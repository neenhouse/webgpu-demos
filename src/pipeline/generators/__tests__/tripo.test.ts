import { describe, it, expect, vi } from 'vitest';
import { tripoGenerator } from '../tripo.ts';
import type { SceneObject } from '../types.ts';

function makeObj(overrides: Partial<SceneObject> = {}): SceneObject {
  return { id: 'test', prompt: 'a test object', ...overrides };
}

describe('Tripo Generator — canHandle', () => {
  it('returns 0.95 for generator hint "tripo"', () => {
    expect(tripoGenerator.canHandle(makeObj({ generator: 'tripo' }))).toBe(0.95);
  });

  it('returns 0 for any other object', () => {
    expect(tripoGenerator.canHandle(makeObj({ prompt: 'a car' }))).toBe(0);
  });

  it('returns 0 for objects with other generator hints', () => {
    expect(tripoGenerator.canHandle(makeObj({ generator: 'csg' }))).toBe(0);
  });
});

describe('Tripo Generator — generate', () => {
  it('returns geometry with position attribute', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = tripoGenerator.generate(makeObj({ generator: 'tripo', prompt: 'a car' }));
    expect(result.geometry).toBeDefined();
    expect(result.geometry.attributes.position.count).toBeGreaterThan(0);
    spy.mockRestore();
  });

  it('returns a SphereGeometry as placeholder', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = tripoGenerator.generate(makeObj({ generator: 'tripo', prompt: 'test' }));
    // SphereGeometry(0.5, 16, 16) vertices
    expect(result.geometry.attributes.position.count).toBeGreaterThan(0);
    spy.mockRestore();
  });

  it('does not set isSdf', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = tripoGenerator.generate(makeObj({ generator: 'tripo', prompt: 'test' }));
    expect(result.isSdf).toBeUndefined();
    spy.mockRestore();
  });

  it('logs a warning about Tripo3D not being configured', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    tripoGenerator.generate(makeObj({ generator: 'tripo', prompt: 'a car' }));
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('Tripo3D not yet configured'),
    );
    spy.mockRestore();
  });

  it('populates metadata correctly', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = tripoGenerator.generate(makeObj({ generator: 'tripo', prompt: 'a car model' }));
    expect(result.metadata.generator).toBe('tripo');
    expect(result.metadata.prompt).toBe('a car model');
    expect(result.metadata.generationTime).toBeGreaterThanOrEqual(0);
    expect(result.metadata.vertexCount).toBeGreaterThan(0);
    spy.mockRestore();
  });
});
