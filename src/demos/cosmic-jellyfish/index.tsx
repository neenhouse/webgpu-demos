import { useRef, useMemo, useState, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
  Fn,
  If,
  instancedArray,
  instanceIndex,
  uniform,
  float,
  int,
  vec3,
  hash,
  time,
  color,
  mix,
  smoothstep,
  sin,
  cos,
  oscSine,
  normalWorld,
  cameraPosition,
  positionWorld,
  positionLocal,
  normalLocal,
} from 'three/tsl';

/**
 * Cosmic Jellyfish — Bioluminescent jellyfish in space with particle trails
 *
 * Combines 5 proven techniques:
 * 1. Skeletal animation (bone chains for 8 tentacles — proven in skeletal-wave)
 * 2. Bloom halo shells (BackSide + AdditiveBlending — proven in bloom-orbs)
 * 3. Instanced particles (600+ trailing sparks — proven in sprite-sparks)
 * 4. Volumetric shells (4 shells for body glow — proven in volumetric-cloud)
 * 5. Compute shader (particle trail positions — proven in compute-particles)
 *
 * requiresWebGPU: true (compute for particle trails)
 */

const BONE_COUNT = 10;
const SEGMENT_HEIGHT = 0.16;
const TENTACLE_COUNT = 8;
const TRAIL_PARTICLE_COUNT = 800;
const STAR_COUNT = 200;

// ─── Tentacle geometry + skeleton helpers (proven in skeletal-wave) ───

function createTentacleGeometry(): THREE.CylinderGeometry {
  const totalHeight = BONE_COUNT * SEGMENT_HEIGHT;
  const geo = new THREE.CylinderGeometry(
    0.015,     // radiusTop (thin tip)
    0.08,      // radiusBottom (thick base)
    totalHeight,
    8,
    BONE_COUNT * 3,
  );
  geo.translate(0, totalHeight / 2, 0);
  return geo;
}

function createSkinData(geometry: THREE.CylinderGeometry) {
  const position = geometry.getAttribute('position');
  const totalHeight = BONE_COUNT * SEGMENT_HEIGHT;
  const vertexCount = position.count;
  const skinIndices: number[] = [];
  const skinWeights: number[] = [];

  for (let i = 0; i < vertexCount; i++) {
    const y = position.getY(i);
    const normalizedY = Math.max(0, Math.min(y / totalHeight, 0.9999));
    const boneFloat = normalizedY * (BONE_COUNT - 1);
    const boneIndex = Math.floor(boneFloat);
    const weight = boneFloat - boneIndex;
    const bi0 = Math.min(boneIndex, BONE_COUNT - 1);
    const bi1 = Math.min(boneIndex + 1, BONE_COUNT - 1);
    skinIndices.push(bi0, bi1, 0, 0);
    skinWeights.push(1 - weight, weight, 0, 0);
  }

  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
}

function createBones(): THREE.Bone[] {
  const bones: THREE.Bone[] = [];
  for (let i = 0; i < BONE_COUNT; i++) {
    const bone = new THREE.Bone();
    if (i === 0) {
      bone.position.set(0, 0, 0);
    } else {
      bone.position.set(0, SEGMENT_HEIGHT, 0);
    }
    if (i > 0) {
      bones[i - 1].add(bone);
    }
    bones.push(bone);
  }
  return bones;
}

// ─── Tentacle component with skeletal animation ───

