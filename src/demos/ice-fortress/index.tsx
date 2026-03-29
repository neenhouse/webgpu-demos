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
 * Ice Fortress — Crystalline ice structures with fresnel refraction, sub-surface lighting, frost particles
 *
 * Techniques:
 * 1. 30 instanced elongated box crystals at varied angles, translucent with fresnel glow
 * 2. Central tower: 5 large crystals in cluster
 * 3. Ground: icy plane with subtle hash displacement
 * 4. 150 instanced frost particles floating around fortress
 * 5. Sub-surface glow via emissive through transparency
 * 6. Bloom halo shells on largest crystals (BackSide icosahedrons)
 */

const CRYSTAL_COUNT = 30;
const FROST_COUNT = 150;
const HALO_SHELLS = 3;

function makeIceCrystalMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;

  // Per-crystal color from seed: cyan-blue range
  const seed = hash(positionWorld.x.mul(float(11.3)).add(positionWorld.z.mul(float(7.7))));
  const iceBlue   = vec3(float(0.55), float(0.85), float(1.0));
  const iceCyan   = vec3(float(0.3), float(0.9), float(0.95));
  const icePale   = vec3(float(0.85), float(0.95), float(1.0));

  const c1 = mix(iceBlue, iceCyan, smoothstep(float(0.3), float(0.6), seed));
  const iceColor = mix(c1, icePale, smoothstep(float(0.65), float(0.85), seed));

  mat.colorNode = vec3(iceColor.x, iceColor.y, iceColor.z);

  // Fresnel refraction glow
  const fresnel = Fn(() => {
    const viewDir = cameraPosition.sub(positionWorld).normalize();
    const nDotV = normalWorld.dot(viewDir).saturate();
    return float(1.0).sub(nDotV).pow(float(2.5));
  });

  const fresnelVal = fresnel();
  const pulse = oscSine(time.mul(float(0.4)).add(seed.mul(float(4.5)))).mul(float(0.25)).add(float(0.75));

  // Sub-surface glow: emissive through transparency
  const ssGlow = vec3(float(0.4), float(0.75), float(1.0)).mul(float(1.8)).mul(pulse);
  const rimGlow = vec3(float(0.8), float(0.95), float(1.0)).mul(fresnelVal.mul(float(2.5)));
  mat.emissiveNode = ssGlow.add(rimGlow);

  mat.opacityNode = float(0.55).add(fresnelVal.mul(float(0.35)));
  mat.roughness = 0.03;
  mat.metalness = 0.3;

  // Subtle breathing
  mat.positionNode = positionLocal.add(
    normalLocal.mul(oscSine(time.mul(float(0.7)).add(positionLocal.y.mul(float(2.0)))).mul(float(0.006))),
  );

  return mat;
}

function makeIceHaloMaterial(layer: number) {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;
  mat.side = THREE.BackSide;
  mat.depthWrite = false;
  mat.blending = THREE.AdditiveBlending;

  const layerF = float(layer);

  const fresnel = Fn(() => {
    const viewDir = cameraPosition.sub(positionWorld).normalize();
    const nDotV = normalWorld.dot(viewDir).saturate();
    return float(1.0).sub(nDotV).pow(float(2.0).add(layerF.mul(float(0.5))));
  });

  const fresnelVal = fresnel();
  const seed = hash(positionWorld.x.mul(float(11.3)).add(positionWorld.z.mul(float(7.7))));
  const pulse = oscSine(time.mul(float(0.4)).add(seed.mul(float(4.5)))).mul(float(0.2)).add(float(0.8));
  const fade = float(1.0).sub(layerF.div(float(HALO_SHELLS)));

  mat.opacityNode = fresnelVal.mul(pulse).mul(fade).mul(float(0.025));
  mat.colorNode = color(0x88ccff);
  mat.emissiveNode = vec3(float(0.5), float(0.8), float(1.0)).mul(fresnelVal.mul(pulse).mul(fade).mul(float(2.0)));
  mat.roughness = 0.0;
  mat.metalness = 0.0;
  return mat;
}

function makeIceGroundMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();

  const groundFn = Fn(() => {
    const px = positionWorld.x;
    const pz = positionWorld.z;
    const n = hash(vec3(px.mul(float(3.5)), float(0.0), pz.mul(float(3.5))));
    const iceWhite  = color(0xddeeff);
    const iceDark   = color(0xaaccee);
    const iceVein   = color(0x88aabb);
    const c1 = mix(iceWhite, iceDark, smoothstep(float(0.3), float(0.6), n));
    return mix(c1, iceVein, smoothstep(float(0.7), float(0.85), n));
  });

  mat.colorNode = groundFn();
  mat.emissiveNode = color(0x334466).mul(float(0.3));

  const dispFn = Fn(() => {
    const n = hash(positionLocal.mul(float(5.0)));
    return positionLocal.add(normalLocal.mul(n.mul(float(0.06)).sub(float(0.03))));
  });

  mat.positionNode = dispFn();
  mat.roughness = 0.08;
  mat.metalness = 0.55;

  return mat;
}

function makeFrostMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;

  const frostFn = Fn(() => {
    const n = hash(positionWorld.mul(float(45.0)));
    const white = color(0xeef5ff);
    const cyan  = color(0xaaddff);
    return mix(white, cyan, n);
  });

  mat.colorNode = frostFn();
  mat.emissiveNode = color(0x88bbff).mul(float(1.0));
  mat.opacityNode = float(0.55);
  mat.roughness = 0.1;
  mat.metalness = 0.0;
  return mat;
}

function IceCrystals() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const haloRefs = [
    useRef<THREE.InstancedMesh>(null),
    useRef<THREE.InstancedMesh>(null),
    useRef<THREE.InstancedMesh>(null),
  ];

  const crystalMat = useMemo(() => makeIceCrystalMaterial(), []);
  const haloMats = useMemo(
    () => Array.from({ length: HALO_SHELLS }, (_, i) => makeIceHaloMaterial(i)),
    [],
  );
  const haloScales = [1.25, 1.55, 1.9];

  const crystalData = useMemo(() => {
    return Array.from({ length: CRYSTAL_COUNT }, (_, i) => {
      const theta = (i / CRYSTAL_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.6;
      const r = 1.5 + Math.random() * 3.5;
      const x = r * Math.cos(theta);
      const z = r * Math.sin(theta);
      const h = 0.3 + Math.random() * 2.5;
      const w = 0.08 + Math.random() * 0.22;
      return {
        pos: new THREE.Vector3(x, h / 2, z),
        rotY: theta + (Math.random() - 0.5) * 0.8,
        rotZ: (Math.random() - 0.5) * 0.6,
        sx: w, sy: h, sz: w,
      };
    });
  }, []);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < crystalData.length; i++) {
      const { pos, rotY, rotZ, sx, sy, sz } = crystalData[i];
      dummy.position.copy(pos);
      dummy.rotation.set(0, rotY, rotZ);
      dummy.scale.set(sx, sy, sz);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      haloRefs.forEach((ref, li) => {
        const halo = ref.current;
        if (!halo) return;
        const hs = haloScales[li];
        dummy.scale.set(sx * hs, sy * hs, sz * hs);
        dummy.updateMatrix();
        halo.setMatrixAt(i, dummy.matrix);
      });
    }
    mesh.instanceMatrix.needsUpdate = true;
    haloRefs.forEach(ref => { if (ref.current) ref.current.instanceMatrix.needsUpdate = true; });
  }, [crystalData, haloScales]);

  return (
    <>
      <instancedMesh ref={meshRef} args={[undefined, undefined, CRYSTAL_COUNT]} material={crystalMat} frustumCulled={false}>
        <icosahedronGeometry args={[1, 1]} />
      </instancedMesh>
      {haloMats.map((mat, i) => (
        <instancedMesh key={i} ref={haloRefs[i]} args={[undefined, undefined, CRYSTAL_COUNT]} material={mat} frustumCulled={false}>
          <icosahedronGeometry args={[1, 1]} />
        </instancedMesh>
      ))}
    </>
  );
}

