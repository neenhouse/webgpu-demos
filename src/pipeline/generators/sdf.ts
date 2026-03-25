import * as THREE from 'three/webgpu';
import {
  Fn,
  float,
  vec3,
  vec4,
  Loop,
  Break,
  If,
  cameraPosition,
  positionWorld,
  normalize,
  max,
  dot,
} from 'three/tsl';
import { sdfSphere, sdfBox, sdfSmoothUnion, sdfNormal } from './sdf-lib.ts';
import type { Generator, GeneratorResult, SceneObject } from './types.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TslNode = any;

const SDF_KEYWORDS = [
  'organic', 'alien', 'abstract', 'blob', 'morph', 'smooth',
  'melting', 'sci-fi', 'fractal', 'infinite', 'raymarched',
  'signed distance', 'sdf', 'metaball',
];

const MAX_STEPS = 64;
const MAX_DIST = 10.0;
const SURF_DIST = 0.001;

/**
 * Build a raymarching material for a given SDF composition function.
 *
 * The sdfFn takes a vec3 position and returns a float distance.
 * The material renders via raymarching in the fragment shader.
 */
function buildRaymarchMaterial(
  sdfFn: (p: TslNode) => TslNode,
  baseColor: THREE.ColorRepresentation = 0x88ccff,
): THREE.MeshBasicNodeMaterial {
  const mat = new THREE.MeshBasicNodeMaterial();
  mat.side = THREE.DoubleSide;
  mat.transparent = true;

  const colorObj = new THREE.Color(baseColor);

  // Raymarching shader built with TSL
  const raymarch = Fn(() => {
    const ro = cameraPosition; // ray origin
    const rd = normalize(positionWorld.sub(cameraPosition)); // ray direction

    // March along ray
    const totalDist = float(0.0).toVar();
    const hitColor = vec4(0, 0, 0, 0).toVar();

    Loop(MAX_STEPS, () => {
      const p = ro.add(rd.mul(totalDist));
      const d = sdfFn(p);

      // Hit detection
      If(d.lessThan(float(SURF_DIST)), () => {
        // Compute normal via central differences
        const normal = sdfNormal(sdfFn, p);

        // Simple diffuse lighting
        const lightDir = normalize(vec3(1, 1, 1));
        const diffuse = max(dot(normal, lightDir), float(0.15));

        const col = vec3(colorObj.r, colorObj.g, colorObj.b).mul(diffuse);
        hitColor.assign(vec4(col.x, col.y, col.z, 1.0));
        Break();
      });

      // Miss detection
      If(totalDist.greaterThan(float(MAX_DIST)), () => {
        Break();
      });

      totalDist.addAssign(d);
    });

    return hitColor;
  });

  mat.colorNode = raymarch() as TslNode;
  mat.alphaTest = 0.01;

  return mat;
}

/**
 * Default SDF scene: smooth union of a sphere and a box.
 * Demonstrates the SDF generator works without custom params.
 */
function defaultSdfScene(p: TslNode): TslNode {
  const sphere = sdfSphere(p, float(0.8));
  const box = sdfBox(p.sub(vec3(0.4, 0.4, 0)), vec3(0.5, 0.5, 0.5));
  return sdfSmoothUnion(sphere, box, float(0.3));
}

export const sdfGenerator: Generator = {
  name: 'sdf',

  canHandle(object: SceneObject): number {
    if (object.generator === 'sdf') return 0.9;
    if (object.material?.shader?.includes('sdf')) return 0.7;
    const prompt = object.prompt.toLowerCase();
    const matchCount = SDF_KEYWORDS.filter(kw => prompt.includes(kw)).length;
    if (matchCount >= 2) return 0.6;
    if (matchCount === 1) return 0.35;
    return 0;
  },

  generate(object: SceneObject): GeneratorResult {
    const start = performance.now();

    // Bounding box size from params (default 4x4x4)
    const size = (object.params?.boundingBox as number) ?? 4;

    // Build SDF composition from params or use default
    const sdfFn = defaultSdfScene;

    // Create bounding box geometry
    const geometry = new THREE.BoxGeometry(size, size, size);

    // Build raymarching material
    const color = (object.params?.color as THREE.ColorRepresentation) ?? 0x88ccff;
    const material = buildRaymarchMaterial(sdfFn, color);

    const elapsed = performance.now() - start;

    return {
      geometry,
      material,
      isSdf: true,
      metadata: {
        vertexCount: geometry.attributes.position.count,
        faceCount: geometry.index ? geometry.index.count / 3 : 0,
        generator: 'sdf',
        prompt: object.prompt,
        generationTime: elapsed,
      },
    };
  },
};
