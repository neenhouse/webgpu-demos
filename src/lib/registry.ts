// Registry loaded from manifests/*.manifest.yaml at build time.
// To regenerate: node scripts/build-registry.mjs
export { demos, getDemoByName, getAdjacentDemos } from './registry-generated';
export type { DemoMeta, DemoEntry } from './registry-generated';
