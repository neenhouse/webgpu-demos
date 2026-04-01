#!/usr/bin/env node
/**
 * Capture thumbnails for all demos missing a thumbnail image.
 *
 * Usage:
 *   pnpm dev  (in another terminal)
 *   node scripts/capture-thumbnails.mjs
 *
 * Requirements:
 *   - Headed Chromium (WebGPU canvases render black in headless mode)
 *   - Dev server running at http://localhost:5173
 *   - Playwright installed: npx playwright install chromium
 *
 * Resilience:
 *   - Creates a fresh browser context per demo to survive GPU crashes
 *   - Skips demos that crash and continues with the rest
 *   - Run again to retry only the still-missing demos
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const THUMB_DIR = path.join(ROOT, 'public', 'thumbnails');
const REGISTRY_PATH = path.join(ROOT, 'src', 'lib', 'registry-generated.ts');
const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';
const RENDER_WAIT_MS = parseInt(process.env.RENDER_WAIT || '4000', 10);
const VIEWPORT = { width: 1280, height: 720 };

// Parse demo names from registry
function getDemoNames() {
  const src = fs.readFileSync(REGISTRY_PATH, 'utf8');
  return [...src.matchAll(/name: '([^']+)'/g)].map(m => m[1]);
}

// Find demos missing thumbnails
function getMissingDemos() {
  const all = getDemoNames();
  const existing = new Set(
    fs.readdirSync(THUMB_DIR)
      .filter(f => f.endsWith('.jpg'))
      .map(f => f.replace('.jpg', ''))
  );
  return all.filter(name => !existing.has(name));
}

async function captureDemo(browser, name) {
  let context;
  let page;
  try {
    context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: 1,
    });
    page = await context.newPage();

    const url = `${BASE_URL}/viewer#${name}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    // Wait for WebGPU render
    await page.waitForTimeout(RENDER_WAIT_MS);

    const outPath = path.join(THUMB_DIR, `${name}.jpg`);
    await page.screenshot({
      path: outPath,
      type: 'jpeg',
      quality: 85,
      clip: { x: 0, y: 0, width: VIEWPORT.width, height: VIEWPORT.height },
    });

    // Verify file was created and isn't tiny (< 5KB likely means black/blank)
    const stat = fs.statSync(outPath);
    if (stat.size < 5000) {
      console.warn(`  ⚠ ${name}: thumbnail only ${stat.size} bytes (may be blank)`);
      await context.close().catch(() => {});
      return false;
    }

    console.log(`  ✓ ${name} (${Math.round(stat.size / 1024)}KB)`);
    await context.close().catch(() => {});
    return true;
  } catch (err) {
    console.error(`  ✗ ${name}: ${err.message.split('\n')[0]}`);
    try { if (context) await context.close(); } catch { /* ignore */ }
    return false;
  }
}

async function main() {
  // Ensure thumbnail directory exists
  fs.mkdirSync(THUMB_DIR, { recursive: true });

  const missing = getMissingDemos();
  if (missing.length === 0) {
    console.log('All thumbnails exist!');
    return;
  }

  console.log(`Capturing ${missing.length} missing thumbnails...`);
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Render wait: ${RENDER_WAIT_MS}ms`);
  console.log();

  // Must use headed mode for WebGPU
  let browser = await chromium.launch({
    headless: false,
    args: [
      '--enable-unsafe-webgpu',
      '--enable-features=Vulkan',
      '--use-angle=vulkan',
    ],
  });

  let success = 0;
  let fail = 0;

  for (let i = 0; i < missing.length; i++) {
    const name = missing[i];
    console.log(`[${i + 1}/${missing.length}] ${name}`);

    // Check if browser is still alive, relaunch if crashed
    try {
      const contexts = browser.contexts();
      void contexts; // just checking if accessible
    } catch {
      console.log('  ↻ Browser crashed, relaunching...');
      try { await browser.close(); } catch { /* ignore */ }
      browser = await chromium.launch({
        headless: false,
        args: [
          '--enable-unsafe-webgpu',
          '--enable-features=Vulkan',
          '--use-angle=vulkan',
        ],
      });
    }

    const ok = await captureDemo(browser, name);
    if (ok) success++;
    else fail++;
  }

  try { await browser.close(); } catch { /* ignore */ }

  console.log();
  console.log(`Done: ${success} captured, ${fail} failed, ${missing.length} total`);
  if (fail > 0) {
    console.log(`Run again to retry the ${fail} failed demos.`);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
