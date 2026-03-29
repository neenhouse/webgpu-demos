import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
  color,
  float,
  hash,
  instanceIndex,
  mix,
  normalWorld,
  oscSine,
  positionWorld,
  smoothstep,
  time,
  vec3,
} from 'three/tsl';

/**
 * Coral Reef — Branching coral structures with swaying anemones and fish
 *
 * 8 coral colonies from instanced cylinders in branching Y-patterns (3-4 levels).
 * 4 coral colors (orange, pink, purple, white).
 * Anemone: instanced thin cones swaying with sin(time + posY).
 * 6 fish: instanced ellipsoids in figure-8 paths.
 * Caustic: animated sine interference on floor emissive.
 * Blue-green fog. Light shaft cones with AdditiveBlending.
 *
 * Techniques: multi-layer instancing, TSL sway, caustic floor, additive light shafts.
 */

const CORAL_BRANCHES = 120;
const ANEMONE_COUNT = 60;
const FISH_COUNT = 6;
const LIGHT_SHAFT_COUNT = 5;

interface CoralBranch {
  position: THREE.Vector3;
  scale: THREE.Vector3;
  rotation: THREE.Euler;
  colorIndex: number;
}

function buildCoralColony(
  base: THREE.Vector3,
  colorIdx: number,
  depth: number,
): CoralBranch[] {
  const branches: CoralBranch[] = [];

  function recurse(
    pos: THREE.Vector3,
    dir: THREE.Vector3,
    radius: number,
    d: number,
  ) {
    if (d > depth || branches.length >= 40) return;
    const len = 0.6 * Math.pow(0.7, d);
    const endPos = pos.clone().addScaledVector(dir, len);
    const mid = pos.clone().lerp(endPos, 0.5);

    const lookQuat = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    lookQuat.setFromUnitVectors(up, dir.clone().normalize());
    const euler = new THREE.Euler().setFromQuaternion(lookQuat);

    branches.push({
      position: mid,
      scale: new THREE.Vector3(radius, len, radius),
      rotation: euler,
      colorIndex: colorIdx,
    });

    if (d < depth) {
      const branchCount = d === 0 ? 3 : 2;
      for (let i = 0; i < branchCount; i++) {
        const angle = (i * Math.PI * 2) / branchCount + d * 0.9;
        const spread = 0.45 + d * 0.08;
        const newDir = new THREE.Vector3(
          dir.x + Math.cos(angle) * spread,
          dir.y,
          dir.z + Math.sin(angle) * spread,
        ).normalize();
        recurse(endPos.clone(), newDir, radius * 0.65, d + 1);
      }
    }
  }

  recurse(base.clone(), new THREE.Vector3(0, 1, 0), 0.06, 0);
  return branches;
}

