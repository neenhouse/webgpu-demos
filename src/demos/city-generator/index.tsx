/* eslint-disable react-hooks/purity */
import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
  color,
  positionWorld,
  Fn,
  float,
  mix,
  smoothstep,
  hash,
  vec3,
} from 'three/tsl';

/**
 * City Generator — Procedural city blocks with roads, buildings, neon windows, and traffic lights
 *
 * Techniques:
 * 1. Instanced mesh for 300 buildings with center-distance-weighted heights
 * 2. Y-flip instanced reflection on ground plane
 * 3. hash().floor() for window grid pattern on building facades
 * 4. 4 distinct color zones via distance-from-center hash bucketing
 * 5. Road network planes between building blocks with lane markings
 */

const BUILDING_COUNT = 300;
const CITY_SPREAD = 16;
const TRAFFIC_COUNT = 40;

function seededRnd(s: number) {
  const x = Math.sin(s * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function makeBuildingMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();

  // 4 color zone palette selected by distance + hash
  const zoneFn = Fn(() => {
    const px = positionWorld.x;
    const pz = positionWorld.z;
    const dist = px.mul(px).add(pz.mul(pz)).sqrt().div(CITY_SPREAD);
    const seed = hash(vec3(px.floor(), float(0.0), pz.floor()));

    // Zone colors: central glass towers, mid-city brick, suburbs beige, outer industrial
    // Use darker values so windows stand out without blowing out
    const glass    = vec3(0.12, 0.16, 0.22);
    const brick    = vec3(0.18, 0.13, 0.10);
    const beige    = vec3(0.22, 0.20, 0.16);
    const concrete = vec3(0.14, 0.14, 0.14);

    const z1 = mix(glass,   brick,    smoothstep(float(0.0), float(0.3), dist));
    const z2 = mix(z1,      beige,    smoothstep(float(0.3), float(0.6), dist));
    const zFinal = mix(z2,  concrete, smoothstep(float(0.6), float(1.0), dist));

    // Per-building variation
    const variation = seed.mul(0.1).sub(0.05);
    return zFinal.add(vec3(variation, variation, variation));
  });

  mat.colorNode = zoneFn();

  // Window grid: hash on quantized Y creates window pattern
  // Only lit windows contribute emissive — dark windows and building body get zero.
  const windowFn = Fn(() => {
    const py = positionWorld.y;
    const px = positionWorld.x;
    const pz = positionWorld.z;
    // Quantize Y into floor bands (every 0.12 units)
    const floor = py.div(0.12).floor();
    // Quantize X or Z for window columns
    const col = px.add(pz).div(0.06).floor();
    const windowSeed = hash(vec3(floor, col, float(0.5)));
    // Per-window brightness variation: some off, some dim, some bright
    const windowBrightnessSeed = hash(vec3(floor, col, float(1.3)));
    // Building accent color for windows (warm amber tint)
    const windowSeed2 = hash(vec3(px.floor(), float(1.7), pz.floor()));
    const warmYellow = vec3(float(0.9), float(0.7), float(0.3));
    const warmOrange = vec3(float(0.85), float(0.45), float(0.15));
    const warmWhite  = vec3(float(0.8), float(0.75), float(0.55));
    const winColor = mix(mix(warmYellow, warmOrange, smoothstep(float(0.3), float(0.6), windowSeed2)), warmWhite, smoothstep(float(0.7), float(0.9), windowSeed2));
    // Sharp window threshold: only ~20% of cells are lit windows
    const isWindow = smoothstep(float(0.78), float(0.82), windowSeed);
    // Per-window brightness: some dim (0.2), most medium (0.5), some bright (0.8)
    const brightness = smoothstep(float(0.0), float(1.0), windowBrightnessSeed).mul(0.6).add(0.2);
    // Emissive is ONLY where isWindow > 0 — non-window areas get exactly zero
    return winColor.mul(isWindow.mul(brightness).mul(0.8));
  });

  mat.emissiveNode = windowFn();
  mat.roughness = 0.75;
  mat.metalness = 0.15;

  return mat;
}

function makeReflectionMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;

  const c = Fn(() => {
    const px = positionWorld.x;
    const pz = positionWorld.z;
    const seed = hash(vec3(px.mul(0.3).floor(), float(0.0), pz.mul(0.3).floor()));
    const dist = px.mul(px).add(pz.mul(pz)).sqrt().div(CITY_SPREAD);
    const glass    = vec3(0.35, 0.48, 0.58);
    const brick    = vec3(0.52, 0.38, 0.28);
    return mix(glass, brick, smoothstep(float(0.0), float(0.5), dist)).mul(seed.mul(0.3).add(0.1));
  });
  mat.colorNode = c();

  const winRefl = Fn(() => {
    const py = positionWorld.y.abs();
    const px = positionWorld.x;
    const pz = positionWorld.z;
    const floor = py.div(0.12).floor();
    const col = px.add(pz).div(0.06).floor();
    const ws = hash(vec3(floor, col, float(0.5)));
    const isWin = smoothstep(float(0.70), float(0.75), ws);
    return vec3(float(1.0), float(0.8), float(0.35)).mul(isWin.mul(0.5));
  });
  mat.emissiveNode = winRefl();
  mat.opacityNode = float(0.45);
  mat.roughness = 0.1;
  mat.metalness = 0.8;

  return mat;
}

function makeRoadMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();
  const roadFn = Fn(() => {
    const px = positionWorld.x;
    const pz = positionWorld.z;
    // Lane markings: thin white dashes along x and z axes
    const dashX = pz.div(0.8).floor().mul(float(0.8)).add(float(0.4)).sub(pz).abs();
    const dashZ = px.div(0.8).floor().mul(float(0.8)).add(float(0.4)).sub(px).abs();
    const onLane = smoothstep(float(0.04), float(0.02), dashX).add(
      smoothstep(float(0.04), float(0.02), dashZ)
    );
    const base = vec3(0.12, 0.12, 0.12);
    const lane = vec3(0.8, 0.8, 0.3);
    return mix(base, lane, onLane.mul(0.6));
  });
  mat.colorNode = roadFn();
  mat.roughness = 0.95;
  mat.metalness = 0.0;
  return mat;
}

function makeGroundMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.colorNode = color(0x1a1a1a);
  mat.roughness = 0.1;
  mat.metalness = 0.7;
  return mat;
}

function makeTrafficLightMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();
  const tFn = Fn(() => {
    const s = hash(positionWorld.mul(17.3));
    const red    = vec3(float(1.0), float(0.1), float(0.1));
    const green  = vec3(float(0.1), float(1.0), float(0.2));
    const yellow = vec3(float(1.0), float(0.85), float(0.0));
    const c1 = mix(red, green, smoothstep(float(0.3), float(0.4), s));
    return mix(c1, yellow, smoothstep(float(0.6), float(0.7), s));
  });
  mat.colorNode = tFn();
  mat.emissiveNode = tFn().mul(float(3.0));
  mat.roughness = 0.2;
  mat.metalness = 0.0;
  return mat;
}

