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
  screenUV,
  Fn,
  float,
  mix,
  smoothstep,
  hash,
  vec3,
} from 'three/tsl';

/**
 * Deep Sea — Bioluminescent underwater scene
 *
 * Demonstrates:
 * - Chain-of-segments tentacles with CPU-driven rotation per joint
 * - Instanced mesh plankton particles with hash-driven variation
 * - Volumetric light shaft meshes with AdditiveBlending
 * - Fresnel rim glow for underwater bioluminescence
 * - screenUV-based depth fog atmosphere
 */

const SEGMENT_COUNT = 6;
const SEGMENT_HEIGHT = 0.13;
const TENTACLE_COUNT = 6;
const PLANKTON_COUNT = 400;

// ─── Tentacle Segment Material ─────────────────────────────────

function makeTentacleMaterial(glowColor: THREE.Color, phaseOffset: number) {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.side = THREE.DoubleSide;

  const glowVec = vec3(glowColor.r, glowColor.g, glowColor.b);

  // Color: glow color fading to dim at tips
  const heightNorm = positionWorld.y.add(1.5).div(3.0).saturate();
  mat.colorNode = mix(glowVec.mul(0.6), vec3(0.02, 0.02, 0.06), heightNorm);

  // Fresnel rim
  const fresnel = Fn(() => {
    const viewDir = cameraPosition.sub(positionWorld).normalize();
    const nDotV = normalWorld.dot(viewDir).saturate();
    return float(1.0).sub(nDotV).pow(2.0);
  });

  // Pulsing emissive
  const pulse = oscSine(time.mul(1.5).add(float(phaseOffset))).mul(0.4).add(0.6);
  mat.emissiveNode = glowVec.mul(fresnel().mul(1.5).add(pulse.mul(0.8)));

  mat.roughness = 0.6;
  mat.metalness = 0.1;

  return mat;
}

// ─── Chain-of-segments Tentacle ────────────────────────────────

function Tentacle({
  angle,
  phaseOffset,
  glowColor,
}: {
  angle: number;
  phaseOffset: number;
  glowColor: THREE.Color;
}) {
  // Refs for each joint group to animate rotation
  const jointRefs = useRef<(THREE.Group | null)[]>([]);

  const material = useMemo(
    () => makeTentacleMaterial(glowColor, phaseOffset),
    [phaseOffset, glowColor],
  );

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    for (let i = 0; i < SEGMENT_COUNT; i++) {
      const joint = jointRefs.current[i];
      if (!joint) continue;
      const progress = i / SEGMENT_COUNT;
      const phase = progress * Math.PI * 2.0;
      const amplitude = 0.05 + progress * 0.1;
      joint.rotation.x = Math.sin(t * 1.8 + phase + phaseOffset) * amplitude;
      joint.rotation.z = Math.cos(t * 1.4 + phase * 0.7 + phaseOffset * 1.3) * amplitude * 0.5;
    }
  });

  const px = Math.cos(angle) * 0.2;
  const pz = Math.sin(angle) * 0.2;
  const tiltX = Math.sin(angle) * 1.1;
  const tiltZ = -Math.cos(angle) * 1.1;

  // Build nested groups: each joint contains a cylinder segment + the next joint
  // We build from tip to base so the innermost is the tip
  function buildChain(depth: number): React.ReactNode {
    if (depth >= SEGMENT_COUNT) return null;
    const t = depth / SEGMENT_COUNT;
    const radiusBottom = 0.04 * (1 - t * 0.7);
    const radiusTop = 0.04 * (1 - (t + 1 / SEGMENT_COUNT) * 0.7);

    return (
      <group
        key={depth}
        ref={(el) => { jointRefs.current[depth] = el; }}
        position={depth === 0 ? [0, 0, 0] : [0, SEGMENT_HEIGHT, 0]}
      >
        <mesh material={material}>
          <cylinderGeometry args={[radiusTop, radiusBottom, SEGMENT_HEIGHT, 6]} />
        </mesh>
        {buildChain(depth + 1)}
      </group>
    );
  }

  return (
    <group position={[px, 0, pz]} rotation={[tiltX, 0, tiltZ]}>
      {buildChain(0)}
    </group>
  );
}

