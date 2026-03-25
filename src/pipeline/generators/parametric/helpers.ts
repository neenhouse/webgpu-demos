import * as THREE from 'three/webgpu';

/** Simple seeded random number generator */
export function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/**
 * Normalize geometry for merging: convert to non-indexed and ensure UVs exist.
 * mergeGeometries requires all geometries to either be indexed or non-indexed.
 * We standardize on non-indexed to avoid compatibility issues.
 */
export function normalizeForMerge(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  let geom = geometry;
  if (geom.index) {
    geom = geom.toNonIndexed();
  }
  return ensureUVs(geom);
}

/**
 * Ensure a geometry has UV attributes.
 * If none exist, generate simple spherical UVs.
 */
export function ensureUVs(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  if (geometry.attributes.uv) return geometry;

  const positions = geometry.attributes.position;
  const uvs = new Float32Array(positions.count * 2);
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);
    const len = Math.sqrt(x * x + y * y + z * z) || 1;
    uvs[i * 2] = 0.5 + Math.atan2(z / len, x / len) / (2 * Math.PI);
    uvs[i * 2 + 1] = 0.5 - Math.asin(Math.max(-1, Math.min(1, y / len))) / Math.PI;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geometry;
}

/**
 * Generate box-mapped UVs for a geometry (better for boxy shapes than spherical UVs).
 * Projects UVs based on the dominant face normal axis.
 */
export function ensureBoxUVs(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  if (geometry.attributes.uv) return geometry;

  const positions = geometry.attributes.position;
  const normals = geometry.attributes.normal;
  const uvs = new Float32Array(positions.count * 2);

  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);
    const nx = normals ? Math.abs(normals.getX(i)) : 0;
    const ny = normals ? Math.abs(normals.getY(i)) : 0;
    const nz = normals ? Math.abs(normals.getZ(i)) : 0;

    // Project onto the plane most facing the normal
    if (nx >= ny && nx >= nz) {
      uvs[i * 2] = z;
      uvs[i * 2 + 1] = y;
    } else if (ny >= nx && ny >= nz) {
      uvs[i * 2] = x;
      uvs[i * 2 + 1] = z;
    } else {
      uvs[i * 2] = x;
      uvs[i * 2 + 1] = y;
    }
  }

  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geometry;
}
