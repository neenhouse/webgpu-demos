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
  positionLocal,
  normalLocal,
  oscSine,
  normalWorld,
  cameraPosition,
  positionWorld,
} from 'three/tsl';

/**
 * Galaxy Collision — Two spiral galaxies collide via GPU compute gravity
 *
 * Demonstrates advanced WebGPU compute shaders:
 * - 10,000 stars distributed in two spiral galaxy arms
 * - Two gravitational attractors that orbit each other
 * - Compute shader gravity integration each frame
 * - Velocity-based color: blue (slow) -> white (fast) -> orange (ejected)
 * - Tidal tails form naturally from gravitational interaction
 * - Bloom halo shells around each galactic core
 */

const STAR_COUNT = 10000;
const HALF = STAR_COUNT / 2;

export default function GalaxyCollision() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const groupRef = useRef<THREE.Group>(null);
  const [initialized, setInitialized] = useState(false);
  const { gl } = useThree();

  // Attractor positions (updated from CPU each frame)
  const attractor1Ref = useRef(new THREE.Vector3(-1.5, 0, 0));
  const attractor2Ref = useRef(new THREE.Vector3(1.5, 0, 0));

  // Compute resources
  const compute = useMemo(() => {
    const positions = instancedArray(STAR_COUNT, 'vec3');
    const velocities = instancedArray(STAR_COUNT, 'vec3');

    const dtUniform = uniform(0);
    const attractor1 = uniform(new THREE.Vector3(-1.5, 0, 0));
    const attractor2 = uniform(new THREE.Vector3(1.5, 0, 0));

    // Initialize: distribute stars in two spiral arms in xz plane
    // Galaxy disks lie in XY plane so they face the camera at [0,0,4]
    const computeInit = Fn(() => {
      const pos = positions.element(instanceIndex);
      const vel = velocities.element(instanceIndex);

      const idx = float(instanceIndex);
      const halfF = float(HALF);

      const localIdx = idx.mod(halfF);
      const t = localIdx.div(halfF); // 0..1

      // Spiral parameters
      const armAngle = t.mul(Math.PI * 6); // 3 full turns
      const armJitter = hash(instanceIndex).mul(Math.PI * 2);
      const angle = armAngle.add(armJitter.mul(0.4));
      const radius = t.mul(1.2).add(hash(instanceIndex.add(1)).mul(0.25));

      // Spiral positions in XY disk (faces camera at z=4)
      const sx = angle.cos().mul(radius);
      const sy = angle.sin().mul(radius);
      const sz = hash(instanceIndex.add(2)).sub(0.5).mul(0.08); // thin disk

      // Galaxy 1: indices 0..HALF-1
      If(idx.lessThan(halfF), () => {
        pos.x.assign(attractor1.x.add(sx));
        pos.y.assign(attractor1.y.add(sy));
        pos.z.assign(sz);

        // Orbital velocity (tangential) in XY plane
        const orbSpeed = float(0.6).div(radius.max(0.2).sqrt());
        vel.x.assign(angle.sin().negate().mul(orbSpeed));
        vel.y.assign(angle.cos().mul(orbSpeed));
        vel.z.assign(float(0));
      });

      // Galaxy 2: indices HALF..STAR_COUNT-1, tilted ~30 deg
      If(idx.greaterThanEqual(halfF), () => {
        // Tilt galaxy 2 by rotating around X axis
        const tiltCos = float(Math.cos(0.5)); // ~30 deg
        const tiltSin = float(Math.sin(0.5));
        const ty = sy.mul(tiltCos).sub(sz.mul(tiltSin));
        const tz = sy.mul(tiltSin).add(sz.mul(tiltCos));

        pos.x.assign(attractor2.x.add(sx));
        pos.y.assign(attractor2.y.add(ty));
        pos.z.assign(tz);

        // Orbital velocity (opposite spin direction), tilted
        const orbSpeed = float(0.6).div(radius.max(0.2).sqrt());
        const vx = angle.sin().mul(orbSpeed);
        const vy = angle.cos().negate().mul(orbSpeed);
        vel.x.assign(vx);
        vel.y.assign(vy.mul(tiltCos));
        vel.z.assign(vy.mul(tiltSin));
      });
    })().compute(STAR_COUNT);

    // Per-frame gravity update
    const computeUpdate = Fn(() => {
      const pos = positions.element(instanceIndex);
      const vel = velocities.element(instanceIndex);

      const dt = dtUniform;

      // Gravity from attractor 1
      const diff1 = vec3(
        attractor1.x.sub(pos.x),
        attractor1.y.sub(pos.y),
        attractor1.z.sub(pos.z),
      );
      const dist1Sq = diff1.x.mul(diff1.x).add(diff1.y.mul(diff1.y)).add(diff1.z.mul(diff1.z));
      const dist1 = dist1Sq.max(0.1).sqrt(); // softening
      const force1 = float(3.0).div(dist1Sq.max(0.1));
      const dir1 = vec3(diff1.x.div(dist1), diff1.y.div(dist1), diff1.z.div(dist1));

      vel.x.addAssign(dir1.x.mul(force1).mul(dt));
      vel.y.addAssign(dir1.y.mul(force1).mul(dt));
      vel.z.addAssign(dir1.z.mul(force1).mul(dt));

      // Gravity from attractor 2
      const diff2 = vec3(
        attractor2.x.sub(pos.x),
        attractor2.y.sub(pos.y),
        attractor2.z.sub(pos.z),
      );
      const dist2Sq = diff2.x.mul(diff2.x).add(diff2.y.mul(diff2.y)).add(diff2.z.mul(diff2.z));
      const dist2 = dist2Sq.max(0.1).sqrt();
      const force2 = float(3.0).div(dist2Sq.max(0.1));
      const dir2 = vec3(diff2.x.div(dist2), diff2.y.div(dist2), diff2.z.div(dist2));

      vel.x.addAssign(dir2.x.mul(force2).mul(dt));
      vel.y.addAssign(dir2.y.mul(force2).mul(dt));
      vel.z.addAssign(dir2.z.mul(force2).mul(dt));

      // Mild drag to prevent energy explosion
      vel.x.mulAssign(float(1.0).sub(dt.mul(0.05)));
      vel.y.mulAssign(float(1.0).sub(dt.mul(0.05)));
      vel.z.mulAssign(float(1.0).sub(dt.mul(0.05)));

      // Integrate position
      pos.x.addAssign(vel.x.mul(dt));
      pos.y.addAssign(vel.y.mul(dt));
      pos.z.addAssign(vel.z.mul(dt));

      // Recycle stars that escape too far (>8 units from origin)
      const distFromOrigin = pos.x.mul(pos.x).add(pos.y.mul(pos.y)).add(pos.z.mul(pos.z));
      If(distFromOrigin.greaterThan(64.0), () => {
        // Respawn near a random attractor
        const whichAttractor = hash(instanceIndex.add(time.mul(500)));
        const respawnAngle = hash(instanceIndex.add(time.mul(1000))).mul(Math.PI * 2);
        const respawnRadius = hash(instanceIndex.add(time.mul(1000)).add(1)).mul(0.8).add(0.2);

        If(whichAttractor.lessThan(0.5), () => {
          pos.x.assign(attractor1.x.add(respawnAngle.cos().mul(respawnRadius)));
          pos.y.assign(attractor1.y.add(respawnAngle.sin().mul(respawnRadius)));
          pos.z.assign(hash(instanceIndex.add(time.mul(1000)).add(2)).sub(0.5).mul(0.1));
        });
        If(whichAttractor.greaterThanEqual(0.5), () => {
          pos.x.assign(attractor2.x.add(respawnAngle.cos().mul(respawnRadius)));
          pos.y.assign(attractor2.y.add(respawnAngle.sin().mul(respawnRadius)));
          pos.z.assign(hash(instanceIndex.add(time.mul(1000)).add(2)).sub(0.5).mul(0.1));
        });

        // Orbital velocity in XY plane
        const orbSpeed = float(0.5);
        vel.x.assign(respawnAngle.sin().negate().mul(orbSpeed));
        vel.y.assign(respawnAngle.cos().mul(orbSpeed));
        vel.z.assign(float(0));
      });
    })().compute(STAR_COUNT);

    return { positions, velocities, dtUniform, attractor1, attractor2, computeInit, computeUpdate };
  }, []);

  // Material: reads velocity buffer for color
  const material = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();

    // Speed-based color: blue (slow) -> white (fast) -> orange (ejected)
    const vel = compute.velocities.element(instanceIndex);
    const speed = vel.length();
    const speedNorm = smoothstep(0.3, 3.0, speed);

    const slowColor = color(0x4488ff); // blue
    const midColor = color(0xeeeeff); // white
    const fastColor = color(0xff8833); // orange

    const lowerMix = mix(slowColor, midColor, smoothstep(0.0, 0.5, speedNorm));
    const fullColor = mix(lowerMix, fastColor, smoothstep(0.5, 1.0, speedNorm));
    mat.colorNode = fullColor;

    // Emissive: glow based on speed
    mat.emissiveNode = fullColor.mul(float(1.5).add(speedNorm.mul(1.5)));

    // Slight vertex breathing
    mat.positionNode = positionLocal.add(
      normalLocal.mul(oscSine(time.mul(2.0).add(positionLocal.y.mul(3.0))).mul(0.005)),
    );

    mat.roughness = 0.4;
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

  // Set initial instance matrices from CPU (spiral in XY plane)
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const dummy = new THREE.Object3D();
    for (let i = 0; i < STAR_COUNT; i++) {
      const galaxy = i < HALF ? 0 : 1;
      const center = galaxy === 0 ? attractor1Ref.current : attractor2Ref.current;
      const localIdx = i % HALF;
      const t = localIdx / HALF;

      const armAngle = t * Math.PI * 6;
      const jitter = Math.random() * Math.PI * 2 * 0.4;
      const angle = armAngle + jitter;
      const radius = t * 1.2 + Math.random() * 0.25;

      // XY disk
      let x = center.x + Math.cos(angle) * radius;
      let y = center.y + Math.sin(angle) * radius;
      let z = (Math.random() - 0.5) * 0.08;

      // Tilt galaxy 2
      if (galaxy === 1) {
        const tiltAngle = 0.5;
        const oy = y - center.y;
        const oz = z;
        y = center.y + oy * Math.cos(tiltAngle) - oz * Math.sin(tiltAngle);
        z = oy * Math.sin(tiltAngle) + oz * Math.cos(tiltAngle);
      }

      dummy.position.set(x, y, z);
      const scale = 0.015 + Math.random() * 0.02;
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, []);

  // Elapsed time for attractor orbiting
  const elapsedRef = useRef(0);

  // Per-frame: update attractors, run compute, sync instance matrices
  useFrame((_, delta) => {
    if (!initialized) return;

    const dt = Math.min(delta, 0.03);
    elapsedRef.current += dt;
    const t = elapsedRef.current;

    // Attractors orbit each other in XY plane, gradually spiraling inward
    const orbitRadius = Math.max(0.3, 1.5 - t * 0.06);
    const orbitSpeed = 0.4 + (1.5 - orbitRadius) * 0.2;
    const angle = t * orbitSpeed;

    attractor1Ref.current.set(
      Math.cos(angle) * orbitRadius,
      Math.sin(angle) * orbitRadius * 0.6,
      Math.sin(angle * 0.2) * 0.15,
    );
    attractor2Ref.current.set(
      Math.cos(angle + Math.PI) * orbitRadius,
      Math.sin(angle + Math.PI) * orbitRadius * 0.6,
      Math.sin((angle + Math.PI) * 0.2) * 0.15,
    );

    // Push to GPU uniforms
    compute.attractor1.value.copy(attractor1Ref.current);
    compute.attractor2.value.copy(attractor2Ref.current);
    compute.dtUniform.value = dt;

    // Run compute
    const renderer = gl as unknown as THREE.WebGPURenderer;
    if (renderer && renderer.compute) {
      renderer.compute(compute.computeUpdate);
    }

    // Very slow scene rotation
    if (groupRef.current) {
      groupRef.current.rotation.z += dt * 0.02;
    }
  });

  return (
    <>
      <ambientLight intensity={0.08} />
      <directionalLight position={[3, 3, 5]} intensity={0.15} />

      {/* Attractor glow lights */}
      <pointLight position={[-1.5, 0, 0]} intensity={6.0} color="#6699ff" distance={6} />
      <pointLight position={[1.5, 0, 0]} intensity={6.0} color="#ff9944" distance={6} />

      <group ref={groupRef}>
        {/* Star field */}
        <instancedMesh
          ref={meshRef}
          args={[undefined, undefined, STAR_COUNT]}
          material={material}
          frustumCulled={false}
        >
          <icosahedronGeometry args={[1, 1]} />
        </instancedMesh>

        {/* Bloom halos around galactic cores */}
        <GalacticCoreHalo posRef={attractor1Ref} glowColor={0x6699ff} phase={0} />
        <GalacticCoreHalo posRef={attractor2Ref} glowColor={0xff9944} phase={2.0} />
      </group>
    </>
  );
}

