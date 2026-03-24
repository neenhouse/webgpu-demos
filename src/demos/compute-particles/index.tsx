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
  hash,
  time,
  color,
  mix,
  smoothstep,
  positionLocal,
  normalLocal,
  oscSine,
} from 'three/tsl';

/**
 * Compute Particles — GPU-driven particle fountain via compute shaders
 *
 * Demonstrates WebGPU compute shaders:
 * - instancedArray storage buffers for positions, velocities, lifetimes
 * - Fn() compute shader for GPU-side particle physics (gravity, respawn)
 * - If() conditional logic inside compute shader context
 * - renderer.compute() called each frame from useFrame
 * - InstancedMesh visualization of computed positions
 * - Speed-based color gradient: slow=cyan, medium=yellow, fast=hot orange
 */

const PARTICLE_COUNT = 8000;

export default function ComputeParticles() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const groupRef = useRef<THREE.Group>(null);
  const [initialized, setInitialized] = useState(false);
  const { gl } = useThree();

  // Create all compute resources in useMemo
  const compute = useMemo(() => {
    const positions = instancedArray(PARTICLE_COUNT, 'vec3');
    const velocities = instancedArray(PARTICLE_COUNT, 'vec3');
    const lifetimes = instancedArray(PARTICLE_COUNT, 'float');

    const dtUniform = uniform(0);
    const gravityUniform = uniform(-3.5);
    const emitterPos = uniform(new THREE.Vector3(0, -0.5, 0));

    const computeInit = Fn(() => {
      const pos = positions.element(instanceIndex);
      const vel = velocities.element(instanceIndex);
      const life = lifetimes.element(instanceIndex);

      pos.assign(emitterPos);

      const angle = hash(instanceIndex).mul(Math.PI * 2);
      const speed = hash(instanceIndex.add(1)).mul(3.0).add(2.0);
      const spread = hash(instanceIndex.add(3)).mul(0.5).add(0.2);

      vel.x.assign(angle.cos().mul(spread).mul(speed).mul(0.35));
      vel.y.assign(speed);
      vel.z.assign(angle.sin().mul(spread).mul(speed).mul(0.35));

      life.assign(hash(instanceIndex.add(2)).mul(2.5).add(0.3));
    })().compute(PARTICLE_COUNT);

    const computeUpdate = Fn(() => {
      const pos = positions.element(instanceIndex);
      const vel = velocities.element(instanceIndex);
      const life = lifetimes.element(instanceIndex);

      vel.y.addAssign(gravityUniform.mul(dtUniform));
      vel.x.mulAssign(float(1.0).sub(dtUniform.mul(0.2)));
      vel.z.mulAssign(float(1.0).sub(dtUniform.mul(0.2)));

      pos.addAssign(vel.mul(dtUniform));
      life.subAssign(dtUniform);

      If(life.lessThan(0), () => {
        pos.assign(emitterPos);
        const angle = hash(instanceIndex.add(time.mul(1000))).mul(Math.PI * 2);
        const speed = hash(instanceIndex.add(time.mul(1000)).add(1)).mul(3.0).add(2.0);
        const spread = hash(instanceIndex.add(time.mul(1000)).add(3)).mul(0.5).add(0.2);

        vel.x.assign(angle.cos().mul(spread).mul(speed).mul(0.35));
        vel.y.assign(speed);
        vel.z.assign(angle.sin().mul(spread).mul(speed).mul(0.35));

        life.assign(hash(instanceIndex.add(time.mul(1000)).add(2)).mul(2.5).add(0.3));
      });
    })().compute(PARTICLE_COUNT);

    return { positions, velocities, lifetimes, dtUniform, computeInit, computeUpdate };
  }, []);

  // Material: reads compute buffers for color, uses standard vertex positioning
  const material = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();

    // Speed-based color from compute velocity buffer
    const vel = compute.velocities.element(instanceIndex);
    const speed = vel.length();
    const speedNorm = smoothstep(0.5, 5.0, speed);

    const coolColor = color(0x00ccff);
    const midColor = color(0xffee44);
    const hotColor = color(0xff4400);

    const lowerMix = mix(coolColor, midColor, smoothstep(0.0, 0.5, speedNorm));
    const fullColor = mix(lowerMix, hotColor, smoothstep(0.4, 1.0, speedNorm));
    mat.colorNode = fullColor;

    // Lifetime-based emissive
    const life = compute.lifetimes.element(instanceIndex);
    const lifeFade = smoothstep(0.0, 0.5, life);
    mat.emissiveNode = fullColor.mul(lifeFade.mul(2.5));

    // Gentle vertex breathing
    mat.positionNode = positionLocal.add(
      normalLocal.mul(oscSine(time.mul(3.0).add(positionLocal.y.mul(4.0))).mul(0.01))
    );

    mat.roughness = 0.3;
    mat.metalness = 0.2;

    return mat;
  }, [compute]);

  // Initialize compute and set instance matrices from CPU (initial positions)
  useEffect(() => {
    const renderer = gl as unknown as THREE.WebGPURenderer;
    if (renderer && renderer.computeAsync) {
      renderer.computeAsync(compute.computeInit).then(() => {
        setInitialized(true);
      });
    }
  }, [gl, compute]);

  // Build initial instance matrices (fountain shape, will be updated by compute)
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const dummy = new THREE.Object3D();
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const t = i / PARTICLE_COUNT;
      const angle = t * Math.PI * 16;
      const radius = 0.1 + t * 1.8;
      const height = (t - 0.5) * 4.0 + (Math.random() - 0.5) * 0.6;
      const scatter = t * 0.3;

      dummy.position.set(
        Math.cos(angle) * radius + (Math.random() - 0.5) * scatter,
        height,
        Math.sin(angle) * radius + (Math.random() - 0.5) * scatter,
      );
      dummy.scale.setScalar(0.04 + Math.random() * 0.04);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, []);

  // Run compute update each frame and update instance positions from compute buffer
  useFrame((_, delta) => {
    if (!initialized) return;
    const renderer = gl as unknown as THREE.WebGPURenderer;
    if (renderer && renderer.compute) {
      compute.dtUniform.value = Math.min(delta, 0.05);
      renderer.compute(compute.computeUpdate);
    }
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.1;
    }
  });

  return (
    <>
      <ambientLight intensity={0.15} />
      <directionalLight position={[3, 5, 3]} intensity={0.5} />
      <pointLight position={[0, 3, 0]} intensity={6.0} color="#ffaa44" distance={12} />
      <pointLight position={[0, -1, 0]} intensity={4.0} color="#ff6622" distance={8} />
      <pointLight position={[2, 1, 2]} intensity={3.0} color="#00ccff" distance={10} />
      <pointLight position={[-2, 1, -2]} intensity={3.0} color="#00ccff" distance={10} />

      <group ref={groupRef}>
        <instancedMesh
          ref={meshRef}
          args={[undefined, undefined, PARTICLE_COUNT]}
          material={material}
          frustumCulled={false}
        >
          <icosahedronGeometry args={[1, 1]} />
        </instancedMesh>
      </group>
    </>
  );
}
