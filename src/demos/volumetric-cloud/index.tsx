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
  mix,
  smoothstep,
  sin,
  hash,
  vec3,
} from 'three/tsl';

/**
 * Volumetric Cloud — Layered shell volumetric effect via TSL Fn()
 *
 * Simulates volumetric density through concentric transparent shells:
 * - 8 nested icosahedron shells with noise-driven opacity via Fn()
 * - TSL hash noise creates procedural density patterns per shell
 * - Animated noise offset creates swirling cloud motion
 * - BackSide rendering + AdditiveBlending for volumetric glow
 * - Warm orange-gold core fading to cool violet outer wisps
 * - Very low per-shell opacity prevents additive blowout
 */

const SHELL_COUNT = 8;

/** Creates a volumetric shell material for one layer */
function makeShellMaterial(layer: number, totalLayers: number) {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;
  mat.side = THREE.BackSide;
  mat.depthWrite = false;
  mat.blending = THREE.AdditiveBlending;

  const layerNorm = layer / (totalLayers - 1); // 0 = innermost, 1 = outermost
  const layerF = float(layerNorm);

  // Animated time offset per layer for swirling
  const timeOffset = time.mul(0.25).add(float(layer).mul(0.3));

  // Multi-octave noise function for cloud density via Fn()
  const cloudDensity = Fn(() => {
    // Use world position scaled per-layer for varying frequency
    const freq = float(4.0 + layer * 2.5);
    const p = positionWorld.mul(freq);

    // Three octaves of hash noise with animated offsets
    const offset1 = vec3(timeOffset, timeOffset.mul(0.7), timeOffset.mul(1.3));
    const offset2 = vec3(timeOffset.mul(1.4), float(5.0), timeOffset.mul(0.8));
    const offset3 = vec3(float(10.0), timeOffset.mul(1.8), timeOffset.mul(0.5));

    const n1 = hash(p.add(offset1));
    const n2 = hash(p.mul(2.3).add(offset2));
    const n3 = hash(p.mul(4.7).add(offset3));

    // Weighted blend: lower octaves dominate for soft clouds
    const combined = n1.mul(0.55).add(n2.mul(0.3)).add(n3.mul(0.15));

    // Smooth threshold: carve cloud shapes from noise
    return smoothstep(0.3, 0.7, combined);
  });

  // Fresnel for edge glow (volumetric depth cue)
  const fresnel = Fn(() => {
    const viewDir = cameraPosition.sub(positionWorld).normalize();
    const nDotV = normalWorld.dot(viewDir).saturate();
    return float(1.0).sub(nDotV).pow(float(2.0).add(layerF));
  });

  const density = cloudDensity();
  const fresnelVal = fresnel();

  // Very low per-shell opacity to prevent additive blowout
  // Inner shells: ~0.04, outer shells: ~0.015
  const baseAlpha = float(0.04).sub(layerF.mul(0.025));
  const pulse = oscSine(time.mul(0.35).add(float(layer).mul(0.5))).mul(0.15).add(0.85);
  const shellOpacity = density.mul(baseAlpha).mul(pulse).add(fresnelVal.mul(0.02));
  mat.opacityNode = shellOpacity.clamp(0.0, 0.08);

  // Color: warm orange core -> soft violet mid -> deep purple outer
  const warmCore = color(0xff7733);
  const midGlow = color(0xcc66ee);
  const outerWisp = color(0x7744bb);

  const shellColor = mix(
    mix(warmCore, midGlow, smoothstep(0.0, 0.5, layerF)),
    outerWisp,
    smoothstep(0.3, 1.0, layerF),
  );
  mat.colorNode = shellColor;

  // Emissive: kept low (1.5-0.5x) to retain color without blowout
  const emissiveStrength = float(1.5).sub(layerF.mul(1.0));
  mat.emissiveNode = shellColor.mul(density.mul(pulse).mul(emissiveStrength));

  // Gentle vertex breathing for organic cloud motion
  mat.positionNode = positionLocal.add(
    normalLocal.mul(
      sin(time.mul(0.6).add(positionLocal.y.mul(2.5)).add(float(layer).mul(0.7))).mul(0.02),
    ),
  );

  mat.roughness = 0.0;
  mat.metalness = 0.0;

  return mat;
}

export default function VolumetricCloud() {
  const groupRef = useRef<THREE.Group>(null);

  // Core material: bright glowing center
  const coreMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    const pulse = oscSine(time.mul(0.6)).mul(0.3).add(0.7);
    mat.colorNode = color(0xffaa44);
    mat.emissiveNode = color(0xff7722).mul(pulse.mul(2.5));

    // Fresnel rim on core
    const coreFresnel = Fn(() => {
      const viewDir = cameraPosition.sub(positionWorld).normalize();
      const nDotV = normalWorld.dot(viewDir).saturate();
      return float(1.0).sub(nDotV).pow(2.0);
    });
    mat.emissiveNode = color(0xff7722).mul(pulse.mul(2.0)).add(
      color(0xffddaa).mul(coreFresnel().mul(1.5)),
    );

    mat.roughness = 0.1;
    mat.metalness = 0.2;
    return mat;
  }, []);

  // Create all shell materials
  const shells = useMemo(() => {
    const result: { material: THREE.MeshStandardNodeMaterial; radius: number }[] = [];
    for (let i = 0; i < SHELL_COUNT; i++) {
      const t = i / (SHELL_COUNT - 1);
      const radius = 0.35 + t * 1.4; // 0.35 inner -> 1.75 outer
      result.push({
        material: makeShellMaterial(i, SHELL_COUNT),
        radius,
      });
    }
    return result;
  }, []);

  // Slow rotation
  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.1;
      groupRef.current.rotation.x += delta * 0.03;
    }
  });

  return (
    <>
      <ambientLight intensity={0.05} />
      <directionalLight position={[3, 4, 5]} intensity={0.1} />
      {/* Core glow light */}
      <pointLight position={[0, 0, 0]} intensity={3.0} color="#ff8844" distance={5} />
      {/* Accent lights for color variation */}
      <pointLight position={[2, 1, 1]} intensity={1.5} color="#aa66ff" distance={6} />
      <pointLight position={[-1.5, -1, 1.5]} intensity={1.0} color="#ff4422" distance={5} />

      <group ref={groupRef}>
        {/* Bright dense core */}
        <mesh material={coreMaterial}>
          <icosahedronGeometry args={[0.25, 5]} />
        </mesh>

        {/* Volumetric shells — outer first for correct blending */}
        {shells
          .slice()
          .reverse()
          .map((shell, i) => (
            <mesh key={i} material={shell.material}>
              <icosahedronGeometry args={[shell.radius, 5]} />
            </mesh>
          ))}
      </group>
    </>
  );
}
