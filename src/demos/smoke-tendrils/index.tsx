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
  vec3,
  hash,
  time,
  color,
  mix,
  smoothstep,
} from 'three/tsl';

/**
 * Smoke Tendrils — 6000 wispy smoke particles rising and curling via GPU compute
 *
 * Demonstrates compute-driven curl-noise-like turbulence:
 * - instancedArray storage for positions, velocities, lifetimes
 * - Upward buoyancy with sin/cos swirling turbulence forces
 * - Lifetime-based color fade from bright white to dark grey
 * - Additive blending for ethereal smoke look
 */

const PARTICLE_COUNT = 6000;

export default function SmokeTendrils() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const [initialized, setInitialized] = useState(false);
  const { gl } = useThree();

  const compute = useMemo(() => {
    const positions = instancedArray(PARTICLE_COUNT, 'vec3');
    const velocities = instancedArray(PARTICLE_COUNT, 'vec3');
    const lifetimes = instancedArray(PARTICLE_COUNT, 'float');

    const dtUniform = uniform(0);

    // Init compute: cluster near y=-2, spread in XZ
    const computeInit = Fn(() => {
      const pos = positions.element(instanceIndex);
      const vel = velocities.element(instanceIndex);
      const life = lifetimes.element(instanceIndex);

      // Random angle and radius for XZ spread
      const angle = hash(instanceIndex).mul(Math.PI * 2);
      const radius = hash(instanceIndex.add(1)).mul(2.0);

      pos.x.assign(angle.cos().mul(radius));
      pos.y.assign(float(-2.0).add(hash(instanceIndex.add(5)).mul(0.5)));
      pos.z.assign(angle.sin().mul(radius));

      // Gentle upward velocity with slight XZ drift
      vel.x.assign(hash(instanceIndex.add(2)).sub(0.5).mul(0.3));
      vel.y.assign(hash(instanceIndex.add(3)).mul(1.0).add(0.5));
      vel.z.assign(hash(instanceIndex.add(4)).sub(0.5).mul(0.3));

      // Random lifetime 3-8 seconds
      life.assign(hash(instanceIndex.add(6)).mul(5.0).add(3.0));
    })().compute(PARTICLE_COUNT);

    // Update compute: buoyancy, curl-noise turbulence, damping, respawn
    const computeUpdate = Fn(() => {
      const pos = positions.element(instanceIndex);
      const vel = velocities.element(instanceIndex);
      const life = lifetimes.element(instanceIndex);

      const dt = dtUniform;

      // Upward buoyancy
      vel.y.addAssign(float(0.8).mul(dt));

      // Curl-noise-like turbulence using sin/cos of position
      const turbX = pos.y.mul(2.0).add(time.mul(0.5)).sin()
        .mul(pos.z.mul(1.5).add(time.mul(0.3)).cos())
        .mul(1.5);
      const turbZ = pos.y.mul(1.8).add(time.mul(0.4)).cos()
        .mul(pos.x.mul(1.7).add(time.mul(0.6)).sin())
        .mul(1.5);
      const turbY = pos.x.mul(1.3).add(pos.z.mul(1.1)).add(time.mul(0.2)).sin()
        .mul(0.3);

      vel.x.addAssign(turbX.mul(dt));
      vel.y.addAssign(turbY.mul(dt));
      vel.z.addAssign(turbZ.mul(dt));

      // Damping
      vel.mulAssign(vec3(0.98, 0.98, 0.98));

      // Position update
      pos.addAssign(vel.mul(dt));

      // Lifetime decrease
      life.subAssign(dt);

      // Respawn when life < 0
      If(life.lessThan(0), () => {
        const angle = hash(instanceIndex.add(time.mul(1000))).mul(Math.PI * 2);
        const radius = hash(instanceIndex.add(time.mul(1000)).add(1)).mul(2.0);

        pos.x.assign(angle.cos().mul(radius));
        pos.y.assign(float(-2.0).add(hash(instanceIndex.add(time.mul(1000)).add(5)).mul(0.5)));
        pos.z.assign(angle.sin().mul(radius));

        vel.x.assign(hash(instanceIndex.add(time.mul(1000)).add(2)).sub(0.5).mul(0.3));
        vel.y.assign(hash(instanceIndex.add(time.mul(1000)).add(3)).mul(1.0).add(0.5));
        vel.z.assign(hash(instanceIndex.add(time.mul(1000)).add(4)).sub(0.5).mul(0.3));

        life.assign(hash(instanceIndex.add(time.mul(1000)).add(6)).mul(5.0).add(3.0));
      });
    })().compute(PARTICLE_COUNT);

    return { positions, velocities, lifetimes, dtUniform, computeInit, computeUpdate };
  }, []);

  // Material: lifetime-based color and opacity
  const material = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.transparent = true;
    mat.depthWrite = false;
    mat.blending = THREE.AdditiveBlending;

    const life = compute.lifetimes.element(instanceIndex);

    // Normalize lifetime: max is ~8, use smoothstep for ranges
    const lifeNorm = smoothstep(0.0, 8.0, life);

    // Color based on lifetime
    const youngColor = color(0xffffff);  // bright white
    const midColor = color(0xccaa88);    // warm grey/orange tint
    const oldColor = color(0x444444);    // dark grey

    const lowerMix = mix(oldColor, midColor, smoothstep(0.0, 0.4, lifeNorm));
    const fullColor = mix(lowerMix, youngColor, smoothstep(0.3, 0.8, lifeNorm));

    mat.colorNode = fullColor;

    // Emissive: strong for young, fading for old
    const youngEmissive = color(0xdddddd);
    const midEmissive = color(0x886644);
    const oldEmissive = color(0x222222);

    const emLower = mix(oldEmissive, midEmissive, smoothstep(0.0, 0.4, lifeNorm));
    const emFull = mix(emLower, youngEmissive, smoothstep(0.3, 0.8, lifeNorm));
    mat.emissiveNode = emFull;

    // Opacity fades near death
    mat.opacityNode = smoothstep(0.0, 1.5, life).mul(0.7);

    mat.roughness = 0.8;
    mat.metalness = 0.0;

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

  // Build initial instance matrices
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const dummy = new THREE.Object3D();
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const t = i / PARTICLE_COUNT;
      const angle = t * Math.PI * 12;
      const radius = Math.random() * 2.0;

      dummy.position.set(
        Math.cos(angle) * radius,
        -2.0 + t * 6.0 + (Math.random() - 0.5) * 0.5,
        Math.sin(angle) * radius,
      );
      dummy.scale.setScalar(0.06);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, []);

  // Run compute update each frame
  useFrame((_, delta) => {
    if (!initialized) return;
    const renderer = gl as unknown as THREE.WebGPURenderer;
    if (renderer && renderer.compute) {
      compute.dtUniform.value = Math.min(delta, 0.05);
      renderer.compute(compute.computeUpdate);
    }
  });

  return (
    <>
      <color attach="background" args={['#0a0a0a']} />
      <ambientLight intensity={0.05} />

      <instancedMesh
        ref={meshRef}
        args={[undefined, undefined, PARTICLE_COUNT]}
        material={material}
        frustumCulled={false}
      >
        <icosahedronGeometry args={[1, 1]} />
      </instancedMesh>
    </>
  );
}
