import * as THREE from 'three/webgpu';

const EPSILON = 1e-6;

/**
 * Clean up a BufferGeometry:
 * 1. Remove degenerate triangles (zero-area faces)
 * 2. Merge duplicate vertices (within epsilon distance)
 *
 * @param geometry  Source geometry (will NOT be mutated)
 * @returns  A new, cleaned-up BufferGeometry
 */
export function cleanupMesh(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  // Work with non-indexed geometry
  const source = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  const positions = source.attributes.position;
  const vertexCount = positions.count;

  if (vertexCount < 3) return source;

  const hasNormals = !!source.attributes.normal;
  const hasUVs = !!source.attributes.uv;
  const normals = source.attributes.normal;
  const uvs = source.attributes.uv;

  // Step 1: Remove degenerate triangles (zero-area or near-zero-area faces)
  const faceCount = Math.floor(vertexCount / 3);
  const validFaces: number[] = []; // indices of valid face starts

  for (let f = 0; f < faceCount; f++) {
    const base = f * 3;

    const ax = positions.getX(base);
    const ay = positions.getY(base);
    const az = positions.getZ(base);
    const bx = positions.getX(base + 1);
    const by = positions.getY(base + 1);
    const bz = positions.getZ(base + 1);
    const cx = positions.getX(base + 2);
    const cy = positions.getY(base + 2);
    const cz = positions.getZ(base + 2);

    // Edge vectors
    const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
    const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;

    // Cross product = 2 * area
    const crossX = e1y * e2z - e1z * e2y;
    const crossY = e1z * e2x - e1x * e2z;
    const crossZ = e1x * e2y - e1y * e2x;

    const area2 = Math.sqrt(crossX * crossX + crossY * crossY + crossZ * crossZ);

    if (area2 > EPSILON) {
      validFaces.push(base);
    }
  }

  // If no faces were removed, proceed to vertex dedup on original data
  if (validFaces.length === faceCount) {
    return mergeVertices(source);
  }

  // Build filtered geometry
  const newPositions: number[] = [];
  const newNormals: number[] = [];
  const newUVs: number[] = [];

  for (const base of validFaces) {
    for (let v = 0; v < 3; v++) {
      const i = base + v;
      newPositions.push(positions.getX(i), positions.getY(i), positions.getZ(i));
      if (hasNormals) {
        newNormals.push(normals.getX(i), normals.getY(i), normals.getZ(i));
      }
      if (hasUVs) {
        newUVs.push(uvs.getX(i), uvs.getY(i));
      }
    }
  }

  const cleaned = new THREE.BufferGeometry();
  cleaned.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
  if (hasNormals && newNormals.length > 0) {
    cleaned.setAttribute('normal', new THREE.Float32BufferAttribute(newNormals, 3));
  }
  if (hasUVs && newUVs.length > 0) {
    cleaned.setAttribute('uv', new THREE.Float32BufferAttribute(newUVs, 2));
  }

  return mergeVertices(cleaned);
}

/**
 * Merge duplicate vertices within epsilon distance.
 * Converts the geometry to an indexed format to share vertices.
 */
function mergeVertices(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const positions = geometry.attributes.position;
  const vertexCount = positions.count;

  if (vertexCount < 3) return geometry;

  const hasNormals = !!geometry.attributes.normal;
  const hasUVs = !!geometry.attributes.uv;
  const normals = geometry.attributes.normal;
  const uvs = geometry.attributes.uv;

  // Spatial hash for vertex dedup
  const precision = 1e4; // round to this precision for hashing
  const uniqueVertices: number[] = [];
  const uniqueNormals: number[] = [];
  const uniqueUVs: number[] = [];
  const indices: number[] = [];
  const vertexMap = new Map<string, number>();

  let uniqueCount = 0;

  for (let i = 0; i < vertexCount; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);

    // Hash key based on rounded position
    const key = `${Math.round(x * precision)},${Math.round(y * precision)},${Math.round(z * precision)}`;

    if (vertexMap.has(key)) {
      indices.push(vertexMap.get(key)!);
    } else {
      const idx = uniqueCount++;
      vertexMap.set(key, idx);
      uniqueVertices.push(x, y, z);
      if (hasNormals) {
        uniqueNormals.push(normals.getX(i), normals.getY(i), normals.getZ(i));
      }
      if (hasUVs) {
        uniqueUVs.push(uvs.getX(i), uvs.getY(i));
      }
      indices.push(idx);
    }
  }

  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(uniqueVertices, 3));
  if (hasNormals && uniqueNormals.length > 0) {
    result.setAttribute('normal', new THREE.Float32BufferAttribute(uniqueNormals, 3));
  }
  if (hasUVs && uniqueUVs.length > 0) {
    result.setAttribute('uv', new THREE.Float32BufferAttribute(uniqueUVs, 2));
  }
  result.setIndex(indices);

  return result;
}
