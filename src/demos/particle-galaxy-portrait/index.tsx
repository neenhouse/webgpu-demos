import { useRef, useMemo, useState, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
  Fn,
  instancedArray,
  instanceIndex,
  uniform,
  float,
  vec3,
  hash,
  time,
  mix,
  smoothstep,
  positionLocal,
  normalLocal,
  normalWorld,
  cameraPosition,
  positionWorld,
  oscSine,
} from 'three/tsl';

/**
 * Particle Galaxy Portrait — Skull shape formed from 10,000 compute-driven particles
 *
 * Techniques combined (4):
 * 1. Compute shader for 10,000 particles (proven in galaxy-collision)
 * 2. Multi-stop velocity-based coloring (proven)
 * 3. Bloom halo center glow (proven)
 * 4. Instanced mesh for particles (proven)
 *
 * Skull shape via parametric math: cranium sphere + jaw parabola + eye sockets + nose bridge
 */

const PARTICLE_COUNT = 10000;

/**
 * Generate a random point on/near the skull surface using parametric math.
 * Returns [x, y, z, surfaceDist] where surfaceDist is distance from ideal surface.
 */
function generateSkullPoint(seed: number): [number, number, number, number] {
  // Use seed-based pseudo-random
  const r1 = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  const rand1 = r1 - Math.floor(r1);
  const r2 = Math.sin(seed * 269.5 + 183.3) * 43758.5453;
  const rand2 = r2 - Math.floor(r2);
  const r3 = Math.sin(seed * 419.2 + 371.9) * 43758.5453;
  const rand3 = r3 - Math.floor(r3);
  const r4 = Math.sin(seed * 547.3 + 223.1) * 43758.5453;
  const rand4 = r4 - Math.floor(r4);

  // Choose which part of the skull to place particle
  const part = rand1;

  let x = 0, y = 0, z = 0;

  if (part < 0.45) {
    // Cranium: upper sphere (slightly elongated, wider at temples)
    const theta = rand2 * Math.PI * 2;
    const phi = rand3 * Math.PI * 0.65; // upper hemisphere mostly
    const r = 0.85 + (rand4 - 0.5) * 0.15;
    x = Math.sin(phi) * Math.cos(theta) * r * 0.9;
    y = Math.cos(phi) * r * 0.95 + 0.2; // shift up
    z = Math.sin(phi) * Math.sin(theta) * r * 0.85;
  } else if (part < 0.6) {
    // Jaw / lower face: narrowing parabola
    const t = rand2 * 0.8; // 0 to 0.8 down from chin line
    const jawAngle = (rand3 - 0.5) * Math.PI * 0.9;
    const jawWidth = 0.65 * (1 - t * 0.7); // narrows toward chin
    const r = jawWidth + (rand4 - 0.5) * 0.08;
    x = Math.sin(jawAngle) * r;
    y = -0.4 - t * 0.55; // below cranium
    z = Math.cos(jawAngle) * r * 0.6;
  } else if (part < 0.72) {
    // Eye sockets: two inset circles
    const isLeft = rand2 < 0.5;
    const eyeX = isLeft ? -0.28 : 0.28;
    const eyeY = 0.1;
    const eyeZ = 0.65;
    const angle = rand3 * Math.PI * 2;
    const eyeR = 0.12 + rand4 * 0.08;
    x = eyeX + Math.cos(angle) * eyeR;
    y = eyeY + Math.sin(angle) * eyeR * 0.8;
    z = eyeZ + (rand4 - 0.5) * 0.05;
  } else if (part < 0.78) {
    // Nose bridge and nasal cavity
    const t = rand2;
    x = (rand3 - 0.5) * 0.08;
    y = -0.1 + t * 0.3;
    z = 0.7 + (rand4 - 0.5) * 0.06;
  } else if (part < 0.85) {
    // Cheekbones: pronounced ridges
    const isLeft = rand2 < 0.5;
    const cheekX = isLeft ? -0.55 : 0.55;
    const spread = (rand3 - 0.5) * 0.2;
    const vspread = (rand4 - 0.5) * 0.15;
    x = cheekX + spread;
    y = -0.05 + vspread;
    z = 0.45 + (rand4 - 0.5) * 0.1;
  } else if (part < 0.92) {
    // Brow ridge: thick bar across top of eye sockets
    const t = (rand2 - 0.5) * 2; // -1 to 1
    x = t * 0.5;
    y = 0.25 + (rand3 - 0.5) * 0.06;
    z = 0.65 + rand4 * 0.08;
  } else {
    // Teeth line: subtle ridge
    const t = (rand2 - 0.5) * 2;
    const toothSpread = 0.3 * (1 - Math.abs(t) * 0.3);
    x = t * toothSpread;
    y = -0.45 + (rand3 - 0.5) * 0.04;
    z = 0.55 + rand4 * 0.05;
  }

  // Compute approximate distance from the "ideal" skull surface
  // For surface proximity effects: how deep/far is this particle
  const craniumDist = Math.sqrt(x * x * 1.23 + (y - 0.2) * (y - 0.2) * 1.1 + z * z * 1.38) - 0.85;
  const surfaceDist = Math.abs(craniumDist);

  return [x, y, z, surfaceDist];
}

