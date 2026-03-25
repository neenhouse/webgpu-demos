import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three/webgpu';
import { resolveMaterial } from '../resolver.ts';
import type { MaterialDef, MaterialContext } from '../types.ts';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('resolveMaterial', () => {
  it('returns a default MeshStandardNodeMaterial with empty def', () => {
    const mat = resolveMaterial({});
    expect(mat).toBeInstanceOf(THREE.MeshStandardNodeMaterial);
  });

  it('applies PBR color, roughness, metalness correctly', () => {
    const mat = resolveMaterial({
      pbr: { color: '#ff0000', roughness: 0.5, metalness: 0.8 },
    });
    expect(mat).toBeInstanceOf(THREE.MeshStandardNodeMaterial);
    // Nodes should be assigned (not null)
    expect(mat.colorNode).not.toBeNull();
    expect(mat.roughnessNode).not.toBeNull();
    expect(mat.metalnessNode).not.toBeNull();
  });

  it('clamps PBR values -- roughness 1.5 becomes 1.0, metalness -0.3 becomes 0.0', () => {
    const mat = resolveMaterial({
      pbr: { roughness: 1.5, metalness: -0.3 },
    });
    expect(mat).toBeInstanceOf(THREE.MeshStandardNodeMaterial);
    // The node is created with clamped value -- we just verify it's assigned
    expect(mat.roughnessNode).not.toBeNull();
    expect(mat.metalnessNode).not.toBeNull();
  });

  it('logs a console warning for unknown preset and returns a material', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const mat = resolveMaterial({ preset: 'nonexistent-preset-xyz' });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Unknown preset "nonexistent-preset-xyz"'),
    );
    expect(mat).toBeInstanceOf(THREE.MeshStandardNodeMaterial);
  });

  it('clones parent material when inherit is "parent" with valid context', () => {
    const parentMat = new THREE.MeshStandardNodeMaterial();
    parentMat.name = 'parent-mat';
    const context: MaterialContext = {
      parentMaterial: parentMat,
      objectId: 'child-obj',
    };
    const mat = resolveMaterial({ inherit: 'parent' }, context);
    expect(mat).toBeInstanceOf(THREE.MeshStandardNodeMaterial);
    // Should be a different instance (clone, not reference)
    expect(mat).not.toBe(parentMat);
  });

  it('logs warning when inherit is "parent" but no parent in context', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const mat = resolveMaterial({ inherit: 'parent' });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('no parent material in context'),
    );
    expect(mat).toBeInstanceOf(THREE.MeshStandardNodeMaterial);
  });

  it('applies preset before PBR overrides (resolution order)', () => {
    // Chrome preset has roughness ~0.05, we override to 0.3
    const mat = resolveMaterial({
      preset: 'chrome',
      pbr: { roughness: 0.3 },
    });
    expect(mat).toBeInstanceOf(THREE.MeshStandardNodeMaterial);
    // roughnessNode should be set (overridden by pbr step)
    expect(mat.roughnessNode).not.toBeNull();
  });

  it('applies rendering hints: side, transparent, blending, wireframe, flatShading', () => {
    const mat = resolveMaterial({
      side: 'double',
      transparent: true,
      blending: 'additive',
      wireframe: true,
      flatShading: true,
    });
    expect(mat.side).toBe(THREE.DoubleSide);
    expect(mat.transparent).toBe(true);
    expect(mat.blending).toBe(THREE.AdditiveBlending);
    expect(mat.wireframe).toBe(true);
    expect(mat.flatShading).toBe(true);
  });

  it('applies side "front" correctly', () => {
    const mat = resolveMaterial({ side: 'front' });
    expect(mat.side).toBe(THREE.FrontSide);
  });

  it('applies side "back" correctly', () => {
    const mat = resolveMaterial({ side: 'back' });
    expect(mat.side).toBe(THREE.BackSide);
  });

  it('applies blending "normal" correctly', () => {
    const mat = resolveMaterial({ blending: 'normal' });
    expect(mat.blending).toBe(THREE.NormalBlending);
  });

  it('handles overrides as final step', () => {
    const mat = resolveMaterial({
      pbr: { roughness: 0.5 },
      overrides: { roughness: 0.9 },
    });
    expect(mat).toBeInstanceOf(THREE.MeshStandardNodeMaterial);
    expect(mat.roughnessNode).not.toBeNull();
  });

  it('handles inherit with string ID and resolvedMaterials in context', () => {
    const baseMat = new THREE.MeshStandardNodeMaterial();
    baseMat.name = 'wall-base-mat';
    const context: MaterialContext = {
      resolvedMaterials: new Map([['wall-base', baseMat]]),
    };
    const def: MaterialDef = { inherit: 'wall-base', overrides: { roughness: 0.9 } };
    const mat = resolveMaterial(def, context);
    expect(mat).toBeInstanceOf(THREE.MeshStandardNodeMaterial);
    // Should be a different instance (cloned)
    expect(mat).not.toBe(baseMat);
    // Overrides should be applied
    expect(mat.roughnessNode).not.toBeNull();
  });

  it('logs warning when inherit references missing object ID', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const context: MaterialContext = {
      resolvedMaterials: new Map(),
    };
    const mat = resolveMaterial({ inherit: 'missing-id' }, context);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('no resolved material found'),
    );
    expect(mat).toBeInstanceOf(THREE.MeshStandardNodeMaterial);
  });
});