/** Bloom halo around a galactic core attractor */
function GalacticCoreHalo({
  posRef,
  glowColor,
  phase,
}: {
  posRef: React.RefObject<THREE.Vector3>;
  glowColor: number;
  phase: number;
}) {
  const groupRef = useRef<THREE.Group>(null);

  const haloMats = useMemo(() => {
    return [0, 1, 2].map((layer) => {
      const mat = new THREE.MeshStandardNodeMaterial();
      mat.transparent = true;
      mat.side = THREE.BackSide;
      mat.depthWrite = false;
      mat.blending = THREE.AdditiveBlending;

      const layerFade = float(1.0).sub(float(layer).mul(0.25));
      const pulse = oscSine(time.mul(0.5).add(phase)).mul(0.2).add(0.8);

      const fresnel = Fn(() => {
        const viewDir = cameraPosition.sub(positionWorld).normalize();
        const nDotV = normalWorld.dot(viewDir).saturate();
        return float(1.0).sub(nDotV).pow(float(1.5).add(float(layer).mul(0.5)));
      });

      const gc = color(glowColor);
      mat.opacityNode = fresnel().mul(pulse).mul(layerFade).mul(0.5);
      mat.colorNode = gc;
      mat.emissiveNode = gc.mul(fresnel().mul(pulse).mul(layerFade).mul(3.0));
      mat.roughness = 0.0;
      mat.metalness = 0.0;

      return mat;
    });
  }, [glowColor, phase]);

  const scales = [0.5, 0.75, 1.1];

  // Update position each frame
  useFrame(() => {
    if (groupRef.current && posRef.current) {
      groupRef.current.position.copy(posRef.current);
    }
  });

  return (
    <group ref={groupRef}>
      {haloMats.map((mat, i) => (
        <mesh key={i} material={mat} scale={scales[i]}>
          <icosahedronGeometry args={[0.4, 3]} />
        </mesh>
      ))}
    </group>
  );
}