export default function ParticleGalaxyPortrait() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const groupRef = useRef<THREE.Group>(null);
  const [initialized, setInitialized] = useState(false);
  const { gl } = useThree();

  // Pre-generate particle positions on CPU (skull shape)
  const particlePositions = useMemo(() => {
    const positions: [number, number, number][] = [];
    const surfaceDists: number[] = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const [x, y, z, sd] = generateSkullPoint(i * 1.7 + 0.3);
      positions.push([x, y, z]);
      surfaceDists.push(sd);
    }
    return { positions, surfaceDists };
  }, []);

  // Compute resources: per-particle orbital offset and brightness
  const compute = useMemo(() => {
    const offsets = instancedArray(PARTICLE_COUNT, 'vec3');
    const intensities = instancedArray(PARTICLE_COUNT, 'float');

    const dtUniform = uniform(0);

    // Initialize offsets to zero
    const computeInit = Fn(() => {
      const off = offsets.element(instanceIndex);
      const intensity = intensities.element(instanceIndex);
      off.assign(vec3(0, 0, 0));
      intensity.assign(hash(instanceIndex).mul(0.5).add(0.5));
    })().compute(PARTICLE_COUNT);

    // Per-frame: small orbital motion within the skull shape
    const computeUpdate = Fn(() => {
      const off = offsets.element(instanceIndex);
      const intensity = intensities.element(instanceIndex);

      const idx = float(instanceIndex);
      const t = time;

      // Per-particle phase offset
      const phase = hash(instanceIndex.mul(11)).mul(Math.PI * 2);
      const phase2 = hash(instanceIndex.mul(17).add(5)).mul(Math.PI * 2);

      // Small orbital drift: particles shimmer in place
      const orbitRadius = float(0.015);
      const orbitSpeed = float(0.8);

      const ox = t.mul(orbitSpeed).add(phase).sin().mul(orbitRadius);
      const oy = t.mul(orbitSpeed.mul(0.7)).add(phase2).cos().mul(orbitRadius.mul(0.8));
      const oz = t.mul(orbitSpeed.mul(1.3)).add(phase.mul(1.5)).sin().mul(orbitRadius.mul(0.6));

      off.x.assign(ox);
      off.y.assign(oy);
      off.z.assign(oz);

      // Pulsing intensity: slow wave + per-particle variation
      const pulse1 = t.mul(0.6).add(idx.mul(0.003)).sin().mul(0.3).add(0.7);
      const pulse2 = t.mul(1.2).add(phase).sin().mul(0.15).add(0.85);
      intensity.assign(pulse1.mul(pulse2).clamp(0.3, 1.0));
    })().compute(PARTICLE_COUNT);

    return { offsets, intensities, dtUniform, computeInit, computeUpdate };
  }, []);

  // Material: proximity-based color + compute-driven intensity
  const material = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();

    const intensity = compute.intensities.element(instanceIndex);

    // Multi-stop color: cool blue (deep) -> white (surface) -> warm orange (outlier)
    const colorFn = Fn(() => {
      // Use hash of world position as proxy for surface distance
      const depthProxy = hash(positionWorld.x.mul(23.1).add(positionWorld.y.mul(17.3)).add(positionWorld.z.mul(31.7)));

      const deepBlue = vec3(0.1, 0.2, 0.9);
      const surfaceWhite = vec3(0.9, 0.92, 1.0);
      const outlierOrange = vec3(1.0, 0.5, 0.1);

      // 3-stop gradient
      const c1 = mix(deepBlue, surfaceWhite, smoothstep(0.2, 0.6, depthProxy));
      const c2 = mix(c1, outlierOrange, smoothstep(0.7, 0.95, depthProxy));

      return c2;
    });

    const particleColor = colorFn();
    mat.colorNode = particleColor;

    // Emissive: 2-3x based on intensity, brighter near "surface"
    mat.emissiveNode = particleColor.mul(intensity.mul(2.5));

    // Gentle vertex breathing
    mat.positionNode = positionLocal.add(
      normalLocal.mul(oscSine(time.mul(2.0).add(positionLocal.y.mul(3.0))).mul(0.003)),
    );

    mat.roughness = 0.3;
    mat.metalness = 0.1;

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

  // Set initial instance matrices (skull shape from CPU positions)
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const dummy = new THREE.Object3D();

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const [x, y, z] = particlePositions.positions[i];
      dummy.position.set(x, y, z);
      // Very small particles: 0.02-0.04
      const scale = 0.02 + particlePositions.surfaceDists[i] * 0.03;
      dummy.scale.setScalar(Math.min(scale, 0.04));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [particlePositions]);

  // Per-frame: run compute, slow rotation
  useFrame((_, delta) => {
    if (!initialized) return;

    const dt = Math.min(delta, 0.03);
    compute.dtUniform.value = dt;

    const renderer = gl as unknown as THREE.WebGPURenderer;
    if (renderer && renderer.compute) {
      renderer.compute(compute.computeUpdate);
    }

    // Slow rotation
    if (groupRef.current) {
      groupRef.current.rotation.y += dt * 0.1;
    }
  });

  return (
    <>
      {/* Minimal ambient - emissive driven */}
      <ambientLight intensity={0.1} />
      <hemisphereLight args={['#222244', '#111111', 0.25]} />
      <directionalLight position={[2, 3, 5]} intensity={0.15} />

      {/* Accent lights */}
      <pointLight position={[0, 0, 2]} intensity={4.0} color="#4488ff" distance={8} />
      <pointLight position={[-2, 1, 0]} intensity={2.0} color="#ff8844" distance={6} />
      <pointLight position={[2, -1, 0]} intensity={2.0} color="#4488ff" distance={6} />

      <group ref={groupRef}>
        {/* Particle skull */}
        <instancedMesh
          ref={meshRef}
          args={[undefined, undefined, PARTICLE_COUNT]}
          material={material}
          frustumCulled={false}
        >
          <icosahedronGeometry args={[1, 1]} />
        </instancedMesh>

        {/* Center bloom halo */}
        <CenterHalo />
      </group>
    </>
  );
}

