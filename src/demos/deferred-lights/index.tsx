import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
  float,
  color,
  mix,
  smoothstep,
  hash,
  instanceIndex,
  uniform,
  oscSine,
} from 'three/tsl';

/**
 * Deferred Lights — 30 dynamic point lights in a large dark room scene
 *
 * Demonstrates:
 * - 30 point lights with varied colors orbiting in small circles
 * - Large dark room: floor 30x30, walls absorb light (dark material)
 * - Each light = emissive sphere that IS the visual star of the scene
 * - Three.js WebGPU handles many lights natively
 * - Warm/cool light mix for visual interest
 * - Dynamic light movement showing real-time GI-like illumination
 */

const LIGHT_COUNT = 30;
const FURNITURE_COUNT = 20;

interface LightData {
  basePos: THREE.Vector3;
  orbitRadius: number;
  orbitSpeed: number;
  orbitPhase: number;
  color: THREE.Color;
}

// Module-scope constants to avoid impure Math.random() calls during render
const LIGHT_DATA: LightData[] = (() => {
  const lights: LightData[] = [];
  for (let i = 0; i < LIGHT_COUNT; i++) {
    const x = (Math.random() - 0.5) * 26;
    const y = 0.5 + Math.random() * 3.5;
    const z = (Math.random() - 0.5) * 26;
    let lightColor: THREE.Color;
    if (i % 3 === 0) {
      lightColor = new THREE.Color().setHSL(0.05 + Math.random() * 0.1, 0.9, 0.6);
    } else if (i % 3 === 1) {
      lightColor = new THREE.Color().setHSL(0.6 + Math.random() * 0.15, 0.8, 0.65);
    } else {
      lightColor = new THREE.Color().setHSL(0.45 + Math.random() * 0.1, 0.7, 0.6);
    }
    lights.push({
      basePos: new THREE.Vector3(x, y, z),
      orbitRadius: 0.3 + Math.random() * 0.8,
      orbitSpeed: 0.5 + Math.random() * 1.5,
      orbitPhase: Math.random() * Math.PI * 2,
      color: lightColor,
    });
  }
  return lights;
})();

const FURNITURE_MATRICES: THREE.Matrix4[] = (() => {
  const dummy = new THREE.Object3D();
  const matrices: THREE.Matrix4[] = [];
  for (let i = 0; i < FURNITURE_COUNT; i++) {
    const col = i % 5;
    const row = Math.floor(i / 5);
    const x = -10 + col * 5 + (Math.random() - 0.5) * 2.0;
    const z = -8 + row * 4 + (Math.random() - 0.5) * 1.5;
    const w = 0.8 + Math.random() * 0.8;
    const h = 0.4 + Math.random() * 1.2;
    const d = 0.6 + Math.random() * 0.6;
    dummy.position.set(x, h * 0.5, z);
    dummy.scale.set(w, h, d);
    dummy.rotation.y = (Math.random() - 0.5) * 0.3;
    dummy.updateMatrix();
    matrices.push(dummy.matrix.clone());
  }
  return matrices;
})();

