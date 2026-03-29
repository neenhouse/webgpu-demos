#!/usr/bin/env node
/**
 * Verify every demo loads through the full pipeline without JS errors.
 *
 * Pipeline: manifest.yaml → build-registry.mjs → registry-generated.ts →
 *           Vite build → serve → Playwright loads each demo → check for errors
 *
 * Usage:
 *   pnpm build && pnpm preview  (in another terminal)
 *   node scripts/verify-all-demos.mjs
 *
 * Or against dev server:
 *   BASE_URL=http://localhost:5173 node scripts/verify-all-demos.mjs
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const MANIFESTS_DIR = path.join(ROOT, 'manifests');
const BASE_URL = process.env.BASE_URL || 'http://localhost:4173';
const LOAD_TIMEOUT = parseInt(process.env.LOAD_TIMEOUT || '10000', 10);
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '4', 10);

function getDemoSlugs() {
  return fs.readdirSync(MANIFESTS_DIR)
    .filter(f => f.endsWith('.manifest.yaml'))
    .map(f => f.replace('.manifest.yaml', ''))
    .sort();
}

async function verifyDemo(browser, slug) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();

  const errors = [];
  const warnings = [];

  page.on('console', msg => {
    if (msg.type() === 'error') {
      const text = msg.text();
      // Ignore known non-critical warnings/expected headless GPU errors
      if (text.includes('THREE.Clock') || text.includes('Download the React DevTools')) return;
      if (text.includes('WebGL context could not be created')) return; // headless has no GPU
      if (text.includes('WebGLRenderer')) return; // GPU fallback errors in headless
      if (text.includes('WebGL context')) return; // another form of GPU error
      if (text.includes('Error creating WebGL')) return; // yet another form
      errors.push(text.substring(0, 200));
    }
  });

  page.on('pageerror', err => {
    const msg = err.message;
    if (msg.includes('WebGL') || msg.includes('GPU')) return; // headless GPU limitations
    errors.push(msg.substring(0, 200));
  });

  try {
    const url = `${BASE_URL}/viewer#${slug}`;
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: LOAD_TIMEOUT });

    if (!response || response.status() !== 200) {
      await context.close().catch(() => {});
      return { slug, status: 'FAIL', reason: `HTTP ${response?.status() || 'no response'}` };
    }

    // Wait for React to mount and demo to start loading
    await page.waitForTimeout(2000);

    // Check if we hit the "Demo not found" page
    const notFound = await page.$('text=Demo not found');
    if (notFound) {
      await context.close().catch(() => {});
      return { slug, status: 'FAIL', reason: 'Demo not found (not in registry)' };
    }

    // Check for fatal JS errors
    if (errors.length > 0) {
      await context.close().catch(() => {});
      return { slug, status: 'ERROR', reason: errors[0] };
    }

    await context.close().catch(() => {});
    return { slug, status: 'OK' };
  } catch (err) {
    try { await context.close(); } catch { /* ignore */ }
    return { slug, status: 'FAIL', reason: err.message.split('\n')[0].substring(0, 200) };
  }
}

async function main() {
  const slugs = getDemoSlugs();
  console.log(`Verifying ${slugs.length} demos against ${BASE_URL}`);
  console.log(`Concurrency: ${CONCURRENCY}, Load timeout: ${LOAD_TIMEOUT}ms`);
  console.log();

  const browser = await chromium.launch({ headless: true });

  const results = [];
  let ok = 0, errors = 0, fails = 0;

  // Process in batches for concurrency
  for (let i = 0; i < slugs.length; i += CONCURRENCY) {
    const batch = slugs.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(slug => verifyDemo(browser, slug))
    );

    for (const result of batchResults) {
      results.push(result);
      const icon = result.status === 'OK' ? '✓' : result.status === 'ERROR' ? '⚠' : '✗';
      const detail = result.reason ? ` — ${result.reason}` : '';
      console.log(`  ${icon} ${result.slug}${detail}`);

      if (result.status === 'OK') ok++;
      else if (result.status === 'ERROR') errors++;
      else fails++;
    }
  }

  await browser.close();

  console.log();
  console.log(`Results: ${ok} OK, ${errors} errors, ${fails} failed, ${slugs.length} total`);

  if (fails > 0) {
    console.log('\nFailed demos:');
    results.filter(r => r.status === 'FAIL').forEach(r => console.log(`  ${r.slug}: ${r.reason}`));
  }
  if (errors > 0) {
    console.log('\nDemos with JS errors:');
    results.filter(r => r.status === 'ERROR').forEach(r => console.log(`  ${r.slug}: ${r.reason}`));
  }

  // Exit with error if any failures
  process.exit(fails > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