function Tentacle({ angle, phaseOffset }: { angle: number; phaseOffset: number }) {
  const meshRef = useRef<THREE.SkinnedMesh>(null);
  const bonesRef = useRef<THREE.Bone[]>([]);

  const geometry = useMemo(() => {
    const geo = createTentacleGeometry();
    createSkinData(geo);
    return geo;
  }, []);

  const material = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.side = THREE.DoubleSide;

    // Color: cyan base → magenta mid → gold tips (jellyfish bioluminescence)
    const heightNorm = positionWorld.y.add(1.5).div(3.5).saturate();
    const baseColor = color(0x00ddff); // cyan
    const midColor = color(0xff33aa);  // magenta
    const tipColor = color(0xffcc33);  // gold
    const lower = mix(baseColor, midColor, smoothstep(0.0, 0.5, heightNorm));
    mat.colorNode = mix(lower, tipColor, smoothstep(0.4, 1.0, heightNorm));

    // Fresnel rim (proven pattern, pow 2.5)
    const fresnel = Fn(() => {
      const viewDir = cameraPosition.sub(positionWorld).normalize();
      const nDotV = normalWorld.dot(viewDir).saturate();
      return float(1.0).sub(nDotV).pow(2.5);
    });

    // Pulsing emissive with phase offset — color shift cyan→magenta→gold
    const colorPhase = oscSine(time.mul(0.3).add(float(phaseOffset).mul(0.5)));
    const emissiveColor = mix(
      vec3(0.0, 0.8, 1.0),
      mix(vec3(1.0, 0.2, 0.7), vec3(1.0, 0.8, 0.2), colorPhase),
      colorPhase,
    );
    const pulse = oscSine(time.mul(1.5).add(positionWorld.y.mul(2.0)).add(float(phaseOffset)));
    const rimGlow = vec3(0.4, 0.8, 1.0).mul(fresnel()).mul(2.0);
    const bodyGlow = emissiveColor.mul(pulse.mul(0.5).add(0.5)).mul(1.8);
    mat.emissiveNode = rimGlow.add(bodyGlow);

    // Subtle vertex breathing
    mat.positionNode = positionLocal.add(
      normalLocal.mul(oscSine(time.mul(1.2).add(positionLocal.y.mul(4.0)).add(float(phaseOffset))).mul(0.004)),
    );

    mat.roughness = 0.3;
    mat.metalness = 0.3;
    return mat;
  }, [phaseOffset]);

  useEffect(() => {
    if (!meshRef.current) return;
    const bones = createBones();
    bonesRef.current = bones;
    const skeleton = new THREE.Skeleton(bones);
    meshRef.current.add(bones[0]);
    meshRef.current.bind(skeleton);
  }, []);

  // Bone animation: sine wave propagation, whip-like tip motion (proven in skeletal-wave)
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const bones = bonesRef.current;
    if (bones.length === 0) return;
    for (let i = 1; i < bones.length; i++) {
      const progress = i / bones.length;
      const phase = progress * Math.PI * 2.5;
      // Amplitude increases toward tip
      const amplitude = 0.06 + progress * 0.18;
      const waveX = Math.sin(t * 1.5 + phase + phaseOffset) * amplitude;
      const waveZ = Math.cos(t * 1.2 + phase * 0.8 + phaseOffset * 1.3) * amplitude * 0.6;
      bones[i].rotation.x = waveX;
      bones[i].rotation.z = waveZ;
    }
  });

  // Position tentacle radiating outward, tilted strongly (proven: tilt 1.2)
  const px = Math.cos(angle) * 0.25;
  const pz = Math.sin(angle) * 0.25;
  const tiltX = Math.sin(angle) * 1.3;
  const tiltZ = -Math.cos(angle) * 1.3;

  return (
    <skinnedMesh
      ref={meshRef}
      geometry={geometry}
      material={material}
      position={[px, -0.15, pz]}
      rotation={[tiltX, 0, tiltZ]}
      frustumCulled={false}
    />
  );
}

// ─── Jellyfish dome: volumetric shells (proven in volumetric-cloud) ───