export default function CoralReef() {
  const coralMeshRef = useRef<THREE.InstancedMesh>(null);
  const anenomeMeshRef = useRef<THREE.InstancedMesh>(null);
  const fishMeshRef = useRef<THREE.InstancedMesh>(null);
  const floorRef = useRef<THREE.Mesh>(null);
  const shaftsRef = useRef<THREE.Group>(null);
  const totalTimeRef = useRef(0);

  const coralData = useMemo(() => {
    const colonies: CoralBranch[] = [];
    const colonyPositions = [
      [-3, 0, -2], [2, 0, -3], [-1, 0, 1], [3.5, 0, 0.5],
      [-4, 0, 1.5], [0.5, 0, -1.5], [1, 0, 2.5], [-2.5, 0, -0.5],
    ];
    for (let c = 0; c < colonyPositions.length; c++) {
      const [x, , z] = colonyPositions[c];
      const base = new THREE.Vector3(x, -2.5, z);
      const depth = 3 + (c % 2);
      const colorIdx = c % 4;
      const col = buildCoralColony(base, colorIdx, depth);
      colonies.push(...col);
    }
    return colonies.slice(0, CORAL_BRANCHES);
  }, []);

  // Coral material: color varies by colony with TSL
  const coralMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    const idxNorm = instanceIndex.toFloat().div(float(CORAL_BRANCHES));
    const c0 = color(0xff6633); // orange
    const c1 = color(0xff44aa); // pink
    const c2 = color(0xcc55ff); // purple
    const c3 = color(0xeeeeff); // white
    const band = idxNorm.mul(4.0).floor().div(3.0);
    const col12 = mix(c0, c1, smoothstep(0.0, 0.33, band));
    const col23 = mix(col12, c2, smoothstep(0.33, 0.67, band));
    const finalCol = mix(col23, c3, smoothstep(0.67, 1.0, band));
    mat.colorNode = finalCol;
    mat.emissiveNode = finalCol.mul(float(0.2));
    mat.roughness = 0.7;
    mat.metalness = 0.1;
    return mat;
  }, []);

  // Anemone material: animated sway
  const anenomeMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    oscSine(time.mul(1.5).add(instanceIndex.toFloat().mul(0.8))).mul(0.15);
    mat.colorNode = mix(color(0xff9966), color(0xffcc44), smoothstep(-1.0, 2.0, positionWorld.y));
    mat.emissiveNode = color(0xff5522).mul(float(0.25));
    mat.roughness = 0.6;
    // Sway via positionNode isn't available for instances - rely on CPU animation
    return mat;
  }, []);

  // Fish material: iridescent blue-green
  const fishMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    const fresnel = float(1.0).sub(normalWorld.dot(vec3(0, 0, 1)).abs());
    mat.colorNode = mix(color(0x0088ff), color(0xffcc00), fresnel.pow(float(2.0)));
    mat.emissiveNode = color(0x0044aa).mul(float(0.3));
    mat.roughness = 0.2;
    mat.metalness = 0.6;
    return mat;
  }, []);

  // Floor material: sandy with caustic
  const floorMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    const caustic1 = positionWorld.x.mul(3.0).add(time.mul(0.8)).sin();
    const caustic2 = positionWorld.z.mul(2.5).add(time.mul(1.1)).sin();
    const caustic3 = positionWorld.x.add(positionWorld.z).mul(2.0).add(time.mul(0.6)).sin();
    const causticPat = caustic1.mul(caustic2).mul(caustic3).mul(0.5).add(0.5);
    const sandColor = color(0xc8a87a);
    const wetSand = color(0x8a6a4a);
    mat.colorNode = mix(wetSand, sandColor, hash(positionWorld.x.mul(10).add(positionWorld.z.mul(10))).mul(0.4).add(0.6));
    mat.emissiveNode = color(0x4488cc).mul(causticPat.mul(float(0.35)));
    mat.roughness = 0.85;
    return mat;
  }, []);

  // Build coral instances
  useEffect(() => {
    const mesh = coralMeshRef.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < coralData.length; i++) {
      const b = coralData[i];
      dummy.position.copy(b.position);
      dummy.rotation.copy(b.rotation);
      dummy.scale.copy(b.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.count = coralData.length;
  }, [coralData]);

  // Build anemone instances
  useEffect(() => {
    const mesh = anenomeMeshRef.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < ANEMONE_COUNT; i++) {
      const angle = (i / ANEMONE_COUNT) * Math.PI * 2;
      const r = 1.5 + (i % 5) * 0.8;
      dummy.position.set(
        Math.cos(angle) * r * 1.2,
        -2.5,
        Math.sin(angle) * r,
      );
      dummy.scale.set(0.03, 0.25 + (i % 3) * 0.1, 0.03);
      dummy.rotation.set(0, angle, (i % 3) * 0.2 - 0.1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, []);

  const dummy = useMemo(() => new THREE.Object3D(), []);

  // Animate fish and anemones
  useFrame((_, delta) => {
    totalTimeRef.current += delta;
    const t = totalTimeRef.current;

    // Fish figure-8 paths
    const fishMesh = fishMeshRef.current;
    if (fishMesh) {
      for (let i = 0; i < FISH_COUNT; i++) {
        const phaseOffset = (i / FISH_COUNT) * Math.PI * 2;
        const speed = 0.6 + i * 0.12;
        const figure8T = t * speed + phaseOffset;
        const x = Math.sin(figure8T) * 3.5;
        const y = -1.0 + i * 0.4 + Math.sin(figure8T * 0.5) * 0.3;
        const z = Math.sin(figure8T * 2) * 1.5 - 1.0;
        dummy.position.set(x, y, z);
        dummy.lookAt(
          x + Math.cos(figure8T) * 3.5,
          y,
          z + Math.cos(figure8T * 2) * 3.0,
        );
        dummy.scale.set(0.12, 0.07, 0.22);
        dummy.updateMatrix();
        fishMesh.setMatrixAt(i, dummy.matrix);
      }
      fishMesh.instanceMatrix.needsUpdate = true;
    }

    // Anemone sway via CPU
    const aneMesh = anenomeMeshRef.current;
    if (aneMesh) {
      for (let i = 0; i < ANEMONE_COUNT; i++) {
        const angle = (i / ANEMONE_COUNT) * Math.PI * 2;
        const r = 1.5 + (i % 5) * 0.8;
        const sway = Math.sin(t * 1.5 + i * 0.8) * 0.15;
        dummy.position.set(Math.cos(angle) * r * 1.2, -2.5, Math.sin(angle) * r);
        dummy.scale.set(0.03, 0.25 + (i % 3) * 0.1, 0.03);
        dummy.rotation.set(sway, angle, (i % 3) * 0.2 - 0.1 + sway * 0.5);
        dummy.updateMatrix();
        aneMesh.setMatrixAt(i, dummy.matrix);
      }
      aneMesh.instanceMatrix.needsUpdate = true;
    }
  });

  const lightShaftPositions = useMemo(() =>
    Array.from({ length: LIGHT_SHAFT_COUNT }, (_, i) => ({
      x: (i - 2) * 1.8,
      z: -2 + (i % 2) * 2,
    })), []);

  return (
    <>
      <color attach="background" args={['#001830']} />
      <fog attach="fog" args={['#003355', 8, 22]} />
      <ambientLight intensity={0.3} color="#003366" />
      <directionalLight position={[2, 8, 1]} intensity={0.8} color="#88ccff" />
      <pointLight position={[-3, 0, 0]} intensity={4.0} color="#00aaff" distance={12} />
      <pointLight position={[3, -1, 2]} intensity={3.0} color="#ff6644" distance={8} />
      <pointLight position={[0, 2, -3]} intensity={2.5} color="#aa44ff" distance={10} />

      {/* Sandy floor */}
      <mesh
        ref={floorRef}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -2.55, 0]}
      >
        <planeGeometry args={[14, 14, 32, 32]} />
        <primitive object={floorMaterial} />
      </mesh>

      {/* Light shafts */}
      <group ref={shaftsRef}>
        {lightShaftPositions.map((p, i) => (
          <mesh key={i} position={[p.x, 2, p.z]} rotation={[0, 0, 0]}>
            <coneGeometry args={[0.3, 6, 6, 1, true]} />
            <meshBasicMaterial
              color="#88ddff"
              transparent
              opacity={0.04}
              side={THREE.BackSide}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
        ))}
      </group>

      {/* Coral branches */}
      <instancedMesh
        ref={coralMeshRef}
        args={[undefined, undefined, CORAL_BRANCHES]}
        material={coralMaterial}
        frustumCulled={false}
      >
        <cylinderGeometry args={[1, 1.1, 1, 5]} />
      </instancedMesh>

      {/* Anemones */}
      <instancedMesh
        ref={anenomeMeshRef}
        args={[undefined, undefined, ANEMONE_COUNT]}
        material={anenomeMaterial}
        frustumCulled={false}
      >
        <coneGeometry args={[1, 1, 4]} />
      </instancedMesh>

      {/* Fish */}
      <instancedMesh
        ref={fishMeshRef}
        args={[undefined, undefined, FISH_COUNT]}
        material={fishMaterial}
        frustumCulled={false}
      >
        <sphereGeometry args={[1, 6, 4]} />
      </instancedMesh>
    </>
  );
}
