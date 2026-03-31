import { useRef, useMemo, useEffect } from 'react';
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
  hash,
  vec3,
} from 'three/tsl';

/**
 * Audio-Reactive Waveform Visualizer
 *
 * Concentric rings of instanced spheres deform based on simulated frequency data.
 * Inner rings = bass (large, slow oscillation), outer rings = treble (fast, small).
 * Color shifts from blue (quiet) through cyan (medium) to white/yellow (loud).
 * Central bloom halo shell provides glow. Emissive-driven lighting.
 */

// Ring configuration
const RING_COUNT = 6;
const SEGMENTS_PER_RING = 48;
const TOTAL_INSTANCES = RING_COUNT * SEGMENTS_PER_RING;
const BASE_RADIUS_START = 0.5;
const BASE_RADIUS_STEP = 0.42;

// Simulated audio frequency bands per ring (inner = low freq, outer = high freq)
const RING_CONFIGS = Array.from({ length: RING_COUNT }, (_, i) => {
  const t = i / (RING_COUNT - 1); // 0 = innermost, 1 = outermost
  return {
    baseRadius: BASE_RADIUS_START + i * BASE_RADIUS_STEP,
    frequency: 0.3 + t * 2.5, // bass: slow, treble: fast
    amplitude: 0.35 - t * 0.18, // bass: large displacement, treble: small
    sphereScale: 0.065 - t * 0.015, // inner spheres slightly larger
    subFreq1: 1.5 + t * 3.0,
    subFreq2: 0.7 + t * 1.8,
  };
});

/** Creates the TSL node material for ring segments */
function makeRingMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();

  // Per-instance seed from world position for variation
  const seed = hash(positionWorld.x.mul(73.1).add(positionWorld.z.mul(127.3)));

  // Displacement amount — driven by how far from center the sphere is
  // Use world-space distance from Z axis (XY plane rings) as a proxy for radial displacement
  const radialDist = positionWorld.x.mul(positionWorld.x).add(positionWorld.y.mul(positionWorld.y)).sqrt();

  // Normalized intensity: inner ring ~radius 0.5, outer ~radius 2.6
  // Map radial distance to a 0-1 range representing bass-to-treble
  const ringT = smoothstep(float(0.3), float(3.0), radialDist);

  // Simulated "audio" amplitude from multiple mixed sine waves
  const audioLevel = Fn(() => {
    const baseFreq = mix(float(0.3), float(2.8), ringT);
    const wave1 = oscSine(time.mul(baseFreq).add(seed.mul(6.28))).mul(0.5).add(0.5);
    const wave2 = oscSine(time.mul(baseFreq.mul(1.7)).add(float(1.3))).mul(0.3).add(0.5);
    const wave3 = oscSine(time.mul(baseFreq.mul(0.6)).add(float(2.7))).mul(0.2).add(0.5);
    return wave1.mul(0.5).add(wave2.mul(0.3)).add(wave3.mul(0.2));
  });

  const intensity = audioLevel();

  // 3-stop color: blue (quiet) -> cyan (medium) -> yellow/white (loud)
  const quietColor = color(0x1144cc); // deep blue
  const midColor = color(0x00ddff); // bright cyan
  const loudColor = color(0xffffaa); // warm white/yellow

  const col1 = mix(quietColor, midColor, smoothstep(float(0.2), float(0.5), intensity));
  const finalColor = mix(col1, loudColor, smoothstep(float(0.55), float(0.85), intensity));

  mat.colorNode = finalColor;

  // Fresnel rim glow
  const fresnel = Fn(() => {
    const viewDir = cameraPosition.sub(positionWorld).normalize();
    const nDotV = normalWorld.dot(viewDir).saturate();
    return float(1.0).sub(nDotV).pow(2.0);
  });

  // Emissive: glow intensity tracks audio level — 2-3x sweet spot
  const emissiveBase = finalColor.mul(intensity.mul(2.5));
  const emissiveRim = vec3(0.6, 0.9, 1.0).mul(fresnel()).mul(1.5);
  mat.emissiveNode = emissiveBase.add(emissiveRim);

  // Subtle vertex breathing along normals
  mat.positionNode = positionLocal.add(
    normalLocal.mul(oscSine(time.mul(1.8).add(seed.mul(6.28))).mul(0.008)),
  );

  mat.roughness = 0.15;
  mat.metalness = 0.3;

  return mat;
}

