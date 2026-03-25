import * as THREE from 'three/webgpu';
import { Brush, Evaluator, ADDITION, SUBTRACTION, INTERSECTION } from 'three-bvh-csg';
import type { Generator, GeneratorResult, SceneObject } from './types.ts';

interface CsgPrimitiveDef {
  [key: string]: unknown;
  position?: [number, number, number];
  rotation?: [number, number, number];
}

interface CsgOperation {
  union?: CsgPrimitiveDef[];
  subtract?: CsgPrimitiveDef[];
  intersect?: CsgPrimitiveDef[];
}

const CSG_KEYWORDS = [
  'boolean', 'subtract', 'hollow', 'cut', 'hole', 'slot',
  'mechanical', 'housing', 'enclosure', 'bracket', 'mount',
  'table', 'shelf', 'cabinet', 'container', 'box', 'crate',
  'wall', 'door', 'window', 'arch', 'pillar', 'barrier',
];

export function createPrimitive(type: string, args: number[]): THREE.BufferGeometry {
  switch (type) {
    case 'box': return new THREE.BoxGeometry(args[0] ?? 1, args[1] ?? 1, args[2] ?? 1);
    case 'sphere': return new THREE.SphereGeometry(args[0] ?? 0.5, 32, 24);
    case 'cylinder': return new THREE.CylinderGeometry(args[0] ?? 0.5, args[0] ?? 0.5, args[1] ?? 1, 32);
    case 'cone': return new THREE.ConeGeometry(args[0] ?? 0.5, args[1] ?? 1, 32);
    case 'torus': return new THREE.TorusGeometry(args[0] ?? 0.5, args[1] ?? 0.2, 16, 48);
    default: throw new Error(`Unknown CSG primitive: ${type}`);
  }
}

function parsePrimitiveDef(def: CsgPrimitiveDef): InstanceType<typeof Brush> {
  const primitiveKeys = Object.keys(def).filter(k => k !== 'position' && k !== 'rotation');
  if (primitiveKeys.length === 0) {
    throw new Error('CSG primitive definition has no type key');
  }

  const type = primitiveKeys[0];
  const args = (def[type] as number[]) ?? [];
  const geometry = createPrimitive(type, args);
  const brush = new Brush(geometry);

  if (def.position) {
    brush.position.set(def.position[0], def.position[1], def.position[2]);
  }
  if (def.rotation) {
    brush.rotation.set(def.rotation[0], def.rotation[1], def.rotation[2]);
  }

  brush.updateMatrixWorld();
  return brush;
}

function getOperationConstant(opType: string): number {
  switch (opType) {
    case 'union': return ADDITION as number;
    case 'subtract': return SUBTRACTION as number;
    case 'intersect': return INTERSECTION as number;
    default: throw new Error(`Unknown CSG operation: ${opType}`);
  }
}

function evaluateOperation(evaluator: InstanceType<typeof Evaluator>, operation: CsgOperation): THREE.BufferGeometry {
  const opType = Object.keys(operation).find(k => ['union', 'subtract', 'intersect'].includes(k));
  if (!opType) {
    throw new Error('CSG operation has no valid operation type');
  }

  const primitiveDefs = (operation as Record<string, CsgPrimitiveDef[]>)[opType];
  if (!primitiveDefs || primitiveDefs.length === 0) {
    throw new Error(`CSG operation "${opType}" has no primitives`);
  }

  const brushes = primitiveDefs.map(parsePrimitiveDef);

  if (brushes.length === 1) {
    return brushes[0].geometry;
  }

  const opConstant = getOperationConstant(opType);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let result: any = brushes[0];
  for (let i = 1; i < brushes.length; i++) {
    result = evaluator.evaluate(result, brushes[i], opConstant);
  }

  return (result as THREE.Mesh).geometry;
}

export const csgGenerator: Generator = {
  name: 'csg',

  canHandle(object: SceneObject): number {
    if (object.generator === 'csg') return 0.9;
    if (object.params?.operations) return 0.85;
    const prompt = object.prompt.toLowerCase();
    const matchCount = CSG_KEYWORDS.filter(kw => prompt.includes(kw)).length;
    if (matchCount >= 2) return 0.5;
    if (matchCount === 1) return 0.3;
    return 0;
  },

  generate(object: SceneObject): GeneratorResult {
    const start = performance.now();
    const evaluator = new Evaluator();

    const operations = object.params?.operations as CsgOperation[] | undefined;

    let geometry: THREE.BufferGeometry;
    if (operations && operations.length > 0) {
      const results = operations.map(op => evaluateOperation(evaluator, op));
      if (results.length === 1) {
        geometry = results[0];
      } else {
        // Combine multiple operation results with union
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let combined: any = new Brush(results[0]);
        for (let i = 1; i < results.length; i++) {
          const brush = new Brush(results[i]);
          combined = evaluator.evaluate(combined, brush, ADDITION as number);
        }
        geometry = (combined as THREE.Mesh).geometry;
      }
    } else {
      // Fallback: generate a simple box
      geometry = new THREE.BoxGeometry(1, 1, 1);
    }

    if (!geometry.attributes.position || geometry.attributes.position.count === 0) {
      throw new Error('CSG operation produced degenerate geometry with zero vertices');
    }

    const elapsed = performance.now() - start;

    return {
      geometry,
      metadata: {
        vertexCount: geometry.attributes.position.count,
        faceCount: geometry.index ? geometry.index.count / 3 : 0,
        generator: 'csg',
        prompt: object.prompt,
        generationTime: elapsed,
      },
    };
  },
};
