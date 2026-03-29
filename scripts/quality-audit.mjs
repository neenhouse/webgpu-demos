#!/usr/bin/env node
/**
 * Quality audit: statically analyze all demo source files against the
 * batch playbook rules and render philosophy.
 *
 * Checks:
 * 1. Minimum line count (200 for Batch 4+, 60 for earlier)
 * 2. Broken pattern detection (PointsNodeMaterial, BoxGeometry material arrays, etc.)
 * 3. Emissive intensity limits (>3x = warning)
 * 4. DoubleSide on additive shells
 * 5. viewportResolution (deprecated)
 * 6. Missing lighting (no ambientLight or directionalLight)
 * 7. Missing animation (no useFrame)
 * 8. Scene demos: validate YAML exists
 * 9. Component exports default function
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DEMOS_DIR = path.join(ROOT, 'src', 'demos');
const SCENES_DIR = path.join(ROOT, 'public', 'scenes');

// Demos from Batch 4+ (should be 200+ lines)
const BATCH4_PLUS_TAGS = new Set([
  'emergent', 'data-viz', 'audio', 'physics', 'procedural',
  'retro', 'organic', 'math', 'game-ready',
]);

// Scene demos (skip line count and code checks)
const SCENE_DEMOS = new Set([
  'test-scene', 'junkyard', 'alien-garden', 'medieval-forge', 'underwater-ruins',
  'cyberpunk-street', 'desert-outpost', 'robot-factory', 'enchanted-forest',
  'space-station', 'gladiator-arena',
]);

function loadManifestTags() {
  const manifestsDir = path.join(ROOT, 'manifests');
  const tagMap = new Map();
  for (const file of fs.readdirSync(manifestsDir).filter(f => f.endsWith('.manifest.yaml'))) {
    const raw = fs.readFileSync(path.join(manifestsDir, file), 'utf8');
    const nameMatch = raw.match(/name:\s*(\S+)/);
    const tagsMatch = raw.match(/tags:\n((?:\s+- \S+\n?)+)/);
    if (nameMatch && tagsMatch) {
      const tags = tagsMatch[1].match(/- (\S+)/g)?.map(t => t.replace('- ', '')) || [];
      tagMap.set(nameMatch[1], tags);
    }
  }
  return tagMap;
}

function auditDemo(slug, src, tags) {
  const issues = [];
  const warnings = [];
  const lines = src.split('\n').length;

  // === LINE COUNT ===
  const isBatch4Plus = tags.some(t => BATCH4_PLUS_TAGS.has(t));
  if (isBatch4Plus && lines < 200) {
    issues.push(`LINE_COUNT: ${lines} lines (minimum 200 for Batch 4+ demos)`);
  } else if (lines < 50) {
    warnings.push(`LINE_COUNT: Only ${lines} lines (very short demo)`);
  }

  // === BROKEN PATTERNS ===
  if (src.includes('PointsNodeMaterial')) {
    issues.push('BROKEN: PointsNodeMaterial (invisible in R3F/WebGPU — use instanced mesh)');
  }
  if (src.includes('SpriteNodeMaterial')) {
    issues.push('BROKEN: SpriteNodeMaterial (invisible in R3F/WebGPU — use instanced mesh)');
  }
  if (/materialIndex|addGroup|material=\{?\[/.test(src)) {
    issues.push('BROKEN: BoxGeometry material arrays (vertex count 0 with WebGPURenderer)');
  }
  if (src.includes('viewportResolution')) {
    issues.push('BROKEN: viewportResolution (deprecated — use screenSize)');
  }
  // Only flag TSL node .atan2(), not Math.atan2() which is valid JS
  const atan2Matches = [...src.matchAll(/(\w+)\.atan2\s*\(/g)];
  for (const m of atan2Matches) {
    if (m[1] !== 'Math') {
      issues.push(`BROKEN: ${m[1]}.atan2() on Node (use standalone atan(y, x))`);
    }
  }

  // === EMISSIVE LIMITS ===
  const emissiveMatches = src.matchAll(/emissiveIntensity\s*[:=]\s*(\d+\.?\d*)/g);
  for (const m of emissiveMatches) {
    const val = parseFloat(m[1]);
    if (val > 5.0) {
      issues.push(`EMISSIVE: emissiveIntensity=${val} (max recommended: 3.0, absolute max: 5.0)`);
    } else if (val > 3.0) {
      warnings.push(`EMISSIVE: emissiveIntensity=${val} (above recommended 3.0 — may blow out)`);
    }
  }

  // === DOUBLESIDE + ADDITIVE (check within same material block, ~15 lines proximity) ===
  const dsLines = [];
  const abLines = [];
  const srcLines = src.split('\n');
  srcLines.forEach((line, i) => {
    if (line.includes('DoubleSide')) dsLines.push(i);
    if (line.includes('AdditiveBlending')) abLines.push(i);
  });
  for (const ds of dsLines) {
    for (const ab of abLines) {
      if (Math.abs(ds - ab) <= 15) {
        warnings.push(`DOUBLESIDE+ADDITIVE: DoubleSide (line ${ds+1}) near AdditiveBlending (line ${ab+1}) — check if same material`);
        break;
      }
    }
  }

  // === MISSING LIGHTING ===
  if (!src.includes('ambientLight') && !src.includes('directionalLight') && !src.includes('pointLight') && !src.includes('AmbientLight')) {
    // Full-screen shader demos (MeshBasicNodeMaterial + viewport plane) don't need lights
    if (!src.includes('MeshBasicNodeMaterial') && !src.includes('screenUV')) {
      warnings.push('NO_LIGHTS: No ambient, directional, or point lights detected');
    }
  }

  // === MISSING ANIMATION ===
  if (!src.includes('useFrame')) {
    warnings.push('NO_ANIMATION: No useFrame detected (static scene?)');
  }

  // === DEFAULT EXPORT ===
  if (!src.includes('export default function')) {
    issues.push('NO_DEFAULT_EXPORT: Missing "export default function" component');
  }

  // === IMPORT HYGIENE ===
  if (src.includes("from 'three'") && !src.includes("from 'three/webgpu'")) {
    warnings.push('IMPORT: Imports from "three" instead of "three/webgpu"');
  }

  // === OBJECT ALLOCATION IN useFrame ===
  const useFrameBlocks = [...src.matchAll(/useFrame\(\s*\([\s\S]*?\n\s*\}\)/g)];
  for (const block of useFrameBlocks) {
    const blockText = block[0];
    const newMatches = blockText.match(/new THREE\.\w+/g);
    if (newMatches) {
      issues.push(`PERF: Object allocation in useFrame: ${newMatches[0]} (hoist to useMemo)`);
    }
  }

  // === MISSING frustumCulled ON INSTANCED MESH ===
  const instancedLines = [...src.matchAll(/<instancedMesh[^>]*>/g)];
  for (const m of instancedLines) {
    if (!m[0].includes('frustumCulled')) {
      warnings.push('PERF: <instancedMesh> missing frustumCulled={false}');
    }
  }

  return { slug, lines, issues, warnings };
}

function main() {
  const tagMap = loadManifestTags();
  const demoDirs = fs.readdirSync(DEMOS_DIR).filter(d =>
    fs.statSync(path.join(DEMOS_DIR, d)).isDirectory()
  ).sort();

  const results = [];
  let totalIssues = 0;
  let totalWarnings = 0;

  for (const slug of demoDirs) {
    if (SCENE_DEMOS.has(slug)) {
      // For scene demos, just check the YAML exists
      const yamlPath = path.join(SCENES_DIR, `${slug}.scene.yaml`);
      if (!fs.existsSync(yamlPath)) {
        results.push({ slug, lines: 0, issues: [`MISSING_YAML: ${yamlPath}`], warnings: [] });
        totalIssues++;
      }
      continue;
    }

    const indexPath = path.join(DEMOS_DIR, slug, 'index.tsx');
    if (!fs.existsSync(indexPath)) {
      results.push({ slug, lines: 0, issues: ['MISSING_FILE: No index.tsx'], warnings: [] });
      totalIssues++;
      continue;
    }

    const src = fs.readFileSync(indexPath, 'utf8');
    const tags = tagMap.get(slug) || [];
    const result = auditDemo(slug, src, tags);
    results.push(result);
    totalIssues += result.issues.length;
    totalWarnings += result.warnings.length;
  }

  // === REPORT ===
  console.log(`Quality Audit: ${demoDirs.length} demos\n`);

  // Issues (must fix)
  const withIssues = results.filter(r => r.issues.length > 0);
  if (withIssues.length > 0) {
    console.log(`=== ISSUES (${totalIssues} across ${withIssues.length} demos) ===\n`);
    for (const r of withIssues) {
      console.log(`  ${r.slug} (${r.lines} lines):`);
      for (const issue of r.issues) {
        console.log(`    ✗ ${issue}`);
      }
    }
    console.log();
  }

  // Warnings (should review)
  const withWarnings = results.filter(r => r.warnings.length > 0);
  if (withWarnings.length > 0) {
    console.log(`=== WARNINGS (${totalWarnings} across ${withWarnings.length} demos) ===\n`);
    for (const r of withWarnings) {
      console.log(`  ${r.slug} (${r.lines} lines):`);
      for (const w of r.warnings) {
        console.log(`    ⚠ ${w}`);
      }
    }
    console.log();
  }

  // Summary
  const clean = results.filter(r => r.issues.length === 0 && r.warnings.length === 0).length;
  console.log(`=== SUMMARY ===`);
  console.log(`  Clean:    ${clean}/${demoDirs.length}`);
  console.log(`  Issues:   ${totalIssues} (across ${withIssues.length} demos)`);
  console.log(`  Warnings: ${totalWarnings} (across ${withWarnings.length} demos)`);

  // Line count distribution
  const lineCounts = results.filter(r => r.lines > 0).map(r => r.lines);
  lineCounts.sort((a, b) => a - b);
  const median = lineCounts[Math.floor(lineCounts.length / 2)];
  const min = lineCounts[0];
  const max = lineCounts[lineCounts.length - 1];
  const under100 = lineCounts.filter(l => l < 100).length;
  const under200 = lineCounts.filter(l => l < 200).length;
  console.log(`\n  Line counts: min=${min}, median=${median}, max=${max}`);
  console.log(`  Under 100 lines: ${under100}`);
  console.log(`  Under 200 lines: ${under200}`);
}

main();
