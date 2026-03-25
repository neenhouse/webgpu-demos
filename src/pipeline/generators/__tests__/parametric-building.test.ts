import { describe, it, expect } from 'vitest';
import { buildingGenerator } from '../parametric/building.ts';
import type { SceneObject } from '../types.ts';

function makeObj(overrides: Partial<SceneObject> = {}): SceneObject {
  return { id: 'test', prompt: 'a test object', ...overrides };
}

describe('Building Generator — canHandle', () => {
  it('returns 0.95 for generator: "parametric/building"', () => {
    expect(
      buildingGenerator.canHandle(makeObj({ generator: 'parametric/building' })),
    ).toBe(0.95);
  });

  it('returns > 0 for building-related prompts', () => {
    expect(
      buildingGenerator.canHandle(makeObj({ prompt: 'a small house' })),
    ).toBeGreaterThan(0);
  });

  it('returns 0.7 for prompts with 2+ keywords', () => {
    expect(
      buildingGenerator.canHandle(makeObj({ prompt: 'a ruined tower fortress' })),
    ).toBeGreaterThanOrEqual(0.7);
  });

  it('returns 0 for unrelated prompts', () => {
    expect(
      buildingGenerator.canHandle(makeObj({ prompt: 'a flying saucer' })),
    ).toBe(0);
  });
});

describe('Building Generator — generate', () => {
  it('house type produces geometry', () => {
    const result = buildingGenerator.generate(
      makeObj({ generator: 'parametric/building', prompt: 'house', params: { type: 'house' } }),
    );
    expect(result.geometry.attributes.position.count).toBeGreaterThan(0);
    expect(result.metadata.generator).toBe('parametric/building');
  });

  it('tower type produces geometry', () => {
    const result = buildingGenerator.generate(
      makeObj({ generator: 'parametric/building', prompt: 'tower', params: { type: 'tower' } }),
    );
    expect(result.geometry.attributes.position.count).toBeGreaterThan(0);
  });

  it('ruin type produces geometry', () => {
    const result = buildingGenerator.generate(
      makeObj({ generator: 'parametric/building', prompt: 'ruin', params: { type: 'ruin' } }),
    );
    expect(result.geometry.attributes.position.count).toBeGreaterThan(0);
  });

  it('wall type produces geometry', () => {
    const result = buildingGenerator.generate(
      makeObj({ generator: 'parametric/building', prompt: 'wall', params: { type: 'wall' } }),
    );
    expect(result.geometry.attributes.position.count).toBeGreaterThan(0);
  });

  it('geometry has normals and UVs', () => {
    const result = buildingGenerator.generate(
      makeObj({ generator: 'parametric/building', prompt: 'house' }),
    );
    expect(result.geometry.attributes.normal).toBeDefined();
    expect(result.geometry.attributes.uv).toBeDefined();
  });

  it('same seed produces same geometry (deterministic)', () => {
    const params = { type: 'house', seed: 42 };
    const r1 = buildingGenerator.generate(
      makeObj({ generator: 'parametric/building', prompt: 'house', params }),
    );
    const r2 = buildingGenerator.generate(
      makeObj({ generator: 'parametric/building', prompt: 'house', params }),
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
