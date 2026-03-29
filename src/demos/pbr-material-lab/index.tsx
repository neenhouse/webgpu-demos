import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
  Fn,
  float,
  color,
  mix,
  smoothstep,
  positionWorld,
  normalWorld,
  cameraPosition,
  uniform,
  oscSine,
  time,
} from 'three/tsl';

/**
 * PBR Material Lab — 7x7 grid exploring roughness × metalness space
 *
 * Demonstrates:
 * - 49 instanced spheres in a 7x7 parameter grid
 * - TSL reads positionWorld to compute per-instance roughness/metalness
 * - Roughness 0→1 across X axis, metalness 0→1 across Y axis
 * - 3 colored lights from different angles (warm/cool/rim)
 * - Central reference sphere with animated roughness sweep
 * - Fresnel rim highlight shows material character clearly
 */

const GRID = 7;
const SPHERE_COUNT = GRID * GRID;
const SPACING = 1.3;
const HALF = ((GRID - 1) * SPACING) / 2;

export default function PbrMaterialLab() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const centerRef = useRef<THREE.Mesh>(null);
  const centerRoughnessUniform = useMemo(() => uniform(0.5), []);

  // Build matrices for the 7x7 grid
  const matrices = useMemo(() => {
    const dummy = new THREE.Object3D();
    const result: THREE.Matrix4[] = [];
    for (let row = 0; row < GRID; row++) {
      for (let col = 0; col < GRID; col++) {
        const x = -HALF + col * SPACING;
        const y = -HALF + row * SPACING;
        dummy.position.set(x, y, 0);
        dummy.scale.setScalar(0.5);
        dummy.updateMatrix();
        result.push(dummy.matrix.clone());
      }
    }
    return result;
  }, []);

  // TSL material that reads world position to compute roughness/metalness
  const gridMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();

    // Map world X (-HALF..+HALF) to roughness (0..1)
    const roughnessNode = Fn(() => {
      const wx = positionWorld.x;
      return wx.add(HALF).div(HALF * 2).clamp(0.02, 0.98);
    });

    // Map world Y (-HALF..+HALF) to metalness (0..1)
    const metalnessNode = Fn(() => {
      const wy = positionWorld.y;
      return wy.add(HALF).div(HALF * 2).clamp(0.0, 1.0);
    });

    mat.roughnessNode = roughnessNode();
    mat.metalnessNode = metalnessNode();

    // Color: blend based on metalness — copper for metals, gray for dielectrics
    const metalColor = color(0xcc8844);
    const dialectricColor = color(0xddddee);
    const m = metalnessNode();
    mat.colorNode = mix(dialectricColor, metalColor, m);

    // Fresnel rim glow to show surface character
    const viewDir = cameraPosition.sub(positionWorld).normalize();
    const nDotV = normalWorld.dot(viewDir).saturate();
    const fresnel = float(1.0).sub(nDotV).pow(2.5);
    const fresnelColor = mix(color(0x4488ff), color(0xffcc88), m);
    mat.emissiveNode = fresnelColor.mul(fresnel.mul(0.4));

    return mat;
  }, []);

  // Center reference sphere material
  const centerMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.color.set(0xaaddff);
    mat.metalness = 0.8;
    mat.roughnessNode = centerRoughnessUniform;

    const viewDir = cameraPosition.sub(positionWorld).normalize();
    const nDotV = normalWorld.dot(viewDir).saturate();
    const fresnel = float(1.0).sub(nDotV).pow(2.0);
    mat.emissiveNode = color(0x4488ff).mul(fresnel.mul(0.5));

    return mat;
  }, [centerRoughnessUniform]);

  // Axis label spheres — show roughness/metalness extremes
  const axisLabelMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.color.set(0xffffff);
    mat.roughness = 0.1;
    mat.metalness = 0.0;
    mat.emissiveNode = color(0xffffff).mul(float(0.8));
    return mat;
  }, []);
  void axisLabelMaterial;

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.instanceMatrix.needsUpdate = true;
  }, [matrices]);

  // Animate center reference sphere roughness sweep
  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    centerRoughnessUniform.value = (Math.sin(t * 0.5) * 0.5 + 0.5) * 0.95 + 0.02;
    if (centerRef.current) {
      centerRef.current.rotation.y = t * 0.3;
    }
  });

  return (
    <>
      {/* 3 colored lights from different angles */}
      <ambientLight intensity={0.08} />

      {/* Key light — warm */}
      <pointLight position={[5, 6, 8]} intensity={80} color="#ffcc88" />

      {/* Fill light — cool */}
      <pointLight position={[-7, 3, 6]} intensity={50} color="#8899ff" />

      {/* Rim light — blue-green from behind */}
      <pointLight position={[0, -5, -8]} intensity={40} color="#44ffcc" />

      {/* Top accent */}
      <directionalLight position={[0, 10, 5]} intensity={0.4} color="#ffffff" />

      {/* Background plane */}
      <mesh position={[0, 0, -1.5]}>
        <planeGeometry args={[20, 20]} />
        <meshStandardMaterial color="#111122" roughness={1} metalness={0} />
      </mesh>

      {/* 7x7 grid of spheres */}
      <instancedMesh
        ref={meshRef}
        args={[undefined, undefined, SPHERE_COUNT]}
        material={gridMaterial}
        frustumCulled={false}
      >
        <sphereGeometry args={[1, 48, 48]} />
      </instancedMesh>

      {/* Central reference sphere — elevated in front, animating */}
      <mesh ref={centerRef} position={[0, 0, 1.8]} scale={0.7}>
        <sphereGeometry args={[1, 64, 64]} />
        <primitive object={centerMaterial} />
      </mesh>

      {/* Axis indicators */}
      {/* Roughness label (X axis) */}
      <mesh position={[-HALF - 0.8, 0, 0.2]}>
        <boxGeometry args={[0.05, GRID * SPACING, 0.05]} />
        <meshStandardMaterial color="#aaaaaa" emissive="#aaaaaa" emissiveIntensity={0.5} />
      </mesh>
      {/* Metalness label (Y axis) */}
      <mesh position={[0, -HALF - 0.8, 0.2]}>
        <boxGeometry args={[GRID * SPACING, 0.05, 0.05]} />
        <meshStandardMaterial color="#aaaaaa" emissive="#aaaaaa" emissiveIntensity={0.5} />
      </mesh>

      {/* Corner markers for extreme values */}
      {[[-HALF, -HALF], [HALF, -HALF], [-HALF, HALF], [HALF, HALF]].map(([x, y], i) => (
        <mesh key={i} position={[x, y, 0.7]} scale={0.12}>
          <sphereGeometry args={[1, 12, 12]} />
          <meshStandardMaterial
            color={['#ff4444', '#44ff44', '#4444ff', '#ffff44'][i]}
            emissive={['#ff4444', '#44ff44', '#4444ff', '#ffff44'][i]}
            emissiveIntensity={1.5}
          />
        </mesh>
      ))}

      {/* Roughness sweep indicator bar */}
      <mesh position={[0, -HALF - 1.4, 0]}>
        <boxGeometry args={[GRID * SPACING * 0.9, 0.08, 0.08]} />
        <primitive object={
          (() => {
            const m = new THREE.MeshStandardNodeMaterial();
            // Gradient bar: rough left → smooth right
            const rx = positionWorld.x.add(HALF).div(HALF * 2).clamp(0, 1);
            m.roughnessNode = rx;
            m.metalnessNode = float(0.9);
            m.colorNode = color(0xcc8844);
            return m;
          })()
        } />
      </mesh>

      {/* Metalness sweep indicator bar */}
      <mesh position={[-HALF - 1.4, 0, 0]}>
        <boxGeometry args={[0.08, GRID * SPACING * 0.9, 0.08]} />
        <primitive object={
          (() => {
            const m = new THREE.MeshStandardNodeMaterial();
            const ry = positionWorld.y.add(HALF).div(HALF * 2).clamp(0, 1);
            m.metalnessNode = ry;
            m.roughnessNode = float(0.3);
            m.colorNode = mix(color(0xddddee), color(0xcc8844), ry);
            return m;
          })()
        } />
      </mesh>

      {/* Animated time — drive secondary effects */}
      <mesh position={[0, 0, -0.5]} visible={false}>
        <boxGeometry args={[0.01, 0.01, 0.01]} />
        <primitive object={
          (() => {
            const m = new THREE.MeshStandardNodeMaterial();
            m.colorNode = oscSine(time).add(1);
            return m;
          })()
        } />
      </mesh>
    </>
  );
}
