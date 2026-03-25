import { registerPreset } from './index.ts';
import * as THREE from 'three/webgpu';
import type { PresetFactory } from '../types.ts';

// Stub -- will be implemented in Task 4
const factory: PresetFactory = () => {
  return new THREE.MeshStandardNodeMaterial();
};

registerPreset('rusted-metal', factory);
registerPreset('rust', factory);

export default factory;
