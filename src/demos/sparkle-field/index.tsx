import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Sparkles, Stars } from '@react-three/drei';
import * as THREE from 'three/webgpu';
import {
  color,
  normalWorld,
  cameraPosition,
  positionWorld,
  Fn,
  float,
  time,
  oscSine,
  mix,
  vec3,
} from 'three/tsl';

/**
 * Sparkle Field — Pure atmospheric scene with drei Sparkles and Stars
 *
 * Layers:
 * 1. <Stars> — dense starfield 6,000 stars in the deep background
 * 2. <Sparkles> — 500 gold/amber sparkle particles floating in midground
 * 3. Manual volumetric cloud spheres (seit drei Cloud may fail with WebGPU)
 * 4. Orbiting mote ring — close foreground glow motes
 * 5. Pulsing central light source — warm golden atmospheric glow sphere
 *
 * Palette: warm golds, ambers, roses — sunset/golden hour meditation
 * Camera: gentle orbit via useFrame for a dreamy, breathing quality
 */

function makeAtmosphereMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.side = THREE.BackSide;

  // Deep golden-hour sky: horizon orange, zenith deep purple
  const gradient = Fn(() => {
    const up = normalWorld.y.mul(0.5).add(0.5);
    const horizon = vec3(0.8, 0.4, 0.15);
    const zenith = vec3(0.12, 0.06, 0.22);
    const mid = vec3(0.5, 0.2, 0.35);
    return mix(mix(horizon, mid, up), zenith, up.mul(up));
  });

  mat.colorNode = gradient();
  mat.emissiveNode = gradient().mul(0.5);
  mat.roughness = 1.0;
  return mat;
}

function makeGlowCoreMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();

  const pulse = oscSine(time.mul(0.4)).mul(0.3).add(0.7);
  mat.colorNode = vec3(1.0, 0.75, 0.2);

  const fresnel = Fn(() => {
    const viewDir = cameraPosition.sub(positionWorld).normalize();
    const nDotV = normalWorld.dot(viewDir).saturate();
    return float(1.0).sub(nDotV).pow(2.5);
  });

  mat.emissiveNode = vec3(1.0, 0.6, 0.1).mul(pulse.mul(3.0)).add(
    vec3(1.0, 0.9, 0.5).mul(fresnel().mul(pulse.mul(2.0)))
  );
  mat.roughness = 0.05;
  mat.metalness = 0.3;
  return mat;
}

function makeGlowHaloMaterial(phase: number) {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;
  mat.side = THREE.BackSide;
  mat.depthWrite = false;
  mat.blending = THREE.AdditiveBlending;

  const pulse = oscSine(time.mul(0.4).add(phase)).mul(0.25).add(0.75);
  const fresnel = Fn(() => {
    const viewDir = cameraPosition.sub(positionWorld).normalize();
    const nDotV = normalWorld.dot(viewDir).saturate();
    return float(1.0).sub(nDotV).pow(1.8);
  });

  mat.colorNode = vec3(1.0, 0.65, 0.1);
  mat.emissiveNode = vec3(1.0, 0.55, 0.05).mul(fresnel().mul(pulse).mul(3.0));
  mat.opacityNode = fresnel().mul(pulse).mul(0.5);
  mat.roughness = 0.0;
  return mat;
}

function makeCloudMaterial(opacity: number) {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;
  mat.depthWrite = false;

  const fresnel = Fn(() => {
    const viewDir = cameraPosition.sub(positionWorld).normalize();
    const nDotV = normalWorld.dot(viewDir).saturate();
    return float(1.0).sub(nDotV).pow(1.2);
  });

  const warmWhite = vec3(1.0, 0.92, 0.8);
  mat.colorNode = warmWhite;
  mat.emissiveNode = warmWhite.mul(fresnel().mul(0.4));
  mat.opacityNode = fresnel().mul(float(opacity));
  mat.roughness = 1.0;
  return mat;
}

function makeMotesMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;
  mat.depthWrite = false;
  mat.blending = THREE.AdditiveBlending;

  const fresnel = Fn(() => {
    const viewDir = cameraPosition.sub(positionWorld).normalize();
    const nDotV = normalWorld.dot(viewDir).saturate();
    return float(1.0).sub(nDotV).pow(2.0);
  });

  const pulse = oscSine(time.mul(1.5)).mul(0.3).add(0.7);
  mat.colorNode = vec3(1.0, 0.8, 0.3);
  mat.emissiveNode = vec3(1.0, 0.7, 0.2).mul(fresnel().mul(pulse).mul(3.0));
  mat.opacityNode = fresnel().mul(pulse).mul(0.7);
  mat.roughness = 0.0;
  return mat;
}

