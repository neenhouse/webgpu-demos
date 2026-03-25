import { registerPreset } from './index.ts';
import * as THREE from 'three/webgpu';
import type { PresetFactory } from '../types.ts';

const factory: PresetFactory = () => {
  return new THREE.MeshStandardNodeMaterial();
};

registerPreset('cel-shaded', factory);
registerPreset('toon', factory);

export default factory;