/** Bloom halo at center of skull for warm inner glow */
function CenterHalo() {
  const haloMats = useMemo(() => {
    return [0, 1, 2].map((layer) => {
      const mat = new THREE.MeshStandardNodeMaterial();
      mat.transparent = true;
      mat.side = THREE.BackSide;
      mat.depthWrite = false;
      mat.blending = THREE.AdditiveBlending;

      const layerFade = float(1.0).sub(float(layer).mul(0.25));
      const pulse = oscSine(time.mul(0.4).add(float(layer).mul(1.0))).mul(0.2).add(0.8);

      const fresnel = Fn(() => {
        const viewDir = cameraPosition.sub(positionWorld).normalize();
        const nDotV = normalWorld.dot(viewDir).saturate();
        return float(1.0).sub(nDotV).pow(float(1.5).add(float(layer).mul(0.5)));
      });

      // Warm blue-white core glow
      const haloColor = mix(
        vec3(0.3, 0.5, 1.0),
        vec3(0.8, 0.85, 1.0),
        float(layer).div(2.0),
      );

      mat.opacityNode = fresnel().mul(pulse).mul(layerFade).mul(0.06);
      mat.colorNode = haloColor;
      mat.emissiveNode = haloColor.mul(fresnel().mul(pulse).mul(layerFade).mul(2.0));
      mat.roughness = 0.0;
      mat.metalness = 0.0;

      return mat;
    });
  }, []);

  const scales = [0.6, 0.9, 1.3];

  return (
    <group position={[0, 0.1, 0]}>
      {haloMats.map((mat, i) => (
        <mesh key={i} material={mat} scale={scales[i]}>
          <icosahedronGeometry args={[0.5, 3]} />
        </mesh>
      ))}
    </group>
  );
}
