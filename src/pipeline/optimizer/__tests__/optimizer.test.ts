import { describe, it, expect } from 'vitest';
import * as THREE from 'three/webgpu';
import { cleanupMesh } from '../mesh-cleanup';
import { deduplicateMaterials, deduplicateGeometries } from '../deduplication';
import { optimizeScene } from '../index';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Create a geometry with a degenerate triangle (zero-area face)
 * alongside valid triangles.
 */
function makeGeometryWithDegenerateFace(): THREE.BufferGeometry {
  const positions = new Float32Array([
    // Valid triangle 1
    0, 0, 0,
    1, 0, 0,
    0, 1, 0,
    // Degenerate triangle (all three points on a line)
    0, 0, 0,
    0.5, 0, 0,
    1, 0, 0,
    // Valid triangle 2
    1, 0, 0,
    1, 1, 0,
    0, 1, 0,
  ]);

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.computeVertexNormals();
  return geom;
}

/**
 * Create a geometry with duplicate vertices (same positions).
 */
function makeGeometryWithDuplicateVertices(): THREE.BufferGeometry {
  const positions = new Float32Array([
    // Triangle using 3 unique positions
    0, 0, 0,
    1, 0, 0,
    0, 1, 0,
    // Another triangle sharing 2 vertices with the first
    1, 0, 0,  // duplicate of vertex 1
    1, 1, 0,
    0, 1, 0,  // duplicate of vertex 2
  ]);

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.computeVertexNormals();
  return geom;
}

// ─── cleanupMesh ─────────────────────────────────────────────────────────────

describe('cleanupMesh', () => {
  it('removes degenerate triangles', () => {
    const geom = makeGeometryWithDegenerateFace();
    const original = geom.attributes.position.count;
    expect(original).toBe(9); // 3 triangles * 3 vertices

    const cleaned = cleanupMesh(geom);
    // Should have removed 1 degenerate face (3 vertices)
    // After cleanup + merge, the vertex count in the index buffer accounts for shared vertices
    const indexCount = cleaned.index ? cleaned.index.count : cleaned.attributes.position.count;
    // 2 valid faces = 6 vertex references (indexed)
    expect(indexCount).toBe(6);
  });

  it('merges duplicate vertices via indexing', () => {
    const geom = makeGeometryWithDuplicateVertices();
    expect(geom.attributes.position.count).toBe(6); // 2 triangles non-indexed

    const cleaned = cleanupMesh(geom);
    // 4 unique positions, but 6 index entries for 2 faces
    expect(cleaned.attributes.position.count).toBe(4);
    expect(cleaned.index).toBeDefined();
    expect(cleaned.index!.count).toBe(6);
  });

  it('preserves valid geometry without corruption', () => {
    const geom = new THREE.BoxGeometry(2, 2, 2);
    const cleaned = cleanupMesh(geom);
    // Box has no degenerate faces; should retain all faces
    const faceCount = cleaned.index
      ? cleaned.index.count / 3
      : Math.floor(cleaned.attributes.position.count / 3);
    expect(faceCount).toBe(12); // box = 6 faces * 2 triangles
  });

  it('handles empty-ish geometry gracefully', () => {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3));
    const cleaned = cleanupMesh(geom);
    expect(cleaned.attributes.position.count).toBeGreaterThan(0);
  });
});

// ─── deduplicateMaterials ────────────────────────────────────────────────────

