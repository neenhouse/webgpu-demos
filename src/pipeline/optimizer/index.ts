import type * as THREE from 'three/webgpu';
import { cleanupMesh } from './mesh-cleanup';
import { deduplicateMaterials, deduplicateGeometries } from './deduplication';

export { cleanupMesh } from './mesh-cleanup';
export { deduplicateMaterials, deduplicateGeometries } from './deduplication';

/**
 * An object that can be optimized: has a geometry and optionally a material.
 */
export interface OptimizableObject {
  geometry: THREE.BufferGeometry;
  material?: THREE.Material;
}

/**
 * Result of scene optimization.
 */
export interface OptimizedResult {
  /** Cleaned and deduplicated geometries */
  geometries: THREE.BufferGeometry[];
  /** Deduplicated materials */
  materials: THREE.Material[];
  /** Stats about what was optimized */
  stats: {
    inputObjectCount: number;
    uniqueGeometries: number;
    uniqueMaterials: number;
    verticesRemoved: number;
    degenerateFacesRemoved: number;
  };
}

/**
 * Optimize a set of scene objects:
 * 1. Clean up each mesh (remove degenerate triangles, merge duplicate vertices)
 * 2. Deduplicate geometries
 * 3. Deduplicate materials
 *
 * @param objects  Array of objects with geometry and optional material
 * @returns  Optimized result with unique geometries and materials
 */
export function optimizeScene(objects: OptimizableObject[]): OptimizedResult {
  if (objects.length === 0) {
    return {
      geometries: [],
      materials: [],
      stats: {
        inputObjectCount: 0,
        uniqueGeometries: 0,
        uniqueMaterials: 0,
        verticesRemoved: 0,
        degenerateFacesRemoved: 0,
      },
    };
  }

  let totalVerticesBefore = 0;
  let totalVerticesAfter = 0;
  let totalFacesBefore = 0;
  let totalFacesAfter = 0;

  // Step 1: Clean up each mesh
  const cleanedGeometries: THREE.BufferGeometry[] = [];
  const allMaterials: THREE.Material[] = [];

  for (const obj of objects) {
    const origVerts = obj.geometry.attributes.position?.count ?? 0;
    const origFaces = obj.geometry.index
      ? obj.geometry.index.count / 3
      : Math.floor(origVerts / 3);

    totalVerticesBefore += origVerts;
    totalFacesBefore += origFaces;

    const cleaned = cleanupMesh(obj.geometry);
    const cleanedVerts = cleaned.attributes.position?.count ?? 0;
    const cleanedFaces = cleaned.index
      ? cleaned.index.count / 3
      : Math.floor(cleanedVerts / 3);

    totalVerticesAfter += cleanedVerts;
    totalFacesAfter += cleanedFaces;

    cleanedGeometries.push(cleaned);

    if (obj.material) {
      allMaterials.push(obj.material);
    }
  }

  // Step 2: Deduplicate geometries
  const uniqueGeometries = deduplicateGeometries(cleanedGeometries);

  // Step 3: Deduplicate materials
  const uniqueMaterials = deduplicateMaterials(allMaterials);

  return {
    geometries: uniqueGeometries,
    materials: uniqueMaterials,
    stats: {
      inputObjectCount: objects.length,
      uniqueGeometries: uniqueGeometries.length,
      uniqueMaterials: uniqueMaterials.length,
      verticesRemoved: totalVerticesBefore - totalVerticesAfter,
      degenerateFacesRemoved: totalFacesBefore - totalFacesAfter,
    },
  };
}
