import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
  color,
  float,
  instanceIndex,
  mix,
  positionWorld,
  smoothstep,
} from 'three/tsl';

/**
 * Mycelium Network — Underground fungal network with bioluminescent fruiting bodies
 *
 * Dark brown background (BackSide sphere).
 * Network: instanced thin cylinders forming branching paths from 3 root nodes.
 * Growth animation: paths extend over time.
 * Nutrient pulses: small bright instanced spheres traveling along paths.
 * 4 mushroom caps (hemisphere + cylinder) at endpoints.
 * Brown network, yellow-green pulses, cyan caps.
 *
 * Techniques: branching instanced network, animated pulses, bioluminescent materials.
 */

interface NetworkSegment {
  start: THREE.Vector3;
  end: THREE.Vector3;
  depth: number;
  pathIndex: number;
  delay: number;
}

function buildNetwork(roots: THREE.Vector3[], maxDepth: number): NetworkSegment[] {
  const segments: NetworkSegment[] = [];

  function recurse(
    start: THREE.Vector3,
    direction: THREE.Vector3,
    depth: number,
    rootIdx: number,
    delay: number,
  ) {
    if (depth > maxDepth || segments.length > 200) return;

    const len = 0.5 * Math.pow(0.78, depth) + 0.1;
    const end = start.clone().addScaledVector(direction, len);
    segments.push({ start: start.clone(), end: end.clone(), depth, pathIndex: rootIdx, delay });

    if (depth < maxDepth) {
      const branches = depth < 2 ? 3 : 2;
      for (let i = 0; i < branches; i++) {
        const angle = ((i / branches) * Math.PI * 2) + depth * 0.6 + rootIdx * 1.1;
        const newDir = new THREE.Vector3(
          direction.x + Math.cos(angle) * 0.6,
          direction.y - 0.05 * depth,
          direction.z + Math.sin(angle) * 0.6,
        ).normalize();
        recurse(end.clone(), newDir, depth + 1, rootIdx, delay + 0.2 + i * 0.1);
      }
    }
  }

  roots.forEach((root, i) => {
    const dirs = [
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(-0.5, 0, 0.866),
      new THREE.Vector3(-0.5, 0, -0.866),
    ];
    dirs.forEach((d, j) => {
      recurse(root.clone(), d, 0, i * 3 + j, i * 0.3 + j * 0.1);
    });
  });

  return segments;
}

const MAX_SEGMENTS = 180;
const PULSE_COUNT = 50;

// Pre-compute at module scope to avoid impure Math.random() calls during render
const MODULE_SEGMENTS = (() => {
  const roots = [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(-1.5, 0, 1),
    new THREE.Vector3(1.5, 0, -0.5),
  ];
  return buildNetwork(roots, 5).slice(0, MAX_SEGMENTS);
})();

const MODULE_PULSE_DATA = Array.from({ length: PULSE_COUNT }, (_, i) => ({
  segmentIndex: Math.floor((i / PULSE_COUNT) * MODULE_SEGMENTS.length),
  speed: 0.4 + Math.random() * 0.6,
  phase: Math.random(),
  size: 0.03 + Math.random() * 0.04,
}));

