import { use } from 'react';
import { parseSceneOrThrow } from '../spec/parser';
import type { Scene } from '../spec/types';

// Module-scoped caches — persist across re-renders and component mounts
const sceneCache = new Map<string, Scene>();
const promiseCache = new Map<string, Promise<Scene>>();

/**
 * Fetch a scene YAML file, parse it, validate with Zod, and cache the result.
 * Returns the cached Scene immediately if already fetched.
 */
export async function fetchScene(scenePath: string): Promise<Scene> {
  // Check scene cache first
  const cached = sceneCache.get(scenePath);
  if (cached) return cached;

  // Fetch the YAML file
  const response = await fetch(scenePath);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch scene "${scenePath}": ${response.status} ${response.statusText}`,
    );
  }

  const yamlText = await response.text();

  // Parse and validate via Zod schema (throws on failure with descriptive message)
  const scene = parseSceneOrThrow(yamlText);

  // Store in cache
  sceneCache.set(scenePath, scene);

  return scene;
}

/**
 * React 19 Suspense-compatible hook for loading scene YAML.
 *
 * Uses React's `use()` hook with a cached promise so the same path
 * never triggers duplicate fetches. Must be rendered inside a <Suspense> boundary.
 */
export function useSceneLoader(scenePath: string): Scene {
  // Get or create the promise for this path
  let promise = promiseCache.get(scenePath);
  if (!promise) {
    promise = fetchScene(scenePath);
    promiseCache.set(scenePath, promise);
  }

  // React 19 use() integrates with Suspense automatically
  return use(promise);
}
