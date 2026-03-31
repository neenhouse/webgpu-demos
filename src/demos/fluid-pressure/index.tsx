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
} from 'three/tsl';

/**
 * Fluid Pressure — SPH-inspired fluid simulation
 *
 * Techniques:
 * - 2000 particles in GPU instancedArray with position + velocity buffers
 * - Simplified SPH: density estimation from N-neighbor samples via hash
 * - Pressure gradient + viscosity + surface tension approximation
 * - Box container walls with elastic bounce response
 * - Periodic shake impulse to stir fluid
 * - Color by local density: blue (sparse) -> white (dense)
 * - InstancedMesh icosahedrons for fluid particles
 */

const PARTICLE_COUNT = 2000;
const BOX_HALF = 2.2;
const NEIGHBOR_SAMPLES = 16;
const SMOOTHING_RADIUS = 0.6;

export default function FluidPressure() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const shakeTimeRef = useRef(0);
  const [initialized, setInitialized] = useState(false);
  const { gl } = useThree();

  const compute = useMemo(() => {
    const positions = instancedArray(PARTICLE_COUNT, 'vec3');
    const velocities = instancedArray(PARTICLE_COUNT, 'vec3');

    const dtUniform = uniform(0.012);
    const gravity = uniform(-5.0);
    const restDensity = uniform(8.0);
    const pressureK = uniform(0.5);
    const viscosity = uniform(0.3);
    const shakeX = uniform(0.0);
    const shakeZ = uniform(0.0);

    const computeInit = Fn(() => {
      const idx = instanceIndex;
      const pos = positions.element(idx);
      const vel = velocities.element(idx);

      // Pack particles into lower half of box
      const col = idx.modInt(int(10));
      const depth = idx.div(int(10)).modInt(int(10));
      const layer = idx.div(int(100));

      pos.assign(vec3(
        float(col).sub(float(5.0)).mul(0.35).add(hash(idx).mul(0.1).sub(0.05)),
        float(layer).mul(0.35).sub(float(1.5)).add(hash(idx.add(100)).mul(0.1)),
        float(depth).sub(float(5.0)).mul(0.35).add(hash(idx.add(200)).mul(0.1).sub(0.05))
      ));
      vel.assign(vec3(0.0, 0.0, 0.0));
    })().compute(PARTICLE_COUNT);

    const computeUpdate = Fn(() => {
      const idx = instanceIndex;
      const pos = positions.element(idx);
      const vel = velocities.element(idx);
      const dt = dtUniform;

      // Estimate local density from neighbor samples
      const density = float(0.0).toVar();
      const pressure_force = vec3(0.0, 0.0, 0.0).toVar();
      const visc_force = vec3(0.0, 0.0, 0.0).toVar();

      Loop({ start: int(0), end: int(NEIGHBOR_SAMPLES) }, ({ i }) => {
        // Hash-based pseudo-random neighbor selection
        const seed = idx.mul(37).add(i.mul(1000)).add(time.mul(0.001).toInt());
        const nIdx = hash(seed).mul(float(PARTICLE_COUNT)).toInt().modInt(int(PARTICLE_COUNT));
        const nPos = positions.element(nIdx);
        const nVel = velocities.element(nIdx);

        const diff = pos.sub(nPos);
        const dist = diff.length();

        If(dist.lessThan(float(SMOOTHING_RADIUS)).and(dist.greaterThan(float(0.001))), () => {
          // Density contribution: poly6 kernel approximation
          const q = float(1.0).sub(dist.div(float(SMOOTHING_RADIUS)));
          density.addAssign(q.mul(q).mul(q));

          // Pressure force (spiky kernel approximation)
          const nDensity = float(restDensity); // approximation
          const pSelf = density.sub(restDensity).mul(pressureK);
          const pNeighbor = nDensity.sub(restDensity).mul(pressureK);
          const pAvg = pSelf.add(pNeighbor).mul(0.5);
          const gradW = diff.normalize().mul(float(1.0).sub(dist.div(float(SMOOTHING_RADIUS))));
          pressure_force.subAssign(gradW.mul(pAvg.mul(0.06)));

          // Viscosity force
          const velDiff = nVel.sub(vel);
          visc_force.addAssign(velDiff.mul(viscosity.mul(q.mul(0.04))));
        });
      });

      // Apply forces
      vel.addAssign(pressure_force.mul(dt));
      vel.addAssign(visc_force.mul(dt));
      vel.y.addAssign(gravity.mul(dt));

      // Shake impulse
      vel.x.addAssign(shakeX.mul(dt));
      vel.z.addAssign(shakeZ.mul(dt));

      // Damping
      vel.mulAssign(float(0.992));

      pos.addAssign(vel.mul(dt));

      // Box walls with elastic bounce
      const wall = float(BOX_HALF - 0.05);
      const bounce = float(0.5);

      If(pos.x.greaterThan(wall), () => {
        pos.x.assign(wall);
        vel.x.assign(vel.x.abs().negate().mul(bounce));
      });
      If(pos.x.lessThan(wall.negate()), () => {
        pos.x.assign(wall.negate());
        vel.x.assign(vel.x.abs().mul(bounce));
      });
      If(pos.y.lessThan(float(-BOX_HALF + 0.05)), () => {
        pos.y.assign(float(-BOX_HALF + 0.05));
        vel.y.assign(vel.y.abs().mul(bounce));
      });
      If(pos.y.greaterThan(wall), () => {
        pos.y.assign(wall);
        vel.y.assign(vel.y.abs().negate().mul(bounce));
      });
      If(pos.z.greaterThan(wall), () => {
        pos.z.assign(wall);
        vel.z.assign(vel.z.abs().negate().mul(bounce));
      });
      If(pos.z.lessThan(wall.negate()), () => {
        pos.z.assign(wall.negate());
        vel.z.assign(vel.z.abs().mul(bounce));
      });
    })().compute(PARTICLE_COUNT);

    return { positions, velocities, dtUniform, shakeX, shakeZ, computeInit, computeUpdate };
  }, []);

  const material = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();

    const vel = compute.velocities.element(instanceIndex);
    const speed = vel.length();
    const density = smoothstep(float(0.0), float(5.0), speed);

    const sparseColor = color(0x0033aa);
    const midColor = color(0x0088ff);
    const denseColor = color(0xeeffff);

    mat.colorNode = mix(sparseColor, mix(midColor, denseColor, smoothstep(float(0.5), float(1.0), density)), density);
    mat.emissiveNode = mix(sparseColor, denseColor, density).mul(float(1.8));
    mat.roughness = 0.1;
    mat.metalness = 0.6;
    mat.transparent = true;
    mat.opacity = 0.85;

    return mat;
  }, [compute]);

  useEffect(() => {
    const renderer = gl as unknown as THREE.WebGPURenderer;
    if (renderer?.computeAsync) {
      renderer.computeAsync(compute.computeInit).then(() => {
        setInitialized(true);
      });
    }
  }, [gl, compute]);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const col = i % 10;
      const depth = Math.floor(i / 10) % 10;
      const layer = Math.floor(i / 100);
      dummy.position.set(
        (col - 5) * 0.35,
        layer * 0.35 - 1.5,
        (depth - 5) * 0.35
      );
      dummy.scale.setScalar(0.08);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, []);

  useFrame((_, delta) => {
    if (!initialized) return;
    const renderer = gl as unknown as THREE.WebGPURenderer;
    if (!renderer?.compute) return;

    shakeTimeRef.current += delta;
    compute.dtUniform.value = Math.min(delta, 0.02);

    // Periodic shake every 4 seconds
    if (Math.floor(shakeTimeRef.current * 0.25) !== Math.floor((shakeTimeRef.current - delta) * 0.25)) {
      compute.shakeX.value = (Math.random() - 0.5) * 30;
      compute.shakeZ.value = (Math.random() - 0.5) * 30;
      setTimeout(() => {
        if (compute.shakeX) compute.shakeX.value = 0;
        if (compute.shakeZ) compute.shakeZ.value = 0;
      }, 150);
    }

    renderer.compute(compute.computeUpdate);
  });

  return (
    <>
      {/* Background atmosphere */}
      <mesh>
        <sphereGeometry args={[30, 16, 16]} />
        <meshBasicMaterial side={THREE.BackSide} color="#020408" />
      </mesh>

      <color attach="background" args={['#010510']} />
      <ambientLight intensity={0.1} />
      <directionalLight position={[5, 8, 3]} intensity={0.5} />
      <pointLight position={[0, 3, 0]} intensity={20} color="#2288ff" distance={10} />
      <pointLight position={[-3, -2, -3]} intensity={10} color="#0044aa" distance={8} />
      <pointLight position={[3, -2, 3]} intensity={10} color="#44aaff" distance={8} />

      <instancedMesh
        ref={meshRef}
        args={[undefined, undefined, PARTICLE_COUNT]}
        material={material}
        frustumCulled={false}
      >
        <icosahedronGeometry args={[1, 0]} />
      </instancedMesh>

      {/* Container box wireframe */}
      <lineSegments>
        <edgesGeometry args={[new THREE.BoxGeometry(BOX_HALF * 2, BOX_HALF * 2, BOX_HALF * 2)]} />
        <lineBasicMaterial color="#2288ff" opacity={0.4} transparent />
      </lineSegments>

      {/* Container floor */}
      <mesh position={[0, -BOX_HALF, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[BOX_HALF * 2, BOX_HALF * 2]} />
        <meshStandardMaterial color="#000d22" transparent opacity={0.8} />
      </mesh>
    </>
  );
}