function makeShellMaterial(layer: number, totalLayers: number) {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;
  mat.side = THREE.BackSide;
  mat.depthWrite = false;
  mat.blending = THREE.AdditiveBlending;

  const layerNorm = layer / (totalLayers - 1);
  const layerF = float(layerNorm);

  const timeOffset = time.mul(0.2).add(float(layer).mul(0.4));

  // Multi-octave hash noise for cloud density (proven in volumetric-cloud)
  const cloudDensity = Fn(() => {
    const freq = float(3.0 + layer * 2.0);
    const p = positionWorld.mul(freq);
    const offset1 = vec3(timeOffset, timeOffset.mul(0.6), timeOffset.mul(1.1));
    const offset2 = vec3(timeOffset.mul(1.3), float(5.0), timeOffset.mul(0.7));
    const n1 = hash(p.add(offset1));
    const n2 = hash(p.mul(2.3).add(offset2));
    const combined = n1.mul(0.6).add(n2.mul(0.4));
    return smoothstep(0.25, 0.75, combined);
  });

  // Fresnel (pow 2-3 for strong edges)
  const fresnel = Fn(() => {
    const viewDir = cameraPosition.sub(positionWorld).normalize();
    const nDotV = normalWorld.dot(viewDir).saturate();
    return float(1.0).sub(nDotV).pow(float(2.0).add(layerF));
  });

  const density = cloudDensity();
  const fresnelVal = fresnel();

  // Very low per-shell opacity (0.015-0.04 — proven to prevent additive blowout)
  const baseAlpha = float(0.035).sub(layerF.mul(0.02));
  const pulse = oscSine(time.mul(0.4).add(float(layer).mul(0.5))).mul(0.2).add(0.8);
  const shellOpacity = density.mul(baseAlpha).mul(pulse).add(fresnelVal.mul(0.025));
  mat.opacityNode = shellOpacity.clamp(0.0, 0.07);

  // Color: cycling cyan → magenta → gold (jellyfish bioluminescence)
  const colorPhase = oscSine(time.mul(0.15).add(layerF.mul(2.0)));
  const cyanGlow = color(0x00eeff);
  const magentaGlow = color(0xff44cc);
  const goldGlow = color(0xffcc44);
  const shellColor = mix(
    mix(cyanGlow, magentaGlow, smoothstep(0.0, 0.5, colorPhase)),
    goldGlow,
    smoothstep(0.4, 1.0, colorPhase),
  );
  mat.colorNode = shellColor;

  // Emissive: kept low (1.5-0.5x) to retain color without blowout (proven)
  const emissiveStrength = float(1.5).sub(layerF.mul(0.8));
  mat.emissiveNode = shellColor.mul(density.mul(pulse).mul(emissiveStrength));

  // Gentle vertex breathing
  mat.positionNode = positionLocal.add(
    normalLocal.mul(
      sin(time.mul(0.5).add(positionLocal.y.mul(2.0)).add(float(layer).mul(0.6))).mul(0.015),
    ),
  );

  mat.roughness = 0.0;
  mat.metalness = 0.0;
  return mat;
}

function JellyfishDome() {
  const SHELL_COUNT = 4;

  // Core material: bright glowing center
  const coreMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    const pulse = oscSine(time.mul(0.5)).mul(0.3).add(0.7);
    const colorPhase = oscSine(time.mul(0.15));
    const coreColor = mix(color(0x00eeff), color(0xff44cc), colorPhase);
    mat.colorNode = coreColor;

    const coreFresnel = Fn(() => {
      const viewDir = cameraPosition.sub(positionWorld).normalize();
      const nDotV = normalWorld.dot(viewDir).saturate();
      return float(1.0).sub(nDotV).pow(2.0);
    });
    mat.emissiveNode = coreColor.mul(pulse.mul(2.0)).add(
      color(0xffffff).mul(coreFresnel().mul(1.2)),
    );
    mat.roughness = 0.1;
    mat.metalness = 0.2;
    return mat;
  }, []);

  // Create volumetric shells
  const shells = useMemo(() => {
    const result: { material: THREE.MeshStandardNodeMaterial; radius: number }[] = [];
    for (let i = 0; i < SHELL_COUNT; i++) {
      const t = i / (SHELL_COUNT - 1);
      const radius = 0.45 + t * 0.6; // dome range
      result.push({
        material: makeShellMaterial(i, SHELL_COUNT),
        radius,
      });
    }
    return result;
  }, []);

  return (
    <group position={[0, 0.3, 0]}>
      {/* Bright dome core */}
      <mesh material={coreMaterial}>
        <sphereGeometry args={[0.4, 32, 24, 0, Math.PI * 2, 0, Math.PI * 0.6]} />
      </mesh>
      {/* Volumetric shells (outer first for correct blending) */}
      {shells.slice().reverse().map((shell, i) => (
        <mesh key={i} material={shell.material}>
          <icosahedronGeometry args={[shell.radius, 5]} />
        </mesh>
      ))}
    </group>
  );
}

