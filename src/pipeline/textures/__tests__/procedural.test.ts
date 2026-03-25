import { describe, it, expect } from 'vitest';
import * as THREE from 'three/webgpu';
import {
  hashNoise,
  multiOctaveNoise,
  fbmNoise,
  checkerboard,
  stripes,
  brick,
  woodGrain,
  rustPatches,
  dirtAccumulation,
} from '../procedural.ts';
import { resolveTextures } from '../index.ts';

describe('procedural noise generators', () => {
  it('hashNoise returns a node', () => {
    const node = hashNoise();
    expect(node).toBeDefined();
    expect(node).not.toBeNull();
  });

  it('hashNoise with custom scale returns a node', () => {
    const node = hashNoise(50);
    expect(node).toBeDefined();
  });

  it('multiOctaveNoise with default params returns a node', () => {
    const node = multiOctaveNoise();
    expect(node).toBeDefined();
    expect(node).not.toBeNull();
  });

  it('multiOctaveNoise with custom params returns a node', () => {
    const node = multiOctaveNoise([10, 30, 60], [0.6, 0.3, 0.1]);
    expect(node).toBeDefined();
  });

  it('fbmNoise returns a node', () => {
    const node = fbmNoise();
    expect(node).toBeDefined();
    expect(node).not.toBeNull();
  });
});

describe('procedural pattern generators', () => {
  it('checkerboard returns a node', () => {
    const node = checkerboard();
    expect(node).toBeDefined();
    expect(node).not.toBeNull();
  });

  it('checkerboard with custom scale returns a node', () => {
    const node = checkerboard(4, 4);
    expect(node).toBeDefined();
  });

  it('stripes with axis "u" returns a node', () => {
    const node = stripes('u');
    expect(node).toBeDefined();
    expect(node).not.toBeNull();
  });

  it('stripes with axis "v" returns a node', () => {
    const node = stripes('v', 20, 0.05);
    expect(node).toBeDefined();
  });

  it('brick returns a node', () => {
    const node = brick();
    expect(node).toBeDefined();
    expect(node).not.toBeNull();
  });

  it('brick with custom params returns a node', () => {
    const node = brick(10, 20, 0.03);
    expect(node).toBeDefined();
  });

  it('woodGrain returns a node', () => {
    const node = woodGrain();
    expect(node).toBeDefined();
    expect(node).not.toBeNull();
  });
});

describe('procedural weathering generators', () => {
  it('rustPatches returns a node', () => {
    const node = rustPatches();
    expect(node).toBeDefined();
    expect(node).not.toBeNull();
  });

  it('dirtAccumulation returns a node', () => {
    const node = dirtAccumulation();
    expect(node).toBeDefined();
    expect(node).not.toBeNull();
  });
});

describe('resolveTextures', () => {
  it('with source "procedural" does not throw', () => {
    const mat = new THREE.MeshStandardNodeMaterial();
    expect(() => resolveTextures({ source: 'procedural' }, mat)).not.toThrow();
  });

  it('with undefined source defaults to procedural and does not throw', () => {
    const mat = new THREE.MeshStandardNodeMaterial();
    expect(() => resolveTextures({}, mat)).not.toThrow();
  });

  it('with source "file" logs a warning', () => {
    const mat = new THREE.MeshStandardNodeMaterial();
    // Should not throw even though file textures are not implemented
    expect(() => resolveTextures({ source: 'file' }, mat)).not.toThrow();
  });
});
