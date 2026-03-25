import type { PresetFactory } from '../types.ts';

/**
 * Preset registry: maps preset names to factory functions.
 */
const presetRegistry = new Map<string, PresetFactory>();

/**
 * Register a preset factory function under the given name.
 */
export function registerPreset(name: string, factory: PresetFactory): void {
  presetRegistry.set(name, factory);
}

/**
 * Get a preset factory by name. Returns undefined if not found.
 */
export function getPreset(name: string): PresetFactory | undefined {
  return presetRegistry.get(name);
}

/**
 * List all registered preset names (including aliases).
 */
export function listPresets(): string[] {
  return Array.from(presetRegistry.keys());
}