/** Manual volumetric clouds using stacked transparent spheres */
function VolumeClouds() {
  const cloudGroups = useMemo(() => [
    { pos: [3, 0.5, -2] as [number, number, number], scale: 1.2, opacity: 0.25 },
    { pos: [-2.5, 0.8, -1.5] as [number, number, number], scale: 0.9, opacity: 0.2 },
    { pos: [1, -0.8, 2] as [number, number, number], scale: 1.4, opacity: 0.22 },
    { pos: [-3.5, -0.5, 0.5] as [number, number, number], scale: 1.1, opacity: 0.18 },
    { pos: [0.5, 1.2, -3.5] as [number, number, number], scale: 1.0, opacity: 0.23 },
  ], []);

  const materials = useMemo(() =>
    cloudGroups.map(c => makeCloudMaterial(c.opacity)),
    [cloudGroups]
  );

  const groupRef = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.03;
    }
  });

  return (
    <group ref={groupRef}>
      {cloudGroups.map((c, i) => (
        <group key={i} position={c.pos}>
          {/* Main cloud puff */}
          <mesh material={materials[i]} scale={c.scale}>
            <sphereGeometry args={[1, 12, 12]} />
          </mesh>
          {/* Elongated wisps */}
          <mesh material={materials[i]} position={[0.6 * c.scale, -0.1, 0]} scale={[c.scale * 0.7, c.scale * 0.5, c.scale * 0.6]}>
            <sphereGeometry args={[1, 8, 8]} />
          </mesh>
          <mesh material={materials[i]} position={[-0.5 * c.scale, 0.1, 0.2]} scale={[c.scale * 0.6, c.scale * 0.45, c.scale * 0.55]}>
            <sphereGeometry args={[1, 8, 8]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Orbiting glow motes */
function OrbitMotes() {
  const count = 24;
  const ref = useRef<THREE.InstancedMesh>(null);
  const mat = useMemo(() => makeMotesMaterial(), []);

  useFrame(() => {
    if (!ref.current) return;
    const t = Date.now() * 0.001;
    const dummy = new THREE.Object3D();

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + t * (0.15 + i * 0.003);
      const layer = Math.floor(i / 8);
      const r = 2.5 + layer * 0.4;
      const y = Math.sin(t * 0.3 + i * 0.8) * 0.4;
      dummy.position.set(Math.cos(angle) * r, y, Math.sin(angle) * r);
      const s = 0.04 + Math.sin(t * 2 + i) * 0.015;
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      ref.current.setMatrixAt(i, dummy.matrix);
    }
    ref.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={ref} args={[undefined, mat, count]} frustumCulled={false}>
      <sphereGeometry args={[1, 8, 8]} />
    </instancedMesh>
  );
}

export default function SparkleField() {
  const atmMat = useMemo(() => makeAtmosphereMaterial(), []);
  const coreMat = useMemo(() => makeGlowCoreMaterial(), []);
  const halo1 = useMemo(() => makeGlowHaloMaterial(0), []);
  const halo2 = useMemo(() => makeGlowHaloMaterial(1.5), []);
  const halo3 = useMemo(() => makeGlowHaloMaterial(3.0), []);
  const cameraRef = useRef({ angle: 0 });

  useFrame(({ camera }, delta) => {
    cameraRef.current.angle += delta * 0.12;
    const r = 6.5;
    const angle = cameraRef.current.angle;
    camera.position.set(
      Math.cos(angle) * r,
      Math.sin(angle * 0.4) * 1.2 + 0.5,
      Math.sin(angle) * r
    );
    camera.lookAt(0, 0.3, 0);
  });

  return (
    <>
      <ambientLight intensity={0.1} />
      <hemisphereLight args={['#334466', '#111122', 0.3]} />
      <pointLight position={[0, 0.5, 0]} intensity={2.0} color={0xffcc44} distance={10} />

      {/* Golden-hour atmosphere */}
      <mesh material={atmMat}>
        <sphereGeometry args={[30, 32, 32]} />
      </mesh>

      {/* Dense starfield background */}
      <Stars
        radius={25}
        depth={50}
        count={6000}
        factor={4}
        saturation={0}
        fade
        speed={1}
      />

      {/* Central golden glow source */}
      <mesh material={coreMat}>
        <sphereGeometry args={[0.22, 24, 24]} />
      </mesh>
      <mesh material={halo1} scale={[2.5, 2.5, 2.5]}>
        <sphereGeometry args={[0.22, 16, 16]} />
      </mesh>
      <mesh material={halo2} scale={[4.0, 4.0, 4.0]}>
        <sphereGeometry args={[0.22, 12, 12]} />
      </mesh>
      <mesh material={halo3} scale={[6.0, 6.0, 6.0]}>
        <sphereGeometry args={[0.22, 10, 10]} />
      </mesh>

      {/* Sparkle particles — 500 glittering motes */}
      <Sparkles
        count={500}
        scale={12}
        size={2.5}
        speed={0.3}
        color="#ffcc44"
        opacity={0.9}
      />

      {/* Second ring of cooler sparkles */}
      <Sparkles
        count={200}
        scale={8}
        size={1.5}
        speed={0.15}
        color="#ffaacc"
        opacity={0.6}
      />

      {/* Volumetric cloud layer */}
      <VolumeClouds />

      {/* Orbiting motes close to center */}
      <OrbitMotes />
    </>
  );
}
