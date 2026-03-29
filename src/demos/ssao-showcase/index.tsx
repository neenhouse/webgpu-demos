import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
  Fn,
  float,
  color,
  smoothstep,
  normalWorld,
  positionWorld,
  cameraPosition,
  hash,
  uniform,
  oscSine,
} from 'three/tsl';

/**
 * SSAO Showcase — screen-space ambient occlusion simulation
 *
 * Demonstrates:
 * - Dense room scene: floor + 2 walls + 40 instanced objects
 * - Simulated AO via TSL: darken areas based on normal/position hash sampling
 * - Per-instance AO contribution darkening corners and crevices
 * - Neutral gray materials to show AO clearly
 * - Animated subtle object breathing to show dynamic AO
 * - Color-shifted emissive to show AO contribution alone
 */

const OBJECT_COUNT = 40;

export default function SsaoShowcase() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const sphereMeshRef = useRef<THREE.InstancedMesh>(null);
  const cylMeshRef = useRef<THREE.InstancedMesh>(null);
  const timeUniform = useMemo(() => uniform(0), []);

  // Build instanced box positions — furniture-like layout
  const boxMatrices = useMemo(() => {
    const dummy = new THREE.Object3D();
    const matrices: THREE.Matrix4[] = [];
    const count = Math.floor(OBJECT_COUNT * 0.5);
    for (let i = 0; i < count; i++) {
      const col = i % 5;
      const row = Math.floor(i / 5);
      const x = -4 + col * 2.0 + (Math.random() - 0.5) * 0.4;
      const z = -3 + row * 1.5 + (Math.random() - 0.5) * 0.3;
      const h = 0.3 + Math.random() * 0.8;
      dummy.position.set(x, h * 0.5, z);
      dummy.scale.set(0.5 + Math.random() * 0.4, h, 0.5 + Math.random() * 0.4);
      dummy.rotation.y = Math.random() * Math.PI;
      dummy.updateMatrix();
      matrices.push(dummy.matrix.clone());
    }
    return matrices;
  }, []);

  const sphereMatrices = useMemo(() => {
    const dummy = new THREE.Object3D();
    const matrices: THREE.Matrix4[] = [];
    const count = Math.floor(OBJECT_COUNT * 0.3);
    for (let i = 0; i < count; i++) {
      const x = -3.5 + Math.random() * 7;
      const z = -2 + Math.random() * 5;
      const r = 0.15 + Math.random() * 0.25;
      dummy.position.set(x, r, z);
      dummy.scale.setScalar(r);
      dummy.updateMatrix();
      matrices.push(dummy.matrix.clone());
    }
    return matrices;
  }, []);

  const cylMatrices = useMemo(() => {
    const dummy = new THREE.Object3D();
    const matrices: THREE.Matrix4[] = [];
    const count = Math.floor(OBJECT_COUNT * 0.2);
    for (let i = 0; i < count; i++) {
      const x = -3 + Math.random() * 6;
      const z = -2 + Math.random() * 4;
      const h = 0.4 + Math.random() * 0.6;
      dummy.position.set(x, h * 0.5, z);
      dummy.scale.set(0.2, h, 0.2);
      dummy.updateMatrix();
      matrices.push(dummy.matrix.clone());
    }
    return matrices;
  }, []);

  // AO material using TSL simulation
  const aoMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();

    // Simulate AO: sample nearby positions with hash noise, darken based on
    // how much the normal faces inward (toward nearby geometry)
    const aoSim = Fn(() => {
      const pos = positionWorld;
      const norm = normalWorld;

      // Sample 4 nearby offsets using hash
      const offset1 = hash(pos.mul(3.7).add(0.1));
      const offset2 = hash(pos.mul(7.3).add(0.5));
      const offset3 = hash(pos.add(norm).mul(11.1));
      const offset4 = hash(pos.sub(norm.mul(0.2)).mul(5.5));

      // AO term: average of hash-based occlusion estimates
      const raw = offset1.add(offset2).add(offset3).add(offset4).mul(0.25);

      // Proximity to floor/walls darkens more
      const floorProx = smoothstep(0.8, 0.0, pos.y);
      const wallProx = smoothstep(5.0, 0.0, pos.z.abs());

      const ao = float(1.0).sub(raw.mul(0.35).add(floorProx.mul(0.2)).add(wallProx.mul(0.1)));
      return ao.clamp(0.2, 1.0);
    });

    const aoValue = aoSim();

    // Base gray color modulated by AO
    const baseCol = color(0x888899);
    mat.colorNode = baseCol.mul(aoValue);

    // Subtle emissive from camera angle — shows occlusion in shadows
    const viewDir = cameraPosition.sub(positionWorld).normalize();
    const nDotV = normalWorld.dot(viewDir).saturate();
    const rimAo = float(1.0).sub(nDotV).mul(0.15);
    mat.emissiveNode = color(0x5566aa).mul(rimAo.mul(aoValue));

    // Subtle animation
    mat.positionNode = positionWorld.add(normalWorld.mul(oscSine(timeUniform.mul(1.5).add(positionWorld.y.mul(3))).mul(0.005)));

    mat.roughness = 0.85;
    mat.metalness = 0.05;

    return mat;
  }, [timeUniform]);

  const floorMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();

    // Floor gets stronger AO darkening at edges/corners
    const pos = positionWorld;
    const cornerX = smoothstep(4.5, 0.0, pos.x.abs());
    const cornerZ = smoothstep(4.5, 0.0, pos.z.abs());
    const cornerAo = float(1.0).sub(cornerX.mul(0.35)).sub(cornerZ.mul(0.35));

    // Object contact shadows via hash proximity
    const contactHash = hash(pos.mul(5.2));
    const contactAo = float(1.0).sub(contactHash.mul(0.1));

    const totalAo = cornerAo.mul(contactAo).clamp(0.15, 1.0);
    mat.colorNode = color(0x555566).mul(totalAo);
    mat.roughness = 0.95;
    mat.metalness = 0.0;

    return mat;
  }, []);

  const wallMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    // Walls darken toward floor intersection
    const distToFloor = positionWorld.y;
    const floorAo = smoothstep(2.0, 0.0, distToFloor).mul(0.5);
    const baseAo = float(1.0).sub(floorAo);
    mat.colorNode = color(0x666677).mul(baseAo);
    mat.roughness = 0.9;
    mat.metalness = 0.0;
    return mat;
  }, []);

  useEffect(() => {
    if (meshRef.current) {
      boxMatrices.forEach((m, i) => meshRef.current!.setMatrixAt(i, m));
      meshRef.current.instanceMatrix.needsUpdate = true;
    }
    if (sphereMeshRef.current) {
      sphereMatrices.forEach((m, i) => sphereMeshRef.current!.setMatrixAt(i, m));
      sphereMeshRef.current.instanceMatrix.needsUpdate = true;
    }
    if (cylMeshRef.current) {
      cylMatrices.forEach((m, i) => cylMeshRef.current!.setMatrixAt(i, m));
      cylMeshRef.current.instanceMatrix.needsUpdate = true;
    }
  }, [boxMatrices, sphereMatrices, cylMatrices]);

  useFrame((state) => {
    timeUniform.value = state.clock.getElapsedTime();
  });

  const boxCount = boxMatrices.length;
  const sphereCount = sphereMatrices.length;
  const cylCount = cylMatrices.length;

  return (
    <>
      {/* Ambient + fill lights — muted to show AO contribution */}
      <ambientLight intensity={0.3} color="#aabbcc" />
      <directionalLight position={[3, 6, 2]} intensity={0.6} color="#ffffff" castShadow shadow-bias={-0.001} />
      <directionalLight position={[-4, 5, -3]} intensity={0.3} color="#8899bb" />
      <pointLight position={[0, 3, 0]} intensity={2.0} color="#ccddee" distance={12} />

      {/* Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[10, 8]} />
        <primitive object={floorMaterial} />
      </mesh>

      {/* Back wall */}
      <mesh position={[0, 2.5, -4]} receiveShadow>
        <planeGeometry args={[10, 5]} />
        <primitive object={wallMaterial} />
      </mesh>

      {/* Side wall */}
      <mesh rotation={[0, Math.PI / 2, 0]} position={[-5, 2.5, 0]} receiveShadow>
        <planeGeometry args={[8, 5]} />
        <primitive object={wallMaterial} />
      </mesh>

      {/* Ceiling — slightly visible */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 5, 0]}>
        <planeGeometry args={[10, 8]} />
        <meshStandardMaterial color="#444455" roughness={1} />
      </mesh>

      {/* Box instanced mesh */}
      <instancedMesh
        ref={meshRef}
        args={[undefined, undefined, boxCount]}
        material={aoMaterial}
        castShadow
        receiveShadow
        frustumCulled={false}
      >
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>

      {/* Sphere instanced mesh */}
      <instancedMesh
        ref={sphereMeshRef}
        args={[undefined, undefined, sphereCount]}
        material={aoMaterial}
        castShadow
        receiveShadow
        frustumCulled={false}
      >
        <sphereGeometry args={[1, 20, 20]} />
      </instancedMesh>

      {/* Cylinder instanced mesh */}
      <instancedMesh
        ref={cylMeshRef}
        args={[undefined, undefined, cylCount]}
        material={aoMaterial}
        castShadow
        receiveShadow
        frustumCulled={false}
      >
        <cylinderGeometry args={[1, 1, 1, 20]} />
      </instancedMesh>

      {/* Corner accent lights to highlight AO regions */}
      <pointLight position={[-4.5, 0.5, -3.5]} intensity={1.5} color="#8899ff" distance={4} />
      <pointLight position={[4, 0.5, -3]} intensity={1.0} color="#ff9988" distance={4} />
    </>
  );
}
