import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
  color,
  time,
  oscSine,
  normalWorld,
  cameraPosition,
  positionWorld,
  positionLocal,
  normalLocal,
  Fn,
  float,
} from 'three/tsl';

/**
 * Bloom Orbs — TSL-driven glow/bloom effect
 *
 * Demonstrates bloom-like glow purely through TSL material nodes:
 * - Strong emissive core with animated intensity
 * - Layered transparent halo shells for soft glow falloff
 * - Fresnel-driven rim glow for bright edges
 * - Additive blending on outer shells to simulate light scatter
 * - Multiple orbs with staggered phase for visual variety
 */

/** Creates a glowing core material with pulsing emissive */
function makeCoreMaterial(baseHex: number, emissiveHex: number, phase: number) {
  const mat = new THREE.MeshStandardNodeMaterial();

  // Pulsing emissive intensity
  const pulse = oscSine(time.mul(0.7).add(phase)).mul(0.4).add(0.6);

  // Core color: bright emissive
  mat.colorNode = color(baseHex);

  // Fresnel rim
  const fresnel = Fn(() => {
    const viewDir = cameraPosition.sub(positionWorld).normalize();
    const nDotV = normalWorld.dot(viewDir).saturate();
    return float(1.0).sub(nDotV).pow(2.0);
  });

  // Strong emissive that pulses
  const coreEmissive = color(emissiveHex).mul(pulse.mul(3.0));
  const rimEmissive = color(0xffffff).mul(fresnel()).mul(pulse.mul(2.0));
  mat.emissiveNode = coreEmissive.add(rimEmissive);

  // Slight vertex displacement for breathing
  mat.positionNode = positionLocal.add(
    normalLocal.mul(oscSine(time.mul(1.2).add(phase)).mul(0.02)),
  );

  mat.roughness = 0.1;
  mat.metalness = 0.3;

  return mat;
}

/** Creates a transparent halo shell material — simulates bloom glow */
function makeHaloMaterial(glowHex: number, phase: number, layer: number) {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;
  mat.side = THREE.BackSide; // Render inside faces so halo wraps around core
  mat.depthWrite = false;
  mat.blending = THREE.AdditiveBlending;

  // Layer-dependent falloff: outer layers are dimmer
  const layerFade = float(1.0).sub(float(layer).mul(0.25));

  // Pulsing glow intensity synced with core
  const pulse = oscSine(time.mul(0.7).add(phase)).mul(0.3).add(0.7);

  // Fresnel: halo is strongest at edges (grazing angles)
  const fresnel = Fn(() => {
    const viewDir = cameraPosition.sub(positionWorld).normalize();
    const nDotV = normalWorld.dot(viewDir).saturate();
    return float(1.0).sub(nDotV).pow(float(1.5).add(float(layer).mul(0.5)));
  });

  const glowColor = color(glowHex);

  // Opacity: fresnel-driven with pulse and layer falloff
  const baseOpacity = fresnel().mul(pulse).mul(layerFade).mul(0.6);
  mat.opacityNode = baseOpacity;

  // Color: glow color, slightly shifting per layer
  mat.colorNode = glowColor;

  // Emissive: strong glow
  mat.emissiveNode = glowColor.mul(fresnel().mul(pulse).mul(layerFade).mul(4.0));

  mat.roughness = 0.0;
  mat.metalness = 0.0;

  return mat;
}

/** A single bloom orb with core + halo shells */
function BloomOrb({
  position,
  baseColor,
  emissiveColor,
  glowColor,
  phase,
  coreRadius,
}: {
  position: [number, number, number];
  baseColor: number;
  emissiveColor: number;
  glowColor: number;
  phase: number;
  coreRadius: number;
}) {
  const groupRef = useRef<THREE.Group>(null);

  const coreMat = useMemo(
    () => makeCoreMaterial(baseColor, emissiveColor, phase),
    [baseColor, emissiveColor, phase],
  );

  const haloMats = useMemo(
    () => [
      makeHaloMaterial(glowColor, phase, 0),
      makeHaloMaterial(glowColor, phase, 1),
      makeHaloMaterial(glowColor, phase, 2),
    ],
    [glowColor, phase],
  );

  // Halo shell scale multipliers
  const haloScales: [number, number, number][] = [
    [1.3, 1.3, 1.3],
    [1.6, 1.6, 1.6],
    [2.0, 2.0, 2.0],
  ];

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.15;
    }
  });

  return (
    <group ref={groupRef} position={position}>
      {/* Core sphere */}
      <mesh material={coreMat}>
        <icosahedronGeometry args={[coreRadius, 5]} />
      </mesh>
      {/* Halo shells */}
      {haloMats.map((mat, i) => (
        <mesh key={i} material={mat} scale={haloScales[i]}>
          <icosahedronGeometry args={[coreRadius, 3]} />
        </mesh>
      ))}
    </group>
  );
}

export default function BloomOrbs() {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.08;
    }
  });

  return (
    <>

      <fogExp2 attach="fog" args={["#020408", 0.04]} />
      <ambientLight intensity={0.1} />
      <hemisphereLight args={['#334466', '#111122', 0.3]} />
      {/* Minimal scene lighting — the orbs provide their own glow */}
      <directionalLight position={[5, 5, 5]} intensity={0.2} />

      <group ref={groupRef}>
        {/* Central large orb — warm gold */}
        <BloomOrb
          position={[0, 0, 0]}
          baseColor={0xffcc44}
          emissiveColor={0xffaa00}
          glowColor={0xffdd66}
          phase={0}
          coreRadius={0.6}
        />

        {/* Left orb — cool cyan */}
        <BloomOrb
          position={[-2.0, 0.5, -0.3]}
          baseColor={0x44ddff}
          emissiveColor={0x00bbff}
          glowColor={0x66eeff}
          phase={2.1}
          coreRadius={0.35}
        />

        {/* Right orb — magenta/pink */}
        <BloomOrb
          position={[1.8, -0.3, 0.5]}
          baseColor={0xff44cc}
          emissiveColor={0xff00aa}
          glowColor={0xff66dd}
          phase={4.2}
          coreRadius={0.4}
        />

        {/* Back orb — green */}
        <BloomOrb
          position={[0.3, 0.8, -1.8]}
          baseColor={0x66ff44}
          emissiveColor={0x44cc00}
          glowColor={0x88ff66}
          phase={1.0}
          coreRadius={0.3}
        />

        {/* Low orb — violet */}
        <BloomOrb
          position={[-0.8, -1.2, 1.0]}
          baseColor={0xaa66ff}
          emissiveColor={0x8800ff}
          glowColor={0xcc88ff}
          phase={3.5}
          coreRadius={0.25}
        />
      </group>
    </>
  );
}
