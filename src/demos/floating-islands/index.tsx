/* eslint-disable react-hooks/purity */
import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
  color,
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
  vec3,
} from 'three/tsl';

/**
 * Floating Islands — Sky islands with waterfalls, vegetation, cloud wisps, and atmospheric depth
 *
 * Techniques:
 * 1. 5 sky islands at different heights: displaced icosahedron (subdivision 4), flat-bottomed via Y-clamp
 * 2. Green-top / brown-underside biome split from positionWorld.y
 * 3. Waterfall: instanced spheres streaming downward with animated Y offset
 * 4. Vegetation: instanced cone trees on island tops
 * 5. Cloud wisps: BackSide translucent shells with hash opacity variation
 * 6. BackSide sphere sky dome with screenUV-style gradient
 */

const TREE_COUNT = 150;
const WATERFALL_COUNT = 200;
const CLOUD_SHELL_COUNT = 8;

const ISLAND_CONFIGS = [
  { pos: new THREE.Vector3(0, 0, 0),      radius: 2.0, phase: 0.0 },
  { pos: new THREE.Vector3(5, 2, -3),     radius: 1.4, phase: 1.2 },
  { pos: new THREE.Vector3(-5, 1, 2),     radius: 1.2, phase: 2.5 },
  { pos: new THREE.Vector3(3, -2, 4),     radius: 1.0, phase: 3.8 },
  { pos: new THREE.Vector3(-3, 3, -4),    radius: 0.8, phase: 5.0 },
];

function makeIslandMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();

  const dispFn = Fn(() => {
    const p = positionLocal;
    const n1 = hash(p.mul(float(2.3)));
    const n2 = hash(p.mul(float(5.7)).add(vec3(float(11.3), float(7.1), float(3.9))));
    const n3 = hash(p.mul(float(12.0)).add(vec3(float(5.0), float(13.0), float(8.0))));
    const noise = n1.mul(float(0.5)).add(n2.mul(float(0.3))).add(n3.mul(float(0.2)));

    // Flat bottom via clamping downward displacement
    const py = positionLocal.y;
    const flattenFactor = smoothstep(float(-0.8), float(-0.2), py);
    const disp = noise.mul(float(0.45)).sub(float(0.1));
    // Only allow positive displacement on bottom (flattens underside)
    const clampedDisp = mix(disp.max(float(-0.05)), disp, flattenFactor);
    return positionLocal.add(normalLocal.mul(clampedDisp));
  });

  mat.positionNode = dispFn();

  const colorFn = Fn(() => {
    const py = positionWorld.y;
    const n = hash(positionWorld.mul(float(4.5)));

    // Green top, brown sides, dark rock underside
    const grass = color(0x3d7a2a);
    const dirt  = color(0x6a4a28);
    const rock  = color(0x4a3d32);
    const moss  = color(0x2d5e1e);

    const heightNorm = py.mul(float(0.7)).add(float(0.5)).saturate();
    const c1 = mix(rock, dirt, smoothstep(float(0.0), float(0.35), heightNorm));
    const c2 = mix(c1, grass, smoothstep(float(0.45), float(0.7), heightNorm));
    const c3 = mix(c2, moss, smoothstep(float(0.7), float(0.85), heightNorm));

    return c3.add(vec3(n.mul(float(0.07)).sub(float(0.035))));
  });

  mat.colorNode = colorFn();
  mat.roughness = 0.87;
  mat.metalness = 0.04;
  return mat;
}

function makeTreeMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();
  const treeFn = Fn(() => {
    const n = hash(positionWorld.mul(float(9.0)));
    const darkGreen = color(0x1a4a0d);
    const brightGreen = color(0x3a8a1e);
    return mix(darkGreen, brightGreen, n);
  });
  mat.colorNode = treeFn();
  mat.roughness = 0.9;
  mat.metalness = 0.0;
  return mat;
}

function makeWaterfallMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;
  const wFn = Fn(() => {
    const depth = smoothstep(float(0.0), float(0.8), positionWorld.y.abs());
    const whiteWater = vec3(float(0.85), float(0.92), float(1.0));
    const deepBlue = vec3(float(0.2), float(0.5), float(0.9));
    return mix(whiteWater, deepBlue, depth);
  });
  mat.colorNode = wFn();
  mat.emissiveNode = color(0x88bbff).mul(float(0.5));
  mat.opacityNode = float(0.7);
  mat.roughness = 0.1;
  mat.metalness = 0.2;
  return mat;
}

function makeCloudMaterial(layer: number) {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;
  mat.side = THREE.BackSide;
  mat.depthWrite = false;
  mat.blending = THREE.AdditiveBlending;

  const layerF = float(layer);
  const fadeFactor = float(1.0).sub(layerF.div(float(CLOUD_SHELL_COUNT)));

  const fresnel = Fn(() => {
    const viewDir = cameraPosition.sub(positionWorld).normalize();
    const nDotV = normalWorld.dot(viewDir).saturate();
    return float(1.0).sub(nDotV).pow(float(2.0).add(layerF.mul(float(0.3))));
  });

  const fresnelVal = fresnel();
  const noise = hash(positionWorld.mul(float(3.0)));

  mat.opacityNode = fresnelVal.mul(fadeFactor).mul(float(0.03)).mul(noise.mul(float(0.5)).add(float(0.5)));
  mat.colorNode = color(0xffffff);
  mat.emissiveNode = vec3(float(0.9), float(0.95), float(1.0)).mul(float(0.5));
  mat.roughness = 0.0;
  mat.metalness = 0.0;
  return mat;
}