// ─── Bloom halo shells around the entire jellyfish (proven in bloom-orbs) ───

function makeHaloMaterial(glowHex: number, phase: number, layer: number) {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;
  mat.side = THREE.BackSide;
  mat.depthWrite = false;
  mat.blending = THREE.AdditiveBlending;

  const layerFade = float(1.0).sub(float(layer).mul(0.3));
  const pulse = oscSine(time.mul(0.5).add(phase)).mul(0.3).add(0.7);

  // Fresnel: stronger pow for outer layers (proven pattern 1.5, 2.0, 2.5)
  const fresnel = Fn(() => {
    const viewDir = cameraPosition.sub(positionWorld).normalize();
    const nDotV = normalWorld.dot(viewDir).saturate();
    return float(1.0).sub(nDotV).pow(float(1.5).add(float(layer).mul(0.5)));
  });

  const glowColor = color(glowHex);
  // Color cycles with time for jellyfish color shifting
  const colorPhase = oscSine(time.mul(0.15));
  const shiftedColor = mix(glowColor, color(0xff44cc), colorPhase.mul(0.3));

  const baseOpacity = fresnel().mul(pulse).mul(layerFade).mul(0.4);
  mat.opacityNode = baseOpacity;
  mat.colorNode = shiftedColor;
  mat.emissiveNode = shiftedColor.mul(fresnel().mul(pulse).mul(layerFade).mul(2.5));
  mat.roughness = 0.0;
  mat.metalness = 0.0;
  return mat;
}

function BloomHalos() {
  const haloMats = useMemo(() => [
    makeHaloMaterial(0x00eeff, 0, 0),
    makeHaloMaterial(0x00eeff, 0, 1),
    makeHaloMaterial(0x00eeff, 0, 2),
  ], []);

  // Scale multipliers: 1.3x, 1.6x, 2.0x (proven in bloom-orbs)
  const scales: [number, number, number][] = [
    [1.4, 1.4, 1.4],
    [1.8, 1.8, 1.8],
    [2.3, 2.3, 2.3],
  ];

  return (
    <group position={[0, 0.1, 0]}>
      {haloMats.map((mat, i) => (
        <mesh key={i} material={mat} scale={scales[i]}>
          <icosahedronGeometry args={[0.6, 3]} />
        </mesh>
      ))}
    </group>
  );
}

// ─── Compute-driven trail particles (proven in compute-particles) ───

