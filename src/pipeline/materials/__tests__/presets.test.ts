import { describe, it, expect } from 'vitest';
import * as THREE from 'three/webgpu';
import { getPreset, listPresets } from '../presets/index.ts';

describe('preset registry', () => {
  it('has all 8 presets registered and retrievable', () => {
    const presetNames = [
      'rusted-metal', 'concrete-weathered', 'chrome', 'wood-oak',
      'glass-clear', 'organic', 'neon-glow', 'cel-shaded',
    ];
    for (const name of presetNames) {
      expect(getPreset(name)).toBeDefined();
    }
  });

  it('each preset factory returns a MeshStandardNodeMaterial instance', () => {
    const presetNames = [
      'rusted-metal', 'concrete-weathered', 'chrome', 'wood-oak',
      'glass-clear', 'organic', 'neon-glow', 'cel-shaded',
    ];
    for (const name of presetNames) {
      const factory = getPreset(name)!;
      const mat = factory();
      expect(mat).toBeInstanceOf(THREE.MeshStandardNodeMaterial);
    }
  });

  it('listPresets returns all expected preset names including aliases', () => {
    const names = listPresets();
    const expected = [
      'rusted-metal', 'rust',
      'concrete-weathered', 'concrete',
      'chrome', 'mirror',
      'wood-oak', 'wood',
      'glass-clear', 'glass', 'glass-frosted',
      'organic', 'skin-organic', 'skin',
      'neon-glow', 'neon',
      'cel-shaded', 'toon',
    ];
    for (const name of expected) {
      expect(names).toContain(name);
    }
  });

  it('preset aliases work -- rust returns same factory as rusted-metal', () => {
    expect(getPreset('rust')).toBe(getPreset('rusted-metal'));
  });

  it('preset aliases work -- mirror returns same factory as chrome', () => {
    expect(getPreset('mirror')).toBe(getPreset('chrome'));
  });

  it('preset aliases work -- toon returns same factory as cel-shaded', () => {
    expect(getPreset('toon')).toBe(getPreset('cel-shaded'));
  });

  it('preset with pbr overrides applies the override', () => {
    const factory = getPreset('chrome')!;
    const mat = factory({ roughness: 0.5 });
    expect(mat).toBeInstanceOf(THREE.MeshStandardNodeMaterial);
    expect(mat.roughnessNode).not.toBeNull();
  });

  it('glass preset sets transparent = true and side = DoubleSide', () => {
    const factory = getPreset('glass-clear')!;
    const mat = factory();
    expect(mat.transparent).toBe(true);
    expect(mat.side).toBe(THREE.DoubleSide);
  });

  it('cel-shaded preset sets flatShading = true', () => {
    const factory = getPreset('cel-shaded')!;
    const mat = factory();
    expect(mat.flatShading).toBe(true);
  });

  it('neon preset has an emissiveNode assigned', () => {
    const factory = getPreset('neon-glow')!;
    const mat = factory();
    expect(mat.emissiveNode).not.toBeNull();
  });

  it('getPreset returns undefined for nonexistent preset', () => {
    expect(getPreset('nonexistent')).toBeUndefined();
  });
});
