import * as THREE from 'three/webgpu';

/**
 * Simplify a BufferGeometry by merging vertices within a distance threshold
 * and rebuilding faces.
 *
 * Uses grid-based vertex clustering: the grid cell size is chosen so that the
 * total number of clusters approximates targetRatio * originalVertexCount.
 *
 * @param geometry  Source geometry (will NOT be mutated)
 * @param targetRatio  0-1, proportion of vertices to keep (0.5 = 50%, 0.2 = 20%)
 * @returns  A new, simplified BufferGeometry
 */
export function simplifyGeometry(
  geometry: THREE.BufferGeometry,
  targetRatio: number,
): THREE.BufferGeometry {
  // Clamp ratio
  const ratio = Math.max(0.01, Math.min(1, targetRatio));
  if (ratio >= 1) return geometry.clone();

  // Work with non-indexed geometry for simplicity
  const source = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  const positions = source.attributes.position;
  const vertexCount = positions.count;

  if (vertexCount < 6) return source;

  // Compute bounding box to determine merge threshold
  source.computeBoundingBox();
  const bbox = source.boundingBox!;
  const size = new THREE.Vector3();
  bbox.getSize(size);

  // Desired number of unique clusters ~ ratio * unique vertex count
  // For non-indexed geometry, faces share no vertices, so unique count ~ vertexCount
  // but many face-vertices share the same position. Estimate unique positions as ~vertexCount/3.
  const estimatedUnique = vertexCount / 3;
  const targetClusters = Math.max(4, Math.floor(estimatedUnique * ratio));

  // Volume of bounding box
  const volume = Math.max(size.x, 0.001) * Math.max(size.y, 0.001) * Math.max(size.z, 0.001);

  // cellSize such that (volume / cellSize^3) ~ targetClusters
  const cellSize = Math.cbrt(volume / targetClusters);

  // Build a grid-based spatial hash for vertex clustering
  const clusterMap = new Map<string, [number, number]>(); // key -> [cluster index, count]
  const clusterCentroids: THREE.Vector3[] = [];
  const vertexToCluster = new Int32Array(vertexCount);

  for (let i = 0; i < vertexCount; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);

    const cx = Math.floor(x / cellSize);
    const cy = Math.floor(y / cellSize);
    const cz = Math.floor(z / cellSize);
    const key = `${cx},${cy},${cz}`;

    if (!clusterMap.has(key)) {
      const idx = clusterCentroids.length;
      clusterMap.set(key, [idx, 1]);
      clusterCentroids.push(new THREE.Vector3(x, y, z));
      vertexToCluster[i] = idx;
    } else {
      const entry = clusterMap.get(key)!;
      const idx = entry[0];
      const prevCount = entry[1];
      entry[1] = prevCount + 1;
      // Running average for centroid
      const c = clusterCentroids[idx];
      c.x = (c.x * prevCount + x) / (prevCount + 1);
      c.y = (c.y * prevCount + y) / (prevCount + 1);
      c.z = (c.z * prevCount + z) / (prevCount + 1);
      vertexToCluster[i] = idx;
    }
  }

  // Rebuild faces: for each triangle, map vertices to cluster centroids.
  // Skip degenerate triangles where two or more vertices map to the same cluster.
  const faceCount = Math.floor(vertexCount / 3);
  const newPositions: number[] = [];
  const hasNormals = !!source.attributes.normal;
  const hasUVs = !!source.attributes.uv;
  const normals = source.attributes.normal;
  const uvs = source.attributes.uv;
  const newNormals: number[] = [];
  const newUVs: number[] = [];

  for (let f = 0; f < faceCount; f++) {
    const i0 = f * 3;
    const i1 = f * 3 + 1;
    const i2 = f * 3 + 2;

    const c0 = vertexToCluster[i0];
    const c1 = vertexToCluster[i1];
    const c2 = vertexToCluster[i2];

    // Skip degenerate: two or more vertices in same cluster
    if (c0 === c1 || c1 === c2 || c0 === c2) continue;

    // Use cluster centroids as new vertex positions
    const p0 = clusterCentroids[c0];
    const p1 = clusterCentroids[c1];
    const p2 = clusterCentroids[c2];

    newPositions.push(p0.x, p0.y, p0.z);
    newPositions.push(p1.x, p1.y, p1.z);
    newPositions.push(p2.x, p2.y, p2.z);

    if (hasNormals) {
      newNormals.push(
        normals.getX(i0), normals.getY(i0), normals.getZ(i0),
        normals.getX(i1), normals.getY(i1), normals.getZ(i1),
        normals.getX(i2), normals.getY(i2), normals.getZ(i2),
      );
    }

    if (hasUVs) {
      newUVs.push(
        uvs.getX(i0), uvs.getY(i0),
        uvs.getX(i1), uvs.getY(i1),
        uvs.getX(i2), uvs.getY(i2),
      );
    }
  }

  // If simplification produced no faces, return the source geometry
  if (newPositions.length === 0) {
    return source;
  }

  const simplified = new THREE.BufferGeometry();
  simplified.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(newPositions, 3),
  );

  if (hasNormals && newNormals.length > 0) {
    simplified.setAttribute(
      'normal',
      new THREE.Float32BufferAttribute(newNormals, 3),
    );
  } else {
    simplified.computeVertexNormals();
  }

  if (hasUVs && newUVs.length > 0) {
    simplified.setAttribute(
      'uv',
      new THREE.Float32BufferAttribute(newUVs, 2),
    );
  }

  return simplified;
}
