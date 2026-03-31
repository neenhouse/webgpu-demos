/* eslint-disable react-hooks/purity */
import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
  color,
  time,
  normalWorld,
  cameraPosition,
  positionWorld,
  positionLocal,
  normalLocal,
  Fn,
  float,
  mix,
  smoothstep,
  hash,
  oscSine,
  vec3,
} from 'three/tsl';

/**
 * Cave System — Underground cave with noise-carved walls, stalactites, bioluminescent pools, crystal clusters
 *
 * Techniques:
 * 1. BackSide icosahedron (subdivision 5) with 3-frequency hash displacement for cave walls
 * 2. 40 instanced stalactite cones hanging from ceiling
 * 3. Bioluminescent pools: emissive planes on floor with animated glow
 * 4. Crystal clusters: 30 instanced elongated icosahedrons with bloom halos
 * 5. Distance-based fog via smoothstep on positionLocal magnitude
 * 6. Fresnel glow on crystals for refraction look
 */

const STALACTITE_COUNT = 40;
const CRYSTAL_COUNT = 30;
const POOL_COUNT = 5;

function makeCaveWallMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.side = THREE.BackSide;

  const dispFn = Fn(() => {
    const p = positionLocal;
    // 3-frequency noise layering
    const n1 = hash(p.mul(float(2.8)));
    const n2 = hash(p.mul(float(6.3)).add(vec3(float(13.7), float(5.1), float(9.3))));
    const n3 = hash(p.mul(float(13.5)).add(vec3(float(7.1), float(18.3), float(3.7))));
    const noise = n1.mul(float(0.55)).add(n2.mul(float(0.3))).add(n3.mul(float(0.15)));
    // Cave walls displace inward and outward irregularly
    const disp = noise.mul(float(0.9)).sub(float(0.25));
    return positionLocal.add(normalLocal.mul(disp));
  });
  mat.positionNode = dispFn();

  const colorFn = Fn(() => {
    const p = positionWorld;
    const n = hash(p.mul(float(1.8)));
    const n2 = hash(p.mul(float(5.1)).add(vec3(float(3.0), float(7.0), float(2.0))));
    const darkBasalt   = color(0x1a1512);
    const warmSandstone = color(0x3a2a1e);
    const coolSlate    = color(0x15191f);
    const c1 = mix(darkBasalt, warmSandstone, smoothstep(float(0.3), float(0.6), n));
    return mix(c1, coolSlate, smoothstep(float(0.55), float(0.85), n2));
  });
  mat.colorNode = colorFn();
  mat.roughness = 0.92;
  mat.metalness = 0.05;
  return mat;
}

function makeStalactiteMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();
  const rockFn = Fn(() => {
    const n = hash(positionWorld.mul(float(6.5)));
    return mix(color(0x2a2520), color(0x3d342a), n);
  });
  mat.colorNode = rockFn();
  mat.roughness = 0.88;
  mat.metalness = 0.08;
  return mat;
}

function makeCrystalMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;
  mat.opacity = 0.85;

  // 4-color bioluminescent crystal palette
  const seed = hash(positionWorld.x.mul(float(7.3)).add(positionWorld.z.mul(float(13.7))));
  const colorIdx = seed.mul(float(4.0)).floor();

  const cyan    = vec3(float(0.1), float(0.9), float(0.85));
  const magenta = vec3(float(0.9), float(0.15), float(0.75));
  const lime    = vec3(float(0.3), float(0.95), float(0.2));
  const gold    = vec3(float(1.0), float(0.78), float(0.1));

  const c1 = mix(cyan,    magenta, smoothstep(float(0.5), float(1.5), colorIdx));
  const c2 = mix(c1,      lime,    smoothstep(float(1.5), float(2.5), colorIdx));
  const crystalColor = mix(c2, gold, smoothstep(float(2.5), float(3.5), colorIdx));

  mat.colorNode = vec3(crystalColor.x, crystalColor.y, crystalColor.z);

  const fresnel = Fn(() => {
    const viewDir = cameraPosition.sub(positionWorld).normalize();
    const nDotV = normalWorld.dot(viewDir).saturate();
    return float(1.0).sub(nDotV).pow(float(1.8));
  });

  const fresnelVal = fresnel();
  const pulse = oscSine(time.mul(float(0.6)).add(seed.mul(float(5.0)))).mul(float(0.35)).add(float(0.65));

  mat.emissiveNode = vec3(crystalColor.x, crystalColor.y, crystalColor.z)
    .mul(pulse.mul(float(2.2)))
    .add(vec3(float(1.0), float(1.0), float(1.0)).mul(fresnelVal.mul(float(1.2))));

  mat.positionNode = positionLocal.add(
    normalLocal.mul(oscSine(time.mul(float(1.2)).add(positionLocal.y.mul(float(3.5)))).mul(float(0.007))),
  );

  mat.roughness = 0.06;
  mat.metalness = 0.35;
  return mat;
}

function makeCrystalHaloMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;
  mat.side = THREE.BackSide;
  mat.depthWrite = false;
  mat.blending = THREE.AdditiveBlending;

  const seed = hash(positionWorld.x.mul(float(7.3)).add(positionWorld.z.mul(float(13.7))));
  const colorIdx = seed.mul(float(4.0)).floor();

  const cyan    = vec3(float(0.1), float(0.9), float(0.85));
  const magenta = vec3(float(0.9), float(0.15), float(0.75));
  const lime    = vec3(float(0.3), float(0.95), float(0.2));
  const gold    = vec3(float(1.0), float(0.78), float(0.1));

  const c1 = mix(cyan,    magenta, smoothstep(float(0.5), float(1.5), colorIdx));
  const c2 = mix(c1,      lime,    smoothstep(float(1.5), float(2.5), colorIdx));
  const glowColor = mix(c2, gold, smoothstep(float(2.5), float(3.5), colorIdx));

  const fresnel = Fn(() => {
    const viewDir = cameraPosition.sub(positionWorld).normalize();
    const nDotV = normalWorld.dot(viewDir).saturate();
    return float(1.0).sub(nDotV).pow(float(2.2));
  });

  const fresnelVal = fresnel();
  const pulse = oscSine(time.mul(float(0.6)).add(seed.mul(float(5.0)))).mul(float(0.2)).add(float(0.8));

  mat.opacityNode = fresnelVal.mul(pulse).mul(float(0.35));
  mat.colorNode = vec3(glowColor.x, glowColor.y, glowColor.z);
  mat.emissiveNode = vec3(glowColor.x, glowColor.y, glowColor.z).mul(fresnelVal.mul(pulse).mul(float(2.5)));

  mat.roughness = 0.0;
  mat.metalness = 0.0;
  return mat;
}

function makePoolMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;
  const poolFn = Fn(() => {
    const px = positionWorld.x;
    const pz = positionWorld.z;
    const n = hash(vec3(px.mul(float(8.0)), float(0.0), pz.mul(float(8.0))));
    // Animated ripple
    const ripple = oscSine(time.mul(float(1.5)).sub(n.mul(float(12.0)))).mul(float(0.3)).add(float(0.7));
    return color(0x00ddaa).mul(float(2.5)).mul(vec3(float(1.0), float(1.0), float(1.0)).mul(ripple));
  });
  mat.emissiveNode = poolFn();
  mat.colorNode = color(0x003322);
  mat.opacityNode = float(0.8);
  mat.roughness = 0.05;
  mat.metalness = 0.0;
  return mat;
}

