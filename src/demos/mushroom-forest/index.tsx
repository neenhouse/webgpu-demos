/* eslint-disable react-hooks/purity */
import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
  color,
  time,
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
 * Mushroom Forest — Giant bioluminescent mushrooms with pulsing caps, spore particles, and ground fog
 *
 * Techniques:
 * 1. 12 mushrooms: cylinder stem + hemisphere cap (separate instanced meshes)
 * 2. Caps pulse emissive with oscSine at different phases per mushroom
 * 3. 4-color bioluminescent palette (cyan, magenta, lime, gold)
 * 4. 200 instanced spore particles floating upward with animated Y
 * 5. Ground fog: translucent plane with animated opacity via oscSine
 * 6. Dark ambient + colored point lights per mushroom cluster
 */

const MUSHROOM_COUNT = 12;
const SPORE_COUNT = 200;

const MUSHROOM_PALETTE = [
  { stem: 0x334433, cap: [0.1, 0.9, 0.85], light: '#00ddaa' }, // cyan
  { stem: 0x3a2233, cap: [0.9, 0.15, 0.75], light: '#ee22cc' }, // magenta
  { stem: 0x2a3322, cap: [0.3, 0.95, 0.2],  light: '#44ff22' }, // lime
  { stem: 0x332a1a, cap: [1.0, 0.78, 0.1],  light: '#ffcc22' }, // gold
];

interface MushroomConfig {
  x: number; z: number;
  stemH: number; stemR: number; capR: number;
  colorIdx: number;
  phase: number;
}

function mushroomConfigs(): MushroomConfig[] {
  return Array.from({ length: MUSHROOM_COUNT }, (_, i) => {
    const theta = (i / MUSHROOM_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.8;
    const r = 1.5 + Math.random() * 3.5;
    const stemH = 0.8 + Math.random() * 2.2;
    const stemR = 0.08 + Math.random() * 0.18;
    const capR = stemR * (2.5 + Math.random() * 2.0);
    return {
      x: r * Math.cos(theta),
      z: r * Math.sin(theta),
      stemH, stemR, capR,
      colorIdx: i % 4,
      phase: Math.random() * Math.PI * 2,
    };
  });
}

function makeStemMaterial(colorIdx: number) {
  const stemColor = MUSHROOM_PALETTE[colorIdx].stem;
  const mat = new THREE.MeshStandardNodeMaterial();
  const fn = Fn(() => {
    const n = hash(positionWorld.mul(float(8.5)));
    const base = color(stemColor);
    const lighter = color(stemColor + 0x111111);
    return mix(base, lighter, n);
  });
  mat.colorNode = fn();
  mat.roughness = 0.82;
  mat.metalness = 0.05;
  return mat;
}

function makeCapMaterial(colorIdx: number, phase: number) {
  const [cr, cg, cb] = MUSHROOM_PALETTE[colorIdx].cap;
  const mat = new THREE.MeshStandardNodeMaterial();

  const capFn = Fn(() => {
    const n = hash(positionWorld.mul(float(6.0)));
    const capColor = vec3(float(cr), float(cg), float(cb));
    const darkCap  = capColor.mul(float(0.3));
    return mix(darkCap, capColor, smoothstep(float(0.3), float(0.7), n));
  });
  mat.colorNode = capFn();

  // Pulsing emissive — each mushroom has different phase via uniform float
  const phaseF = float(phase);
  const emFn = Fn(() => {
    const capColor = vec3(float(cr), float(cg), float(cb));
    const pulse = oscSine(time.mul(float(0.8)).add(phaseF)).mul(float(0.4)).add(float(0.6));
    // Spots pattern on cap
    const px = positionWorld.x;
    const pz = positionWorld.z;
    const spotSeed = hash(vec3(px.mul(float(18.0)).floor().div(float(18.0)), float(0.0), pz.mul(float(18.0)).floor().div(float(18.0))));
    const isSpot = smoothstep(float(0.75), float(0.82), spotSeed);
    const spotBrightness = isSpot.mul(float(1.5)).add(float(1.0));
    return capColor.mul(pulse.mul(float(2.5)).mul(spotBrightness));
  });
  mat.emissiveNode = emFn();
  mat.roughness = 0.4;
  mat.metalness = 0.1;
  return mat;
}

function makeSporeMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;

  const sporeFn = Fn(() => {
    const n = hash(positionWorld.mul(float(35.0)));
    const c1 = vec3(float(0.1), float(0.9), float(0.85));
    const c2 = vec3(float(0.9), float(0.15), float(0.75));
    const c3 = vec3(float(0.3), float(0.95), float(0.2));
    const c4 = vec3(float(1.0), float(0.78), float(0.1));

    const idx = n.mul(float(4.0)).floor();
    const s1 = mix(c1, c2, smoothstep(float(0.5), float(1.5), idx));
    const s2 = mix(s1, c3, smoothstep(float(1.5), float(2.5), idx));
    return mix(s2, c4, smoothstep(float(2.5), float(3.5), idx));
  });

  mat.colorNode = sporeFn();
  mat.emissiveNode = sporeFn().mul(float(2.0));
  mat.opacityNode = float(0.6);
  mat.roughness = 0.2;
  mat.metalness = 0.0;
  return mat;
}

function makeGroundFogMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;
  mat.depthWrite = false;
  mat.side = THREE.DoubleSide;

  const fogFn = Fn(() => {
    const px = positionWorld.x;
    const pz = positionWorld.z;
    const n = hash(vec3(px.mul(float(2.5)), float(0.0), pz.mul(float(2.5))));
    const drift = oscSine(time.mul(float(0.3)).add(n.mul(float(6.0)))).mul(float(0.3)).add(float(0.7));
    return smoothstep(float(0.45), float(0.65), n).mul(drift).mul(float(0.18));
  });

  mat.colorNode = color(0x334433);
  mat.emissiveNode = color(0x00aa66).mul(float(0.3));
  mat.opacityNode = fogFn();
  mat.roughness = 1.0;
  mat.metalness = 0.0;
  return mat;
}

function makeGroundMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();
  const gFn = Fn(() => {
    const n = hash(positionWorld.mul(float(3.5)));
    const darkMoss = color(0x0d1a0d);
    const richMoss = color(0x1a2e12);
    return mix(darkMoss, richMoss, n);
  });
  mat.colorNode = gFn();
  mat.emissiveNode = color(0x002210).mul(float(0.4));
  mat.roughness = 0.95;
  mat.metalness = 0.0;
  return mat;
}

function Mushrooms({ configs }: { configs: MushroomConfig[] }) {
  // Group stems by colorIdx
  const stemRefs = [
    useRef<THREE.InstancedMesh>(null),
    useRef<THREE.InstancedMesh>(null),
    useRef<THREE.InstancedMesh>(null),
    useRef<THREE.InstancedMesh>(null),
  ];
  const capRefs = [
    useRef<THREE.InstancedMesh>(null),
    useRef<THREE.InstancedMesh>(null),
    useRef<THREE.InstancedMesh>(null),
    useRef<THREE.InstancedMesh>(null),
  ];

  const stemMats = useMemo(() => [0,1,2,3].map(i => makeStemMaterial(i)), []);
  const capMats = useMemo(() => configs.map(cfg => makeCapMaterial(cfg.colorIdx, cfg.phase)), [configs]);

  // Separate mushrooms by color
  const byColor = useMemo(() => {
    const groups: MushroomConfig[][] = [[],[],[],[]];
    configs.forEach(cfg => groups[cfg.colorIdx].push(cfg));
    return groups;
  }, [configs]);

  useEffect(() => {
    const dummy = new THREE.Object3D();

    byColor.forEach((group, colorIdx) => {
      const stemMesh = stemRefs[colorIdx].current;
      const capMesh = capRefs[colorIdx].current;
      if (!stemMesh || !capMesh) return;

      group.forEach((cfg, i) => {
        // Stem
        dummy.position.set(cfg.x, cfg.stemH / 2, cfg.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(cfg.stemR, cfg.stemH, cfg.stemR);
        dummy.updateMatrix();
        stemMesh.setMatrixAt(i, dummy.matrix);

        // Cap — position above stem top
        dummy.position.set(cfg.x, cfg.stemH + cfg.capR * 0.3, cfg.z);
        dummy.scale.set(cfg.capR, cfg.capR * 0.5, cfg.capR);
        dummy.updateMatrix();
        capMesh.setMatrixAt(i, dummy.matrix);
      });

      stemMesh.instanceMatrix.needsUpdate = true;
      capMesh.instanceMatrix.needsUpdate = true;
    });
  }, [byColor]);

  return (
    <>
      {[0,1,2,3].map(colorIdx => (
        <group key={colorIdx}>
          <instancedMesh ref={stemRefs[colorIdx]} args={[undefined, undefined, Math.max(byColor[colorIdx].length, 1)]} material={stemMats[colorIdx]} frustumCulled={false}>
            <cylinderGeometry args={[1, 1.2, 1, 8]} />
          </instancedMesh>
          <instancedMesh ref={capRefs[colorIdx]} args={[undefined, undefined, Math.max(byColor[colorIdx].length, 1)]} material={capMats[colorIdx * 3]} frustumCulled={false}>
            <sphereGeometry args={[1, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
          </instancedMesh>
        </group>
      ))}
    </>
  );
}

function SporeParticles() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const sporeMat = useMemo(() => makeSporeMaterial(), []);

  const sporeData = useMemo(() =>
    Array.from({ length: SPORE_COUNT }, () => ({
      x: (Math.random() - 0.5) * 12,
      startY: Math.random() * 1.5,
      z: (Math.random() - 0.5) * 12,
      speed: 0.3 + Math.random() * 0.8,
      phase: Math.random() * Math.PI * 2,
      driftX: (Math.random() - 0.5) * 0.5,
      driftZ: (Math.random() - 0.5) * 0.5,
      size: 0.015 + Math.random() * 0.03,
    })),
  []);

  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const t = clock.getElapsedTime();
    const dummy = new THREE.Object3D();
    for (let i = 0; i < SPORE_COUNT; i++) {
      const d = sporeData[i];
      const y = d.startY + ((t * d.speed + d.phase) % 5.0);
      const x = d.x + Math.sin(t * 0.4 + d.phase) * d.driftX;
      const z = d.z + Math.cos(t * 0.35 + d.phase) * d.driftZ;
      dummy.position.set(x, y, z);
      dummy.scale.setScalar(d.size);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, SPORE_COUNT]} material={sporeMat} frustumCulled={false}>
      <sphereGeometry args={[1, 4, 4]} />
    </instancedMesh>
  );
}

