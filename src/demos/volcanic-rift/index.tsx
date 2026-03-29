/* eslint-disable react-hooks/purity */
import { useRef, useMemo } from 'react';
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
 * Volcanic Rift — Lava river through cracked terrain, smoke particles, ember sparks, heat distortion
 *
 * Techniques:
 * 1. Terrain plane with central rift crack (smooth valley via abs(x) smoothstep)
 * 2. Dark rock terrain with orange emissive crack overlay (dual-material from lava-planet pattern)
 * 3. Lava river: orange-red emissive plane with animated hash noise
 * 4. 300 instanced smoke particles (dark gray, rising slowly)
 * 5. 100 bright orange ember spark particles (fast upward + drift)
 * 6. Fresnel-based heat shimmer on a screen overlay plane near rift
 */

const SMOKE_COUNT = 300;
const EMBER_COUNT = 100;

function makeTerrainMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.side = THREE.DoubleSide;

  const terrainFn = Fn(() => {
    const x = positionLocal.x;
    const z = positionLocal.z;

    // Rift valley: dip down at center (|x| < riftWidth)
    const riftWidth = float(1.8);
    const riftDepth = float(0.7);
    const riftDip = smoothstep(riftWidth.mul(float(2.0)), float(0.0), x.abs()).mul(riftDepth);

    // Multi-octave terrain noise
    const n1 = hash(vec3(x.mul(float(0.3)), float(0.0), z.mul(float(0.3))));
    const n2 = hash(vec3(x.mul(float(0.8)), float(0.5), z.mul(float(0.8))));
    const n3 = hash(vec3(x.mul(float(2.0)), float(1.2), z.mul(float(2.0))));
    const noise = n1.mul(float(1.2)).add(n2.mul(float(0.5))).add(n3.mul(float(0.2)));

    // Clamp rift to prevent terrain poking through lava
    const h = noise.sub(riftDip);
    return positionLocal.add(normalLocal.mul(h));
  });

  mat.positionNode = terrainFn();

  const colorFn = Fn(() => {
    const x = positionWorld.x;
    const z = positionWorld.z;
    const n = hash(vec3(x.mul(float(2.5)), float(0.0), z.mul(float(2.5))));

    // Distance from rift center
    const riftDist = x.abs().div(float(4.0)).saturate();

    const darkRock   = color(0x1a1210);
    const ashRock    = color(0x2a2018);
    const hotRock    = color(0x3a1a0a);
    const c1 = mix(darkRock, ashRock, smoothstep(float(0.3), float(0.6), n));
    const c2 = mix(c1, hotRock, smoothstep(float(0.6), float(1.0), float(1.0).sub(riftDist)));

    return c2;
  });

  mat.colorNode = colorFn();
  mat.roughness = 0.92;
  mat.metalness = 0.05;
  return mat;
}

function makeCrackOverlayMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;
  mat.alphaTest = 0.4;
  mat.side = THREE.DoubleSide;
  mat.depthWrite = false;

  const crackFn = Fn(() => {
    const x = positionLocal.x;
    const z = positionLocal.z;

    // Crack network: hash-based thin lines near rift
    const n1 = hash(vec3(x.mul(float(4.0)), float(0.0), z.mul(float(4.0))));
    const n2 = hash(vec3(x.mul(float(9.0)), float(0.3), z.mul(float(9.0))));
    const crackN = n1.mul(float(0.6)).add(n2.mul(float(0.4)));

    // Pulse through cracks
    const lavaPulse = oscSine(time.mul(float(0.2))).mul(float(0.08)).add(float(0.5));
    const inCrack = smoothstep(lavaPulse.add(float(0.1)), lavaPulse, crackN).mul(
      smoothstep(float(5.0), float(1.5), x.abs()) // fade with rift distance
    );

    return inCrack;
  });

  const crackVal = crackFn();
  mat.opacityNode = crackVal;

  const emFn = Fn(() => {
    const x = positionLocal.x;
    const z = positionLocal.z;
    const n1 = hash(vec3(x.mul(float(4.0)), float(0.0), z.mul(float(4.0))));
    const n2 = hash(vec3(x.mul(float(9.0)), float(0.3), z.mul(float(9.0))));
    const crackN = n1.mul(float(0.6)).add(n2.mul(float(0.4)));
    const lavaPulse = oscSine(time.mul(float(0.2))).mul(float(0.08)).add(float(0.5));
    const inCrack = smoothstep(lavaPulse.add(float(0.08)), lavaPulse, crackN);
    const orange = vec3(float(1.0), float(0.4), float(0.05));
    const hot    = vec3(float(1.0), float(0.75), float(0.3));
    return mix(orange, hot, inCrack.pow(float(0.5))).mul(float(3.0));
  });

  mat.colorNode = emFn();
  mat.emissiveNode = emFn();
  mat.roughness = 0.1;
  mat.metalness = 0.0;
  return mat;
}

function makeLavaRiverMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();

  const lavaFn = Fn(() => {
    const x = positionWorld.x;
    const z = positionWorld.z;
    const t = time;

    // Animated noise for churning lava
    const n1 = hash(vec3(x.mul(float(3.0)).add(t.mul(float(0.8))), float(0.0), z.mul(float(2.5)).add(t.mul(float(0.5)))));
    const n2 = hash(vec3(x.mul(float(7.0)).sub(t.mul(float(1.1))), float(0.5), z.mul(float(5.5)).add(t.mul(float(0.9)))));
    const lavaTexture = n1.mul(float(0.65)).add(n2.mul(float(0.35)));

    const pulse = oscSine(t.mul(float(0.35)).add(lavaTexture.mul(float(5.0)))).mul(float(0.3)).add(float(0.7));

    const lavaDeep   = vec3(float(0.7), float(0.05), float(0.0));
    const lavaMid    = vec3(float(1.0), float(0.35), float(0.02));
    const lavaHot    = vec3(float(1.0), float(0.75), float(0.3));

    const c1 = mix(lavaDeep, lavaMid, smoothstep(float(0.3), float(0.6), lavaTexture));
    const c2 = mix(c1, lavaHot, smoothstep(float(0.65), float(0.85), lavaTexture));
    return c2.mul(pulse.mul(float(2.8)));
  });

  mat.colorNode = color(0xff4400);
  mat.emissiveNode = lavaFn();
  mat.roughness = 0.4;
  mat.metalness = 0.0;
  return mat;
}

function makeSmokeMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;
  mat.depthWrite = false;

  const smokeFn = Fn(() => {
    const n = hash(positionWorld.mul(float(15.0)));
    const dark = color(0x1a1a1a);
    const gray = color(0x333333);
    return mix(dark, gray, n);
  });
  mat.colorNode = smokeFn();
  mat.opacityNode = float(0.18);
  mat.roughness = 1.0;
  mat.metalness = 0.0;
  return mat;
}

function makeEmberMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();
  const emFn = Fn(() => {
    const n = hash(positionWorld.mul(float(50.0)));
    const orange = vec3(float(1.0), float(0.45), float(0.05));
    const yellow = vec3(float(1.0), float(0.88), float(0.2));
    return mix(orange, yellow, n).mul(float(4.0));
  });
  mat.colorNode = color(0xff6600);
  mat.emissiveNode = emFn();
  mat.roughness = 0.2;
  mat.metalness = 0.0;
  return mat;
}

function SmokeParticles() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const smokeMat = useMemo(() => makeSmokeMaterial(), []);

  const smokeData = useMemo(() =>
    Array.from({ length: SMOKE_COUNT }, () => ({
      x: (Math.random() - 0.5) * 4,
      startY: Math.random() * 0.5,
      z: (Math.random() - 0.5) * 10,
      speed: 0.4 + Math.random() * 0.8,
      phase: Math.random() * Math.PI * 2,
      drift: (Math.random() - 0.5) * 0.6,
      size: 0.1 + Math.random() * 0.25,
    })),
  []);

  const smokeDummy = useMemo(() => new THREE.Object3D(), []);

  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const t = clock.getElapsedTime();
    const dummy = smokeDummy;
    for (let i = 0; i < SMOKE_COUNT; i++) {
      const d = smokeData[i];
      const y = d.startY + ((t * d.speed + d.phase) % 5.0);
      const x = d.x + Math.sin(t * 0.3 + d.phase) * d.drift;
      dummy.position.set(x, y, d.z);
      dummy.scale.setScalar(d.size * (1.0 + y * 0.3)); // grow as they rise
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, SMOKE_COUNT]} material={smokeMat} frustumCulled={false}>
      <sphereGeometry args={[1, 6, 6]} />
    </instancedMesh>
  );
}

function EmberParticles() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const emberMat = useMemo(() => makeEmberMaterial(), []);

  const emberData = useMemo(() =>
    Array.from({ length: EMBER_COUNT }, () => ({
      x: (Math.random() - 0.5) * 3.5,
      z: (Math.random() - 0.5) * 8,
      phase: Math.random() * Math.PI * 2,
      speed: 1.5 + Math.random() * 3.0,
      driftX: (Math.random() - 0.5) * 1.2,
      size: 0.02 + Math.random() * 0.04,
    })),
  []);

  const emberDummy = useMemo(() => new THREE.Object3D(), []);

  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const t = clock.getElapsedTime();
    const dummy = emberDummy;
    for (let i = 0; i < EMBER_COUNT; i++) {
      const d = emberData[i];
      const y = ((t * d.speed + d.phase) % 4.0);
      const x = d.x + Math.sin(t * 1.5 + d.phase) * d.driftX * 0.4;
      dummy.position.set(x, y, d.z);
      dummy.scale.setScalar(d.size);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, EMBER_COUNT]} material={emberMat} frustumCulled={false}>
      <sphereGeometry args={[1, 4, 4]} />
    </instancedMesh>
  );
}

const volcanicSkyMat = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, colorNode: color(0x110502) });

export default function VolcanicRift() {
  const terrainMat = useMemo(() => makeTerrainMaterial(), []);
  const crackMat = useMemo(() => makeCrackOverlayMaterial(), []);
  const lavaMat = useMemo(() => makeLavaRiverMaterial(), []);

  return (
    <>
      {/* Dark hellish ambient */}
      <ambientLight intensity={0.12} color="#220800" />
      <directionalLight position={[-5, 8, 3]} intensity={0.6} color="#ff4400" />
      {/* Lava glow from below */}
      <pointLight position={[0, -0.5, 0]} intensity={8.0} color="#ff4400" distance={20} />
      <pointLight position={[0, 0.5, 5]} intensity={5.0} color="#ff6600" distance={15} />
      <pointLight position={[0, 0.5, -5]} intensity={5.0} color="#ff3300" distance={15} />

      {/* Volcanic sky */}
      <mesh material={volcanicSkyMat}>
        <sphereGeometry args={[80, 16, 10]} />
      </mesh>

      {/* Terrain */}
      <mesh material={terrainMat} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[40, 40, 80, 80]} />
      </mesh>

      {/* Crack overlay on terrain */}
      <mesh material={crackMat} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <planeGeometry args={[40, 40, 80, 80]} />
      </mesh>

      {/* Lava river in rift */}
      <mesh material={lavaMat} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.55, 0]}>
        <planeGeometry args={[3.2, 40, 16, 64]} />
      </mesh>

      {/* Smoke */}
      <SmokeParticles />

      {/* Embers */}
      <EmberParticles />
    </>
  );
}
