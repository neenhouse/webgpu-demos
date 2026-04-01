#!/usr/bin/env node
/**
 * Generate gradient placeholder thumbnails for demos missing real captures.
 * Uses the demo's accent color to create a dark-to-color gradient with the demo title.
 * Requires: sharp (for image generation)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const THUMB_DIR = path.join(ROOT, 'public', 'thumbnails');
const REGISTRY_PATH = path.join(ROOT, 'src', 'lib', 'registry-generated.ts');

const WIDTH = 640;
const HEIGHT = 360;

// Parse demo entries from registry
function getDemos() {
  const src = fs.readFileSync(REGISTRY_PATH, 'utf8');
  const demos = [];
  const regex = /\{\s*name:\s*'([^']+)',\s*title:\s*'([^']+)',[\s\S]*?color:\s*'([^']+)'/g;
  let m;
  while ((m = regex.exec(src)) !== null) {
    demos.push({ name: m[1], title: m[2], color: m[3] });
  }
  return demos;
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  };
}

// Generate an SVG gradient placeholder
function makePlaceholderSvg(title, colorHex) {
  const { r, g, b } = hexToRgb(colorHex);
  // Dark background with accent color gradient
  const darkR = Math.round(r * 0.15);
  const darkG = Math.round(g * 0.15);
  const darkB = Math.round(b * 0.15);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="rgb(${darkR},${darkG},${darkB})"/>
      <stop offset="100%" stop-color="rgb(${Math.round(r*0.4)},${Math.round(g*0.4)},${Math.round(b*0.4)})"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="50%">
      <stop offset="0%" stop-color="rgb(${r},${g},${b})" stop-opacity="0.3"/>
      <stop offset="70%" stop-color="rgb(${r},${g},${b})" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
  <ellipse cx="${WIDTH/2}" cy="${HEIGHT/2}" rx="200" ry="120" fill="url(#glow)"/>
  <text x="${WIDTH/2}" y="${HEIGHT/2 + 6}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="28" font-weight="bold" fill="rgb(${Math.min(255, r+80)},${Math.min(255, g+80)},${Math.min(255, b+80)})" opacity="0.9">${escapeXml(title)}</text>
  <text x="${WIDTH/2}" y="${HEIGHT/2 + 34}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="13" fill="rgba(255,255,255,0.4)">WebGPU Demo</text>
</svg>`;
}

function escapeXml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function main() {
  let sharp;
  try {
    sharp = (await import('sharp')).default;
  } catch {
    console.error('sharp not installed. Run: pnpm add -D sharp');
    process.exit(1);
  }

  const demos = getDemos();
  const existing = new Set(
    fs.readdirSync(THUMB_DIR).filter(f => f.endsWith('.jpg')).map(f => f.replace('.jpg', ''))
  );

  const missing = demos.filter(d => !existing.has(d.name));
  if (missing.length === 0) {
    console.log('All thumbnails exist!');
    return;
  }

  console.log(`Generating ${missing.length} placeholder thumbnails...`);

  for (const demo of missing) {
    const svg = makePlaceholderSvg(demo.title, demo.color);
    const outPath = path.join(THUMB_DIR, `${demo.name}.jpg`);
    await sharp(Buffer.from(svg))
      .jpeg({ quality: 85 })
      .toFile(outPath);
    console.log(`  ✓ ${demo.name}`);
  }

  console.log(`Done: ${missing.length} placeholders generated`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
