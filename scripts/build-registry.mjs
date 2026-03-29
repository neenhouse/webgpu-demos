#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import YAML from 'yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const MANIFESTS_DIR = path.join(ROOT, 'manifests');
const OUTPUT_PATH = path.join(ROOT, 'src', 'lib', 'registry-generated.ts');

function loadManifests() {
  const files = fs.readdirSync(MANIFESTS_DIR)
    .filter(f => f.endsWith('.manifest.yaml'))
    .sort();

  const manifests = [];
  const errors = [];

  for (const file of files) {
    const raw = fs.readFileSync(path.join(MANIFESTS_DIR, file), 'utf8');
    try {
      const parsed = YAML.parse(raw);
      manifests.push(parsed);
    } catch (err) {
      errors.push(`${file}: ${err.message}`);
    }
  }

  if (errors.length > 0) {
    console.error('Manifest parse errors:');
    errors.forEach(e => console.error(`  ${e}`));
    process.exit(1);
  }

  return manifests;
}

function generateRegistryCode(manifests) {
  const imports = `import { lazy, type ComponentType, type LazyExoticComponent } from 'react';\n\n`;

  const interfaceCode = `export interface DemoMeta {
  name: string;
  title: string;
  description: string;
  requiresWebGPU: boolean;
  color: string;
  tags: string[];
  rendererType: 'component' | 'scene';
  scenePath?: string;
}

export interface DemoEntry extends DemoMeta {
  component: LazyExoticComponent<ComponentType>;
}

`;

  const entries = manifests.map(m => {
    const meta = m.meta;
    const isScene = m.renderer.type === 'scene';
    const modulePath = isScene ? meta.name : (m.renderer.module || meta.name);
    const tags = JSON.stringify(meta.tags);

    return `  {
    name: '${meta.name}',
    title: '${meta.title.replace(/'/g, "\\'")}',
    description: '${meta.description.replace(/'/g, "\\'")}',
    requiresWebGPU: ${meta.requiresWebGPU},
    color: '${meta.color}',
    tags: ${tags},
    rendererType: '${m.renderer.type}',${isScene ? `\n    scenePath: '/scenes/${m.renderer.scene}',` : ''}
    component: lazy(() => import('../demos/${modulePath}')),
  }`;
  });

  const arrayCode = `export const demos: DemoEntry[] = [\n${entries.join(',\n')},\n];\n`;

  const helpersCode = `
export function getDemoByName(name: string): DemoEntry | undefined {
  return demos.find((d) => d.name === name);
}

export function getAdjacentDemos(name: string): { prev: DemoEntry | null; next: DemoEntry | null } {
  const idx = demos.findIndex((d) => d.name === name);
  if (idx === -1) return { prev: null, next: null };
  return {
    prev: idx > 0 ? demos[idx - 1] : demos[demos.length - 1],
    next: idx < demos.length - 1 ? demos[idx + 1] : demos[0],
  };
}
`;

  return `// AUTO-GENERATED — do not edit. Run: node scripts/build-registry.mjs\n${imports}${interfaceCode}${arrayCode}${helpersCode}`;
}

function main() {
  const manifests = loadManifests();
  console.log(`Loaded ${manifests.length} manifests`);

  const code = generateRegistryCode(manifests);
  fs.writeFileSync(OUTPUT_PATH, code, 'utf8');
  console.log(`Generated ${OUTPUT_PATH}`);
}

main();
