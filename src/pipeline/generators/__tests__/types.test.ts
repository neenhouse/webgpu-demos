import { describe, it, expect } from 'vitest';
import {
  registerGenerator,
  getGenerators,
  selectGenerator,
  generateObject,
} from '../index.ts';
import { ERROR_MARKER_COLOR } from '../types.ts';
import type { Generator, SceneObject } from '../types.ts';

// Helper: create a minimal SceneObject
function makeObj(overrides: Partial<SceneObject> = {}): SceneObject {
  return { id: 'test', prompt: 'a test object', ...overrides };
}

describe('Generator Registry', () => {
  it('has generators registered from side-effect imports', () => {
    const gens = getGenerators();
    expect(gens.length).toBeGreaterThan(0);
    const names = gens.map(g => g.name);
    expect(names).toContain('csg');
    expect(names).toContain('sdf');
    expect(names).toContain('parametric');
  });

  it('selectGenerator returns the hinted generator when confidence > 0', () => {
    const obj = makeObj({ generator: 'csg', prompt: 'a box with holes' });
    const gen = selectGenerator(obj);
    expect(gen).not.toBeNull();
    expect(gen!.name).toBe('csg');
  });

  it('selectGenerator returns highest confidence without hint', () => {
    // 'terrain' keyword should match parametric terrain generator
    const obj = makeObj({ prompt: 'a hilly terrain landscape' });
    const gen = selectGenerator(obj);
    expect(gen).not.toBeNull();
    // Should match parametric (terrain sub-generator)
    expect(gen!.name).toBe('parametric');
  });

  it('selectGenerator returns null when no generator matches', () => {
    const obj = makeObj({ prompt: 'a fluffy cat sleeping' });
    const gen = selectGenerator(obj);
    expect(gen).toBeNull();
  });

  it('generateObject returns error marker when no generator matches', () => {
    const obj = makeObj({ prompt: 'a fluffy cat sleeping' });
    const result = generateObject(obj);
    expect(result.metadata.generator).toBe('error-marker');
    expect(result.material).toBeDefined();
  });

  it('generateObject returns error marker when generator throws', () => {
    // Create a throwing generator and register it
    const throwingGen: Generator = {
      name: 'test-thrower',
      canHandle(object: SceneObject) {
        return object.generator === 'test-thrower' ? 0.99 : 0;
      },
      generate() {
        throw new Error('intentional test failure');
      },
    };
    registerGenerator(throwingGen);

    const obj = makeObj({ generator: 'test-thrower', prompt: 'test' });
    const result = generateObject(obj);
    expect(result.metadata.generator).toBe('error-marker');
  });

  it('error marker has correct color and wireframe', () => {
    const obj = makeObj({ prompt: 'something with no match at all xyz123' });
    const result = generateObject(obj);
    expect(result.material).toBeDefined();
    // Check the material is a wireframe with the error color
    const mat = result.material as { color?: { getHex(): number }; wireframe?: boolean };
    expect(mat.wireframe).toBe(true);
    expect(mat.color?.getHex()).toBe(ERROR_MARKER_COLOR);
  });
});