function CentralTower() {
  const towerMat = useMemo(() => makeIceCrystalMaterial(), []);

  const crystals = useMemo(() => [
    { pos: [0, 2.0, 0],    rot: [0.0, 0,   0.0],   sx: 0.35, sy: 4.0 },
    { pos: [0.25, 1.2, 0.15], rot: [0.15, 1.2, 0.1],  sx: 0.22, sy: 2.8 },
    { pos: [-0.2, 1.0, 0.2], rot: [-0.1, 2.5, -0.1], sx: 0.18, sy: 2.5 },
    { pos: [0.15, 0.8, -0.25], rot: [0.1, 3.8, 0.15], sx: 0.15, sy: 2.2 },
    { pos: [-0.25, 0.6, -0.15], rot: [-0.12, 5.0, -0.2], sx: 0.12, sy: 1.8 },
  ] as const, []);

  return (
    <>
      {crystals.map((c, i) => (
        <mesh key={i} material={towerMat} position={c.pos as [number,number,number]} rotation={c.rot as [number,number,number]} scale={[c.sx, c.sy, c.sx]}>
          <icosahedronGeometry args={[1, 1]} />
        </mesh>
      ))}
    </>
  );
}

function FrostParticles() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const frostMat = useMemo(() => makeFrostMaterial(), []);

  const frostData = useMemo(() =>
    Array.from({ length: FROST_COUNT }, () => ({
      r: 1.5 + Math.random() * 5.0,
      theta: Math.random() * Math.PI * 2,
      y: (Math.random() - 0.3) * 5.0,
      speed: 0.15 + Math.random() * 0.45,
      phase: Math.random() * Math.PI * 2,
      size: 0.02 + Math.random() * 0.05,
    })),
  []);

  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const t = clock.getElapsedTime();
    const dummy = new THREE.Object3D();
    for (let i = 0; i < FROST_COUNT; i++) {
      const d = frostData[i];
      const theta = d.theta + t * d.speed;
      const x = d.r * Math.cos(theta);
      const z = d.r * Math.sin(theta);
      const y = d.y + Math.sin(t * 0.5 + d.phase) * 0.3;
      dummy.position.set(x, y, z);
      dummy.scale.setScalar(d.size);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, FROST_COUNT]} material={frostMat} frustumCulled={false}>
      <icosahedronGeometry args={[1, 0]} />
    </instancedMesh>
  );
}

export default function IceFortress() {
  const groundMat = useMemo(() => makeIceGroundMaterial(), []);
  const groupRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (groupRef.current) groupRef.current.rotation.y += delta * 0.02;
  });

  return (
    <>
      <ambientLight intensity={0.4} color="#aaddff" />
      <directionalLight position={[8, 14, 5]} intensity={1.5} color="#e8f5ff" />
      <directionalLight position={[-6, 4, -8]} intensity={0.5} color="#88aacc" />
      <pointLight position={[0, 3, 0]} intensity={4.0} color="#66bbff" distance={15} />
      <pointLight position={[0, -1, 0]} intensity={1.5} color="#aaddff" distance={10} />

      {/* Ice sky */}
      <mesh>
        <sphereGeometry args={[80, 16, 10]} />
        <meshBasicNodeMaterial side={THREE.BackSide} colorNode={color(0x88c4e8)} />
      </mesh>

      <group ref={groupRef}>
        {/* Icy ground */}
        <mesh material={groundMat} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
          <planeGeometry args={[30, 30, 32, 32]} />
        </mesh>

        {/* Central ice tower */}
        <CentralTower />

        {/* Surrounding crystal field */}
        <IceCrystals />

        {/* Drifting frost particles */}
        <FrostParticles />
      </group>
    </>
  );
}