// ─── Jellyfish Dome (half-sphere bell) ─────────────────────────

function JellyfishDome({
  glowColor,
  phase,
}: {
  glowColor: THREE.Color;
  phase: number;
}) {
  const material = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.transparent = true;
    mat.side = THREE.DoubleSide;

    const glowVec = vec3(glowColor.r, glowColor.g, glowColor.b);

    mat.colorNode = glowVec.mul(0.4);

    // Fresnel rim for bioluminescent edge
    const fresnel = Fn(() => {
      const viewDir = cameraPosition.sub(positionWorld).normalize();
      const nDotV = normalWorld.dot(viewDir).saturate();
      return float(1.0).sub(nDotV).pow(1.8);
    });

    const pulse = oscSine(time.mul(1.0).add(float(phase))).mul(0.3).add(0.7);
    mat.opacityNode = float(0.35).add(fresnel().mul(0.4)).mul(pulse);

    // Strong emissive for bioluminescent glow
    mat.emissiveNode = glowVec.mul(fresnel().mul(2.5).add(pulse.mul(1.5)));

    // Gentle vertex breathing for bell pulsation
    mat.positionNode = positionLocal.add(
      normalLocal.mul(oscSine(time.mul(1.2).add(float(phase))).mul(0.03)),
    );

    mat.roughness = 0.3;
    mat.metalness = 0.1;

    return mat;
  }, [glowColor, phase]);

  return (
    <mesh material={material} position={[0, 0.15, 0]}>
      <sphereGeometry args={[0.35, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
    </mesh>
  );
}

// ─── Jellyfish Halo (bloom glow shell) ─────────────────────────

function JellyfishHalo({
  glowColor,
  phase,
}: {
  glowColor: THREE.Color;
  phase: number;
}) {
  const material = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.transparent = true;
    mat.side = THREE.BackSide;
    mat.depthWrite = false;
    mat.blending = THREE.AdditiveBlending;

    const glowVec = vec3(glowColor.r, glowColor.g, glowColor.b);

    const fresnel = Fn(() => {
      const viewDir = cameraPosition.sub(positionWorld).normalize();
      const nDotV = normalWorld.dot(viewDir).saturate();
      return float(1.0).sub(nDotV).pow(2.0);
    });

    const pulse = oscSine(time.mul(1.0).add(float(phase))).mul(0.3).add(0.7);
    mat.opacityNode = fresnel().mul(pulse).mul(0.25);
    mat.colorNode = glowVec;
    mat.emissiveNode = glowVec.mul(fresnel().mul(pulse).mul(2.0));

    mat.roughness = 0.0;
    mat.metalness = 0.0;

    return mat;
  }, [glowColor, phase]);

  return (
    <mesh material={material} position={[0, 0.1, 0]} scale={[1.5, 1.3, 1.5]}>
      <icosahedronGeometry args={[0.45, 3]} />
    </mesh>
  );
}

// ─── Complete Jellyfish ────────────────────────────────────────

function Jellyfish({
  position,
  glowColor,
  phase,
  bobSpeed,
  bobAmplitude,
}: {
  position: [number, number, number];
  glowColor: THREE.Color;
  phase: number;
  bobSpeed: number;
  bobAmplitude: number;
}) {
  const groupRef = useRef<THREE.Group>(null);

  const tentacles = useMemo(() => {
    const items = [];
    for (let i = 0; i < TENTACLE_COUNT; i++) {
      const a = (i / TENTACLE_COUNT) * Math.PI * 2;
      const po = phase + (i / TENTACLE_COUNT) * Math.PI * 2;
      items.push(
        <Tentacle key={i} angle={a} phaseOffset={po} glowColor={glowColor} />,
      );
    }
    return items;
  }, [phase, glowColor]);

  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.elapsedTime;
    groupRef.current.position.y = position[1] + Math.sin(t * bobSpeed + phase) * bobAmplitude;
    groupRef.current.rotation.y += 0.002;
  });

  return (
    <group ref={groupRef} position={position}>
      <JellyfishDome glowColor={glowColor} phase={phase} />
      <JellyfishHalo glowColor={glowColor} phase={phase} />
      {tentacles}
    </group>
  );
}