export default function MushroomForest() {
  const configs = useMemo(() => mushroomConfigs(), []);
  const groundMat = useMemo(() => makeGroundMaterial(), []);
  const fogMat = useMemo(() => makeGroundFogMaterial(), []);

  return (
    <>
      {/* Dark ambiance — bioluminescence is primary */}
      <ambientLight intensity={0.05} />
      {/* Colored point lights matching mushroom palette */}
      <pointLight position={[2, 1.5, 1]} intensity={5.0} color="#00ddaa" distance={8} />
      <pointLight position={[-2, 1.2, -1]} intensity={4.5} color="#ee22cc" distance={8} />
      <pointLight position={[1, 2.0, -2.5]} intensity={4.5} color="#44ff22" distance={8} />
      <pointLight position={[-1.5, 1.0, 2]} intensity={4.0} color="#ffcc22" distance={7} />
      <pointLight position={[0, 0.5, 0]} intensity={1.5} color="#224422" distance={6} />

      {/* Dark sky for nighttime forest */}
      <mesh>
        <sphereGeometry args={[80, 16, 10]} />
        <meshBasicNodeMaterial side={THREE.BackSide} colorNode={color(0x040a04)} />
      </mesh>

      {/* Mossy ground */}
      <mesh material={groundMat} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[25, 25, 32, 32]} />
      </mesh>

      {/* Ground fog plane */}
      <mesh material={fogMat} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.15, 0]}>
        <planeGeometry args={[25, 25, 16, 16]} />
      </mesh>

      {/* Mushrooms */}
      <Mushrooms configs={configs} />

      {/* Drifting spores */}
      <SporeParticles />
    </>
  );
}