export default function DeferredLights() {
  const lightSphereRef = useRef<THREE.InstancedMesh>(null);
  const lightRefs = useRef<THREE.PointLight[]>([]);
  const furnitureMeshRef = useRef<THREE.InstancedMesh>(null);
  const timeUniform = useMemo(() => uniform(0), []);

  const lightData = LIGHT_DATA;
  const furnitureMatrices = FURNITURE_MATRICES;

  // Light sphere material: small emissive spheres visualizing each light
  const lightSphereMat = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    // Per-instance color from instance index using hash
    const idx = float(instanceIndex);
    const hue = hash(idx).mul(0.8);
    const r = smoothstep(float(0.0), float(0.33), hue.sub(smoothstep(float(0.33), float(0.66), hue).mul(0)));
    // Simple color cycling: warm/cool/teal
    const warmC = color(0xff6633);
    const coolC = color(0x6677ff);
    const tealC = color(0x44ffcc);
    const phase = idx.mod(float(3.0));
    const col = mix(
      mix(warmC, coolC, smoothstep(float(0.5), float(1.5), phase)),
      tealC,
      smoothstep(float(1.5), float(2.5), phase)
    );
    mat.colorNode = col;
    mat.emissiveNode = col.mul(oscSine(timeUniform.mul(2).add(idx.mul(0.7))).mul(0.3).add(2.5));
    mat.roughness = 0.1;
    mat.metalness = 0.0;
    void r; void hue;
    return mat;
  }, [timeUniform]);

  // Furniture material: neutral, responsive to many lights
  const furnitureMat = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.color.set(0x556677);
    mat.roughness = 0.7;
    mat.metalness = 0.15;
    return mat;
  }, []);

  // Floor material — dark, absorbs light, slight metalness so emissive spheres reflect subtly
  const floorMat = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.color.set(0x0a0a14);
    mat.roughness = 0.15;
    mat.metalness = 0.3;
    return mat;
  }, []);

  // Wall material — very dark, low roughness so they absorb rather than diffuse
  const wallMat = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.color.set(0x0d0d18);
    mat.roughness = 0.15;
    mat.metalness = 0.3;
    return mat;
  }, []);

  useEffect(() => {
    if (furnitureMeshRef.current) {
      furnitureMatrices.forEach((m, i) => furnitureMeshRef.current!.setMatrixAt(i, m));
      furnitureMeshRef.current.instanceMatrix.needsUpdate = true;
    }

    // Init light sphere matrices
    if (lightSphereRef.current) {
      const dummy = new THREE.Object3D();
      lightData.forEach((ld, i) => {
        dummy.position.copy(ld.basePos);
        dummy.scale.setScalar(0.15);
        dummy.updateMatrix();
        lightSphereRef.current!.setMatrixAt(i, dummy.matrix);
      });
      lightSphereRef.current.instanceMatrix.needsUpdate = true;
    }
  }, [furnitureMatrices, lightData]);

  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    // eslint-disable-next-line react-hooks/immutability
    timeUniform.value = t;

    // Update light sphere positions to match orbiting lights
    lightData.forEach((ld, i) => {
      const angle = t * ld.orbitSpeed + ld.orbitPhase;
      const px = ld.basePos.x + Math.cos(angle) * ld.orbitRadius;
      const py = ld.basePos.y + Math.sin(angle * 0.7) * 0.3;
      const pz = ld.basePos.z + Math.sin(angle) * ld.orbitRadius;

      dummy.position.set(px, py, pz);
      dummy.scale.setScalar(0.15);
      dummy.updateMatrix();
      lightSphereRef.current?.setMatrixAt(i, dummy.matrix);

      // Update actual light position
      if (lightRefs.current[i]) {
        lightRefs.current[i].position.set(px, py, pz);
      }
    });
    if (lightSphereRef.current) lightSphereRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      {/* Background atmosphere */}
      <mesh>
        <sphereGeometry args={[30, 16, 16]} />
        <meshBasicMaterial side={THREE.BackSide} color="#020408" />
      </mesh>
      <ambientLight intensity={0.15} color="#0a0a1a" />
      <fogExp2 attach="fog" color="#020408" density={0.04} />      <hemisphereLight args={['#111122', '#050510', 0.08]} />

      {/* 30 actual point lights */}
      {lightData.map((ld, i) => (
        <pointLight
          key={i}
          ref={(l) => { if (l) lightRefs.current[i] = l; }}
          position={[ld.basePos.x, ld.basePos.y, ld.basePos.z]}
          intensity={0.5}
          color={ld.color}
          distance={5}
          decay={2}
        />
      ))}

      {/* Floor — large dark 30x30 room */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[30, 30]} />
        <primitive object={floorMat} />
      </mesh>

      {/* Back wall */}
      <mesh position={[0, 2.5, -15]}>
        <planeGeometry args={[30, 5]} />
        <primitive object={wallMat} />
      </mesh>

      {/* Front wall */}
      <mesh rotation={[0, Math.PI, 0]} position={[0, 2.5, 15]}>
        <planeGeometry args={[30, 5]} />
        <primitive object={wallMat} />
      </mesh>

      {/* Left wall */}
      <mesh rotation={[0, Math.PI / 2, 0]} position={[-15, 2.5, 0]}>
        <planeGeometry args={[30, 5]} />
        <primitive object={wallMat} />
      </mesh>

      {/* Right wall */}
      <mesh rotation={[0, -Math.PI / 2, 0]} position={[15, 2.5, 0]}>
        <planeGeometry args={[30, 5]} />
        <primitive object={wallMat} />
      </mesh>

      {/* Ceiling */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 5, 0]}>
        <planeGeometry args={[30, 30]} />
        <meshStandardMaterial color="#0a0a14" roughness={1} />
      </mesh>

      {/* Furniture boxes */}
      <instancedMesh
        ref={furnitureMeshRef}
        args={[undefined, undefined, FURNITURE_COUNT]}
        material={furnitureMat}
        castShadow
        receiveShadow
        frustumCulled={false}
      >
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>

      {/* Light visualization spheres */}
      <instancedMesh
        ref={lightSphereRef}
        args={[undefined, undefined, LIGHT_COUNT]}
        material={lightSphereMat}
        frustumCulled={false}
      >
        <sphereGeometry args={[1, 12, 12]} />
      </instancedMesh>

      {/* Floor reflection plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]}>
        <planeGeometry args={[30, 30]} />
        <meshStandardMaterial
          color="#08080f"
          roughness={0.05}
          metalness={0.98}
          transparent
          opacity={0.6}
        />
      </mesh>

      {/* Corner pillars */}
      {[[-13, -13], [-13, 13], [13, -13], [13, 13]].map(([px, pz], i) => (
        <mesh key={i} position={[px, 2.5, pz]}>
          <cylinderGeometry args={[0.2, 0.2, 5, 12]} />
          <meshStandardMaterial color="#0d0d18" roughness={0.15} metalness={0.3} />
        </mesh>
      ))}
    </>
  );
}
