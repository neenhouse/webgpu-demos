import { registerPreset } from './index.ts';
import * as THREE from 'three/webgpu';
import type { PresetFactory } from '../types.ts';

const factory: PresetFactory = () => {
  return new THREE.MeshStandardNodeMaterial();
};

registerPreset('organic', factory);
registerPreset('skin-organic', factory);
registerPreset('skin', factory);

export default factory;
