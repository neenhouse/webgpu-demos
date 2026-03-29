/* eslint-disable react-hooks/purity */
import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
  color,
  time,
  positionLocal,
  normalLocal,
  positionWorld,
  Fn,
  float,
  mix,
  smoothstep,
  hash,
  vec3,
} from 'three/tsl';

/**
 * Desert Dunes — Wind-sculpted sand dunes with ripples, heat haze, and drifting sand particles
 *
 * Techniques:
 * 1. Large displaced plane: height = layered sine waves with hash perturbation
 * 2. 3-stop sand color (dark shadow, golden mid, bright white-gold crests)
 * 3. High-frequency sin pattern overlay for wind ripple texture on faces
 * 4. 200 instanced sand particles drifting with wind in useFrame
 * 5. Warm directional lighting from sun angle
 * 6. Heat haze: screen-based UV warp on overlay plane
 */

const SAND_PARTICLE_COUNT = 200;

function makeDuneMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.side = THREE.DoubleSide;

  // Dune height displacement: layered sine + hash
  const duneFn = Fn(() => {
    const x = positionLocal.x;
    const z = positionLocal.z;
    const t = time.mul(float(0.08)); // very slow drift

    // Primary dune: large sine waves with wind direction bias
    const d1 = x.mul(float(0.18)).add(z.mul(float(0.28))).add(t).sin().mul(float(1.8));
    const d2 = x.mul(float(0.35)).sub(z.mul(float(0.12))).add(t.mul(float(1.4))).sin().mul(float(0.9));
    // Secondary ridges
    const d3 = x.mul(float(0.55)).add(z.mul(float(0.45))).add(t.mul(float(0.7))).sin().mul(float(0.45));
    // Hash perturbation for natural randomness
    const h = hash(vec3(x.mul(float(0.8)), float(0.0), z.mul(float(0.8))));
    const perturb = h.mul(float(0.5)).sub(float(0.25));

    const height = d1.add(d2).add(d3).add(perturb);
    return positionLocal.add(normalLocal.mul(height));
  });

  mat.positionNode = duneFn();

  // 3-stop sand color: dark shadow → golden → bright crest
  const colorFn = Fn(() => {
    const x = positionLocal.x;
    const z = positionLocal.z;
    const t = time.mul(float(0.08));

    const d1 = x.mul(float(0.18)).add(z.mul(float(0.28))).add(t).sin().mul(float(1.8));
    const d2 = x.mul(float(0.35)).sub(z.mul(float(0.12))).add(t.mul(float(1.4))).sin().mul(float(0.9));
    const d3 = x.mul(float(0.55)).add(z.mul(float(0.45))).add(t.mul(float(0.7))).sin().mul(float(0.45));
    const h = hash(vec3(x.mul(float(0.8)), float(0.0), z.mul(float(0.8))));
    const height = d1.add(d2).add(d3).add(h.mul(float(0.5)).sub(float(0.25)));

    const norm = height.add(float(3.5)).div(float(6.5)).saturate();

    // Wind ripple micropattern: high-frequency sine over position
    const ripple = x.mul(float(12.0)).add(z.mul(float(8.0))).add(t.mul(float(5.0))).sin()
      .mul(float(0.5)).add(float(0.5));
    const rippleStrength = smoothstep(float(0.3), float(0.65), norm).mul(float(0.06));

    const shadow    = color(0x8c6a30);
    const golden    = color(0xd4a040);
    const brightGold = color(0xf5d88a);
    const crestWhite = color(0xfaecd4);

    const c1 = mix(shadow, golden, smoothstep(float(0.0), float(0.5), norm));
    const c2 = mix(c1, brightGold, smoothstep(float(0.5), float(0.78), norm));
    const c3 = mix(c2, crestWhite, smoothstep(float(0.82), float(0.95), norm));

    // Add ripple texture
    return c3.add(vec3(rippleStrength.mul(ripple)));
  });

  mat.colorNode = colorFn();
  mat.roughness = 0.88;
  mat.metalness = 0.02;

  return mat;
}

function makeSandParticleMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();
  const pFn = Fn(() => {
    const n = hash(positionWorld.mul(float(30.0)));
    const sandy = color(0xd4a040);
    const pale  = color(0xf5d88a);
    return mix(sandy, pale, n);
  });
  mat.colorNode = pFn();
  mat.emissiveNode = color(0xc8902a).mul(float(0.4));
  mat.roughness = 0.9;
  mat.metalness = 0.0;
  return mat;
}

function makeHeatHazeMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;
  mat.depthWrite = false;

  // Wavy distortion pattern simulating heat shimmer
  const hazeFn = Fn(() => {
    const px = positionWorld.x;
    const pz = positionWorld.z;
    const t = time;
    // Shimmer bands
    const wave = px.mul(float(4.0)).add(t.mul(float(2.5))).sin()
      .mul(pz.mul(float(3.5)).add(t.mul(float(1.8))).cos())
      .mul(float(0.5)).add(float(0.5));
    return smoothstep(float(0.55), float(0.75), wave);
  });

  mat.opacityNode = hazeFn().mul(float(0.06));
  mat.colorNode = color(0xfff0cc);
  mat.emissiveNode = color(0xffe088).mul(float(0.8));
  mat.roughness = 1.0;
  mat.metalness = 0.0;
  return mat;
}

function SandParticles() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const sandMat = useMemo(() => makeSandParticleMaterial(), []);

  const particleData = useMemo(() =>
    Array.from({ length: SAND_PARTICLE_COUNT }, (_, i) => ({
      x: (Math.random() - 0.5) * 50,
      y: Math.random() * 3.0,
      z: (Math.random() - 0.5) * 50,
      speed: 2.0 + Math.random() * 4.0,
      phase: Math.random() * 50,
      driftY: (Math.random() - 0.5) * 0.5,
      size: 0.03 + Math.random() * 0.06,
    })),
  []);

  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const t = clock.getElapsedTime();
    const dummy = new THREE.Object3D();
    for (let i = 0; i < SAND_PARTICLE_COUNT; i++) {
      const d = particleData[i];
      // Drift in wind direction (positive X)
      const wx = ((d.x + d.phase + t * d.speed) % 50) - 25;
      const wy = d.y + Math.sin(t * 0.8 + d.phase) * 0.3;
      const wz = d.z + Math.cos(t * 0.6 + d.phase) * d.driftY;
      dummy.position.set(wx, wy, wz);
      dummy.scale.setScalar(d.size);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, SAND_PARTICLE_COUNT]} material={sandMat} frustumCulled={false}>
      <sphereGeometry args={[1, 4, 4]} />
    </instancedMesh>
  );
}

export default function DesertDunes() {
  const duneRef = useRef<THREE.Mesh>(null);
  const duneMat = useMemo(() => makeDuneMaterial(), []);
  const hazeMat = useMemo(() => makeHeatHazeMaterial(), []);

  useFrame((_, delta) => {
    // Slight tilt for dramatic sun angle
    if (duneRef.current) {
      duneRef.current.rotation.x = -Math.PI / 2;
    }
  });

  return (
    <>
      {/* Warm desert sun */}
      <ambientLight intensity={0.45} color="#e8c880" />
      <directionalLight position={[15, 20, -8]} intensity={2.2} color="#ffe8a0" castShadow />
      <directionalLight position={[-10, 5, 12]} intensity={0.3} color="#ff8840" />
      {/* Horizon warm glow */}
      <pointLight position={[0, -1, 20]} intensity={3.0} color="#ff6622" distance={50} />

      {/* Sky — warm desert sky */}
      <mesh>
        <sphereGeometry args={[90, 16, 10]} />
        <meshBasicNodeMaterial side={THREE.BackSide} colorNode={color(0xe8c060)} />
      </mesh>

      {/* Dune terrain */}
      <mesh
        ref={duneRef}
        material={duneMat}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -1.5, 0]}
      >
        <planeGeometry args={[80, 80, 128, 128]} />
      </mesh>

      {/* Heat haze overlay */}
      <mesh material={hazeMat} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.5, 0]}>
        <planeGeometry args={[80, 80, 16, 16]} />
      </mesh>

      {/* Drifting sand particles */}
      <SandParticles />
    </>
  );
}
