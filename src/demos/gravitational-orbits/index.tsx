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
} from 'three/tsl';

/**
 * Gravitational Orbits — 5000 particles orbiting 4 moving attractor points via GPU compute
 *
 * Demonstrates WebGPU compute shaders with gravitational forces:
 * - instancedArray storage for positions and velocities
 * - 4 attractor uniforms updated from CPU each frame (orbiting in different planes)
 * - Compute shader calculates gravitational pull from all 4 attractors
 * - Speed-based color gradient: purple -> teal -> gold -> white/pink
 * - Velocity damping and speed limit to prevent explosion
 */

const PARTICLE_COUNT = 5000;

export default function GravitationalOrbits() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const groupRef = useRef<THREE.Group>(null);
  const [initialized, setInitialized] = useState(false);
  const { gl } = useThree();

  // Elapsed time for attractor animation
  const elapsedRef = useRef(0);

  // Compute resources
  const compute = useMemo(() => {
    const positions = instancedArray(PARTICLE_COUNT, 'vec3');
    const velocities = instancedArray(PARTICLE_COUNT, 'vec3');

    const dtUniform = uniform(0);
    const attractor1 = uniform(new THREE.Vector3(2, 0, 0));
    const attractor2 = uniform(new THREE.Vector3(-2, 0, 0));
    const attractor3 = uniform(new THREE.Vector3(0, 0, 2));
    const attractor4 = uniform(new THREE.Vector3(0, 0, -2));

    // Initialize: random positions in a 6-unit sphere, small tangential velocity
    const computeInit = Fn(() => {
      const pos = positions.element(instanceIndex);
      const vel = velocities.element(instanceIndex);

      // Spherical distribution using hash
      const theta = hash(instanceIndex).mul(Math.PI * 2);
      const phi = hash(instanceIndex.add(1)).mul(Math.PI);
      const r = hash(instanceIndex.add(2)).pow(1.0 / 3.0).mul(3.0);

      const sinPhi = phi.sin();
      const cosPhi = phi.cos();
      const sinTheta = theta.sin();
      const cosTheta = theta.cos();

      pos.x.assign(r.mul(sinPhi).mul(cosTheta));
      pos.y.assign(r.mul(sinPhi).mul(sinTheta));
      pos.z.assign(r.mul(cosPhi));

      // Small tangential velocity: cross(position, up) normalized and scaled
      // up = (0, 1, 0), cross(pos, up) = (pos.z, 0, -pos.x)
      const tanX = pos.z;
      const tanZ = pos.x.negate();
      const tanLen = tanX.mul(tanX).add(tanZ.mul(tanZ)).max(0.001).sqrt();
      const tangentScale = float(0.3);
      vel.x.assign(tanX.div(tanLen).mul(tangentScale));
      vel.y.assign(float(0));
      vel.z.assign(tanZ.div(tanLen).mul(tangentScale));
    })().compute(PARTICLE_COUNT);

    // Per-frame gravity update
    const computeUpdate = Fn(() => {
      const pos = positions.element(instanceIndex);
      const vel = velocities.element(instanceIndex);
      const dt = dtUniform;

      const G = float(1.5); // gravitational constant
      const minDist = float(0.3); // clamped minimum distance

      // Accumulate force from all 4 attractors
      const forceX = float(0).toVar();
      const forceY = float(0).toVar();
      const forceZ = float(0).toVar();

      // Helper: compute gravitational force from a single attractor
      // Attractor 1
      const dx1 = attractor1.x.sub(pos.x);
      const dy1 = attractor1.y.sub(pos.y);
      const dz1 = attractor1.z.sub(pos.z);
      const dist1Sq = dx1.mul(dx1).add(dy1.mul(dy1)).add(dz1.mul(dz1));
      const dist1 = dist1Sq.max(minDist.mul(minDist)).sqrt();
      const force1 = G.div(dist1.mul(dist1));
      forceX.addAssign(dx1.div(dist1).mul(force1));
      forceY.addAssign(dy1.div(dist1).mul(force1));
      forceZ.addAssign(dz1.div(dist1).mul(force1));

      // Attractor 2
      const dx2 = attractor2.x.sub(pos.x);
      const dy2 = attractor2.y.sub(pos.y);
      const dz2 = attractor2.z.sub(pos.z);
      const dist2Sq = dx2.mul(dx2).add(dy2.mul(dy2)).add(dz2.mul(dz2));
      const dist2 = dist2Sq.max(minDist.mul(minDist)).sqrt();
      const force2 = G.div(dist2.mul(dist2));
      forceX.addAssign(dx2.div(dist2).mul(force2));
      forceY.addAssign(dy2.div(dist2).mul(force2));
      forceZ.addAssign(dz2.div(dist2).mul(force2));

      // Attractor 3
      const dx3 = attractor3.x.sub(pos.x);
      const dy3 = attractor3.y.sub(pos.y);
      const dz3 = attractor3.z.sub(pos.z);
      const dist3Sq = dx3.mul(dx3).add(dy3.mul(dy3)).add(dz3.mul(dz3));
      const dist3 = dist3Sq.max(minDist.mul(minDist)).sqrt();
      const force3 = G.div(dist3.mul(dist3));
      forceX.addAssign(dx3.div(dist3).mul(force3));
      forceY.addAssign(dy3.div(dist3).mul(force3));
      forceZ.addAssign(dz3.div(dist3).mul(force3));

      // Attractor 4
      const dx4 = attractor4.x.sub(pos.x);
      const dy4 = attractor4.y.sub(pos.y);
      const dz4 = attractor4.z.sub(pos.z);
      const dist4Sq = dx4.mul(dx4).add(dy4.mul(dy4)).add(dz4.mul(dz4));
      const dist4 = dist4Sq.max(minDist.mul(minDist)).sqrt();
      const force4 = G.div(dist4.mul(dist4));
      forceX.addAssign(dx4.div(dist4).mul(force4));
      forceY.addAssign(dy4.div(dist4).mul(force4));
      forceZ.addAssign(dz4.div(dist4).mul(force4));

      // Apply force to velocity
      vel.x.addAssign(forceX.mul(dt));
      vel.y.addAssign(forceY.mul(dt));
      vel.z.addAssign(forceZ.mul(dt));

      // Velocity damping
      vel.x.mulAssign(float(0.999));
      vel.y.mulAssign(float(0.999));
      vel.z.mulAssign(float(0.999));

      // Speed limit: if speed > 8, normalize and scale to 8
      const speed = vel.x.mul(vel.x).add(vel.y.mul(vel.y)).add(vel.z.mul(vel.z)).sqrt();
      If(speed.greaterThan(8.0), () => {
        const scale = float(8.0).div(speed);
        vel.x.mulAssign(scale);
        vel.y.mulAssign(scale);
        vel.z.mulAssign(scale);
      });

      // Update position
      pos.x.addAssign(vel.x.mul(dt));
      pos.y.addAssign(vel.y.mul(dt));
      pos.z.addAssign(vel.z.mul(dt));

      // Recycle particles that escape too far (> 10 units from origin)
      const distFromOrigin = pos.x.mul(pos.x).add(pos.y.mul(pos.y)).add(pos.z.mul(pos.z));
      If(distFromOrigin.greaterThan(100.0), () => {
        const respawnTheta = hash(instanceIndex.add(time.mul(500))).mul(Math.PI * 2);
        const respawnPhi = hash(instanceIndex.add(time.mul(500)).add(1)).mul(Math.PI);
        const respawnR = hash(instanceIndex.add(time.mul(500)).add(2)).mul(2.0).add(1.0);

        const rSinPhi = respawnR.mul(respawnPhi.sin());
        pos.x.assign(rSinPhi.mul(respawnTheta.cos()));
        pos.y.assign(rSinPhi.mul(respawnTheta.sin()));
        pos.z.assign(respawnR.mul(respawnPhi.cos()));

        // Reset velocity to small tangential
        vel.x.assign(pos.z.mul(0.1));
        vel.y.assign(float(0));
        vel.z.assign(pos.x.negate().mul(0.1));
      });
    })().compute(PARTICLE_COUNT);

    return {
      positions,
      velocities,
      dtUniform,
      attractor1,
      attractor2,
      attractor3,
      attractor4,
      computeInit,
      computeUpdate,
    };
  }, []);

  // Material: speed-based color gradient
  const material = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();

    const vel = compute.velocities.element(instanceIndex);
    const speed = vel.length();

    // Color gradient based on speed
    const deepPurple = color(0x4400aa);
    const tealCyan = color(0x00ccbb);
    const yellowGold = color(0xffcc22);
    const hotPink = color(0xffaadd);

    // Slow (< 1): deep purple/blue
    // Medium (1-3): teal/cyan
    // Fast (3-6): yellow/gold
    // Very fast (> 6): hot white/pink
    const t1 = smoothstep(0.0, 1.0, speed);
    const t2 = smoothstep(1.0, 3.0, speed);
    const t3 = smoothstep(3.0, 6.0, speed);

    const c1 = mix(deepPurple, tealCyan, t1);
    const c2 = mix(c1, yellowGold, t2);
    const fullColor = mix(c2, hotPink, t3);

    mat.colorNode = fullColor;

    // Strong emissive for glow effect
    mat.emissiveNode = fullColor.mul(float(2.0).add(speed.mul(0.3)));

    // Subtle vertex effect
    mat.positionNode = positionLocal.add(
      normalLocal.mul(speed.mul(0.002)),
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

  // Set initial instance matrices from CPU
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const dummy = new THREE.Object3D();
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      // Random positions in a sphere for initial placement
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      const r = Math.cbrt(Math.random()) * 3.0;

      dummy.position.set(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.sin(phi) * Math.sin(theta),
        r * Math.cos(phi),
      );
      dummy.scale.setScalar(0.03);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, []);

  // Per-frame: update attractor positions and run compute
  useFrame((_, delta) => {
    if (!initialized) return;

    const dt = Math.min(delta, 0.03);
    elapsedRef.current += dt;
    const t = elapsedRef.current;

    // Attractor 1: orbits in XY plane, radius 2.5, speed 0.7
    compute.attractor1.value.set(
      Math.cos(t * 0.7) * 2.5,
      Math.sin(t * 0.7) * 2.5,
      0,
    );

    // Attractor 2: orbits in XY plane (opposite), radius 2.0, speed 0.9
    compute.attractor2.value.set(
      Math.cos(t * 0.9 + Math.PI) * 2.0,
      Math.sin(t * 0.9 + Math.PI) * 2.0,
      0,
    );

    // Attractor 3: orbits in XZ plane, radius 2.2, speed 0.6
    compute.attractor3.value.set(
      Math.cos(t * 0.6) * 2.2,
      0,
      Math.sin(t * 0.6) * 2.2,
    );

    // Attractor 4: orbits in XZ plane (opposite), radius 1.8, speed 1.1
    compute.attractor4.value.set(
      Math.cos(t * 1.1 + Math.PI) * 1.8,
      0,
      Math.sin(t * 1.1 + Math.PI) * 1.8,
    );

    compute.dtUniform.value = dt;

    const renderer = gl as unknown as THREE.WebGPURenderer;
    if (renderer && renderer.compute) {
      renderer.compute(compute.computeUpdate);
    }

    // Gentle scene rotation
    if (groupRef.current) {
      groupRef.current.rotation.y += dt * 0.05;
    }
  });

  return (
    <>
      {/* Background atmosphere */}
      <mesh>
        <sphereGeometry args={[30, 16, 16]} />
        <meshBasicMaterial side={THREE.BackSide} color="#020408" />
      </mesh>
      <ambientLight intensity={0.15} />
      <hemisphereLight args={['#222244', '#111111', 0.25]} />
      <directionalLight position={[5, 8, 5]} intensity={0.4} />
      <pointLight position={[0, 3, 0]} intensity={4} color="#4400aa" distance={12} />

      <group ref={groupRef}>
        <instancedMesh
          ref={meshRef}
          args={[undefined, undefined, PARTICLE_COUNT]}
          material={material}
          frustumCulled={false}
        >
          <icosahedronGeometry args={[1, 0]} />
        </instancedMesh>
      </group>
    </>
  );
}
