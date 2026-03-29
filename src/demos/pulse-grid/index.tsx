import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
  color,
  positionWorld,
  Fn,
  float,
  mix,
} from 'three/tsl';

const GRID_SIZE = 20;
const INSTANCE_COUNT = GRID_SIZE * GRID_SIZE; // 400 instances
const SPACING = 0.6;
const BOX_SIZE = 0.3;

export default function PulseGrid() {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  // Store base grid positions + distance from center for ripple calculation
  const gridData = useMemo(() => {
    const data: { x: number; z: number; dist: number }[] = [];
    for (let ix = 0; ix < GRID_SIZE; ix++) {
      for (let iz = 0; iz < GRID_SIZE; iz++) {
        const x = (ix - (GRID_SIZE - 1) / 2) * SPACING;
        const z = (iz - (GRID_SIZE - 1) / 2) * SPACING;
        const dist = Math.sqrt(x * x + z * z);
        data.push({ x, z, dist });
      }
    }
    return data;
  }, []);

  // Set initial instance matrices
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const dummy = new THREE.Object3D();

    for (let i = 0; i < gridData.length; i++) {
      const { x, z } = gridData[i];
      dummy.position.set(x, 0, z);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [gridData]);

  // TSL material: color based on world Y height, blue at bottom to white at top
  const material = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();

    // Color gradient based on positionWorld.y — blue at base, white at pulse peak
    const colorFn = Fn(() => {
      const deepBlue = color(0x1144aa);
      const brightWhite = color(0xccddff);
      // Normalize height: most boxes sit around y=0, pulses go up to ~1.5
      const heightBlend = positionWorld.y.div(1.5).clamp(0.0, 1.0);
      return mix(deepBlue, brightWhite, heightBlend);
    });

    mat.colorNode = colorFn();

    // Subtle emissive glow matching the height color
    const emissiveFn = Fn(() => {
      const glowBlue = color(0x2266ff);
      const glowWhite = color(0x88aaff);
      const heightBlend = positionWorld.y.div(1.5).clamp(0.0, 1.0);
      return mix(glowBlue, glowWhite, heightBlend).mul(float(0.4));
    });

    mat.emissiveNode = emissiveFn();

    mat.metalnessNode = float(0.2);
    mat.roughnessNode = float(0.4);

    return mat;
  }, []);

  const dummy = useMemo(() => new THREE.Object3D(), []);

  // Animate: expanding circular ripple waves from center
  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const elapsed = performance.now() * 0.001;

    for (let i = 0; i < gridData.length; i++) {
      const { x, z, dist } = gridData[i];

      // Expanding ripple: sin(distance - time) creates outward-traveling waves
      const wave = Math.sin(dist * 2.5 - elapsed * 2.5);
      // Only pulse upward (clamp negative to a small base height)
      const scaleY = Math.max(0.15, (wave + 1) * 0.5) * 2.5;
      // Offset Y so boxes grow upward from the grid plane
      const yPos = (scaleY * BOX_SIZE) / 2;

      dummy.position.set(x, yPos, z);
      dummy.scale.set(1, scaleY, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      <ambientLight intensity={0.3} />
      <directionalLight position={[8, 15, 8]} intensity={1.2} color={0xffffff} />
      <directionalLight position={[-5, 10, -5]} intensity={0.4} color={0x8888ff} />
      <pointLight position={[0, 4, 0]} intensity={3} color={0x4488ff} distance={20} />

      <group rotation={[-0.5, 0, 0]} position={[0, 1, 0]}>
        <instancedMesh
          ref={meshRef}
          args={[undefined, undefined, INSTANCE_COUNT]}
          material={material}
          frustumCulled={false}
        >
          <boxGeometry args={[BOX_SIZE, BOX_SIZE, BOX_SIZE]} />
        </instancedMesh>
      </group>
    </>
  );
}