// ─── Plankton (instanced tiny spheres) ─────────────────────────

function Plankton() {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  const matrices = useMemo(() => {
    const dummy = new THREE.Object3D();
    const result: THREE.Matrix4[] = [];
    for (let i = 0; i < PLANKTON_COUNT; i++) {
      const x = (Math.random() - 0.5) * 7;
      const y = (Math.random() - 0.5) * 5;
      const z = (Math.random() - 0.5) * 5 - 1;
      const scale = 0.01 + Math.random() * 0.025;
      dummy.position.set(x, y, z);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      result.push(dummy.matrix.clone());
    }
    return result;
  }, []);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    for (let i = 0; i < matrices.length; i++) {
      mesh.setMatrixAt(i, matrices[i]);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [matrices]);

  const material = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();

    // Per-particle seed from world position
    const seed = hash(positionWorld.x.mul(47.3).add(positionWorld.z.mul(83.7)));

    // Plankton color: mix of cyan, green, warm white
    const c1 = color(0x44ffee);
    const c2 = color(0xaaffcc);
    const c3 = color(0xffeedd);
    const baseColor = mix(mix(c1, c2, seed), c3, seed.mul(seed));
    mat.colorNode = baseColor;

    // Fresnel rim
    const fresnel = Fn(() => {
      const viewDir = cameraPosition.sub(positionWorld).normalize();
      const nDotV = normalWorld.dot(viewDir).saturate();
      return float(1.0).sub(nDotV).pow(2.5);
    });

    // Pulsing emissive: gentle glow with per-particle phase
    const pulse = oscSine(time.mul(0.8).add(seed.mul(6.283))).mul(0.5).add(0.5);
    mat.emissiveNode = baseColor.mul(pulse.mul(2.0).add(fresnel().mul(1.5)));

    mat.roughness = 0.5;
    mat.metalness = 0.0;

    return mat;
  }, []);

  const dummy = useMemo(() => new THREE.Object3D(), []);

  // Slowly drift plankton
  useFrame((state) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const t = state.clock.elapsedTime;
    for (let i = 0; i < PLANKTON_COUNT; i++) {
      mesh.getMatrixAt(i, dummy.matrix);
      dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale);
      dummy.position.y += Math.sin(t * 0.3 + i * 0.1) * 0.0003;
      dummy.position.x += Math.cos(t * 0.2 + i * 0.15) * 0.0002;
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, PLANKTON_COUNT]}
      material={material}
      frustumCulled={false}
    >
      <icosahedronGeometry args={[1, 1]} />
    </instancedMesh>
  );
}

// ─── Light Shafts ──────────────────────────────────────────────

function LightShaft({
  position,
  rotationZ,
  scale,
  phase,
}: {
  position: [number, number, number];
  rotationZ: number;
  scale: [number, number, number];
  phase: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);

  const material = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.transparent = true;
    mat.side = THREE.BackSide;
    mat.depthWrite = false;
    mat.blending = THREE.AdditiveBlending;

    // Gradient: brighter at top, fading to transparent at bottom
    const heightNorm = positionLocal.y.add(0.5).saturate();

    // Soft shaft color
    const shaftColor = vec3(0.15, 0.35, 0.55);

    mat.colorNode = mix(vec3(0.0, 0.0, 0.0), shaftColor, heightNorm);

    // Opacity: gentle fade with sway
    const sway = oscSine(time.mul(0.3).add(float(phase))).mul(0.15).add(0.85);
    mat.opacityNode = heightNorm.mul(0.12).mul(sway);

    // Subtle emissive
    mat.emissiveNode = shaftColor.mul(heightNorm.mul(sway).mul(0.8));

    mat.roughness = 1.0;
    mat.metalness = 0.0;

    return mat;
  }, [phase]);

  useFrame((state) => {
    if (!meshRef.current) return;
    const t = state.clock.elapsedTime;
    meshRef.current.rotation.z = rotationZ + Math.sin(t * 0.4 + phase) * 0.05;
  });

  return (
    <mesh ref={meshRef} position={position} scale={scale} rotation={[0, 0, rotationZ]} material={material}>
      <cylinderGeometry args={[0.05, 0.4, 1, 8, 1, true]} />
    </mesh>
  );
}

