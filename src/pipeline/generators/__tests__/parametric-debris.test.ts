import { describe, it, expect } from 'vitest';
import { debrisGenerator } from '../parametric/debris.ts';
import type { SceneObject } from '../types.ts';

function makeObj(overrides: Partial<SceneObject> = {}): SceneObject {
  return { id: 'test', prompt: 'a test object', ...overrides };
}

describe('Debris Generator — canHandle', () => {
  it('returns 0.95 for generator: "parametric/debris"', () => {
    expect(
      debrisGenerator.canHandle(makeObj({ generator: 'parametric/debris' })),
    ).toBe(0.95);
  });

  it('returns > 0 for debris-related prompts', () => {
    expect(
      debrisGenerator.canHandle(makeObj({ prompt: 'a wooden crate' })),
    ).toBeGreaterThan(0);
  });

  it('returns 0.7 for prompts with 2+ keywords', () => {
    expect(
      debrisGenerator.canHandle(makeObj({ prompt: 'a barrel and some junk debris' })),
    ).toBeGreaterThanOrEqual(0.7);
  });

  it('returns 0 for unrelated prompts', () => {
    expect(
      debrisGenerator.canHandle(makeObj({ prompt: 'a flying saucer' })),
    ).toBe(0);
  });
});

describe('Debris Generator — generate', () => {
  it('crate type produces geometry', () => {
    const result = debrisGenerator.generate(
      makeObj({ generator: 'parametric/debris', prompt: 'crate', params: { type: 'crate' } }),
    );
    expect(result.geometry.attributes.position.count).toBeGreaterThan(0);
    expect(result.metadata.generator).toBe('parametric/debris');
  });

  it('tire type produces geometry', () => {
    const result = debrisGenerator.generate(
      makeObj({ generator: 'parametric/debris', prompt: 'tire', params: { type: 'tire' } }),
    );
    expect(result.geometry.attributes.position.count).toBeGreaterThan(0);
  });

  it('barrel type produces geometry', () => {
    const result = debrisGenerator.generate(
      makeObj({ generator: 'parametric/debris', prompt: 'barrel', params: { type: 'barrel' } }),
    );
    expect(result.geometry.attributes.position.count).toBeGreaterThan(0);
  });

  it('pipe type produces geometry', () => {
    const result = debrisGenerator.generate(
      makeObj({ generator: 'parametric/debris', prompt: 'pipe', params: { type: 'pipe' } }),
    );
    expect(result.geometry.attributes.position.count).toBeGreaterThan(0);
  });

  it('geometry has normals and UVs', () => {
    const result = debrisGenerator.generate(
      makeObj({ generator: 'parametric/debris', prompt: 'crate' }),
    );
    expect(result.geometry.attributes.normal).toBeDefined();
    expect(result.geometry.attributes.uv).toBeDefined();
  });

  it('same seed produces same geometry (deterministic)', () => {
    const params = { type: 'crate', seed: 42 };
    const r1 = debrisGenerator.generate(
      makeObj({ generator: 'parametric/debris', prompt: 'crate', params }),
    );
    const r2 = debrisGenerator.generate(
      makeObj({ generator: 'parametric/debris', prompt: 'crate', params }),
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
