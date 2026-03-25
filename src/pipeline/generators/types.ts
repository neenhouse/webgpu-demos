import type * as THREE from 'three/webgpu';

// Minimal SceneObject stub for generators — will be replaced by full scene spec types
export interface SceneObject {
  id: string;
  prompt: string;
  style?: string;
  generator?: string; // hint: 'csg' | 'parametric/terrain' | 'parametric/rock' | 'parametric/vegetation' | 'parametric/vehicle' | 'parametric/character' | 'parametric/debris' | 'parametric/building' | 'parametric/furniture' | 'parametric/weapon' | 'parametric/organic' | 'sdf' | ...
  params?: Record<string, unknown>;
  material?: {
    shader?: string;
    pbr?: Record<string, unknown>;
  };
}

export interface GeneratorMetadata {
  vertexCount: number;
  faceCount: number;
  generator: string;
  prompt: string;
  generationTime: number; // milliseconds
}

export interface GeneratorResult {
  geometry: THREE.BufferGeometry;
  material?: THREE.Material; // provided by SDF generator, skips material pipeline
  isSdf?: boolean; // true = scene renderer skips material pipeline
  metadata: GeneratorMetadata;
}

export interface Generator {
  name: string;
  canHandle(object: SceneObject): number; // confidence 0-1 (0 = can't handle, 1 = perfect match)
  generate(object: SceneObject): GeneratorResult;
}

/** Color used for error marker cubes when a generator fails */
export const ERROR_MARKER_COLOR = 0xff00ff;
