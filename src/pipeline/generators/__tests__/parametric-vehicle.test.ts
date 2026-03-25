import { describe, it, expect } from 'vitest';
import { vehicleGenerator } from '../parametric/vehicle.ts';
import type { SceneObject } from '../types.ts';

function makeObj(overrides: Partial<SceneObject> = {}): SceneObject {
  return { id: 'test', prompt: 'a test object', ...overrides };
}

describe('Vehicle Generator — canHandle', () => {
  it('returns 0.95 for generator: "parametric/vehicle"', () => {
    expect(
      vehicleGenerator.canHandle(makeObj({ generator: 'parametric/vehicle' })),
    ).toBe(0.95);
  });

  it('returns > 0 for vehicle-related prompts', () => {
    expect(
      vehicleGenerator.canHandle(makeObj({ prompt: 'a red sports car' })),
    ).toBeGreaterThan(0);
  });

  it('returns 0.7 for prompts with 2+ keywords', () => {
    expect(
      vehicleGenerator.canHandle(makeObj({ prompt: 'a truck and a van' })),
    ).toBeGreaterThanOrEqual(0.7);
  });

  it('returns 0 for unrelated prompts', () => {
    expect(
      vehicleGenerator.canHandle(makeObj({ prompt: 'a tall pine tree' })),
    ).toBe(0);
  });
});

describe('Vehicle Generator — generate', () => {
  it('sedan type produces geometry', () => {
    const result = vehicleGenerator.generate(
      makeObj({ generator: 'parametric/vehicle', prompt: 'car', params: { type: 'sedan' } }),
    );
    expect(result.geometry.attributes.position.count).toBeGreaterThan(0);
    expect(result.metadata.generator).toBe('parametric/vehicle');
  });

  it('truck type produces geometry', () => {
    const result = vehicleGenerator.generate(
      makeObj({ generator: 'parametric/vehicle', prompt: 'truck', params: { type: 'truck' } }),
    );
    expect(result.geometry.attributes.position.count).toBeGreaterThan(0);
  });

  it('motorcycle type produces geometry', () => {
    const result = vehicleGenerator.generate(
      makeObj({ generator: 'parametric/vehicle', prompt: 'motorcycle', params: { type: 'motorcycle' } }),
    );
    expect(result.geometry.attributes.position.count).toBeGreaterThan(0);
  });

  it('van type produces geometry', () => {
    const result = vehicleGenerator.generate(
      makeObj({ generator: 'parametric/vehicle', prompt: 'van', params: { type: 'van' } }),
    );
    expect(result.geometry.attributes.position.count).toBeGreaterThan(0);
  });

  it('geometry has normals and UVs', () => {
    const result = vehicleGenerator.generate(
      makeObj({ generator: 'parametric/vehicle', prompt: 'car' }),
    );
    expect(result.geometry.attributes.normal).toBeDefined();
    expect(result.geometry.attributes.uv).toBeDefined();
  });

  it('same seed produces same geometry (deterministic)', () => {
    const params = { type: 'sedan', seed: 42 };
    const r1 = vehicleGenerator.generate(
      makeObj({ generator: 'parametric/vehicle', prompt: 'car', params }),
    );
    const r2 = vehicleGenerator.generate(
      makeObj({ generator: 'parametric/vehicle', prompt: 'car', params }),
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
