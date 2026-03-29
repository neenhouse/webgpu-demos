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
 * Collision Cascade — Chain reaction of 200 rigid spheres
 *
 * Techniques:
 * - 200 spheres in GPU instancedArray (positions + velocities)
 * - Compute: each sphere samples 16 random pairs via hash for elastic collision
 * - Elastic collision response: velocity exchange on overlap detection
 * - Gravity + floor bounce + wall bounds in AABB box
 * - Initial pyramid arrangement, trigger drop after init
 * - Color by kinetic energy: blue=rest, yellow=fast, orange=very fast
 * - CPU reads back nothing — fully GPU-driven simulation
 */

const SPHERE_COUNT = 200;
const SPHERE_RADIUS = 0.18;
const BOX_HALF = 3.0;
const NEIGHBOR_CHECKS = 16;

export default function CollisionCascade() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const [initialized, setInitialized] = useState(false);
  const { gl } = useThree();

  const compute = useMemo(() => {
    const positions = instancedArray(SPHERE_COUNT, 'vec3');
    const velocities = instancedArray(SPHERE_COUNT, 'vec3');

    const dtUniform = uniform(0.016);
    const gravity = uniform(-8.0);
    const restitution = uniform(0.85);
    const triggerDrop = uniform(0); // 0=arranged, 1=dropped

    const computeInit = Fn(() => {
      const idx = instanceIndex;
      const pos = positions.element(idx);
      const vel = velocities.element(idx);

      // Pyramid arrangement
      // Layer 0 (bottom): 10x10 = 100 spheres
      // Layer 1: 7x7 = 49
      // Layer 2: 5x5 = 25
      // Layer 3: 3x3 = 9
      // Layer 4: 2x2 = 4
      // Layer 5: 1x1 = 1 (we have 200 total, rest scatter)

      const spacing = float(SPHERE_RADIUS * 2.2);

      If(idx.lessThan(int(100)), () => {
        // Layer 0: 10x10
        const col = idx.modInt(int(10));
        const row = idx.div(int(10));
        pos.assign(vec3(
          float(col).sub(float(4.5)).mul(spacing),
          float(SPHERE_RADIUS).add(float(0.1)),
          float(row).sub(float(4.5)).mul(spacing)
        ));
      });
      If(idx.greaterThanEqual(int(100)).and(idx.lessThan(int(149))), () => {
        // Layer 1: 7x7
        const localIdx = idx.sub(int(100));
        const col = localIdx.modInt(int(7));
        const row = localIdx.div(int(7));
        pos.assign(vec3(
          float(col).sub(float(3.0)).mul(spacing),
          float(SPHERE_RADIUS * 2 + 0.3),
          float(row).sub(float(3.0)).mul(spacing)
        ));
      });
      If(idx.greaterThanEqual(int(149)).and(idx.lessThan(int(174))), () => {
        // Layer 2: 5x5
        const localIdx = idx.sub(int(149));
        const col = localIdx.modInt(int(5));
        const row = localIdx.div(int(5));
        pos.assign(vec3(
          float(col).sub(float(2.0)).mul(spacing),
          float(SPHERE_RADIUS * 4 + 0.3),
          float(row).sub(float(2.0)).mul(spacing)
        ));
      });
      If(idx.greaterThanEqual(int(174)), () => {
        // Remaining scattered high
        const localIdx = idx.sub(int(174));
        pos.assign(vec3(
          hash(localIdx).mul(float(BOX_HALF * 1.5)).sub(float(BOX_HALF * 0.75)),
          float(SPHERE_RADIUS * 6 + 0.5).add(float(localIdx).mul(0.15)),
          hash(localIdx.add(100)).mul(float(BOX_HALF * 1.5)).sub(float(BOX_HALF * 0.75))
        ));
      });

      vel.assign(vec3(0.0, 0.0, 0.0));
    })().compute(SPHERE_COUNT);

    const computeUpdate = Fn(() => {
      const idx = instanceIndex;
      const pos = positions.element(idx);
      const vel = velocities.element(idx);
      const dt = dtUniform;

      // Apply gravity
      vel.y.addAssign(gravity.mul(dt));

      // Elastic collision checks
      Loop({ start: int(0), end: int(NEIGHBOR_CHECKS) }, ({ i }) => {
        // Random partner selection via hash
        const seed = idx.mul(31).add(i.mul(997)).add(time.mul(0.01).toInt());
        const jIdx = hash(seed).mul(float(SPHERE_COUNT)).toInt().modInt(int(SPHERE_COUNT));

        If(jIdx.notEqual(idx), () => {
          const jPos = positions.element(jIdx);
          const jVel = velocities.element(jIdx);

          const diff = pos.sub(jPos);
          const dist = diff.length();
          const minDist = float(SPHERE_RADIUS * 2.0);

          If(dist.lessThan(minDist).and(dist.greaterThan(float(0.001))), () => {
            // Elastic collision: exchange velocities along collision normal
            const normal = diff.normalize();
            const relVel = vel.sub(jVel);
            const vAlongNormal = relVel.dot(normal);

            // Only resolve if approaching
            If(vAlongNormal.lessThan(float(0.0)), () => {
              const impulse = normal.mul(vAlongNormal.mul(restitution.add(float(1.0))).mul(float(0.5)));
              vel.subAssign(impulse);
              // Positional correction to prevent overlap
              const overlap = minDist.sub(dist).mul(float(0.5));
              pos.addAssign(normal.mul(overlap));
            });
          });
        });
      });

      pos.addAssign(vel.mul(dt));

      // Floor bounce
      If(pos.y.lessThan(float(SPHERE_RADIUS)), () => {
        pos.y.assign(float(SPHERE_RADIUS));
        vel.y.assign(vel.y.abs().mul(restitution));
        vel.x.mulAssign(float(0.92));
        vel.z.mulAssign(float(0.92));
      });

      // Walls
      const wall = float(BOX_HALF - SPHERE_RADIUS);
      If(pos.x.greaterThan(wall), () => { pos.x.assign(wall); vel.x.assign(vel.x.abs().negate().mul(restitution)); });
      If(pos.x.lessThan(wall.negate()), () => { pos.x.assign(wall.negate()); vel.x.assign(vel.x.abs().mul(restitution)); });
      If(pos.z.greaterThan(wall), () => { pos.z.assign(wall); vel.z.assign(vel.z.abs().negate().mul(restitution)); });
      If(pos.z.lessThan(wall.negate()), () => { pos.z.assign(wall.negate()); vel.z.assign(vel.z.abs().mul(restitution)); });
    })().compute(SPHERE_COUNT);

    return { positions, velocities, dtUniform, gravity, computeInit, computeUpdate };
  }, []);

  const material = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();

    const vel = compute.velocities.element(instanceIndex);
    const speed = vel.length();
    const ke = smoothstep(float(0.0), float(8.0), speed);

    const restColor = color(0x1133aa);
    const midColor = color(0xffdd00);
    const fastColor = color(0xff5500);

    mat.colorNode = mix(restColor, mix(midColor, fastColor, smoothstep(float(0.5), float(1.0), ke)), ke);
    mat.emissiveNode = mix(restColor, fastColor, ke).mul(float(2.0));
    mat.roughness = 0.2;
    mat.metalness = 0.6;

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
    const spacing = SPHERE_RADIUS * 2.2;
    for (let i = 0; i < SPHERE_COUNT; i++) {
      if (i < 100) {
        const col = i % 10;
        const row = Math.floor(i / 10);
        dummy.position.set((col - 4.5) * spacing, SPHERE_RADIUS + 0.1, (row - 4.5) * spacing);
      } else {
        dummy.position.set(
          (Math.random() - 0.5) * BOX_HALF * 1.5,
          SPHERE_RADIUS + 0.5 + i * 0.02,
          (Math.random() - 0.5) * BOX_HALF * 1.5
        );
      }
      dummy.scale.setScalar(SPHERE_RADIUS);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, []);

  useFrame((_, delta) => {
    if (!initialized) return;
    const renderer = gl as unknown as THREE.WebGPURenderer;
    if (!renderer?.compute) return;

    compute.dtUniform.value = Math.min(delta, 0.025);
    renderer.compute(compute.computeUpdate);
  });

  return (
    <>
      <color attach="background" args={['#060408']} />
      <ambientLight intensity={0.15} />
      <directionalLight position={[5, 12, 5]} intensity={0.7} castShadow />
      <pointLight position={[0, 6, 0]} intensity={30} color="#ffaa00" distance={15} />
      <pointLight position={[-4, 2, -4]} intensity={12} color="#1133aa" distance={10} />
      <pointLight position={[4, 2, 4]} intensity={12} color="#ff5500" distance={10} />

      <instancedMesh
        ref={meshRef}
        args={[undefined, undefined, SPHERE_COUNT]}
        material={material}
        frustumCulled={false}
      >
        <sphereGeometry args={[1, 14, 14]} />
      </instancedMesh>

      {/* Floor */}
      <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[BOX_HALF * 2 + 1, BOX_HALF * 2 + 1]} />
        <meshStandardMaterial color="#0d0d0d" metalness={0.3} roughness={0.9} />
      </mesh>

      {/* Box outline */}
      <lineSegments>
        <edgesGeometry args={[new THREE.BoxGeometry(BOX_HALF * 2, BOX_HALF * 2, BOX_HALF * 2)]} />
        <lineBasicMaterial color="#ffaa00" opacity={0.15} transparent />
      </lineSegments>
    </>
  );
}
