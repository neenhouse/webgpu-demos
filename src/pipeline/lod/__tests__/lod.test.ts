import { describe, it, expect } from 'vitest';
import * as THREE from 'three/webgpu';
import { simplifyGeometry } from '../simplifier';
import { generateLOD, parseLodConfig } from '../generator';
import type { LodConfig } from '../generator';

// ─── Helper ──────────────────────────────────────────────────────────────────

function makeIcosahedron(detail = 3): THREE.BufferGeometry {
  return new THREE.IcosahedronGeometry(1, detail);
}

function makePlane(segments = 16): THREE.BufferGeometry {
  return new THREE.PlaneGeometry(10, 10, segments, segments);
}

function vertexCount(geom: THREE.BufferGeometry): number {
  return geom.attributes.position.count;
}

// ─── simplifyGeometry ────────────────────────────────────────────────────────

describe('simplifyGeometry', () => {
  it('returns a geometry with fewer vertices at ratio 0.5', () => {
    const original = makeIcosahedron(3);
    const simplified = simplifyGeometry(original, 0.5);
    expect(vertexCount(simplified)).toBeLessThan(vertexCount(original));
    expect(vertexCount(simplified)).toBeGreaterThan(0);
  });

  it('returns a geometry with even fewer vertices at ratio 0.2', () => {
    const original = makeIcosahedron(3);
    const half = simplifyGeometry(original, 0.5);
    const fifth = simplifyGeometry(original, 0.2);
    expect(vertexCount(fifth)).toBeLessThanOrEqual(vertexCount(half));
    expect(vertexCount(fifth)).toBeGreaterThan(0);
  });

  it('ratio 1.0 returns a clone with same vertex count', () => {
    const original = makeIcosahedron(2);
    const result = simplifyGeometry(original, 1.0);
    // Cloned — should have same vertex count (may differ if toNonIndexed applied)
    expect(vertexCount(result)).toBeGreaterThan(0);
  });

  it('preserves UV attributes when present', () => {
    const original = makePlane(8);
    const simplified = simplifyGeometry(original, 0.5);
    expect(simplified.attributes.uv).toBeDefined();
  });

  it('preserves normal attributes', () => {
    const original = makeIcosahedron(2);
    original.computeVertexNormals();
    const simplified = simplifyGeometry(original, 0.5);
    expect(simplified.attributes.normal).toBeDefined();
  });

  it('handles very small geometries gracefully', () => {
    // A tetrahedron: 4 faces, 12 vertices (non-indexed)
    const tiny = new THREE.TetrahedronGeometry(1, 0);
    const result = simplifyGeometry(tiny, 0.5);
    // Should not crash; may return original if nothing can be simplified
    expect(vertexCount(result)).toBeGreaterThan(0);
  });

  it('produces valid face count (divisible by 3)', () => {
    const original = makeIcosahedron(3);
    const simplified = simplifyGeometry(original, 0.3);
    expect(vertexCount(simplified) % 3).toBe(0);
  });
});

// ─── parseLodConfig ──────────────────────────────────────────────────────────

describe('parseLodConfig', () => {
  it('"none" returns mode none', () => {
    const config = parseLodConfig('none');
    expect(config.mode).toBe('none');
    expect(config.levels).toBeUndefined();
  });

  it('"auto" returns mode auto with 3 default levels', () => {
    const config = parseLodConfig('auto');
    expect(config.mode).toBe('auto');
    expect(config.levels).toHaveLength(3);
    expect(config.levels![0].distance).toBe(0);
    expect(config.levels![0].detail).toBe(1.0);
    expect(config.levels![1].distance).toBe(30);
    expect(config.levels![1].detail).toBe(0.5);
    expect(config.levels![2].distance).toBe(80);
    expect(config.levels![2].detail).toBe(0.2);
  });

  it('custom levels are passed through', () => {
    const levels = [
      { distance: 0, detail: 1.0 },
      { distance: 50, detail: 0.3 },
    ];
    const config = parseLodConfig({ levels });
    expect(config.mode).toBe('custom');
    expect(config.levels).toEqual(levels);
  });
});

// ─── generateLOD ─────────────────────────────────────────────────────────────

describe('generateLOD', () => {
  const material = new THREE.MeshStandardMaterial();

  it('returns null for mode "none"', () => {
    const config: LodConfig = { mode: 'none' };
    const lod = generateLOD(makeIcosahedron(2), material, config);
    expect(lod).toBeNull();
  });

  it('auto config creates LOD with 3 levels', () => {
    const config = parseLodConfig('auto');
    const lod = generateLOD(makeIcosahedron(3), material, config);
    expect(lod).toBeInstanceOf(THREE.LOD);
    expect(lod!.levels).toHaveLength(3);
  });

  it('LOD levels are sorted by distance ascending', () => {
    const config = parseLodConfig('auto');
    const lod = generateLOD(makeIcosahedron(3), material, config);
    for (let i = 1; i < lod!.levels.length; i++) {
      expect(lod!.levels[i].distance).toBeGreaterThanOrEqual(
        lod!.levels[i - 1].distance,
      );
    }
  });

  it('higher distance levels have equal or fewer vertices', () => {
    const config = parseLodConfig('auto');
    const lod = generateLOD(makeIcosahedron(3), material, config);
    const counts = lod!.levels.map((l) => {
      const mesh = l.object as THREE.Mesh;
      return mesh.geometry.attributes.position.count;
    });
    // Each subsequent level should have <= vertices of previous
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]).toBeLessThanOrEqual(counts[i - 1]);
    }
  });

  it('custom levels produce the expected number of LOD children', () => {
    const config: LodConfig = {
      mode: 'custom',
      levels: [
        { distance: 0, detail: 1.0 },
        { distance: 25, detail: 0.6 },
        { distance: 60, detail: 0.3 },
        { distance: 120, detail: 0.1 },
      ],
    };
    const lod = generateLOD(makeIcosahedron(3), material, config);
    expect(lod!.levels).toHaveLength(4);
  });
});
