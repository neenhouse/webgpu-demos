import { parseSceneOrThrow } from '../spec/parser';
import type { Scene } from '../spec/types';

/**
 * Parse a YAML string into a validated Scene object.
 * Delegates to the existing spec parser which handles
 * YAML parsing + Zod validation + default application.
 */
export function readScene(yamlContent: string): Scene {
  return parseSceneOrThrow(yamlContent);
}