/** Creates a bloom halo shell material for the center */
function makeHaloMaterial(layer: number) {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;
  mat.side = THREE.BackSide;
  mat.depthWrite = false;
  mat.blending = THREE.AdditiveBlending;

  const layerFade = float(1.0).sub(float(layer).mul(0.3));
  const pulse = oscSine(time.mul(0.5)).mul(0.3).add(0.7);

  const fresnel = Fn(() => {
    const viewDir = cameraPosition.sub(positionWorld).normalize();
    const nDotV = normalWorld.dot(viewDir).saturate();
    return float(1.0).sub(nDotV).pow(float(1.5).add(float(layer).mul(0.5)));
  });

  // Cyan-blue glow
  const glowColor = color(0x00aaff);
  mat.opacityNode = fresnel().mul(pulse).mul(layerFade).mul(0.4);
  mat.colorNode = glowColor;
  mat.emissiveNode = glowColor.mul(fresnel().mul(pulse).mul(layerFade).mul(3.0));

  mat.roughness = 0.0;
  mat.metalness = 0.0;

  return mat;
}

export default function WaveformViz() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const groupRef = useRef<THREE.Group>(null);

  // Precompute base positions per instance (ring index, segment angle)
  const instanceData = useMemo(() => {
    const data: { ringIdx: number; angle: number; baseRadius: number }[] = [];
    for (let r = 0; r < RING_COUNT; r++) {
      const cfg = RING_CONFIGS[r];
      for (let s = 0; s < SEGMENTS_PER_RING; s++) {
        const angle = (s / SEGMENTS_PER_RING) * Math.PI * 2;
        data.push({ ringIdx: r, angle, baseRadius: cfg.baseRadius });
      }
    }
    return data;
  }, []);

  // Initial matrix setup — rings in XY plane (facing camera at z=4)
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < TOTAL_INSTANCES; i++) {
      const { angle, baseRadius, ringIdx } = instanceData[i];
      const cfg = RING_CONFIGS[ringIdx];
      const x = Math.cos(angle) * baseRadius;
      const y = Math.sin(angle) * baseRadius;
      dummy.position.set(x, y, 0);
      dummy.scale.setScalar(cfg.sphereScale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [instanceData]);

  const dummy = useMemo(() => new THREE.Object3D(), []);

  // Animate: update instance positions based on simulated audio
  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const t = clock.getElapsedTime();

    for (let i = 0; i < TOTAL_INSTANCES; i++) {
      const { angle, baseRadius, ringIdx } = instanceData[i];
      const cfg = RING_CONFIGS[ringIdx];

      // Simulated frequency data: multiple sine waves mixed together
      const wave1 = Math.sin(t * cfg.frequency * 2.5 + angle * 3) * 0.5 + 0.5;
      const wave2 = Math.sin(t * cfg.subFreq1 * 2 + angle * 5 + 1.3) * 0.3 + 0.5;
      const wave3 = Math.sin(t * cfg.subFreq2 * 1.5 + angle * 2 + 2.7) * 0.2 + 0.5;
      const audioAmp = wave1 * 0.5 + wave2 * 0.3 + wave3 * 0.2;

      // Radial displacement: push outward from center
      const displacement = audioAmp * cfg.amplitude;
      const r = baseRadius + displacement;

      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r;
      // Subtle Z oscillation (depth wobble) for bass rings
      const z = Math.sin(t * cfg.frequency * 1.5 + angle * 4) * cfg.amplitude * 0.3;

      // Scale pulses with audio
      const scale = cfg.sphereScale * (0.8 + audioAmp * 0.5);

      dummy.position.set(x, y, z);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  const ringMaterial = useMemo(() => makeRingMaterial(), []);
  const haloMats = useMemo(
    () => [makeHaloMaterial(0), makeHaloMaterial(1), makeHaloMaterial(2)],
    [],
  );

  // Slow group rotation for visual interest
  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.1;
    }
  });

  return (
    <>
      <ambientLight intensity={0.1} />
      <hemisphereLight args={['#334466', '#111122', 0.3]} />
      <directionalLight position={[5, 5, 5]} intensity={0.2} />
      {/* Colored accent lights */}
      <pointLight position={[0, 0, 0]} intensity={1.5} color={0x0088ff} distance={8} />
      <pointLight position={[2, 1, 0]} intensity={0.8} color={0x00ffff} distance={6} />
      <pointLight position={[-2, -1, 0]} intensity={0.5} color={0x4444ff} distance={6} />

      <group ref={groupRef}>
        {/* Ring segments: instanced spheres */}
        <instancedMesh
          ref={meshRef}
          args={[undefined, undefined, TOTAL_INSTANCES]}
          material={ringMaterial}
          frustumCulled={false}
        >
          <icosahedronGeometry args={[1, 2]} />
        </instancedMesh>

        {/* Central bloom halo */}
        {haloMats.map((mat, i) => (
          <mesh key={i} material={mat} scale={[0.6 + i * 0.3, 0.6 + i * 0.3, 0.6 + i * 0.3]}>
            <icosahedronGeometry args={[1, 4]} />
          </mesh>
        ))}
      </group>
    </>
  );
}
