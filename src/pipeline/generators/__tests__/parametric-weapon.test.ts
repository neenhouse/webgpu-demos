import { describe, it, expect } from 'vitest';
import { weaponGenerator } from '../parametric/weapon.ts';
import type { SceneObject } from '../types.ts';

function makeObj(overrides: Partial<SceneObject> = {}): SceneObject {
  return { id: 'test', prompt: 'a test object', ...overrides };
}

describe('Weapon Generator — canHandle', () => {
  it('returns 0.95 for generator: "parametric/weapon"', () => {
    expect(
      weaponGenerator.canHandle(makeObj({ generator: 'parametric/weapon' })),
    ).toBe(0.95);
  });

  it('returns > 0 for weapon-related prompts', () => {
    expect(
      weaponGenerator.canHandle(makeObj({ prompt: 'a sharp sword' })),
    ).toBeGreaterThan(0);
  });

  it('returns 0.7 for prompts with 2+ keywords', () => {
    expect(
      weaponGenerator.canHandle(makeObj({ prompt: 'a sword and shield weapon' })),
    ).toBeGreaterThanOrEqual(0.7);
  });

  it('returns 0 for unrelated prompts', () => {
    expect(
      weaponGenerator.canHandle(makeObj({ prompt: 'a flying saucer' })),
    ).toBe(0);
  });
});

describe('Weapon Generator — generate', () => {
  it('sword type produces geometry', () => {
    const result = weaponGenerator.generate(
      makeObj({ generator: 'parametric/weapon', prompt: 'sword', params: { type: 'sword' } }),
    );
    expect(result.geometry.attributes.position.count).toBeGreaterThan(0);
    expect(result.metadata.generator).toBe('parametric/weapon');
  });

  it('shield type produces geometry', () => {
    const result = weaponGenerator.generate(
      makeObj({ generator: 'parametric/weapon', prompt: 'shield', params: { type: 'shield' } }),
    );
    expect(result.geometry.attributes.position.count).toBeGreaterThan(0);
  });

  it('staff type produces geometry', () => {
    const result = weaponGenerator.generate(
      makeObj({ generator: 'parametric/weapon', prompt: 'staff', params: { type: 'staff' } }),
    );
    expect(result.geometry.attributes.position.count).toBeGreaterThan(0);
  });

  it('axe type produces geometry', () => {
    const result = weaponGenerator.generate(
      makeObj({ generator: 'parametric/weapon', prompt: 'axe', params: { type: 'axe' } }),
    );
    expect(result.geometry.attributes.position.count).toBeGreaterThan(0);
  });

  it('geometry has normals and UVs', () => {
    const result = weaponGenerator.generate(
      makeObj({ generator: 'parametric/weapon', prompt: 'sword' }),
    );
    expect(result.geometry.attributes.normal).toBeDefined();
    expect(result.geometry.attributes.uv).toBeDefined();
  });

  it('same seed produces same geometry (deterministic)', () => {
    const params = { type: 'sword', seed: 42 };
    const r1 = weaponGenerator.generate(
      makeObj({ generator: 'parametric/weapon', prompt: 'sword', params }),
    );
    const r2 = weaponGenerator.generate(
      makeObj({ generator: 'parametric/weapon', prompt: 'sword', params }),
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
