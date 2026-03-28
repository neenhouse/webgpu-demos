import { useRef, useMemo, useState, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
  Fn,
  If,
  Loop,
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
  positionLocal,
  normalLocal,
  oscSine,
} from 'three/tsl';

/**
 * Boids Murmuration -- 10,000 bird-like particles flocking via GPU compute
 *
 * Compute flocking rules (simplified: each boid samples ~8 random neighbors):
 * - Separation: steer away from too-close neighbors (distance < 0.5)
 * - Alignment: steer toward average velocity of nearby neighbors
 * - Cohesion: steer toward center of mass of nearby neighbors
 * - Bounds: soft steering back toward origin when distance > 8
 * - Speed limits: clamp velocity magnitude between 1.0 and 4.0
 *
 * Visual: InstancedMesh with icosahedronGeometry, speed-based color gradient
 * (slow=deep blue, medium=teal, fast=white), emissive glow, subtle group rotation.
 */

const BOID_COUNT = 10000;
const NEIGHBOR_SAMPLES = 8;

export default function BoidsMurmuration() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const groupRef = useRef<THREE.Group>(null);
  const [initialized, setInitialized] = useState(false);
  const { gl } = useThree();

  const compute = useMemo(() => {
    const positions = instancedArray(BOID_COUNT, 'vec3');
    const velocities = instancedArray(BOID_COUNT, 'vec3');

    const dtUniform = uniform(0);

    // ── Init: random positions in 10-unit cube, random velocities ──
    const computeInit = Fn(() => {
      const pos = positions.element(instanceIndex);
      const vel = velocities.element(instanceIndex);

      // Random position in [-5, 5] cube
      pos.x.assign(hash(instanceIndex).sub(0.5).mul(10.0));
      pos.y.assign(hash(instanceIndex.add(1)).sub(0.5).mul(10.0));
      pos.z.assign(hash(instanceIndex.add(2)).sub(0.5).mul(10.0));

      // Random velocity
      vel.x.assign(hash(instanceIndex.add(3)).sub(0.5).mul(4.0));
      vel.y.assign(hash(instanceIndex.add(4)).sub(0.5).mul(4.0));
      vel.z.assign(hash(instanceIndex.add(5)).sub(0.5).mul(4.0));
    })().compute(BOID_COUNT);

    // ── Per-frame flocking update ──
    const computeUpdate = Fn(() => {
      const pos = positions.element(instanceIndex);
      const vel = velocities.element(instanceIndex);
      const dt = dtUniform;

      // Accumulators for flocking forces
      const sepForce = vec3(0, 0, 0).toVar();
      const alignSum = vec3(0, 0, 0).toVar();
      const cohesionSum = vec3(0, 0, 0).toVar();
      const neighborCount = float(0).toVar();

      // Sample ~8 random neighbors using hash
      Loop(NEIGHBOR_SAMPLES, ({ i }) => {
        // Pick random neighbor index using hash of (instanceIndex + time + offset)
        const neighborHashSeed = instanceIndex.mul(17).add(time.mul(100.0)).add(float(i).mul(31.0));
        const neighborIdxF = hash(neighborHashSeed).mul(float(BOID_COUNT));
        const neighborIdx = int(neighborIdxF.min(float(BOID_COUNT - 1)));

        const nPos = positions.element(neighborIdx);
        const nVel = velocities.element(neighborIdx);

        const dx = nPos.x.sub(pos.x);
        const dy = nPos.y.sub(pos.y);
        const dz = nPos.z.sub(pos.z);
        const distSq = dx.mul(dx).add(dy.mul(dy)).add(dz.mul(dz));
        const dist = distSq.max(0.001).sqrt();

        // Only consider neighbors within radius 3.0
        If(dist.lessThan(3.0), () => {
          neighborCount.addAssign(1.0);

          // Separation: push away from very close neighbors (dist < 0.5)
          If(dist.lessThan(0.5), () => {
            const repelStrength = float(1.0).div(dist.max(0.05));
            sepForce.x.addAssign(dx.negate().mul(repelStrength));
            sepForce.y.addAssign(dy.negate().mul(repelStrength));
            sepForce.z.addAssign(dz.negate().mul(repelStrength));
          });

          // Alignment: accumulate neighbor velocities
          alignSum.x.addAssign(nVel.x);
          alignSum.y.addAssign(nVel.y);
          alignSum.z.addAssign(nVel.z);

          // Cohesion: accumulate neighbor positions
          cohesionSum.x.addAssign(nPos.x);
          cohesionSum.y.addAssign(nPos.y);
          cohesionSum.z.addAssign(nPos.z);
        });
      });

      // Apply flocking forces
      const separationWeight = float(2.0);
      const alignmentWeight = float(0.5);
      const cohesionWeight = float(0.3);

      // Separation
      vel.x.addAssign(sepForce.x.mul(separationWeight).mul(dt));
      vel.y.addAssign(sepForce.y.mul(separationWeight).mul(dt));
      vel.z.addAssign(sepForce.z.mul(separationWeight).mul(dt));

      // Alignment and Cohesion (only if we found neighbors)
      If(neighborCount.greaterThan(0.5), () => {
        // Average neighbor velocity
        const avgVelX = alignSum.x.div(neighborCount);
        const avgVelY = alignSum.y.div(neighborCount);
        const avgVelZ = alignSum.z.div(neighborCount);

        vel.x.addAssign(avgVelX.sub(vel.x).mul(alignmentWeight).mul(dt));
        vel.y.addAssign(avgVelY.sub(vel.y).mul(alignmentWeight).mul(dt));
        vel.z.addAssign(avgVelZ.sub(vel.z).mul(alignmentWeight).mul(dt));

        // Center of mass steering
        const comX = cohesionSum.x.div(neighborCount);
        const comY = cohesionSum.y.div(neighborCount);
        const comZ = cohesionSum.z.div(neighborCount);

        vel.x.addAssign(comX.sub(pos.x).mul(cohesionWeight).mul(dt));
        vel.y.addAssign(comY.sub(pos.y).mul(cohesionWeight).mul(dt));
        vel.z.addAssign(comZ.sub(pos.z).mul(cohesionWeight).mul(dt));
      });

      // Bounds: soft steering back toward origin when distance > 8
      const distFromOrigin = pos.x.mul(pos.x).add(pos.y.mul(pos.y)).add(pos.z.mul(pos.z)).sqrt();
      const boundsStrength = smoothstep(8.0, 12.0, distFromOrigin).mul(2.0);
      vel.x.subAssign(pos.x.div(distFromOrigin.max(0.1)).mul(boundsStrength).mul(dt));
      vel.y.subAssign(pos.y.div(distFromOrigin.max(0.1)).mul(boundsStrength).mul(dt));
      vel.z.subAssign(pos.z.div(distFromOrigin.max(0.1)).mul(boundsStrength).mul(dt));

      // Speed limits: clamp velocity magnitude between 1.0 and 4.0
      const speed = vel.x.mul(vel.x).add(vel.y.mul(vel.y)).add(vel.z.mul(vel.z)).sqrt();

      // Clamp min speed
      If(speed.lessThan(1.0), () => {
        const scale = float(1.0).div(speed.max(0.01));
        vel.x.mulAssign(scale);
        vel.y.mulAssign(scale);
        vel.z.mulAssign(scale);
      });

      // Clamp max speed
      If(speed.greaterThan(4.0), () => {
        const scale = float(4.0).div(speed);
        vel.x.mulAssign(scale);
        vel.y.mulAssign(scale);
        vel.z.mulAssign(scale);
      });

      // Integrate position
      pos.x.addAssign(vel.x.mul(dt));
      pos.y.addAssign(vel.y.mul(dt));
      pos.z.addAssign(vel.z.mul(dt));
    })().compute(BOID_COUNT);

    return { positions, velocities, dtUniform, computeInit, computeUpdate };
  }, []);

  // Material: speed-based color gradient (slow=deep blue, medium=teal, fast=white)
  const material = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();

    const vel = compute.velocities.element(instanceIndex);
    const speed = vel.length();
    const speedNorm = smoothstep(1.0, 4.0, speed);

    const slowColor = color(0x1122aa); // deep blue
    const midColor = color(0x22ccbb); // teal
    const fastColor = color(0xeeffff); // near white

    const lowerMix = mix(slowColor, midColor, smoothstep(0.0, 0.5, speedNorm));
    const fullColor = mix(lowerMix, fastColor, smoothstep(0.4, 1.0, speedNorm));
    mat.colorNode = fullColor;

    // Emissive glow
    mat.emissiveNode = fullColor.mul(float(1.2).add(speedNorm.mul(1.8)));

    // Gentle vertex breathing
    mat.positionNode = positionLocal.add(
      normalLocal.mul(oscSine(time.mul(2.5).add(positionLocal.y.mul(3.0))).mul(0.005)),
    );

    mat.roughness = 0.3;
    mat.metalness = 0.15;

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
    for (let i = 0; i < BOID_COUNT; i++) {
      // Random initial positions in a 10-unit cube (matches compute init)
      dummy.position.set(
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 10,
      );
      dummy.scale.setScalar(0.04 + Math.random() * 0.03);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, []);

  // Per-frame compute and subtle group rotation
  useFrame((_, delta) => {
    if (!initialized) return;
    const renderer = gl as unknown as THREE.WebGPURenderer;
    if (renderer && renderer.compute) {
      compute.dtUniform.value = Math.min(delta, 0.05);
      renderer.compute(compute.computeUpdate);
    }
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.05;
    }
  });

  return (
    <>
      <ambientLight intensity={0.1} />
      <directionalLight position={[5, 8, 5]} intensity={0.3} />
      <pointLight position={[0, 0, 0]} intensity={5.0} color="#6644ff" distance={15} />
      <pointLight position={[4, 3, 4]} intensity={3.0} color="#22ccbb" distance={12} />
      <pointLight position={[-4, -2, -3]} intensity={3.0} color="#1144cc" distance={12} />

      <group ref={groupRef}>
        <instancedMesh
          ref={meshRef}
          args={[undefined, undefined, BOID_COUNT]}
          material={material}
          frustumCulled={false}
        >
          <icosahedronGeometry args={[1, 0]} />
        </instancedMesh>
      </group>
    </>
  );
}
