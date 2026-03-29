import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
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
 * LOD Transition — 3 LOD levels with smooth cross-fade transitions
 *
 * Demonstrates:
 * - 3 LOD torus knot levels (high/mid/low detail)
 * - Color-coded by detail level (green=high, yellow=mid, red=low)
 * - 20 instances at various camera distances
 * - Cross-fade: two opacity-lerped meshes during LOD switch
 * - Camera dolly animation triggering LOD switches
 * - Distance-based LOD selection logic
 */

const INSTANCE_COUNT = 20;
const LOD_HIGH_THRESHOLD = 6.0;
const LOD_MID_THRESHOLD = 12.0;
const TRANSITION_WIDTH = 1.5;

interface LodInstance {
  position: [number, number, number];
  rotSpeed: [number, number, number];
  scale: number;
  id: number;
}

export default function LodTransition() {
  const highMeshRef = useRef<THREE.InstancedMesh>(null);
  const midMeshRef = useRef<THREE.InstancedMesh>(null);
  const lowMeshRef = useRef<THREE.InstancedMesh>(null);
  const cameraDistUniform = useMemo(() => uniform(5.0), []);

  const instances = useMemo<LodInstance[]>(() => {
    const result: LodInstance[] = [];
    for (let i = 0; i < INSTANCE_COUNT; i++) {
      const angle = (i / INSTANCE_COUNT) * Math.PI * 2;
      const radius = 4 + (i % 4) * 3;
      result.push({
        position: [
          Math.cos(angle) * radius,
          -0.5 + (Math.random() - 0.5) * 0.5,
          Math.sin(angle) * radius,
        ],
        rotSpeed: [
          (Math.random() - 0.5) * 0.4,
          (Math.random() - 0.5) * 0.8,
          (Math.random() - 0.5) * 0.2,
        ],
        scale: 0.5 + Math.random() * 0.4,
        id: i,
      });
    }
    return result;
  }, []);

  const instanceRefs = useRef<THREE.Object3D[]>([]);

  // Create 3 separate instanced meshes per LOD level with color-coded materials
  // High LOD: green, Mid LOD: yellow, Low LOD: red

  const makeLodMaterial = (lodColor: string, lodEmissive: string) => {
    const mat = new THREE.MeshStandardNodeMaterial();
    const base = color(lodColor);
    const emis = color(lodEmissive);

    const viewDir = cameraPosition.sub(positionWorld).normalize();
    const nDotV = normalWorld.dot(viewDir).saturate();
    const fresnel = float(1.0).sub(nDotV).pow(2.5);
    mat.colorNode = base;
    mat.emissiveNode = emis.mul(fresnel.mul(0.6)).add(emis.mul(0.1));
    mat.roughness = 0.35;
    mat.metalness = 0.5;
    return mat;
  };

  const highMat = useMemo(() => makeLodMaterial('#44ff88', '#22cc66'), []);
  const midMat = useMemo(() => makeLodMaterial('#ffcc44', '#cc9922'), []);
  const lowMat = useMemo(() => makeLodMaterial('#ff5544', '#cc3322'), []);

  // LOD fade materials with opacity
  const highFadeMat = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.transparent = true;
    mat.color.set(0x44ff88);
    mat.emissive.set(0x22cc66);
    mat.emissiveIntensity = 0.3;
    mat.roughness = 0.35;
    mat.metalness = 0.5;
    return mat;
  }, []);
  const midFadeMat = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.transparent = true;
    mat.color.set(0xffcc44);
    mat.emissive.set(0xcc9922);
    mat.emissiveIntensity = 0.3;
    mat.roughness = 0.35;
    mat.metalness = 0.5;
    return mat;
  }, []);
  void highFadeMat; void midFadeMat;

  // Setup initial matrices — all instances at their positions
  const setupMatrices = (meshRef: React.RefObject<THREE.InstancedMesh | null>) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < INSTANCE_COUNT; i++) {
      const inst = instances[i];
      dummy.position.set(...inst.position);
      dummy.scale.setScalar(inst.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  };

  useEffect(() => {
    setupMatrices(highMeshRef);
    setupMatrices(midMeshRef);
    setupMatrices(lowMeshRef);
    instanceRefs.current = instances.map(() => new THREE.Object3D());
  }, [instances]);

  // Camera dolly animation target — circles inward and outward
  const cameraAngle = useRef(0);
  const cameraRadius = useRef(8);
  const dollyDir = useRef(1);

  useFrame((state, delta) => {
    // Dolly camera in/out to trigger LOD transitions
    cameraRadius.current += dollyDir.current * delta * 3.0;
    if (cameraRadius.current > 22) dollyDir.current = -1;
    if (cameraRadius.current < 3) dollyDir.current = 1;
    cameraAngle.current += delta * 0.3;

    const r = cameraRadius.current;
    state.camera.position.set(
      Math.cos(cameraAngle.current) * r,
      5,
      Math.sin(cameraAngle.current) * r
    );
    state.camera.lookAt(0, 0, 0);

    cameraDistUniform.value = r;

    // Rotate instances and update matrices per-mesh
    const dummy = new THREE.Object3D();
    const t = state.clock.getElapsedTime();

    // For each mesh level, set opacity based on distance and blend
    for (let i = 0; i < INSTANCE_COUNT; i++) {
      const inst = instances[i];
      dummy.position.set(...inst.position);
      const instDist = new THREE.Vector3(...inst.position).length();

      // Rotation animation
      dummy.rotation.x = t * inst.rotSpeed[0];
      dummy.rotation.y = t * inst.rotSpeed[1];
      dummy.rotation.z = t * inst.rotSpeed[2];
      dummy.scale.setScalar(inst.scale);
      dummy.updateMatrix();

      // Show/hide per LOD level based on camera distance to instance
      const camPos = state.camera.position;
      const dx = camPos.x - inst.position[0];
      const dz = camPos.z - inst.position[2];
      const distToInst = Math.sqrt(dx * dx + dz * dz);

      // High LOD: visible when dist < threshold, fade out at boundary
      const highOpacity = 1.0 - Math.max(0, Math.min(1, (distToInst - LOD_HIGH_THRESHOLD) / TRANSITION_WIDTH));
      // Mid LOD: visible in mid range
      const midOpacity = Math.max(0, Math.min(1, (distToInst - LOD_HIGH_THRESHOLD + TRANSITION_WIDTH) / TRANSITION_WIDTH))
                       * (1.0 - Math.max(0, Math.min(1, (distToInst - LOD_MID_THRESHOLD) / TRANSITION_WIDTH)));
      // Low LOD: visible far away
      const lowOpacity = Math.max(0, Math.min(1, (distToInst - LOD_MID_THRESHOLD + TRANSITION_WIDTH) / TRANSITION_WIDTH));

      // Use scale to simulate visibility (0.0001 when invisible)
      const highScale = highOpacity > 0.01 ? inst.scale : 0.0001;
      const midScale = midOpacity > 0.01 ? inst.scale : 0.0001;
      const lowScale = lowOpacity > 0.01 ? inst.scale : 0.0001;

      dummy.scale.setScalar(highScale);
      dummy.updateMatrix();
      highMeshRef.current?.setMatrixAt(i, dummy.matrix);

      dummy.scale.setScalar(midScale);
      dummy.updateMatrix();
      midMeshRef.current?.setMatrixAt(i, dummy.matrix);

      dummy.scale.setScalar(lowScale);
      dummy.updateMatrix();
      lowMeshRef.current?.setMatrixAt(i, dummy.matrix);

      void instDist;
    }

    if (highMeshRef.current) highMeshRef.current.instanceMatrix.needsUpdate = true;
    if (midMeshRef.current) midMeshRef.current.instanceMatrix.needsUpdate = true;
    if (lowMeshRef.current) lowMeshRef.current.instanceMatrix.needsUpdate = true;
  });

  // TSL for LOD distance indicator — uses camera distance uniform
  const distIndicatorMat = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    const d = cameraDistUniform;
    // Color indicator changes with distance
    const nearColor = color(0x44ff88);
    const midColor = color(0xffcc44);
    const farColor = color(0xff5544);
    const t1 = smoothstep(float(LOD_HIGH_THRESHOLD - 1), float(LOD_HIGH_THRESHOLD + 1), d);
    const t2 = smoothstep(float(LOD_MID_THRESHOLD - 1), float(LOD_MID_THRESHOLD + 1), d);
    const col = mix(mix(nearColor, midColor, t1), farColor, t2);
    mat.colorNode = col;
    mat.emissiveNode = col.mul(oscSine(time.mul(2)).mul(0.3).add(0.5));
    mat.roughness = 0.2;
    mat.metalness = 0.8;
    return mat;
  }, [cameraDistUniform]);

  return (
    <>
      <ambientLight intensity={0.15} />
      <directionalLight position={[8, 10, 5]} intensity={0.6} />
      <directionalLight position={[-5, 8, -8]} intensity={0.3} color="#8899ff" />
      <pointLight position={[0, 3, 0]} intensity={15} color="#ffeecc" distance={20} />

      {/* Ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1, 0]}>
        <planeGeometry args={[60, 60]} />
        <meshStandardMaterial color="#111122" roughness={0.95} />
      </mesh>

      {/* Distance rings on ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.99, 0]}>
        <ringGeometry args={[LOD_HIGH_THRESHOLD - 0.05, LOD_HIGH_THRESHOLD + 0.05, 64]} />
        <meshStandardMaterial color="#44ff88" emissive="#44ff88" emissiveIntensity={1.5} transparent opacity={0.8} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.99, 0]}>
        <ringGeometry args={[LOD_MID_THRESHOLD - 0.05, LOD_MID_THRESHOLD + 0.05, 64]} />
        <meshStandardMaterial color="#ff5544" emissive="#ff5544" emissiveIntensity={1.5} transparent opacity={0.8} />
      </mesh>

      {/* HIGH LOD instances: 200 tubular, 32 radial */}
      <instancedMesh
        ref={highMeshRef}
        args={[undefined, undefined, INSTANCE_COUNT]}
        material={highMat}
        frustumCulled={false}
      >
        <torusKnotGeometry args={[0.5, 0.15, 200, 32]} />
      </instancedMesh>

      {/* MID LOD instances: 100 tubular, 16 radial */}
      <instancedMesh
        ref={midMeshRef}
        args={[undefined, undefined, INSTANCE_COUNT]}
        material={midMat}
        frustumCulled={false}
      >
        <torusKnotGeometry args={[0.5, 0.15, 100, 16]} />
      </instancedMesh>

      {/* LOW LOD instances: 30 tubular, 8 radial */}
      <instancedMesh
        ref={lowMeshRef}
        args={[undefined, undefined, INSTANCE_COUNT]}
        material={lowMat}
        frustumCulled={false}
      >
        <torusKnotGeometry args={[0.5, 0.15, 30, 8]} />
      </instancedMesh>

      {/* Distance indicator sphere at center */}
      <mesh position={[0, 1.5, 0]}>
        <sphereGeometry args={[0.4, 32, 32]} />
        <primitive object={distIndicatorMat} />
      </mesh>

      {/* Legend markers */}
      {[
        { pos: [0, 2.5, 0] as [number, number, number], col: '#44ff88', label: 'HIGH' },
        { pos: [0, 3.2, 0] as [number, number, number], col: '#ffcc44', label: 'MID' },
        { pos: [0, 3.9, 0] as [number, number, number], col: '#ff5544', label: 'LOW' },
      ].map(({ pos, col: c }, i) => (
        <mesh key={i} position={pos}>
          <boxGeometry args={[0.5, 0.12, 0.12]} />
          <meshStandardMaterial color={c} emissive={c} emissiveIntensity={1.0} />
        </mesh>
      ))}
    </>
  );
}