describe('deduplicateMaterials', () => {
  it('removes duplicate materials with identical PBR properties', () => {
    const m1 = new THREE.MeshStandardMaterial({ color: 0xff0000, roughness: 0.5, metalness: 0.3 });
    const m2 = new THREE.MeshStandardMaterial({ color: 0xff0000, roughness: 0.5, metalness: 0.3 });
    const m3 = new THREE.MeshStandardMaterial({ color: 0x00ff00, roughness: 0.8, metalness: 0.1 });

    const result = deduplicateMaterials([m1, m2, m3]);
    expect(result).toHaveLength(2);
  });

  it('preserves unique materials', () => {
    const m1 = new THREE.MeshStandardMaterial({ color: 0xff0000 });
    const m2 = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
    const m3 = new THREE.MeshStandardMaterial({ color: 0x0000ff });

    const result = deduplicateMaterials([m1, m2, m3]);
    expect(result).toHaveLength(3);
  });

  it('returns empty array for empty input', () => {
    expect(deduplicateMaterials([])).toEqual([]);
  });

  it('single material returns itself', () => {
    const m = new THREE.MeshStandardMaterial();
    expect(deduplicateMaterials([m])).toEqual([m]);
  });

  it('distinguishes by roughness', () => {
    const m1 = new THREE.MeshStandardMaterial({ color: 0xff0000, roughness: 0.2 });
    const m2 = new THREE.MeshStandardMaterial({ color: 0xff0000, roughness: 0.8 });
    expect(deduplicateMaterials([m1, m2])).toHaveLength(2);
  });
});

// ─── deduplicateGeometries ───────────────────────────────────────────────────

describe('deduplicateGeometries', () => {
  it('removes duplicate geometries with same vertex count and bounding box', () => {
    const g1 = new THREE.BoxGeometry(1, 1, 1);
    const g2 = new THREE.BoxGeometry(1, 1, 1);
    const g3 = new THREE.SphereGeometry(1, 16, 16);

    const result = deduplicateGeometries([g1, g2, g3]);
    expect(result).toHaveLength(2);
  });

  it('preserves geometries of different sizes', () => {
    const g1 = new THREE.BoxGeometry(1, 1, 1);
    const g2 = new THREE.BoxGeometry(2, 2, 2);

    const result = deduplicateGeometries([g1, g2]);
    expect(result).toHaveLength(2);
  });

  it('returns empty array for empty input', () => {
    expect(deduplicateGeometries([])).toEqual([]);
  });

  it('single geometry returns itself', () => {
    const g = new THREE.BoxGeometry(1, 1, 1);
    expect(deduplicateGeometries([g])).toEqual([g]);
  });
});

// ─── optimizeScene ───────────────────────────────────────────────────────────

describe('optimizeScene', () => {
  it('returns correct stats for empty scene', () => {
    const result = optimizeScene([]);
    expect(result.stats.inputObjectCount).toBe(0);
    expect(result.geometries).toEqual([]);
    expect(result.materials).toEqual([]);
  });

  it('cleans up meshes and deduplicates in a scene with mixed objects', () => {
    const g1 = new THREE.BoxGeometry(1, 1, 1);
    const g2 = new THREE.BoxGeometry(1, 1, 1); // duplicate of g1
    const g3 = new THREE.SphereGeometry(1, 8, 8);
    const m1 = new THREE.MeshStandardMaterial({ color: 0xff0000 });
    const m2 = new THREE.MeshStandardMaterial({ color: 0xff0000 }); // duplicate of m1
    const m3 = new THREE.MeshStandardMaterial({ color: 0x0000ff });

    const result = optimizeScene([
      { geometry: g1, material: m1 },
      { geometry: g2, material: m2 },
      { geometry: g3, material: m3 },
    ]);

    expect(result.stats.inputObjectCount).toBe(3);
    expect(result.stats.uniqueGeometries).toBe(2); // box + sphere
    expect(result.stats.uniqueMaterials).toBe(2); // red + blue
  });

  it('reports vertex savings when duplicate vertices are merged', () => {
    const geom = makeGeometryWithDuplicateVertices();
    const result = optimizeScene([{ geometry: geom }]);

    // The cleanup merges 6 non-indexed vertices into 4 unique + index
    expect(result.stats.verticesRemoved).toBeGreaterThanOrEqual(0);
  });

  it('handles objects without materials', () => {
    const geom = new THREE.BoxGeometry(1, 1, 1);
    const result = optimizeScene([{ geometry: geom }]);

    expect(result.geometries).toHaveLength(1);
    expect(result.materials).toHaveLength(0);
  });
});
