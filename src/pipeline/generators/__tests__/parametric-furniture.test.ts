import { describe, it, expect } from 'vitest';
import { furnitureGenerator } from '../parametric/furniture.ts';
import type { SceneObject } from '../types.ts';

function makeObj(overrides: Partial<SceneObject> = {}): SceneObject {
  return { id: 'test', prompt: 'a test object', ...overrides };
}

describe('Furniture Generator — canHandle', () => {
  it('returns 0.95 for generator: "parametric/furniture"', () => {
    expect(
      furnitureGenerator.canHandle(makeObj({ generator: 'parametric/furniture' })),
    ).toBe(0.95);
  });

  it('returns > 0 for furniture-related prompts', () => {
    expect(
      furnitureGenerator.canHandle(makeObj({ prompt: 'a wooden table' })),
    ).toBeGreaterThan(0);
  });

  it('returns 0.7 for prompts with 2+ keywords', () => {
    expect(
      furnitureGenerator.canHandle(makeObj({ prompt: 'a table and chair set' })),
    ).toBeGreaterThanOrEqual(0.7);
  });

  it('returns 0 for unrelated prompts', () => {
    expect(
      furnitureGenerator.canHandle(makeObj({ prompt: 'a flying saucer' })),
    ).toBe(0);
  });
});

describe('Furniture Generator — generate', () => {
  it('table type produces geometry', () => {
    const result = furnitureGenerator.generate(
      makeObj({ generator: 'parametric/furniture', prompt: 'table', params: { type: 'table' } }),
    );
    expect(result.geometry.attributes.position.count).toBeGreaterThan(0);
    expect(result.metadata.generator).toBe('parametric/furniture');
  });

  it('chair type produces geometry', () => {
    const result = furnitureGenerator.generate(
      makeObj({ generator: 'parametric/furniture', prompt: 'chair', params: { type: 'chair' } }),
    );
    expect(result.geometry.attributes.position.count).toBeGreaterThan(0);
  });

  it('shelf type produces geometry', () => {
    const result = furnitureGenerator.generate(
      makeObj({ generator: 'parametric/furniture', prompt: 'shelf', params: { type: 'shelf' } }),
    );
    expect(result.geometry.attributes.position.count).toBeGreaterThan(0);
  });

  it('bench type produces geometry', () => {
    const result = furnitureGenerator.generate(
      makeObj({ generator: 'parametric/furniture', prompt: 'bench', params: { type: 'bench' } }),
    );
    expect(result.geometry.attributes.position.count).toBeGreaterThan(0);
  });

  it('geometry has normals and UVs', () => {
    const result = furnitureGenerator.generate(
      makeObj({ generator: 'parametric/furniture', prompt: 'table' }),
    );
    expect(result.geometry.attributes.normal).toBeDefined();
    expect(result.geometry.attributes.uv).toBeDefined();
  });

  it('same seed produces same geometry (deterministic)', () => {
    const params = { type: 'table', seed: 42 };
    const r1 = furnitureGenerator.generate(
      makeObj({ generator: 'parametric/furniture', prompt: 'table', params }),
    );
    const r2 = furnitureGenerator.generate(
      makeObj({ generator: 'parametric/furniture', prompt: 'table', params }),
    );
    const pos1 = r1.geometry.attributes.position;
    const pos2 = r2.geometry.attributes.position;
    expect(pos1.count).toBe(pos2.count);
    for (let i = 0; i < Math.min(pos1.count, 50); i++) {
      expect(pos1.getX(i)).toBe(pos2.getX(i));
      expect(pos1.getY(i)).toBe(pos2.getY(i));
      expect(pos1.getZ(i)).toBe(pos2.getZ(i));
    }
  });
});
