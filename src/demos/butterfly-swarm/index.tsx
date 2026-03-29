import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
  color,
  float,
  instanceIndex,
  mix,
  normalWorld,
  smoothstep,
  vec3,
} from 'three/tsl';

/**
 * Butterfly Swarm — Morpho butterflies with iridescent wings and boids flocking
 *
 * 60 butterflies. Wings: 2 instanced planes per butterfly with rotation for flapping.
 * Iridescent: fresnel color shift mix(deepBlue, brightCyan, normal.dot(cam).pow(2)).
 * Simplified boids on CPU (60 manageable).
 * Ground plane with flower spots (instanced colored spheres).
 *
 * Techniques: multi-mesh butterfly, CPU boids, TSL fresnel iridescence, instanced flowers.
 */

const BUTTERFLY_COUNT = 60;
const FLOWER_COUNT = 80;

interface BoidState {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  phase: number; // wing flap phase
}

function createBoids(): BoidState[] {
  return Array.from({ length: BUTTERFLY_COUNT }, (_) => ({
    position: new THREE.Vector3(
      (Math.random() - 0.5) * 8,
      0.5 + Math.random() * 3,
      (Math.random() - 0.5) * 8,
    ),
    velocity: new THREE.Vector3(
      (Math.random() - 0.5) * 2,
      (Math.random() - 0.5) * 0.5,
      (Math.random() - 0.5) * 2,
    ),
    phase: Math.random() * Math.PI * 2,
  }));
}

// Simple boids update
function updateBoids(boids: BoidState[], dt: number) {
  const SEPARATION_DIST = 0.8;
  const ALIGNMENT_DIST = 2.5;
  const COHESION_DIST = 3.0;
  const SEP_WEIGHT = 3.0;
  const ALI_WEIGHT = 0.8;
  const COH_WEIGHT = 0.4;
  const MAX_SPEED = 2.5;
  const MIN_SPEED = 0.8;

  const forces = boids.map(() => new THREE.Vector3());

  for (let i = 0; i < boids.length; i++) {
    const boid = boids[i];
    const sep = new THREE.Vector3();
    const ali = new THREE.Vector3();
    const coh = new THREE.Vector3();
    let aliCount = 0;
    let cohCount = 0;

    for (let j = 0; j < boids.length; j++) {
      if (i === j) continue;
      const other = boids[j];
      const dist = boid.position.distanceTo(other.position);

      if (dist < SEPARATION_DIST && dist > 0.001) {
        const away = boid.position.clone().sub(other.position).normalize().divideScalar(dist);
        sep.add(away);
      }
      if (dist < ALIGNMENT_DIST) {
        ali.add(other.velocity);
        aliCount++;
      }
      if (dist < COHESION_DIST) {
        coh.add(other.position);
        cohCount++;
      }
    }

    forces[i].addScaledVector(sep, SEP_WEIGHT);
    if (aliCount > 0) {
      ali.divideScalar(aliCount).sub(boid.velocity);
      forces[i].addScaledVector(ali, ALI_WEIGHT);
    }
    if (cohCount > 0) {
      coh.divideScalar(cohCount).sub(boid.position);
      forces[i].addScaledVector(coh, COH_WEIGHT);
    }

    // Bounds: keep near origin
    const distFromOrigin = boid.position.length();
    if (distFromOrigin > 5) {
      forces[i].addScaledVector(boid.position.clone().negate().normalize(), (distFromOrigin - 5) * 2.0);
    }
    // Height bounds
    if (boid.position.y < 0.3) forces[i].y += 3.0;
    if (boid.position.y > 4.5) forces[i].y -= 3.0;
  }

  for (let i = 0; i < boids.length; i++) {
    const boid = boids[i];
    boid.velocity.addScaledVector(forces[i], dt);
    // Clamp speed
    const speed = boid.velocity.length();
    if (speed > MAX_SPEED) boid.velocity.multiplyScalar(MAX_SPEED / speed);
    if (speed < MIN_SPEED) boid.velocity.multiplyScalar(MIN_SPEED / Math.max(speed, 0.001));
    boid.position.addScaledVector(boid.velocity, dt);
    boid.phase += dt * 6.0; // flap speed
  }
}

