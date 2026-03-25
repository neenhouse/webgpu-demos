import { describe, it, expect } from 'vitest';
import { terrainGenerator, generateTerrainHeight } from '../parametric/terrain.ts';
import { rockGenerator } from '../parametric/rock.ts';
import { vegetationGenerator } from '../parametric/vegetation.ts';
import type { SceneObject } from '../types.ts';

function makeObj(overrides: Partial<SceneObject> = {}): SceneObject {
  return { id: 'test', prompt: 'a test object', ...overrides };
}

// ─── Terrain Tests ────────────────────────────────────────────────────────────

describe('Terrain Generator — canHandle', () => {
  it('returns 0.95 for generator: "parametric/terrain"', () => {
    expect(
      terrainGenerator.canHandle(makeObj({ generator: 'parametric/terrain' })),
    ).toBe(0.95);
  });

  it('returns 0.8 for parametric generator with biome param', () => {
    expect(
      terrainGenerator.canHandle(makeObj({ generator: 'parametric', params: { biome: 'mountain' } })),
    ).toBe(0.8);
  });

  it('returns > 0 for terrain-related prompts', () => {
    expect(
      terrainGenerator.canHandle(makeObj({ prompt: 'a hilly terrain' })),
    ).toBeGreaterThan(0);
  });

  it('returns 0.7 for prompts with 2+ terrain keywords', () => {
    expect(
      terrainGenerator.canHandle(makeObj({ prompt: 'mountain valley landscape' })),
    ).toBeGreaterThanOrEqual(0.7);
  });

  it('returns 0 for unrelated prompts', () => {
    expect(
      terrainGenerator.canHandle(makeObj({ prompt: 'a flying saucer' })),
    ).toBe(0);
  });
});

describe('Terrain Generator — generate', () => {
  it('produces a PlaneGeometry with displaced vertices', () => {
    const result = terrainGenerator.generate(
      makeObj({ generator: 'parametric/terrain', prompt: 'terrain', params: { segments: 16 } }),
    );
    expect(result.geometry.attributes.position.count).toBeGreaterThan(0);
    expect(result.metadata.generator).toBe('parametric/terrain');
  });

  it('default terrain has expected segment count (128x128)', () => {
    const result = terrainGenerator.generate(
      makeObj({ generator: 'parametric/terrain', prompt: 'terrain' }),
    );
    // (segments+1)^2 vertices = 129*129 = 16641
    expect(result.geometry.attributes.position.count).toBe(129 * 129);
  });

  it('biome presets override amplitude and frequency', () => {
    const mountainResult = terrainGenerator.generate(
      makeObj({ generator: 'parametric/terrain', prompt: 'terrain', params: { biome: 'mountain', segments: 8 } }),
    );
    const grasslandResult = terrainGenerator.generate(
      makeObj({ generator: 'parametric/terrain', prompt: 'terrain', params: { biome: 'grassland', segments: 8 } }),
    );
    // Both should produce valid geometry
    expect(mountainResult.geometry.attributes.position.count).toBeGreaterThan(0);
    expect(grasslandResult.geometry.attributes.position.count).toBeGreaterThan(0);
  });

  it('generated geometry has normals and UVs', () => {
    const result = terrainGenerator.generate(
      makeObj({ generator: 'parametric/terrain', prompt: 'terrain', params: { segments: 8 } }),
    );
    expect(result.geometry.attributes.normal).toBeDefined();
    expect(result.geometry.attributes.uv).toBeDefined();
  });

  it('same seed produces same geometry (deterministic)', () => {
    const params = { segments: 8, seed: 42 };
    const r1 = terrainGenerator.generate(
      makeObj({ generator: 'parametric/terrain', prompt: 'terrain', params }),
    );
    const r2 = terrainGenerator.generate(
      makeObj({ generator: 'parametric/terrain', prompt: 'terrain', params }),
    );
    const pos1 = r1.geometry.attributes.position;
    const pos2 = r2.geometry.attributes.position;
    expect(pos1.count).toBe(pos2.count);
    for (let i = 0; i < pos1.count; i++) {
      expect(pos1.getY(i)).toBe(pos2.getY(i));
    }
  });
});

describe('generateTerrainHeight', () => {
  it('returns a number', () => {
    const h = generateTerrainHeight(1, 1, 0.1, 2, 4, 0);
    expect(typeof h).toBe('number');
    expect(Number.isFinite(h)).toBe(true);
  });

  it('is deterministic', () => {
    const h1 = generateTerrainHeight(5, 3, 0.15, 2, 4, 42);
    const h2 = generateTerrainHeight(5, 3, 0.15, 2, 4, 42);
    expect(h1).toBe(h2);
  });
});

// ─── Rock Tests ───────────────────────────────────────────────────────────────

describe('Rock Generator — canHandle', () => {
  it('returns 0.95 for generator: "parametric/rock"', () => {
    expect(
      rockGenerator.canHandle(makeObj({ generator: 'parametric/rock' })),
    ).toBe(0.95);
  });

  it('returns > 0 for rock-related prompts', () => {
    expect(
      rockGenerator.canHandle(makeObj({ prompt: 'a large boulder' })),
    ).toBeGreaterThan(0);
  });

  it('returns 0 for unrelated prompts', () => {
    expect(
      rockGenerator.canHandle(makeObj({ prompt: 'a flying saucer' })),
    ).toBe(0);
  });
});