function makeSkyMaterial() {
  const mat = new THREE.MeshBasicNodeMaterial();
  mat.side = THREE.BackSide;
  const skyFn = Fn(() => {
    const py = normalWorld.y.mul(float(0.5)).add(float(0.5));
    const skyBlue = color(0x6aa8e8);
    const horizonMist = color(0xc8dff5);
    return mix(horizonMist, skyBlue, smoothstep(float(0.0), float(0.7), py));
  });
  mat.colorNode = skyFn();
  return mat;
}

interface IslandProps {
  config: typeof ISLAND_CONFIGS[0];
  islandMat: THREE.MeshStandardNodeMaterial;
}

function Island({ config, islandMat }: IslandProps) {
  const ref = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (ref.current) {
      // Gentle bob
      ref.current.position.y = config.pos.y + Math.sin(clock.getElapsedTime() * 0.4 + config.phase) * 0.15;
    }
  });

  return (
    <mesh ref={ref} position={config.pos} material={islandMat}>
      <icosahedronGeometry args={[config.radius, 4]} />
    </mesh>
  );
}

function Trees({ islandConfigs }: { islandConfigs: typeof ISLAND_CONFIGS }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const treeMat = useMemo(() => makeTreeMaterial(), []);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    let idx = 0;
    for (const cfg of islandConfigs) {
      const count = Math.floor((TREE_COUNT * cfg.radius) / 7.4);
      for (let i = 0; i < count && idx < TREE_COUNT; i++, idx++) {
        const theta = Math.random() * Math.PI * 2;
        const r = Math.random() * cfg.radius * 0.7;
        const x = cfg.pos.x + r * Math.cos(theta);
        const z = cfg.pos.z + r * Math.sin(theta);
        const y = cfg.pos.y + cfg.radius * 0.55 + Math.random() * 0.1;
        dummy.position.set(x, y, z);
        dummy.rotation.set(0, Math.random() * Math.PI * 2, 0);
        const sc = 0.08 + Math.random() * 0.18;
        dummy.scale.set(sc, sc * 1.8, sc);
        dummy.updateMatrix();
        mesh.setMatrixAt(idx, dummy.matrix);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [islandConfigs]);

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, TREE_COUNT]} material={treeMat} frustumCulled={false}>
      <coneGeometry args={[1, 2, 6]} />
    </instancedMesh>
  );
}

function Waterfall() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const waterfallMat = useMemo(() => makeWaterfallMaterial(), []);
  const waterData = useMemo(() => {
    return Array.from({ length: WATERFALL_COUNT }, (_) => ({
      xOff: (Math.random() - 0.5) * 0.25,
      zOff: (Math.random() - 0.5) * 0.25,
      speed: 1.5 + Math.random() * 2.0,
      phase: Math.random() * 5.0,
      size: 0.03 + Math.random() * 0.05,
    }));
  }, []);

  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const t = clock.getElapsedTime();
    for (let i = 0; i < WATERFALL_COUNT; i++) {
      const d = waterData[i];
      const y = 1.8 - ((t * d.speed + d.phase) % 4.5);
      dummy.position.set(2.2 + d.xOff, y, d.zOff);
      dummy.scale.setScalar(d.size);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, WATERFALL_COUNT]} material={waterfallMat} frustumCulled={false}>
      <sphereGeometry args={[1, 5, 5]} />
    </instancedMesh>
  );
}

function CloudWisps() {
  const cloudMats = useMemo(
    () => Array.from({ length: CLOUD_SHELL_COUNT }, (_, i) => makeCloudMaterial(i)),
    [],
  );

  return (
    <>
      {cloudMats.map((mat, i) => (
        <mesh key={i} material={mat} position={[-4, 2.5, -5]}>
          <icosahedronGeometry args={[1.2 + i * 0.15, 2]} />
        </mesh>
      ))}
    </>
  );
}

export default function FloatingIslands() {
  const islandMat = useMemo(() => makeIslandMaterial(), []);
  const skyMat = useMemo(() => makeSkyMaterial(), []);

  return (
    <>
      <ambientLight intensity={0.5} color="#c8dff5" />
      <directionalLight position={[8, 14, 5]} intensity={1.6} color="#fff5d8" />
      <directionalLight position={[-6, 4, -8]} intensity={0.4} color="#8bbfee" />

      {/* Sky dome */}
      <mesh material={skyMat}>
        <sphereGeometry args={[80, 16, 10]} />
      </mesh>

      {/* Islands */}
      {ISLAND_CONFIGS.map((cfg, i) => (
        <Island key={i} config={cfg} islandMat={islandMat} />
      ))}

      {/* Trees on islands */}
      <Trees islandConfigs={ISLAND_CONFIGS} />

      {/* Waterfall from main island */}
      <Waterfall />

      {/* Cloud wisps */}
      <CloudWisps />
    </>
  );
}
