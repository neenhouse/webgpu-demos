import { describe, it, expect } from 'vitest';
import { csgGenerator, createPrimitive } from '../csg.ts';
import type { SceneObject } from '../types.ts';

function makeObj(overrides: Partial<SceneObject> = {}): SceneObject {
  return { id: 'test', prompt: 'a test object', ...overrides };
}

describe('CSG Generator — canHandle', () => {
  it('returns 0.9 for generator hint "csg"', () => {
    expect(csgGenerator.canHandle(makeObj({ generator: 'csg' }))).toBe(0.9);
  });

  it('returns 0.85 for objects with params.operations', () => {
    expect(
      csgGenerator.canHandle(makeObj({ params: { operations: [] } })),
    ).toBe(0.85);
  });

  it('returns > 0 for prompts with CSG keywords', () => {
    expect(
      csgGenerator.canHandle(makeObj({ prompt: 'a hollow box with holes cut out' })),
    ).toBeGreaterThan(0);
  });

  it('returns 0.5 for prompts with 2+ CSG keywords', () => {
    expect(
      csgGenerator.canHandle(makeObj({ prompt: 'a hollow container with a door' })),
    ).toBeGreaterThanOrEqual(0.5);
  });

  it('returns 0 for unrelated prompts', () => {
    expect(
      csgGenerator.canHandle(makeObj({ prompt: 'a fluffy cat on a cloud' })),
    ).toBe(0);
  });
});

describe('CSG Generator — createPrimitive', () => {
  it('creates a BoxGeometry', () => {
    const geom = createPrimitive('box', [2, 1, 0.5]);
    expect(geom.attributes.position.count).toBeGreaterThan(0);
  });

  it('creates a SphereGeometry', () => {
    const geom = createPrimitive('sphere', [1]);
    expect(geom.attributes.position.count).toBeGreaterThan(0);
  });

  it('creates a CylinderGeometry', () => {
    const geom = createPrimitive('cylinder', [0.5, 2]);
    expect(geom.attributes.position.count).toBeGreaterThan(0);
  });

  it('creates a ConeGeometry', () => {
    const geom = createPrimitive('cone', [0.5, 1.5]);
    expect(geom.attributes.position.count).toBeGreaterThan(0);
  });

  it('creates a TorusGeometry', () => {
    const geom = createPrimitive('torus', [1, 0.3]);
    expect(geom.attributes.position.count).toBeGreaterThan(0);
  });

  it('throws for unknown primitive type', () => {
    expect(() => createPrimitive('banana', [1])).toThrow('Unknown CSG primitive: banana');
  });
});

describe('CSG Generator — generate', () => {
  it('returns fallback box when no operations provided', () => {
    const result = csgGenerator.generate(makeObj({ prompt: 'a csg box' }));
    expect(result.geometry.attributes.position.count).toBeGreaterThan(0);
    expect(result.metadata.generator).toBe('csg');
  });

  it('generates a union of two boxes', () => {
    const obj = makeObj({
      prompt: 'two boxes merged',
      generator: 'csg',
      params: {
        operations: [
          {
            union: [
              { box: [2, 1, 1] },
              { box: [1, 2, 1], position: [0.5, 0.5, 0] as [number, number, number] },
            ],
          },
        ],
      },
    });
    const result = csgGenerator.generate(obj);
    expect(result.geometry.attributes.position.count).toBeGreaterThan(0);
    expect(result.metadata.vertexCount).toBeGreaterThan(0);
  });

  it('generates a subtraction', () => {
    const obj = makeObj({
      prompt: 'box with sphere cut',
      generator: 'csg',
      params: {
        operations: [
          {
            subtract: [
              { box: [2, 1, 1] },
              { sphere: [0.4], position: [0, 0.3, 0] as [number, number, number] },
            ],
          },
        ],
      },
    });
    const result = csgGenerator.generate(obj);
    expect(result.geometry.attributes.position.count).toBeGreaterThan(0);
  });

  it('populates metadata with timing and counts', () => {
    const result = csgGenerator.generate(makeObj({ prompt: 'simple box', generator: 'csg' }));
    expect(result.metadata.generationTime).toBeGreaterThanOrEqual(0);
    expect(result.metadata.generator).toBe('csg');
    expect(result.metadata.prompt).toBe('simple box');
  });
});
