import { describe, it, expect } from 'vitest';
import { sdfGenerator } from '../sdf.ts';
import type { SceneObject } from '../types.ts';

function makeObj(overrides: Partial<SceneObject> = {}): SceneObject {
  return { id: 'test', prompt: 'a test object', ...overrides };
}

describe('SDF Generator — canHandle', () => {
  it('returns 0.9 for generator hint "sdf"', () => {
    expect(sdfGenerator.canHandle(makeObj({ generator: 'sdf' }))).toBe(0.9);
  });

  it('returns 0.7 for material.shader containing "sdf"', () => {
    expect(
      sdfGenerator.canHandle(makeObj({ material: { shader: 'sdf-raymarched' } })),
    ).toBe(0.7);
  });

  it('returns > 0 for SDF-related prompts', () => {
    expect(
      sdfGenerator.canHandle(makeObj({ prompt: 'an organic alien blob' })),
    ).toBeGreaterThan(0);
  });

  it('returns 0.6 for prompts with 2+ SDF keywords', () => {
    expect(
      sdfGenerator.canHandle(makeObj({ prompt: 'smooth organic metaball shape' })),
    ).toBeGreaterThanOrEqual(0.6);
  });

  it('returns 0 for unrelated prompts', () => {
    expect(
      sdfGenerator.canHandle(makeObj({ prompt: 'a simple wooden chair' })),
    ).toBe(0);
  });
});

describe('SDF Generator — generate', () => {
  it('returns a result with isSdf: true', () => {
    const result = sdfGenerator.generate(makeObj({ generator: 'sdf', prompt: 'sdf shape' }));
    expect(result.isSdf).toBe(true);
  });

  it('returns both geometry and material', () => {
    const result = sdfGenerator.generate(makeObj({ generator: 'sdf', prompt: 'sdf shape' }));
    expect(result.geometry).toBeDefined();
    expect(result.material).toBeDefined();
  });

  it('geometry is a BoxGeometry (bounding box)', () => {
    const result = sdfGenerator.generate(makeObj({ generator: 'sdf', prompt: 'sdf shape' }));
    // BoxGeometry has 24 vertices (6 faces * 4 vertices each)
    expect(result.geometry.attributes.position.count).toBe(24);
  });

  it('material is a MeshBasicNodeMaterial', () => {
    const result = sdfGenerator.generate(makeObj({ generator: 'sdf', prompt: 'sdf shape' }));
    expect(result.material).toBeDefined();
    expect((result.material as { type: string }).type).toBe('MeshBasicNodeMaterial');
  });

  it('populates metadata correctly', () => {
    const result = sdfGenerator.generate(makeObj({ generator: 'sdf', prompt: 'my sdf' }));
    expect(result.metadata.generator).toBe('sdf');
    expect(result.metadata.prompt).toBe('my sdf');
    expect(result.metadata.generationTime).toBeGreaterThanOrEqual(0);
  });

  it('accepts custom bounding box size', () => {
    const result = sdfGenerator.generate(makeObj({
      generator: 'sdf',
      prompt: 'sdf',
      params: { boundingBox: 6 },
    }));
    expect(result.geometry).toBeDefined();
    expect(result.geometry.attributes.position.count).toBe(24);
  });
});
