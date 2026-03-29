import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
  color,
  time,
  oscSine,
  normalWorld,
  cameraPosition,
  positionWorld,
  positionLocal,
  normalLocal,
  Fn,
  float,
} from 'three/tsl';

const GRID_X = 12;
const GRID_Z = 12;
const CRYSTAL_COUNT = GRID_X * GRID_Z; // 144 crystals
const SPACING = 1.1;

export default function CrystalGrid() {
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.InstancedMesh>(null);

  // Store base positions for bobbing animation
  const basePositions = useMemo(() => {
    const positions: { x: number; y: number; z: number; phase: number }[] = [];
    for (let ix = 0; ix < GRID_X; ix++) {
      for (let iz = 0; iz < GRID_Z; iz++) {
        const x = (ix - (GRID_X - 1) / 2) * SPACING;
        const z = (iz - (GRID_Z - 1) / 2) * SPACING;
        const y = (Math.random() - 0.5) * 0.2;
        // Phase offset based on grid position for wave effect
        const phase = (ix + iz) * 0.5;
        positions.push({ x, y, z, phase });
      }
    }
    return positions;
  }, []);

  // Apply initial instance matrices
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const dummy = new THREE.Object3D();

    for (let i = 0; i < basePositions.length; i++) {
      const { x, y, z } = basePositions[i];
      dummy.position.set(x, y, z);
      // Slight random rotation for visual variety
      dummy.rotation.set(
        Math.random() * 0.3,
        Math.random() * Math.PI * 2,
        Math.random() * 0.3,
      );
      // Vary crystal sizes slightly
      const scale = 0.25 + Math.random() * 0.15;
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [basePositions]);

  // TSL material: rainbow wave color + fresnel rim glow + metallic/glassy look
  const material = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();

    // Rainbow color wave across the grid based on world XZ position + time
    const posW = positionWorld;
    const t = time.mul(0.4);

    const r = oscSine(posW.x.mul(0.5).add(posW.z.mul(0.3)).add(t)).mul(0.5).add(0.5);
    const g = oscSine(posW.x.mul(0.3).add(posW.z.mul(0.5)).add(t.mul(1.3))).mul(0.5).add(0.5);
    const b = oscSine(posW.z.mul(0.6).add(t.mul(0.7))).mul(0.5).add(0.5);

    mat.colorNode = Fn(() => {
      // Bright saturated rainbow crystal colors
      const base = color(0xffffff);
      return base.mul(
        float(0.3).add(r.mul(0.7)),
      ).mul(
        float(0.3).add(g.mul(0.7)),
      ).add(
        color(0x4400ff).mul(b.mul(0.3)),
      );
    })();

    // Fresnel rim lighting — cyan/purple edge glow
    const fresnel = Fn(() => {
      const viewDir = cameraPosition.sub(positionWorld).normalize();
      const nDotV = normalWorld.dot(viewDir).saturate();
      return float(1.0).sub(nDotV).pow(3.0);
    });

    // Emissive shifts between cyan and magenta for a neon crystal look
    const emissiveColor = Fn(() => {
      const cyan = color(0x00ffff);
      const magenta = color(0xaa00ff);
      const blend = oscSine(time.mul(0.25).add(positionWorld.x.mul(0.2))).mul(0.5).add(0.5);
      // Manual lerp: cyan * (1 - blend) + magenta * blend
      return cyan.mul(float(1.0).sub(blend)).add(magenta.mul(blend));
    });

    mat.emissiveNode = emissiveColor().mul(fresnel()).mul(float(2.0));

    // Metallic and glossy surface
    mat.metalnessNode = float(0.3);
    mat.roughnessNode = float(0.2);

    // Subtle vertex displacement — crystals shimmer/pulse along normals
    mat.positionNode = positionLocal.add(
      normalLocal.mul(
        oscSine(time.mul(2.0).add(positionLocal.y.mul(6.0))).mul(0.02),
      ),
    );

    mat.transparent = true;
    mat.opacity = 0.92;

    return mat;
  }, []);

  const dummy = useMemo(() => new THREE.Object3D(), []);

  // Animate: slowly rotate group + bob crystals up and down
  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.05;
    }

    const mesh = meshRef.current;
    if (!mesh) return;
    const elapsed = performance.now() * 0.001;

    for (let i = 0; i < basePositions.length; i++) {
      const { x, y, z, phase } = basePositions[i];
      // Bobbing: sine wave with per-crystal phase offset
      const bob = Math.sin(elapsed * 0.8 + phase) * 0.15;
      mesh.getMatrixAt(i, dummy.matrix);
      dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale);
      dummy.position.set(x, y + bob, z);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      {/* Background atmosphere */}
      <mesh>
        <sphereGeometry args={[30, 16, 16]} />
        <meshBasicMaterial side={THREE.BackSide} color="#020408" />
      </mesh>
      <ambientLight intensity={0.3} />
      <directionalLight position={[8, 12, 5]} intensity={1.0} color={0xffffff} />
      <directionalLight position={[-5, 8, -8]} intensity={0.5} color={0x8888ff} />
      <pointLight position={[0, 2, 0]} intensity={3} color={0x00ffcc} distance={15} />
      <pointLight position={[4, 1, -4]} intensity={2} color={0xff00ff} distance={10} />

      <group ref={groupRef}>
        <instancedMesh
          ref={meshRef}
          args={[undefined, undefined, CRYSTAL_COUNT]}
          material={material}
          frustumCulled={false}
        >
          <icosahedronGeometry args={[1, 0]} />
        </instancedMesh>
      </group>
    </>
  );
}
