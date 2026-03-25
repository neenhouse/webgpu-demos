import { describe, it, expect } from 'vitest';
import { organicGenerator } from '../parametric/organic.ts';
import type { SceneObject } from '../types.ts';

function makeObj(overrides: Partial<SceneObject> = {}): SceneObject {
  return { id: 'test', prompt: 'a test object', ...overrides };
}

describe('Organic Generator — canHandle', () => {
  it('returns 0.95 for generator: "parametric/organic"', () => {
    expect(
      organicGenerator.canHandle(makeObj({ generator: 'parametric/organic' })),
    ).toBe(0.95);
  });

  it('returns > 0 for organic-related prompts', () => {
    expect(
      organicGenerator.canHandle(makeObj({ prompt: 'a giant mushroom' })),
    ).toBeGreaterThan(0);
  });

  it('returns 0.7 for prompts with 2+ keywords', () => {
    expect(
      organicGenerator.canHandle(makeObj({ prompt: 'an alien organic growth' })),
    ).toBeGreaterThanOrEqual(0.7);
  });

  it('returns 0 for unrelated prompts', () => {
    expect(
      organicGenerator.canHandle(makeObj({ prompt: 'a flying saucer' })),
    ).toBe(0);
  });
});

describe('Organic Generator — generate', () => {
  it('mushroom type produces geometry', () => {
    const result = organicGenerator.generate(
      makeObj({ generator: 'parametric/organic', prompt: 'mushroom', params: { type: 'mushroom' } }),
    );
    expect(result.geometry.attributes.position.count).toBeGreaterThan(0);
    expect(result.metadata.generator).toBe('parametric/organic');
  });

  it('coral type produces geometry', () => {
    const result = organicGenerator.generate(
      makeObj({ generator: 'parametric/organic', prompt: 'coral', params: { type: 'coral' } }),
    );
    expect(result.geometry.attributes.position.count).toBeGreaterThan(0);
  });

  it('alien_growth type produces geometry', () => {
    const result = organicGenerator.generate(
      makeObj({ generator: 'parametric/organic', prompt: 'alien growth', params: { type: 'alien_growth' } }),
    );
    expect(result.geometry.attributes.position.count).toBeGreaterThan(0);
  });

  it('shell type produces geometry', () => {
    const result = organicGenerator.generate(
      makeObj({ generator: 'parametric/organic', prompt: 'shell', params: { type: 'shell' } }),
    );
    expect(result.geometry.attributes.position.count).toBeGreaterThan(0);
  });

  it('geometry has normals and UVs', () => {
    const result = organicGenerator.generate(
      makeObj({ generator: 'parametric/organic', prompt: 'mushroom' }),
    );
    expect(result.geometry.attributes.normal).toBeDefined();
    expect(result.geometry.attributes.uv).toBeDefined();
  });

  it('same seed produces same geometry (deterministic)', () => {
    const params = { type: 'mushroom', seed: 42 };
    const r1 = organicGenerator.generate(
      makeObj({ generator: 'parametric/organic', prompt: 'mushroom', params }),
    );
    const r2 = organicGenerator.generate(
      makeObj({ generator: 'parametric/organic', prompt: 'mushroom', params }),
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
