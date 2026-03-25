/**
 * Node.js-only file I/O helpers for reading and writing scene YAML files.
 *
 * These functions use `node:fs/promises` and are intended for use in
 * CLI scripts, Ralph editing workflows, and tests -- NOT in browser bundles.
 * The main `scene-reader.ts` and `scene-writer.ts` are purely string-based
 * and safe for browser bundling.
 */

import { readScene } from './scene-reader';
import { writeScene } from './scene-writer';
import type { Scene } from '../spec/types';

// Type for the subset of node:fs/promises we use.
// This avoids requiring @types/node in the browser tsconfig.
interface FsPromises {
  readFile(path: string, encoding: string): Promise<string>;
  writeFile(path: string, data: string, encoding: string): Promise<void>;
}

// Use a variable for the module specifier to prevent tsc from attempting
// module resolution on `node:fs/promises` (which fails without @types/node).
const FS_MODULE = 'node:fs/promises';

async function getFs(): Promise<FsPromises> {
  return await (import(/* @vite-ignore */ FS_MODULE) as Promise<FsPromises>);
}

/**
 * Read and parse a scene YAML file from disk.
 */
export async function readSceneFile(path: string): Promise<Scene> {
  const fs = await getFs();
  const content = await fs.readFile(path, 'utf-8');
  return readScene(content);
}

/**
 * Write a Scene object to a YAML file on disk.
 */
export async function writeSceneFile(path: string, scene: Scene): Promise<void> {
  const fs = await getFs();
  const content = writeScene(scene);
  await fs.writeFile(path, content, 'utf-8');
}