function TrailParticles() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const [initialized, setInitialized] = useState(false);
  const { gl } = useThree();

  const compute = useMemo(() => {
    const positions = instancedArray(TRAIL_PARTICLE_COUNT, 'vec3');
    const velocities = instancedArray(TRAIL_PARTICLE_COUNT, 'vec3');
    const lifetimes = instancedArray(TRAIL_PARTICLE_COUNT, 'float');

    const dtUniform = uniform(0);
    const timeUniform = uniform(0);

    // Init: distribute particles around tentacle tips in a ring
    const computeInit = Fn(() => {
      const pos = positions.element(instanceIndex);
      const vel = velocities.element(instanceIndex);
      const life = lifetimes.element(instanceIndex);

      // Scatter initial positions in a ring around origin (tentacle region)
      const angle = hash(instanceIndex).mul(Math.PI * 2);
      const radius = hash(instanceIndex.add(7)).mul(1.5).add(0.3);
      const h = hash(instanceIndex.add(3)).mul(2.0).sub(1.5);

      pos.x.assign(cos(angle).mul(radius));
      pos.y.assign(h);
      pos.z.assign(sin(angle).mul(radius));

      // Slow downward drift with outward spread
      vel.x.assign(cos(angle).mul(0.15));
      vel.y.assign(float(-0.3).sub(hash(instanceIndex.add(5)).mul(0.4)));
      vel.z.assign(sin(angle).mul(0.15));

      life.assign(hash(instanceIndex.add(2)).mul(3.0).add(0.5));
    })().compute(TRAIL_PARTICLE_COUNT);

    // Update: drift particles downward with gentle swirl, respawn at tentacle tips
    const computeUpdate = Fn(() => {
      const pos = positions.element(instanceIndex);
      const vel = velocities.element(instanceIndex);
      const life = lifetimes.element(instanceIndex);
      const dt = dtUniform;
      const t = timeUniform;

      // Gentle swirl force
      const swirlAngle = t.mul(0.5).add(hash(instanceIndex).mul(6.28));
      vel.x.addAssign(cos(swirlAngle).mul(dt).mul(0.08));
      vel.z.addAssign(sin(swirlAngle).mul(dt).mul(0.08));

      // Gravity-like downward drift
      vel.y.addAssign(float(-0.15).mul(dt));

      // Gentle drag
      vel.x.mulAssign(float(1.0).sub(dt.mul(0.5)));
      vel.y.mulAssign(float(1.0).sub(dt.mul(0.3)));
      vel.z.mulAssign(float(1.0).sub(dt.mul(0.5)));

      // Integrate position
      pos.addAssign(vel.mul(dt));

      // Decrease lifetime
      life.subAssign(dt);

      // Respawn dead particles at tentacle tip positions
      If(life.lessThan(0), () => {
        const respawnAngle = hash(instanceIndex.add(int(t.mul(1000)))).mul(Math.PI * 2);
        const tentacleRadius = float(0.8).add(hash(instanceIndex.add(int(t.mul(500)))).mul(0.8));
        const tipY = float(-1.0).sub(hash(instanceIndex.add(int(t.mul(700)))).mul(1.0));

        pos.x.assign(cos(respawnAngle).mul(tentacleRadius));
        pos.y.assign(tipY);
        pos.z.assign(sin(respawnAngle).mul(tentacleRadius));

        vel.x.assign(cos(respawnAngle).mul(0.1));
        vel.y.assign(float(-0.25).sub(hash(instanceIndex.add(int(t.mul(300)))).mul(0.3)));
        vel.z.assign(sin(respawnAngle).mul(0.1));

        life.assign(hash(instanceIndex.add(int(t.mul(800))).add(2)).mul(3.0).add(0.5));
      });
    })().compute(TRAIL_PARTICLE_COUNT);

    return { positions, velocities, lifetimes, dtUniform, timeUniform, computeInit, computeUpdate };
  }, []);

  // Material: reads compute buffers for color (proven hybrid CPU-matrices + GPU-color)
  const material = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();

    // Lifetime-based fade + color from compute velocity
    const vel = compute.velocities.element(instanceIndex);
    const speed = vel.length();
    const speedNorm = smoothstep(0.05, 0.8, speed);
    const life = compute.lifetimes.element(instanceIndex);
    const lifeFade = smoothstep(0.0, 0.8, life);

    // Color: cyan → magenta → gold (matching jellyfish theme)
    const coolColor = color(0x00eeff);
    const midColor = color(0xff44cc);
    const hotColor = color(0xffcc33);
    const lowerMix = mix(coolColor, midColor, smoothstep(0.0, 0.5, speedNorm));
    const fullColor = mix(lowerMix, hotColor, smoothstep(0.4, 1.0, speedNorm));
    mat.colorNode = fullColor;

    // Emissive: lifetime-based fade (emissive 2.5x — proven sweet spot)
    mat.emissiveNode = fullColor.mul(lifeFade.mul(2.5));

    // Per-particle variation via hash(positionWorld) (proven pattern)
    const seed = hash(positionWorld.x.mul(37.7).add(positionWorld.z.mul(91.1)));
    const pulse = oscSine(time.mul(1.5).add(seed.mul(6.283))).mul(0.3).add(0.7);
    mat.emissiveNode = fullColor.mul(lifeFade.mul(pulse).mul(2.5));

    mat.roughness = 0.2;
    mat.metalness = 0.3;
    return mat;
  }, [compute]);

  // Initialize compute
  useEffect(() => {
    const renderer = gl as unknown as THREE.WebGPURenderer;
    if (renderer && renderer.computeAsync) {
      renderer.computeAsync(compute.computeInit).then(() => {
        setInitialized(true);
      });
    }
  }, [gl, compute]);

  // Build initial instance matrices (spiral distribution)
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < TRAIL_PARTICLE_COUNT; i++) {
      const t = i / TRAIL_PARTICLE_COUNT;
      const angle = t * Math.PI * 12;
      const radius = 0.3 + t * 1.5;
      const height = -t * 2.5 + (Math.random() - 0.5) * 0.5;

      dummy.position.set(
        Math.cos(angle) * radius + (Math.random() - 0.5) * 0.2,
        height,
        Math.sin(angle) * radius + (Math.random() - 0.5) * 0.2,
      );
      dummy.scale.setScalar(0.02 + Math.random() * 0.03);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, []);

  // Per-frame compute dispatch
  useFrame((_, delta) => {
    if (!initialized) return;
    const renderer = gl as unknown as THREE.WebGPURenderer;
    if (renderer && renderer.compute) {
      compute.dtUniform.value = Math.min(delta, 0.05);
      compute.timeUniform.value += Math.min(delta, 0.05);
      renderer.compute(compute.computeUpdate);
    }
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, TRAIL_PARTICLE_COUNT]}
      material={material}
      frustumCulled={false}
    >
      <icosahedronGeometry args={[1, 1]} />
    </instancedMesh>
  );
}

