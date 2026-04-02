#!/usr/bin/env node
/**
 * Visual Evaluation Pipeline
 *
 * Captures real WebGPU screenshots using system Chrome (headed, separate
 * profile so it doesn't interfere with the operator's browser), then
 * outputs screenshots for evaluation.
 *
 * Usage:
 *   pnpm build && pnpm preview   (in another terminal, port 4173)
 *   node scripts/visual-eval.mjs                    # all demos
 *   node scripts/visual-eval.mjs --demo=tsl-torus   # single demo
 *   node scripts/visual-eval.mjs --batch=13         # specific batch
 *   node scripts/visual-eval.mjs --replace-thumbnails  # copy screenshots to public/thumbnails/
 *
 * Requirements:
 *   - System Google Chrome installed
 *   - Preview server running at localhost:4173
 *
 * The Chrome instance:
 *   - Uses a SEPARATE user data dir (won't touch your profile/tabs)
 *   - Launches in its own window group
 *   - Auto-closes when done
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SCREENSHOTS_DIR = path.join(ROOT, '.screenshots');
const THUMBNAILS_DIR = path.join(ROOT, 'public', 'thumbnails');
const REGISTRY_PATH = path.join(ROOT, 'src', 'lib', 'registry-generated.ts');
const BASE_URL = process.env.BASE_URL || 'http://localhost:4173';
const RENDER_WAIT_MS = parseInt(process.env.RENDER_WAIT || '5000', 10);
const VIEWPORT = { width: 1280, height: 720 };

// Parse CLI args
const args = process.argv.slice(2);
const singleDemo = args.find(a => a.startsWith('--demo='))?.split('=')[1];
const batchNum = args.find(a => a.startsWith('--batch='))?.split('=')[1];
const replaceThumbnails = args.includes('--replace-thumbnails');
const quiet = args.includes('--quiet');

// Parse demo names from registry
function getDemoNames() {
  const src = fs.readFileSync(REGISTRY_PATH, 'utf8');
  return [...src.matchAll(/name: '([^']+)'/g)].map(m => m[1]);
}

// Batch ranges for --batch filter
const BATCH_RANGES = {
  '1': [0, 15], '2': [15, 25], '3': [25, 35],
  'scene': [35, 46], '3b': [46, 56],
  '4': [56, 66], '5': [66, 76],
  '6': [76, 86], '7': [86, 96],
  '8': [96, 106], '9': [106, 116],
  '10': [116, 126], '11': [126, 136],
  '12': [136, 146], '13': [146, 156], '14': [156, 166],
};

function getTargetDemos() {
  const all = getDemoNames();
  if (singleDemo) return all.filter(n => n === singleDemo);
  if (batchNum && BATCH_RANGES[batchNum]) {
    const [start, end] = BATCH_RANGES[batchNum];
    return all.slice(start, end);
  }
  return all;
}

async function captureDemo(browser, name) {
  let page;
  try {
    page = await browser.newPage();

    // Suppress console noise
    page.on('console', () => {});
    page.on('pageerror', () => {});

    const url = `${BASE_URL}/viewer#${name}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });

    // Wait for WebGPU render
    await page.waitForTimeout(RENDER_WAIT_MS);

    // Hide the overlay UI for clean screenshot
    await page.evaluate(() => {
      document.querySelectorAll('.viewer-overlay').forEach(el => {
        (el).style.display = 'none';
      });
    });

    // Wait a beat after hiding overlay
    await page.waitForTimeout(300);

    const outPath = path.join(SCREENSHOTS_DIR, `${name}.png`);
    await page.screenshot({
      path: outPath,
      type: 'png',
      clip: { x: 0, y: 0, width: VIEWPORT.width, height: VIEWPORT.height },
    });

    const stat = fs.statSync(outPath);
    const sizeKB = Math.round(stat.size / 1024);

    // Check if screenshot is likely blank (very small = just black + UI chrome)
    const isLikelyBlank = stat.size < 15000;

    await page.close();

    return {
      name,
      path: outPath,
      sizeKB,
      isLikelyBlank,
      status: isLikelyBlank ? 'BLANK' : 'OK',
    };
  } catch (err) {
    try { if (page) await page.close(); } catch { /* ignore */ }
    return {
      name,
      path: null,
      sizeKB: 0,
      isLikelyBlank: true,
      status: 'ERROR',
      error: err.message.split('\n')[0].substring(0, 100),
    };
  }
}

