import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import { color, float, mix, positionWorld, smoothstep, time, uniform } from 'three/tsl';

/**
 * Tree Growth — L-system tree growing in real time
 *
 * CPU L-system generates branch segments over time.
 * Rules: F -> F[+F][-F]F (simplified 3D branching).
 * Each segment = thin CylinderGeometry positioned/rotated.
 * Branch thickness decreases with depth.
 * Leaf particles: instanced small spheres at tips.
 * Growth animation: segments appear progressively over 10s, loop.
 * Brown bark, green leaves, wind sway on outer branches via sin(time).
 *
 * Techniques: CPU L-system, instanced mesh, progressive reveal, wind sway TSL.
 */

interface Branch {
  position: THREE.Vector3;
  direction: THREE.Vector3;
  length: number;
  radius: number;
  depth: number;
  parentIndex: number;
  angle: number;
}

function generateLSystem(maxDepth: number): Branch[] {
  const branches: Branch[] = [];
  const stack: Array<{
    pos: THREE.Vector3;
    dir: THREE.Vector3;
    depth: number;
    radius: number;
    parentAngle: number;
  }> = [];

  stack.push({
    pos: new THREE.Vector3(0, -3, 0),
    dir: new THREE.Vector3(0, 1, 0),
    depth: 0,
    radius: 0.22,
    parentAngle: 0,
  });

  while (stack.length > 0) {
    const { pos, dir, depth, radius, parentAngle } = stack.pop()!;
    if (depth > maxDepth) continue;

    const segLen = Math.max(0.35, 1.8 * Math.pow(0.72, depth));
    const endPos = pos.clone().addScaledVector(dir, segLen);

    branches.push({
      position: pos.clone().lerp(endPos, 0.5),
      direction: dir.clone(),
      length: segLen,
      radius: radius,
      depth,
      parentIndex: branches.length,
      angle: parentAngle,
    });

    if (depth < maxDepth) {
      const branchCount = depth < 2 ? 3 : 2;
      for (let b = 0; b < branchCount; b++) {
        const pitchAngle = (25 + depth * 8) * (Math.PI / 180);
        const yawAngle = (b * Math.PI * 2) / branchCount + depth * 0.7 + parentAngle * 0.3;

        const newDir = dir.clone();
        const right = new THREE.Vector3(Math.cos(yawAngle), 0, Math.sin(yawAngle));
        newDir.lerp(right, Math.sin(pitchAngle)).normalize();

        stack.push({
          pos: endPos.clone(),
          dir: newDir,
          depth: depth + 1,
          radius: radius * 0.68,
          parentAngle: yawAngle,
        });
      }
    }
  }

  return branches;
}

const MAX_BRANCHES = 300;
const MAX_LEAVES = 200;

