#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const REGISTRY_PATH = path.join(ROOT, 'src', 'lib', 'registry.ts');
const MANIFESTS_DIR = path.join(ROOT, 'manifests');

// Scene demos (use SceneFromYaml)
const SCENE_DEMOS = new Set([
  'test-scene', 'junkyard', 'alien-garden', 'medieval-forge', 'underwater-ruins',
  'cyberpunk-street', 'desert-outpost', 'robot-factory', 'enchanted-forest',
  'space-station', 'gladiator-arena',
]);

function parseRegistry() {
  const src = fs.readFileSync(REGISTRY_PATH, 'utf8');
  const demos = [];

  // Extract each entry block (everything between { name: ... component: lazy... })
  // Split on entries by finding the component: lazy line which is always last
  const blockRegex = /\{[^{}]*?name:\s*'([^']+)'[^{}]*?component:\s*lazy[^{}]*?\}/gs;
  let m;
  while ((m = blockRegex.exec(src)) !== null) {
    const block = m[0];
    const name = m[1];

    // Extract each field from the block
    const titleMatch = block.match(/title:\s*'([^']*)'/);
    const descMatch = block.match(/description:\s*'((?:[^'\\]|\\.)*)'/);
    const webGpuMatch = block.match(/requiresWebGPU:\s*(true|false)/);
    const colorMatch = block.match(/color:\s*'([^']*)'/);
    const tagsMatch = block.match(/tags:\s*\[([^\]]*)\]/);

    if (!titleMatch || !descMatch || !webGpuMatch || !colorMatch || !tagsMatch) {
      console.warn(`Skipping entry "${name}" — missing fields`);
      continue;
    }

    const tags = tagsMatch[1].split(',').map(t => t.trim().replace(/'/g, '')).filter(Boolean);
    demos.push({
      name,
      title: titleMatch[1],
      description: descMatch[1].replace(/\\'/g, "'"),
      requiresWebGPU: webGpuMatch[1] === 'true',
      color: colorMatch[1],
      tags,
    });
  }
  return demos;
}

function makeManifestYaml(demo) {
  const isScene = SCENE_DEMOS.has(demo.name);
  const tagsYaml = demo.tags.map(t => `    - ${t}`).join('\n');

  let rendererYaml;
  if (isScene) {
    rendererYaml = `  type: scene\n  scene: ${demo.name}.scene.yaml`;
  } else {
    rendererYaml = `  type: component\n  module: ${demo.name}`;
  }

  return `version: "2.0"

meta:
  name: ${demo.name}
  title: "${demo.title}"
  description: "${demo.description}"
  tags:
${tagsYaml}
  color: "${demo.color}"
  requiresWebGPU: ${demo.requiresWebGPU}

renderer:
${rendererYaml}
`;
}

function main() {
  fs.mkdirSync(MANIFESTS_DIR, { recursive: true });

  const demos = parseRegistry();
  if (demos.length === 0) {
    console.error('No demos parsed from registry!');
    process.exit(1);
  }

  let count = 0;
  for (const demo of demos) {
    const yaml = makeManifestYaml(demo);
    const outPath = path.join(MANIFESTS_DIR, `${demo.name}.manifest.yaml`);
    fs.writeFileSync(outPath, yaml, 'utf8');
    count++;
  }

  console.log(`Generated ${count} manifest files in manifests/`);
}

main();
