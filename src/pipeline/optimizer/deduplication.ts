import * as THREE from 'three/webgpu';

/**
 * Deduplicate materials: return only unique materials.
 *
 * Equality is determined by comparing PBR-relevant properties:
 * color, roughness, metalness, opacity, emissive, side, transparent, wireframe.
 * For MeshStandardMaterial specifically, these properties are compared directly.
 * For other material types, reference equality is used.
 */
export function deduplicateMaterials<T extends THREE.Material>(materials: T[]): T[] {
  if (materials.length <= 1) return materials;

  const unique: T[] = [];
  const signatures = new Set<string>();

  for (const mat of materials) {
    const sig = materialSignature(mat);
    if (!signatures.has(sig)) {
      signatures.add(sig);
      unique.push(mat);
    }
  }

  return unique;
}

function materialSignature(mat: THREE.Material): string {
  // For MeshStandardMaterial and its subclasses, use PBR properties
  if ('color' in mat && 'roughness' in mat && 'metalness' in mat) {
    const m = mat as unknown as {
      color: THREE.Color;
      roughness: number;
      metalness: number;
      opacity: number;
      emissive?: THREE.Color;
      side: number;
      transparent: boolean;
      wireframe: boolean;
    };
    return [
      m.color.getHexString(),
      m.roughness.toFixed(3),
      m.metalness.toFixed(3),
      m.opacity.toFixed(3),
      m.emissive?.getHexString() ?? '000000',
      m.side,
      m.transparent,
      m.wireframe,
    ].join('|');
  }

  // Fallback: use uuid (reference equality)
  return mat.uuid;
}

/**
 * Deduplicate geometries: return only unique geometries.
 *
 * Two geometries are considered duplicates if they have the same:
 * - vertex count
 * - approximate bounding box (center + size, rounded)
 *
 * This is a heuristic — two geometries with identical bounding boxes and
 * vertex counts but different shapes would be falsely considered duplicates.
 * For procedurally generated scenes this is adequate and fast.
 */
export function deduplicateGeometries(
  geometries: THREE.BufferGeometry[],
): THREE.BufferGeometry[] {
  if (geometries.length <= 1) return geometries;

  const unique: THREE.BufferGeometry[] = [];
  const signatures = new Set<string>();

  for (const geom of geometries) {
    const sig = geometrySignature(geom);
    if (!signatures.has(sig)) {
      signatures.add(sig);
      unique.push(geom);
    }
  }

  return unique;
}

function geometrySignature(geom: THREE.BufferGeometry): string {
  const vertexCount = geom.attributes.position?.count ?? 0;

  geom.computeBoundingBox();
  const bbox = geom.boundingBox;

  if (!bbox) return `v${vertexCount}`;

  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  bbox.getCenter(center);
  bbox.getSize(size);

  // Round to 2 decimal places to allow small floating-point differences
  const p = 100;
  return [
    vertexCount,
    Math.round(center.x * p),
    Math.round(center.y * p),
    Math.round(center.z * p),
    Math.round(size.x * p),
    Math.round(size.y * p),
    Math.round(size.z * p),
  ].join(',');
}