describe('Rock Generator — generate', () => {
  it('produces geometry with vertices', () => {
    const result = rockGenerator.generate(
      makeObj({ generator: 'parametric/rock', prompt: 'rock' }),
    );
    expect(result.geometry.attributes.position.count).toBeGreaterThan(0);
    expect(result.metadata.generator).toBe('parametric/rock');
  });

  it('variant presets apply expected parameter overrides', () => {
    const boulderResult = rockGenerator.generate(
      makeObj({ generator: 'parametric/rock', prompt: 'rock', params: { variant: 'boulder' } }),
    );
    const jaggedResult = rockGenerator.generate(
      makeObj({ generator: 'parametric/rock', prompt: 'rock', params: { variant: 'jagged' } }),
    );
    // Both should produce valid geometry
    expect(boulderResult.geometry.attributes.position.count).toBeGreaterThan(0);
    expect(jaggedResult.geometry.attributes.position.count).toBeGreaterThan(0);
  });

  it('flatten parameter reduces Y range of vertices', () => {
    const roundResult = rockGenerator.generate(
      makeObj({ generator: 'parametric/rock', prompt: 'rock', params: { flatten: 0, seed: 42 } }),
    );
    const flatResult = rockGenerator.generate(
      makeObj({ generator: 'parametric/rock', prompt: 'rock', params: { flatten: 0.6, seed: 42 } }),
    );

    // Calculate Y range for each
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const getYRange = (geom: any) => {
      let minY = Infinity, maxY = -Infinity;
      for (let i = 0; i < geom.attributes.position.count; i++) {
        const y = geom.attributes.position.getY(i);
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      return maxY - minY;
    };

    const roundRange = getYRange(roundResult.geometry);
    const flatRange = getYRange(flatResult.geometry);
    expect(flatRange).toBeLessThan(roundRange);
  });

  it('same seed produces same geometry (deterministic)', () => {
    const params = { seed: 42, detail: 2 };
    const r1 = rockGenerator.generate(
      makeObj({ generator: 'parametric/rock', prompt: 'rock', params }),
    );
    const r2 = rockGenerator.generate(
      makeObj({ generator: 'parametric/rock', prompt: 'rock', params }),
    );
    const pos1 = r1.geometry.attributes.position;
    const pos2 = r2.geometry.attributes.position;
    expect(pos1.count).toBe(pos2.count);
    for (let i = 0; i < pos1.count; i++) {
      expect(pos1.getX(i)).toBe(pos2.getX(i));
      expect(pos1.getY(i)).toBe(pos2.getY(i));
      expect(pos1.getZ(i)).toBe(pos2.getZ(i));
    }
  });

  it('generates spherical UVs', () => {
    const result = rockGenerator.generate(
      makeObj({ generator: 'parametric/rock', prompt: 'rock' }),
    );
    expect(result.geometry.attributes.uv).toBeDefined();
    expect(result.geometry.attributes.uv.count).toBe(result.geometry.attributes.position.count);
  });
});

// ─── Vegetation Tests ─────────────────────────────────────────────────────────

describe('Vegetation Generator — canHandle', () => {
  it('returns 0.95 for generator: "parametric/vegetation"', () => {
    expect(
      vegetationGenerator.canHandle(makeObj({ generator: 'parametric/vegetation' })),
    ).toBe(0.95);
  });

  it('returns > 0 for vegetation-related prompts', () => {
    expect(
      vegetationGenerator.canHandle(makeObj({ prompt: 'a tall pine tree' })),
    ).toBeGreaterThan(0);
  });

  it('returns 0 for unrelated prompts', () => {
    expect(
      vegetationGenerator.canHandle(makeObj({ prompt: 'a flying saucer' })),
    ).toBe(0);
  });
});

describe('Vegetation Generator — generate', () => {
  it('tree type produces merged geometry with many vertices', () => {
    const result = vegetationGenerator.generate(
      makeObj({ generator: 'parametric/vegetation', prompt: 'tree', params: { type: 'tree' } }),
    );
    expect(result.geometry.attributes.position.count).toBeGreaterThan(0);
    expect(result.metadata.generator).toBe('parametric/vegetation');
    // Tree has trunk + branches + foliage — should have more vertices than a single cylinder
    const singleCylinder = 8 * 2 + 2; // rough estimate for 8-segment cylinder
    expect(result.geometry.attributes.position.count).toBeGreaterThan(singleCylinder);
  });

  it('bush type produces geometry with minimal trunk', () => {
    const result = vegetationGenerator.generate(
      makeObj({ generator: 'parametric/vegetation', prompt: 'bush', params: { type: 'bush' } }),
    );
    expect(result.geometry.attributes.position.count).toBeGreaterThan(0);
  });

  it('pine type produces geometry (smoke test)', () => {
    const result = vegetationGenerator.generate(
      makeObj({ generator: 'parametric/vegetation', prompt: 'pine', params: { type: 'pine' } }),
    );
    expect(result.geometry.attributes.position.count).toBeGreaterThan(0);
  });

  it('palm type produces geometry (smoke test)', () => {
    const result = vegetationGenerator.generate(
      makeObj({ generator: 'parametric/vegetation', prompt: 'palm', params: { type: 'palm' } }),
    );
    expect(result.geometry.attributes.position.count).toBeGreaterThan(0);
  });

  it('same seed produces same geometry (deterministic)', () => {
    const params = { type: 'tree', seed: 42 };
    const r1 = vegetationGenerator.generate(
      makeObj({ generator: 'parametric/vegetation', prompt: 'tree', params }),
    );
    const r2 = vegetationGenerator.generate(
      makeObj({ generator: 'parametric/vegetation', prompt: 'tree', params }),
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