export default function MyceliumNetwork() {
  const networkRef = useRef<THREE.InstancedMesh>(null);
  const pulseRef = useRef<THREE.InstancedMesh>(null);
  const totalTimeRef = useRef(0);
  const groupRef = useRef<THREE.Group>(null);

  const segments = MODULE_SEGMENTS;
  const pulseData = MODULE_PULSE_DATA;

  // Network material: brown organic
  const networkMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    const depthNorm = smoothstep(0, 7, positionWorld.y.add(3.0));
    mat.colorNode = mix(color(0x2a1005), color(0x6b3a18), depthNorm);
    mat.emissiveNode = color(0x332211).mul(float(0.1));
    mat.roughness = 0.9;
    mat.metalness = 0.05;
    return mat;
  }, []);

  // Pulse material: bright yellow-green bioluminescent
  const pulseMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    const idxNorm = instanceIndex.toFloat().div(float(PULSE_COUNT));
    const c0 = color(0xccff22); // yellow-green
    const c1 = color(0x88ffaa); // green
    mat.colorNode = mix(c0, c1, idxNorm);
    mat.emissiveNode = mix(c0, c1, idxNorm).mul(float(3.0));
    mat.roughness = 0.1;
    mat.metalness = 0.2;
    return mat;
  }, []);

  // Build network instance matrices
  useEffect(() => {
    const mesh = networkRef.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const mid = seg.start.clone().lerp(seg.end, 0.5);
      const dir = seg.end.clone().sub(seg.start).normalize();
      const len = seg.start.distanceTo(seg.end);
      const radius = Math.max(0.01, 0.06 * Math.pow(0.75, seg.depth));

      dummy.position.copy(mid);
      const up = new THREE.Vector3(0, 1, 0);
      const q = new THREE.Quaternion().setFromUnitVectors(up, dir);
      dummy.setRotationFromQuaternion(q);
      dummy.scale.set(radius, len, radius);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.count = 0; // starts hidden, grows in useFrame
  }, [segments]);

  const pulseDummy = useMemo(() => new THREE.Object3D(), []);

  useFrame((_, delta) => {
    totalTimeRef.current += delta;
    const t = totalTimeRef.current;

    // Progressive reveal of network
    const GROW_TIME = 12.0;
    const visCount = Math.floor(Math.min(1, t / GROW_TIME) * segments.length);
    if (networkRef.current) networkRef.current.count = visCount;

    // Animate pulses along segments
    const pulseMesh = pulseRef.current;
    if (pulseMesh) {
      let activeCount = 0;
      for (let i = 0; i < PULSE_COUNT; i++) {
        const p = pulseData[i];
        if (p.segmentIndex >= visCount) continue;
        const seg = segments[p.segmentIndex];
        const progress = ((t * p.speed + p.phase) % 1.0);
        const pos = seg.start.clone().lerp(seg.end, progress);
        pulseDummy.position.copy(pos);
        pulseDummy.scale.setScalar(p.size);
        pulseDummy.updateMatrix();
        pulseMesh.setMatrixAt(activeCount, pulseDummy.matrix);
        activeCount++;
      }
      pulseMesh.instanceMatrix.needsUpdate = true;
      pulseMesh.count = activeCount;
    }

    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.04;
    }
  });

  const mushroomPositions = useMemo(() =>
    [
      [0.8, 0, 1.2],
      [-1.2, 0, 0.5],
      [0.3, 0, -1.5],
      [-0.5, 0, 2.0],
    ], []);

  return (
    <>
      <color attach="background" args={['#030508']} />
      <fog attach="fog" args={['#050810', 8, 18]} />

      {/* Dark BackSide sphere for underground environment */}
      <mesh>
        <sphereGeometry args={[12, 16, 12]} />
        <meshStandardMaterial color="#0a0608" side={THREE.BackSide} />
      </mesh>

      <ambientLight intensity={0.1} color="#112233" />
      <pointLight position={[0, 2, 0]} intensity={3.0} color="#ccff44" distance={10} />
      <pointLight position={[-1.5, 1, 0.5]} intensity={2.0} color="#44ffcc" distance={8} />
      <pointLight position={[1.5, 1, -0.5]} intensity={2.0} color="#88ff44" distance={8} />

      {/* Ground plane (underground) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
        <planeGeometry args={[10, 10, 4, 4]} />
        <meshStandardMaterial color="#1a0d05" roughness={0.95} />
      </mesh>

      {/* Mushroom caps and stems */}
      {mushroomPositions.map(([mx, my, mz], i) => (
        <group key={i} position={[mx, my, mz]}>
          {/* Stem */}
          <mesh position={[0, 0.2, 0]}>
            <cylinderGeometry args={[0.06, 0.08, 0.4, 7]} />
            <meshStandardMaterial color="#c8aa88" roughness={0.8} />
          </mesh>
          {/* Cap */}
          <mesh position={[0, 0.42, 0]}>
            <sphereGeometry args={[0.22, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial
              color={['#44ffcc', '#88ff44', '#22ffaa', '#aaffcc'][i]}
              emissive={['#00cc88', '#44bb00', '#00aa66', '#44cc88'][i]}
              emissiveIntensity={1.5}
              roughness={0.3}
              transparent
              opacity={0.9}
            />
          </mesh>
          {/* Glow halo */}
          <mesh position={[0, 0.42, 0]}>
            <sphereGeometry args={[0.4, 6, 4]} />
            <meshBasicMaterial
              color={['#44ffcc', '#88ff44', '#22ffaa', '#aaffcc'][i]}
              transparent
              opacity={0.03}
              side={THREE.BackSide}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
          {/* Larger glow */}
          <mesh position={[0, 0.42, 0]}>
            <sphereGeometry args={[0.7, 6, 4]} />
            <meshBasicMaterial
              color={['#44ffcc', '#88ff44', '#22ffaa', '#aaffcc'][i]}
              transparent
              opacity={0.015}
              side={THREE.BackSide}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
        </group>
      ))}

      <group ref={groupRef}>
        {/* Mycelium network strands */}
        <instancedMesh
          ref={networkRef}
          args={[undefined, undefined, MAX_SEGMENTS]}
          material={networkMaterial}
          frustumCulled={false}
        >
          <cylinderGeometry args={[1, 1, 1, 4]} />
        </instancedMesh>

        {/* Nutrient pulses */}
        <instancedMesh
          ref={pulseRef}
          args={[undefined, undefined, PULSE_COUNT]}
          material={pulseMaterial}
          frustumCulled={false}
        >
          <sphereGeometry args={[1, 5, 4]} />
        </instancedMesh>
      </group>
    </>
  );
}