// ─── Background stars (instanced, proven pattern) ───

function BackgroundStars() {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  const material = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.colorNode = color(0xffffff);
    const seed = hash(positionWorld.x.mul(17.3).add(positionWorld.z.mul(53.7)));
    const twinkle = oscSine(time.mul(1.0).add(seed.mul(6.28))).mul(0.5).add(0.5);
    mat.emissiveNode = vec3(0.8, 0.85, 1.0).mul(twinkle.mul(2.0));
    mat.roughness = 0.0;
    mat.metalness = 0.0;
    return mat;
  }, []);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < STAR_COUNT; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 6 + Math.random() * 4;
      dummy.position.set(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.sin(phi) * Math.sin(theta),
        r * Math.cos(phi),
      );
      dummy.scale.setScalar(0.01 + Math.random() * 0.02);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, []);

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, STAR_COUNT]}
      material={material}
    >
      <icosahedronGeometry args={[1, 0]} />
    </instancedMesh>
  );
}

// ─── Main scene ───

export default function CosmicJellyfish() {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.12;
    }
  });

  const tentacles = useMemo(() => {
    const items = [];
    for (let i = 0; i < TENTACLE_COUNT; i++) {
      const angle = (i / TENTACLE_COUNT) * Math.PI * 2;
      const phaseOffset = (i / TENTACLE_COUNT) * Math.PI * 2;
      items.push(<Tentacle key={i} angle={angle} phaseOffset={phaseOffset} />);
    }
    return items;
  }, []);

  return (
    <>
      {/* Minimal scene lighting — emissive-driven scene (proven) */}
      <ambientLight intensity={0.05} />
      <directionalLight position={[3, 5, 3]} intensity={0.15} />
      {/* Core glow */}
      <pointLight position={[0, 0.3, 0]} intensity={4.0} color="#00eeff" distance={8} />
      {/* Tentacle accent lights */}
      <pointLight position={[0, -1.5, 0]} intensity={3.0} color="#ff44cc" distance={7} />
      <pointLight position={[1.5, 0, 1.5]} intensity={2.0} color="#ffcc33" distance={6} />
      <pointLight position={[-1.5, 0.5, -1]} intensity={2.0} color="#00eeff" distance={6} />

      <BackgroundStars />

      <group ref={groupRef}>
        <JellyfishDome />
        <BloomHalos />
        {tentacles}
        <TrailParticles />
      </group>
    </>
  );
}
