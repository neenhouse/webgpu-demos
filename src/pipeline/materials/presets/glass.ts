import { registerPreset } from './index.ts';
import * as THREE from 'three/webgpu';
import type { PresetFactory } from '../types.ts';

const factory: PresetFactory = () => {
  return new THREE.MeshStandardNodeMaterial();
};

registerPreset('glass-clear', factory);
registerPreset('glass', factory);
registerPreset('glass-frosted', factory);

export default factory;