// ─── Depth Fog Overlay ─────────────────────────────────────────

function DepthFog() {
  const material = useMemo(() => {
    const mat = new THREE.MeshBasicNodeMaterial();
    mat.transparent = true;
    mat.depthWrite = false;
    mat.side = THREE.DoubleSide;

    // Dark gradient: deep navy/black at bottom, slightly lighter navy at top
    const fogColor = mix(
      vec3(0.0, 0.01, 0.03),
      vec3(0.02, 0.06, 0.12),
      screenUV.y,
    );

    // Very subtle vignette at edges
    const vignette = screenUV.sub(0.5).length().mul(1.4);
    const vignetteAlpha = smoothstep(0.3, 0.9, vignette).mul(0.3);

    mat.colorNode = fogColor;
    mat.opacityNode = vignetteAlpha;

    return mat;
  }, []);

  return (
    <mesh material={material} position={[0, 0, 3]} renderOrder={999}>
      <planeGeometry args={[12, 10]} />
    </mesh>
  );
}

// ─── Main Scene ────────────────────────────────────────────────

export default function DeepSea() {
  return (
    <>
      {/* Very dark ambient — deep underwater */}
      <ambientLight intensity={0.1} />
      <hemisphereLight args={['#334466', '#111122', 0.3]} />
      {/* Faint overhead light for shafts */}
      <directionalLight position={[0, 5, 2]} intensity={0.15} color="#3366aa" />

      {/* Underwater point lights for bioluminescence */}
      <pointLight position={[0, 1, 1]} intensity={2.0} color="#00ccff" distance={8} />
      <pointLight position={[-2, -0.5, 0]} intensity={1.5} color="#44ff88" distance={6} />
      <pointLight position={[2, 0, -1]} intensity={1.5} color="#aa44ff" distance={6} />

      {/* Three jellyfish at different positions and depths */}
      <Jellyfish
        position={[-0.2, 0.3, 0]}
        glowColor={new THREE.Color(0.0, 0.8, 1.0)}
        phase={0}
        bobSpeed={0.6}
        bobAmplitude={0.25}
      />
      <Jellyfish
        position={[1.8, -0.5, -1.2]}
        glowColor={new THREE.Color(0.5, 1.0, 0.3)}
        phase={2.0}
        bobSpeed={0.5}
        bobAmplitude={0.2}
      />
      <Jellyfish
        position={[-1.6, 0.8, -0.8]}
        glowColor={new THREE.Color(0.7, 0.2, 1.0)}
        phase={4.0}
        bobSpeed={0.7}
        bobAmplitude={0.18}
      />

      {/* Floating plankton particles */}
      <Plankton />

      {/* Volumetric light shafts from above */}
      <LightShaft position={[-0.8, 2.5, -1]} rotationZ={0.1} scale={[3, 5, 3]} phase={0} />
      <LightShaft position={[1.0, 2.8, -0.5]} rotationZ={-0.08} scale={[2.5, 4.5, 2.5]} phase={1.5} />
      <LightShaft position={[0.2, 2.3, -1.5]} rotationZ={0.05} scale={[2, 4, 2]} phase={3.0} />

      {/* Depth fog vignette overlay */}
      <DepthFog />
    </>
  );
}