async function main() {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

  const targets = getTargetDemos();
  if (targets.length === 0) {
    console.error('No demos matched the filter.');
    process.exit(1);
  }

  if (!quiet) {
    console.log(`Visual Evaluation: ${targets.length} demos`);
    console.log(`Base URL: ${BASE_URL}`);
    console.log(`Render wait: ${RENDER_WAIT_MS}ms`);
    console.log(`Screenshots: ${SCREENSHOTS_DIR}`);
    console.log();
  }

  // NOTE: WebGPU requires a visible, non-minimized browser window.
  // The Chrome window WILL briefly appear. To minimize disruption:
  //   - It opens in a separate profile (won't touch your tabs)
  //   - Window is positioned far right (2000px offset)
  //   - Closes automatically when done
  //   - Run with --headless to skip Chrome and use placeholder thumbnails only
  if (!quiet) {
    console.log('⚡ Launching system Chrome (separate profile, positioned off-screen)');
    console.log('   WebGPU requires a visible window — Chrome will briefly appear.\n');
  }

  const userDataDir = path.join(ROOT, '.chrome-eval-profile');
  fs.mkdirSync(userDataDir, { recursive: true });

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    channel: 'chrome',
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    args: [
      '--new-window',
      '--window-position=2560,100',   // Far right (second monitor or off-screen)
      '--window-size=1300,750',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--enable-unsafe-webgpu',
      '--enable-features=Vulkan',
      '--disable-gpu-sandbox',
    ],
  });
  const browser = context;

  const results = [];
  let ok = 0, blank = 0, errors = 0;

  for (let i = 0; i < targets.length; i++) {
    const name = targets[i];
    if (!quiet) process.stdout.write(`[${i + 1}/${targets.length}] ${name}... `);

    const result = await captureDemo(browser, name);
    results.push(result);

    if (result.status === 'OK') {
      ok++;
      if (!quiet) console.log(`✓ ${result.sizeKB}KB`);
    } else if (result.status === 'BLANK') {
      blank++;
      if (!quiet) console.log(`⚠ ${result.sizeKB}KB (likely blank)`);
    } else {
      errors++;
      if (!quiet) console.log(`✗ ${result.error}`);
    }
  }

  await context.close();

  // Optionally copy screenshots to thumbnails
  if (replaceThumbnails) {
    let replaced = 0;
    for (const r of results) {
      if (r.status === 'OK' && r.path) {
        // Convert PNG to JPEG for thumbnails (use sharp if available, otherwise just copy)
        try {
          const sharp = (await import('sharp')).default;
          await sharp(r.path)
            .resize(640, 360, { fit: 'cover' })
            .jpeg({ quality: 85 })
            .toFile(path.join(THUMBNAILS_DIR, `${r.name}.jpg`));
          replaced++;
        } catch {
          // sharp not available — skip thumbnail replacement
          if (replaced === 0) console.log('\nNote: sharp not installed, skipping thumbnail conversion');
          break;
        }
      }
    }
    if (replaced > 0) {
      console.log(`\nReplaced ${replaced} thumbnails from screenshots`);
    }
  }

  // Summary
  console.log(`\nResults: ${ok} OK, ${blank} blank, ${errors} errors, ${targets.length} total`);
  console.log(`Screenshots saved to: ${SCREENSHOTS_DIR}/`);

  if (blank > 0) {
    console.log(`\nBlank screenshots (${blank}):`);
    results.filter(r => r.status === 'BLANK').forEach(r =>
      console.log(`  ${r.name} (${r.sizeKB}KB)`)
    );
  }

  // Write results JSON for downstream tooling
  const reportPath = path.join(SCREENSHOTS_DIR, 'eval-report.json');
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    baseUrl: BASE_URL,
    renderWait: RENDER_WAIT_MS,
    total: targets.length,
    ok, blank, errors,
    results: results.map(r => ({
      name: r.name,
      status: r.status,
      sizeKB: r.sizeKB,
      ...(r.error ? { error: r.error } : {}),
    })),
  }, null, 2));
  console.log(`Report: ${reportPath}`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