export default function CityGenerator() {
  const buildingRef = useRef<THREE.InstancedMesh>(null);
  const reflectionRef = useRef<THREE.InstancedMesh>(null);
  const trafficRef = useRef<THREE.InstancedMesh>(null);
  const groupRef = useRef<THREE.Group>(null);

  const buildingMaterial = useMemo(() => makeBuildingMaterial(), []);
  const reflectionMaterial = useMemo(() => makeReflectionMaterial(), []);
  const roadMaterial = useMemo(() => makeRoadMaterial(), []);
  const groundMaterial = useMemo(() => makeGroundMaterial(), []);
  const trafficMaterial = useMemo(() => makeTrafficLightMaterial(), []);

  const buildingData = useMemo(() => {
    const data: { x: number; z: number; w: number; d: number; h: number }[] = [];
    const GRID = 10;
    const BLOCK = (CITY_SPREAD * 2) / GRID;
    for (let i = 0; i < BUILDING_COUNT; i++) {
      const seed = i * 5.3 + 1.7;
      const gx = Math.floor(seededRnd(seed) * GRID) - GRID / 2;
      const gz = Math.floor(seededRnd(seed + 1) * GRID) - GRID / 2;
      // Offset within block, leaving road gap at block edges
      const ox = (seededRnd(seed + 2) - 0.5) * (BLOCK * 0.65);
      const oz = (seededRnd(seed + 3) - 0.5) * (BLOCK * 0.65);
      const x = gx * BLOCK + ox;
      const z = gz * BLOCK + oz;
      const dist = Math.sqrt(x * x + z * z) / CITY_SPREAD;
      const centerBoost = Math.max(0, 1 - dist) * 3.5;
      const h = 0.4 + seededRnd(seed + 4) * 2.5 + centerBoost;
      const w = 0.18 + seededRnd(seed + 5) * 0.4;
      const d = 0.18 + seededRnd(seed + 6) * 0.4;
      data.push({ x, z, w, d, h });
    }
    return data;
  }, []);

  useEffect(() => {
    const mesh = buildingRef.current;
    const reflMesh = reflectionRef.current;
    if (!mesh || !reflMesh) return;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < buildingData.length; i++) {
      const { x, z, w, d, h } = buildingData[i];
      dummy.position.set(x, h / 2, z);
      dummy.scale.set(w, h, d);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      // Reflection: Y-flip
      dummy.position.set(x, -h / 2, z);
      dummy.scale.set(w, h, d);
      dummy.updateMatrix();
      reflMesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    reflMesh.instanceMatrix.needsUpdate = true;
  }, [buildingData]);

  // Traffic lights at intersections
  const trafficData = useMemo(() => {
    const data: { x: number; z: number }[] = [];
    const GRID = 10;
    const BLOCK = (CITY_SPREAD * 2) / GRID;
    for (let gx = -GRID / 2; gx < GRID / 2; gx++) {
      for (let gz = -GRID / 2; gz < GRID / 2; gz++) {
        if (data.length >= TRAFFIC_COUNT) break;
        data.push({ x: gx * BLOCK + BLOCK / 2, z: gz * BLOCK + BLOCK / 2 });
      }
    }
    return data;
  }, []);

  useEffect(() => {
    const mesh = trafficRef.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < trafficData.length; i++) {
      const { x, z } = trafficData[i];
      dummy.position.set(x, 0.3, z);
      dummy.scale.setScalar(0.06);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [trafficData]);

  useFrame((_, delta) => {
    if (groupRef.current) groupRef.current.rotation.y += delta * 0.03;
  });

  return (
    <>
      {/* Background atmosphere */}
      <mesh>
        <sphereGeometry args={[30, 16, 16]} />
        <meshBasicMaterial side={THREE.BackSide} color="#020408" />
      </mesh>
      <ambientLight intensity={0.4} color="#334466" />
      <hemisphereLight args={['#446688', '#111122', 0.5]} />
      <directionalLight position={[8, 14, 6]} intensity={0.8} color="#aabbdd" />
      <pointLight position={[0, 8, 0]} intensity={5.0} color="#ffcc88" distance={60} />
      <pointLight position={[-8, 2, 0]} intensity={3.0} color="#ff4488" distance={30} />
      <pointLight position={[8, 2, 0]} intensity={3.0} color="#44aaff" distance={30} />
      <pointLight position={[0, 2, 8]} intensity={2.0} color="#ff8833" distance={25} />
      {/* City fog */}
      <fog attach="fog" args={['#050a14', 20, 50]} />

      <group ref={groupRef}>
        {/* Road network */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} material={roadMaterial}>
          <planeGeometry args={[CITY_SPREAD * 2, CITY_SPREAD * 2, 20, 20]} />
        </mesh>

        {/* Reflective ground */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} material={groundMaterial}>
          <planeGeometry args={[CITY_SPREAD * 2 + 4, CITY_SPREAD * 2 + 4]} />
        </mesh>

        {/* Buildings */}
        <instancedMesh
          ref={buildingRef}
          args={[undefined, undefined, BUILDING_COUNT]}
          material={buildingMaterial}
          frustumCulled={false}
        >
          <boxGeometry args={[1, 1, 1]} />
        </instancedMesh>

        {/* Reflections below ground */}
        <instancedMesh
          ref={reflectionRef}
          args={[undefined, undefined, BUILDING_COUNT]}
          material={reflectionMaterial}
          frustumCulled={false}
        >
          <boxGeometry args={[1, 1, 1]} />
        </instancedMesh>

        {/* Traffic lights */}
        <instancedMesh
          ref={trafficRef}
          args={[undefined, undefined, TRAFFIC_COUNT]}
          material={trafficMaterial}
          frustumCulled={false}
        >
          <sphereGeometry args={[1, 6, 6]} />
        </instancedMesh>
      </group>
    </>
  );
}
