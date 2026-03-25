import { describe, it, expect } from 'vitest';
import { characterGenerator } from '../parametric/character.ts';
import type { SceneObject } from '../types.ts';

function makeObj(overrides: Partial<SceneObject> = {}): SceneObject {
  return { id: 'test', prompt: 'a test object', ...overrides };
}

describe('Character Generator — canHandle', () => {
  it('returns 0.95 for generator: "parametric/character"', () => {
    expect(
      characterGenerator.canHandle(makeObj({ generator: 'parametric/character' })),
    ).toBe(0.95);
  });

  it('returns > 0 for character-related prompts', () => {
    expect(
      characterGenerator.canHandle(makeObj({ prompt: 'a human warrior' })),
    ).toBeGreaterThan(0);
  });

  it('returns 0.7 for prompts with 2+ keywords', () => {
    expect(
      characterGenerator.canHandle(makeObj({ prompt: 'a robot warrior figure' })),
    ).toBeGreaterThanOrEqual(0.7);
  });

  it('returns 0 for unrelated prompts', () => {
    expect(
      characterGenerator.canHandle(makeObj({ prompt: 'a flying saucer' })),
    ).toBe(0);
  });
});

describe('Character Generator — generate', () => {
  it('human type produces geometry', () => {
    const result = characterGenerator.generate(
      makeObj({ generator: 'parametric/character', prompt: 'human', params: { type: 'human' } }),
    );
    expect(result.geometry.attributes.position.count).toBeGreaterThan(0);
    expect(result.metadata.generator).toBe('parametric/character');
  });

  it('robot type produces geometry', () => {
    const result = characterGenerator.generate(
      makeObj({ generator: 'parametric/character', prompt: 'robot', params: { type: 'robot' } }),
    );
    expect(result.geometry.attributes.position.count).toBeGreaterThan(0);
  });

  it('creature type produces geometry', () => {
    const result = characterGenerator.generate(
      makeObj({ generator: 'parametric/character', prompt: 'creature', params: { type: 'creature' } }),
    );
    expect(result.geometry.attributes.position.count).toBeGreaterThan(0);
  });

  it('child type produces geometry', () => {
    const result = characterGenerator.generate(
      makeObj({ generator: 'parametric/character', prompt: 'child', params: { type: 'child' } }),
    );
    expect(result.geometry.attributes.position.count).toBeGreaterThan(0);
  });

  it('tpose pose works', () => {
    const result = characterGenerator.generate(
      makeObj({ generator: 'parametric/character', prompt: 'human', params: { type: 'human', pose: 'tpose' } }),
    );
    expect(result.geometry.attributes.position.count).toBeGreaterThan(0);
  });

  it('action pose works', () => {
    const result = characterGenerator.generate(
      makeObj({ generator: 'parametric/character', prompt: 'human', params: { type: 'human', pose: 'action' } }),
    );
    expect(result.geometry.attributes.position.count).toBeGreaterThan(0);
  });

  it('geometry has normals and UVs', () => {
    const result = characterGenerator.generate(
      makeObj({ generator: 'parametric/character', prompt: 'human' }),
    );
    expect(result.geometry.attributes.normal).toBeDefined();
    expect(result.geometry.attributes.uv).toBeDefined();
  });

  it('same seed produces same geometry (deterministic)', () => {
    const params = { type: 'human', seed: 42 };
    const r1 = characterGenerator.generate(
      makeObj({ generator: 'parametric/character', prompt: 'human', params }),
    );
    const r2 = characterGenerator.generate(
      makeObj({ generator: 'parametric/character', prompt: 'human', params }),
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