export default function TreeGrowth() {
  const branchMeshRef = useRef<THREE.InstancedMesh>(null);
  const leafMeshRef = useRef<THREE.InstancedMesh>(null);
  const groupRef = useRef<THREE.Group>(null);
  const progressRef = useRef(0);
  const totalTimeRef = useRef(0);

  const branches = useMemo(() => generateLSystem(5), []);

  // Branch material: warm brown bark with subtle variation
  const branchMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    const heightNorm = smoothstep(-3.0, 5.0, positionWorld.y);
    const darkBark = color(0x3d1e0a);
    const midBark = color(0x6b3a1f);
    const lightBark = color(0x8b5a3a);
    mat.colorNode = mix(darkBark, mix(midBark, lightBark, heightNorm), heightNorm.mul(0.7));
    mat.roughness = 0.9;
    mat.metalness = 0.0;
    return mat;
  }, []);

  // Leaf material: fresh green with wind sway
  const leafMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    const windSway = float(uniform(0)).toVar();
    const windFactor = positionWorld.y.sub(0.0).mul(0.3);
    const sway = time.mul(2.5).add(positionWorld.x.mul(1.7)).sin().mul(windFactor).mul(0.06);
    windSway.assign(sway);

    const freshGreen = color(0x4a9b2f);
    const darkGreen = color(0x1e5a10);
    const lightGreen = color(0x7ec850);
    const heightFactor = smoothstep(2.0, 7.0, positionWorld.y);
    mat.colorNode = mix(darkGreen, mix(freshGreen, lightGreen, heightFactor), heightFactor);
    mat.emissiveNode = mat.colorNode.mul(float(0.15));
    mat.roughness = 0.7;
    mat.metalness = 0.0;
    return mat;
  }, []);

  // Build instance matrices for branches
  useEffect(() => {
    const mesh = branchMeshRef.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < Math.min(branches.length, MAX_BRANCHES); i++) {
      const b = branches[i];
      dummy.position.copy(b.position);
      dummy.lookAt(b.position.clone().add(b.direction));
      dummy.rotateX(Math.PI / 2);
      dummy.scale.set(b.radius, b.length, b.radius);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.count = 0;
  }, [branches]);

  // Build leaf instance matrices at branch tips
  useEffect(() => {
    const mesh = leafMeshRef.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    const tipBranches = branches.filter((b) => b.depth >= 4);
    let leafIdx = 0;
    for (let i = 0; i < Math.min(tipBranches.length, MAX_LEAVES); i++) {
      const b = tipBranches[i];
      const tipPos = b.position.clone().addScaledVector(b.direction, b.length * 0.5);
      // Add a cluster of 2-3 leaves per tip
      for (let l = 0; l < 2 && leafIdx < MAX_LEAVES; l++) {
        dummy.position.set(
          tipPos.x + (Math.random() - 0.5) * 0.4,
          tipPos.y + Math.random() * 0.3,
          tipPos.z + (Math.random() - 0.5) * 0.4,
        );
        const scale = 0.08 + Math.random() * 0.06;
        dummy.scale.setScalar(scale);
        dummy.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
        dummy.updateMatrix();
        mesh.setMatrixAt(leafIdx, dummy.matrix);
        leafIdx++;
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.count = 0;
  }, [branches]);

  // Animate growth — segments appear progressively
  useFrame((_, delta) => {
    totalTimeRef.current += delta;
    const CYCLE = 12.0;
    const t = (totalTimeRef.current % CYCLE) / CYCLE;
    progressRef.current = t;

    // Reveal branches progressively
    const branchMesh = branchMeshRef.current;
    if (branchMesh) {
      const visCount = Math.floor(t * branches.length);
      branchMesh.count = Math.min(visCount, MAX_BRANCHES);
    }

    // Reveal leaves after branches mostly grown
    const leafMesh = leafMeshRef.current;
    if (leafMesh) {
      const leafProgress = Math.max(0, (t - 0.65) / 0.35);
      const tipBranches = branches.filter((b) => b.depth >= 4);
      const maxLeafCount = Math.min(tipBranches.length * 2, MAX_LEAVES);
      leafMesh.count = Math.floor(leafProgress * maxLeafCount);
    }

    // Subtle group sway
    if (groupRef.current) {
      groupRef.current.rotation.z = Math.sin(totalTimeRef.current * 0.4) * 0.03;
    }
  });

  return (
    <>
      <color attach="background" args={['#87ceeb']} />
      <fog attach="fog" args={['#c8e8f0', 15, 40]} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 10, 3]} intensity={1.4} castShadow />
      <directionalLight position={[-3, 5, -2]} intensity={0.4} color="#88ccff" />
      <pointLight position={[0, 2, 0]} intensity={2.0} color="#ffee88" distance={12} />

      {/* Ground plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -3.05, 0]}>
        <planeGeometry args={[20, 20]} />
        <meshStandardMaterial color="#3d6b2a" roughness={0.9} />
      </mesh>

      {/* Ground grass tufts — instanced small cylinders */}
      <instancedMesh args={[undefined, undefined, 80]} frustumCulled={false}>
        <cylinderGeometry args={[0.02, 0.04, 0.2, 4]} />
        <meshStandardMaterial color="#4a8a2f" roughness={0.8} />
      </instancedMesh>

      <group ref={groupRef}>
        {/* Branch instances */}
        <instancedMesh
          ref={branchMeshRef}
          args={[undefined, undefined, MAX_BRANCHES]}
          material={branchMaterial}
          frustumCulled={false}
        >
          <cylinderGeometry args={[1, 1.2, 1, 6]} />
        </instancedMesh>

        {/* Leaf instances */}
        <instancedMesh
          ref={leafMeshRef}
          args={[undefined, undefined, MAX_LEAVES]}
          material={leafMaterial}
          frustumCulled={false}
        >
          <sphereGeometry args={[1, 5, 4]} />
        </instancedMesh>
      </group>
    </>
  );
}
