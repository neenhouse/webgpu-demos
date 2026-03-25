import { registerPreset } from './index.ts';
import * as THREE from 'three/webgpu';
import type { PresetFactory } from '../types.ts';

const factory: PresetFactory = () => {
  return new THREE.MeshStandardNodeMaterial();
};

registerPreset('neon-glow', factory);
registerPreset('neon', factory);

export default factory;
