// ─── Scene Reader ────────────────────────────────────────────
export { readScene } from './scene-reader';

// ─── Scene Writer ────────────────────────────────────────────
export { writeScene } from './scene-writer';

// ─── Scene File I/O (Node.js only) ──────────────────────────
// For file-system read/write, import directly from './scene-fs'.
// Not re-exported here to avoid pulling node:fs/promises into
// browser bundles via the barrel.

// ─── Scene Modifier ──────────────────────────────────────────
export {
  findObject,
  updateObject,
  addObject,
  removeObject,
  updateMaterial,
  addInstance,
  updateEnvironment,
  updateCamera,
} from './scene-modifier';