function CrystalClusters() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const haloRef = useRef<THREE.InstancedMesh>(null);

  const crystalMat = useMemo(() => makeCrystalMaterial(), []);
  const haloMat = useMemo(() => makeCrystalHaloMaterial(), []);

  const crystalData = useMemo(() => {
    const data: { pos: THREE.Vector3; rot: THREE.Euler; sx: number; sy: number }[] = [];
    for (let i = 0; i < CRYSTAL_COUNT; i++) {
      // Distribute on cave floor and lower walls
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.PI * 0.55 + Math.random() * Math.PI * 0.45; // lower hemisphere
      const r = 3.5 + Math.random() * 0.6;
      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.cos(phi);
      const z = r * Math.sin(phi) * Math.sin(theta);
      const sx = 0.08 + Math.random() * 0.14;
      const sy = sx * (2.0 + Math.random() * 2.0);
      data.push({
        pos: new THREE.Vector3(x, y, z),
        rot: new THREE.Euler(
          Math.atan2(Math.sqrt(x * x + z * z), y) + (Math.random() - 0.5) * 0.5,
          Math.atan2(z, x),
          (Math.random() - 0.5) * 0.4,
        ),
        sx, sy,
      });
    }
    return data;
  }, []);

  useEffect(() => {
    const mesh = meshRef.current;
    const halo = haloRef.current;
    if (!mesh || !halo) return;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < crystalData.length; i++) {
      const { pos, rot, sx, sy } = crystalData[i];
      dummy.position.copy(pos);
      dummy.rotation.copy(rot);
      dummy.scale.set(sx, sy, sx);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      dummy.scale.set(sx * 1.5, sy * 1.4, sx * 1.5);
      dummy.updateMatrix();
      halo.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    halo.instanceMatrix.needsUpdate = true;
  }, [crystalData]);

  return (
    <>
      <instancedMesh ref={meshRef} args={[undefined, undefined, CRYSTAL_COUNT]} material={crystalMat} frustumCulled={false}>
        <icosahedronGeometry args={[1, 0]} />
      </instancedMesh>
      <instancedMesh ref={haloRef} args={[undefined, undefined, CRYSTAL_COUNT]} material={haloMat} frustumCulled={false}>
        <icosahedronGeometry args={[1, 0]} />
      </instancedMesh>
    </>
  );
}

function Stalactites() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const stalMat = useMemo(() => makeStalactiteMaterial(), []);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < STALACTITE_COUNT; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * 0.55; // upper hemisphere (ceiling)
      const r = 3.6;
      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.cos(phi);
      const z = r * Math.sin(phi) * Math.sin(theta);
      dummy.position.set(x, y, z);
      dummy.rotation.set(Math.PI + (Math.random() - 0.5) * 0.25, theta, 0);
      const sc = 0.05 + Math.random() * 0.09;
      dummy.scale.set(sc, sc * 3.5 + Math.random() * 1.5, sc);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, []);

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, STALACTITE_COUNT]} material={stalMat} frustumCulled={false}>
      <coneGeometry args={[1, 1, 7]} />
    </instancedMesh>
  );
}

function BioluminescentPools() {
  const poolMat = useMemo(() => makePoolMaterial(), []);

  const pools = useMemo(() => {
    const data: { x: number; z: number; r: number }[] = [];
    for (let i = 0; i < POOL_COUNT; i++) {
      const theta = (i / POOL_COUNT) * Math.PI * 2 + Math.random() * 0.5;
      const r = 1.2 + Math.random() * 1.0;
      data.push({ x: r * Math.cos(theta), z: r * Math.sin(theta), r: 0.2 + Math.random() * 0.3 });
    }
    return data;
  }, []);

  return (
    <>
      {pools.map((p, i) => (
        <mesh key={i} material={poolMat} position={[p.x, -3.2, p.z]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[p.r, 16]} />
        </mesh>
      ))}
    </>
  );
}

export default function CaveSystem() {
  const groupRef = useRef<THREE.Group>(null);
  const caveWallMat = useMemo(() => makeCaveWallMaterial(), []);

  useFrame((_, delta) => {
    if (groupRef.current) groupRef.current.rotation.y += delta * 0.025;
  });

  return (
    <>
      {/* Very dark ambient — bioluminescence is primary light */}
      <ambientLight intensity={0.1} />
      <hemisphereLight args={['#334433', '#112211', 0.3]} />
      {/* Crystal-colored point lights */}
      <pointLight position={[1.5, -2.5, 1.0]} intensity={5.0} color="#00ddaa" distance={9} />
      <pointLight position={[-2.0, -1.5, 1.5]} intensity={4.0} color="#ff22cc" distance={9} />
      <pointLight position={[0.5, -2.0, -2.0]} intensity={4.0} color="#44aaff" distance={9} />
      <pointLight position={[-1.0, -3.0, -1.5]} intensity={3.5} color="#aaff22" distance={8} />
      <pointLight position={[0, 0, 0]} intensity={0.8} color="#223322" distance={7} />

      <group ref={groupRef}>
        {/* Cave shell — BackSide icosahedron, subdivision 5 */}
        <mesh material={caveWallMat}>
          <icosahedronGeometry args={[5.0, 5]} />
        </mesh>

        <CrystalClusters />
        <Stalactites />
        <BioluminescentPools />
      </group>
    </>
  );
}