export default function ButterflySwarm() {
  const leftWingRef = useRef<THREE.InstancedMesh>(null);
  const rightWingRef = useRef<THREE.InstancedMesh>(null);
  const bodyRef = useRef<THREE.InstancedMesh>(null);
  const flowerRef = useRef<THREE.InstancedMesh>(null);

  const boids = useMemo(() => createBoids(), []);

  // Wing material: iridescent fresnel
  const wingMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    const fresnel = float(1.0).sub(
      normalWorld.dot(vec3(0, 0, 1)).abs().clamp(0.0, 1.0),
    );
    const fresnelPow = fresnel.pow(float(1.5));
    const deepBlue = color(0x001aff);
    const brightCyan = color(0x00eeff);
    const violet = color(0x8800ff);
    const inner = mix(deepBlue, brightCyan, fresnelPow);
    const finalCol = mix(inner, violet, fresnelPow.pow(float(3.0)));
    mat.colorNode = finalCol;
    mat.emissiveNode = finalCol.mul(float(0.6));
    mat.roughness = 0.1;
    mat.metalness = 0.3;
    mat.transparent = true;
    mat.opacity = 0.9;
    mat.side = THREE.DoubleSide;
    return mat;
  }, []);

  // Body material: dark
  const bodyMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.colorNode = color(0x112233);
    mat.emissiveNode = color(0x001144).mul(float(0.5));
    mat.roughness = 0.6;
    return mat;
  }, []);

  // Flower material
  const flowerMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    const idxNorm = instanceIndex.toFloat().div(float(FLOWER_COUNT));
    const fc = [color(0xff4488), color(0xff8800), color(0xffee22), color(0xff44ff)];
    const c01 = mix(fc[0], fc[1], smoothstep(0.0, 0.25, idxNorm));
    const c12 = mix(c01, fc[2], smoothstep(0.25, 0.5, idxNorm));
    const c23 = mix(c12, fc[3], smoothstep(0.5, 0.75, idxNorm));
    mat.colorNode = c23;
    mat.emissiveNode = c23.mul(float(0.2));
    mat.roughness = 0.7;
    return mat;
  }, []);

  // Build flower instances
  useEffect(() => {
    const mesh = flowerRef.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < FLOWER_COUNT; i++) {
      const angle = (i / FLOWER_COUNT) * Math.PI * 2 * 3;
      const r = 1.0 + (i % 8) * 0.6;
      dummy.position.set(
        Math.cos(angle) * r,
        -1.98,
        Math.sin(angle) * r,
      );
      dummy.scale.setScalar(0.06 + (i % 3) * 0.03);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, []);

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const fwdVec = useMemo(() => new THREE.Vector3(0, 0, 1), []);

  useFrame((_, delta) => {
    updateBoids(boids, Math.min(delta, 0.03));

    const lWing = leftWingRef.current;
    const rWing = rightWingRef.current;
    const body = bodyRef.current;
    if (!lWing || !rWing || !body) return;

    for (let i = 0; i < BUTTERFLY_COUNT; i++) {
      const boid = boids[i];
      const flapAngle = Math.sin(boid.phase) * (Math.PI * 0.45);

      // Orientation: body faces velocity direction
      const velDir = boid.velocity.clone().normalize();
      if (velDir.lengthSq() > 0.001) {
        q.setFromUnitVectors(fwdVec, velDir);
      }

      // Left wing
      dummy.position.copy(boid.position);
      dummy.setRotationFromQuaternion(q);
      dummy.rotateZ(flapAngle);
      dummy.scale.set(0.3, 0.22, 0.01);
      dummy.translateX(-0.15);
      dummy.updateMatrix();
      lWing.setMatrixAt(i, dummy.matrix);

      // Right wing
      dummy.position.copy(boid.position);
      dummy.setRotationFromQuaternion(q);
      dummy.rotateZ(-flapAngle);
      dummy.scale.set(0.3, 0.22, 0.01);
      dummy.translateX(0.15);
      dummy.updateMatrix();
      rWing.setMatrixAt(i, dummy.matrix);

      // Body
      dummy.position.copy(boid.position);
      dummy.setRotationFromQuaternion(q);
      dummy.scale.set(0.04, 0.04, 0.2);
      dummy.updateMatrix();
      body.setMatrixAt(i, dummy.matrix);
    }

    lWing.instanceMatrix.needsUpdate = true;
    rWing.instanceMatrix.needsUpdate = true;
    body.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      <color attach="background" args={['#87ceeb']} />
      <fog attach="fog" args={['#c8e8f0', 10, 22]} />
      <ambientLight intensity={0.8} />
      <directionalLight position={[5, 8, 3]} intensity={1.5} color="#fffde7" />
      <directionalLight position={[-3, 4, -2]} intensity={0.4} color="#88ccff" />

      {/* Garden ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2, 0]}>
        <planeGeometry args={[16, 16, 4, 4]} />
        <meshStandardMaterial color="#3d7a28" roughness={0.9} />
      </mesh>

      {/* Flower patch */}
      <instancedMesh
        ref={flowerRef}
        args={[undefined, undefined, FLOWER_COUNT]}
        material={flowerMaterial}
        frustumCulled={false}
      >
        <sphereGeometry args={[1, 5, 4]} />
      </instancedMesh>

      {/* Grass base strips */}
      {Array.from({ length: 16 }, (_, i) => (
        <mesh
          key={i}
          position={[(i % 4 - 1.5) * 3, -1.92, Math.floor(i / 4) * 3 - 4]}
        >
          <cylinderGeometry args={[0.02, 0.04, 0.25, 4]} />
          <meshStandardMaterial color="#2d6020" roughness={0.9} />
        </mesh>
      ))}

      {/* Left wings */}
      <instancedMesh
        ref={leftWingRef}
        args={[undefined, undefined, BUTTERFLY_COUNT]}
        material={wingMaterial}
        frustumCulled={false}
      >
        <planeGeometry args={[1, 1]} />
      </instancedMesh>

      {/* Right wings */}
      <instancedMesh
        ref={rightWingRef}
        args={[undefined, undefined, BUTTERFLY_COUNT]}
        material={wingMaterial}
        frustumCulled={false}
      >
        <planeGeometry args={[1, 1]} />
      </instancedMesh>

      {/* Bodies */}
      <instancedMesh
        ref={bodyRef}
        args={[undefined, undefined, BUTTERFLY_COUNT]}
        material={bodyMaterial}
        frustumCulled={false}
      >
        <sphereGeometry args={[1, 5, 4]} />
      </instancedMesh>
    </>
  );
}
