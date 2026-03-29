import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
  Fn,
  float,
  vec3,
  vec4,
  positionWorld,
  time,
  sin,
  mix,
} from 'three/tsl';

/**
 * Vector Arcade — Wireframe Asteroids/Tempest aesthetic
 *
 * Techniques:
 * 1. All meshes wireframe: true with phosphor glow
 * 2. Rotating asteroid (icosahedron wireframe)
 * 3. Small ship triangle wireframe
 * 4. Star field dots (instanced)
 * 5. Phosphor glow: wireframe duplicated at 1.05x with AdditiveBlending
 * 6. Monochrome green/cyan palette with pulsing emissive
 */

const STAR_COUNT = 200;

function seededRand(seed: number) {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export default function VectorArcade() {
  // Main asteroid
  const asteroidRef = useRef<THREE.Mesh>(null);
  const asteroidGlowRef = useRef<THREE.Mesh>(null);

  // Ship
  const shipRef = useRef<THREE.Group>(null);

  // Stars
  const starsRef = useRef<THREE.InstancedMesh>(null);

  // Small asteroids (orbital debris)
  const debris1Ref = useRef<THREE.Mesh>(null);
  const debris2Ref = useRef<THREE.Mesh>(null);
  const debris3Ref = useRef<THREE.Mesh>(null);

  // ── Vector green wireframe material ──
  const wireframeMat = useMemo(() => {
    const mat = new THREE.MeshBasicNodeMaterial();
    mat.wireframe = true;

    mat.colorNode = Fn(() => {
      // Phosphor green that pulses
      const pulse = sin(time.mul(float(2.0))).mul(float(0.15)).add(float(0.85));
      return vec4(float(0.0), float(1.0).mul(pulse), float(0.3).mul(pulse), float(1.0));
    })();

    return mat;
  }, []);

  // ── Glow duplicate (slightly larger, additive) ──
  const glowMat = useMemo(() => {
    const mat = new THREE.MeshBasicNodeMaterial();
    mat.wireframe = true;
    mat.transparent = true;
    mat.blending = THREE.AdditiveBlending;
    mat.depthWrite = false;

    mat.colorNode = Fn(() => {
      const pulse = sin(time.mul(float(1.5))).mul(float(0.2)).add(float(0.5));
      return vec4(float(0.0), float(0.8).mul(pulse), float(0.4).mul(pulse), float(1.0));
    })();

    mat.opacityNode = float(0.35);

    return mat;
  }, []);

  // ── Cyan wireframe for ship ──
  const shipMat = useMemo(() => {
    const mat = new THREE.MeshBasicNodeMaterial();
    mat.wireframe = true;

    mat.colorNode = Fn(() => {
      const pulse = sin(time.mul(float(3.0))).mul(float(0.1)).add(float(0.9));
      return vec4(float(0.0), float(0.9).mul(pulse), float(1.0).mul(pulse), float(1.0));
    })();

    return mat;
  }, []);

  const shipGlowMat = useMemo(() => {
    const mat = new THREE.MeshBasicNodeMaterial();
    mat.wireframe = true;
    mat.transparent = true;
    mat.blending = THREE.AdditiveBlending;
    mat.depthWrite = false;
    mat.colorNode = Fn(() => {
      return vec4(float(0.0), float(0.5), float(1.0), float(1.0));
    })();
    mat.opacityNode = float(0.4);
    return mat;
  }, []);

  // ── Star material ──
  const starMat = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.emissiveNode = Fn(() => {
      const idx = positionWorld.x.add(positionWorld.y).add(positionWorld.z);
      const twinkle = sin(time.mul(float(3.0)).add(idx.mul(float(7.3)))).mul(float(0.3)).add(float(0.7));
      // Alternate between green and cyan stars
      const greenStar = vec3(float(0.0), float(1.0).mul(twinkle), float(0.3));
      const cyanStar = vec3(float(0.0), float(0.8).mul(twinkle), float(1.0).mul(twinkle));
      return mix(cyanStar, greenStar, float(0.5));
    })();
    mat.roughness = 1.0;
    return mat;
  }, []);

  // Debris wireframe materials
  const debrisMats = useMemo(() => {
    return [0, 1, 2].map((i) => {
      const mat = new THREE.MeshBasicNodeMaterial();
      mat.wireframe = true;
      const speed = float(1.5 + i * 0.5);
      mat.colorNode = Fn(() => {
        const pulse = sin(time.mul(speed)).mul(float(0.2)).add(float(0.8));
        return vec4(float(0.0), float(0.7).mul(pulse), float(0.5).mul(pulse), float(1.0));
      })();
      return mat;
    });
  }, []);

  // Set up stars
  useEffect(() => {
    const mesh = starsRef.current;
    if (!mesh) return;
    const mat = new THREE.Matrix4();
    for (let i = 0; i < STAR_COUNT; i++) {
      const theta = seededRand(i * 3.1) * Math.PI * 2;
      const phi = Math.acos(2 * seededRand(i * 3.1 + 1) - 1);
      const r = 15 + seededRand(i * 3.1 + 2) * 10;
      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.sin(phi) * Math.sin(theta);
      const z = r * Math.cos(phi);
      const s = 0.04 + seededRand(i * 3.1 + 3) * 0.06;
      mat.makeScale(s, s, s);
      mat.setPosition(x, y, z);
      mesh.setMatrixAt(i, mat);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, []);

  useFrame((state, delta) => {
    // Asteroid rotation
    if (asteroidRef.current) {
      asteroidRef.current.rotation.y += delta * 0.35;
      asteroidRef.current.rotation.x += delta * 0.15;
    }
    if (asteroidGlowRef.current) {
      asteroidGlowRef.current.rotation.y += delta * 0.35;
      asteroidGlowRef.current.rotation.x += delta * 0.15;
    }

    // Ship orbiting
    if (shipRef.current) {
      const t = state.clock.elapsedTime;
      const orbitR = 3.0;
      shipRef.current.position.x = Math.cos(t * 0.5) * orbitR;
      shipRef.current.position.y = Math.sin(t * 0.3) * 0.8;
      shipRef.current.position.z = Math.sin(t * 0.5) * orbitR;
      shipRef.current.rotation.y = Math.atan2(
        Math.sin(t * 0.5 + 0.1) * orbitR - shipRef.current.position.x,
        Math.cos(t * 0.5 + 0.1) * orbitR - shipRef.current.position.z
      );
    }

    // Debris orbits
    [debris1Ref, debris2Ref, debris3Ref].forEach((ref, i) => {
      if (ref.current) {
        const t2 = state.clock.elapsedTime * (0.4 + i * 0.25);
        const r2 = 4.5 + i * 1.2;
        ref.current.position.x = Math.cos(t2 + i * 2.1) * r2;
        ref.current.position.y = Math.sin(t2 * 0.7 + i) * 1.5;
        ref.current.position.z = Math.sin(t2 + i * 2.1) * r2;
        ref.current.rotation.x += delta * (0.3 + i * 0.2);
        ref.current.rotation.z += delta * (0.5 + i * 0.15);
      }
    });
  });

  return (
    <>
      <ambientLight intensity={0.0} />
      <pointLight position={[0, 0, 0]} intensity={0.5} color="#00ff44" distance={20} />

      {/* Main asteroid (icosahedron) */}
      <mesh ref={asteroidRef} material={wireframeMat}>
        <icosahedronGeometry args={[1.5, 1]} />
      </mesh>
      {/* Phosphor glow for asteroid */}
      <mesh ref={asteroidGlowRef} material={glowMat} scale={1.05}>
        <icosahedronGeometry args={[1.5, 1]} />
      </mesh>

      {/* Ship (simple tetrahedron as triangle ship) */}
      <group ref={shipRef}>
        <mesh material={shipMat}>
          <tetrahedronGeometry args={[0.35, 0]} />
        </mesh>
        <mesh material={shipGlowMat} scale={1.08}>
          <tetrahedronGeometry args={[0.35, 0]} />
        </mesh>
      </group>

      {/* Orbital debris */}
      <mesh ref={debris1Ref} material={debrisMats[0]}>
        <icosahedronGeometry args={[0.4, 0]} />
      </mesh>
      <mesh ref={debris2Ref} material={debrisMats[1]}>
        <octahedronGeometry args={[0.35, 0]} />
      </mesh>
      <mesh ref={debris3Ref} material={debrisMats[2]}>
        <icosahedronGeometry args={[0.3, 0]} />
      </mesh>

      {/* Star field */}
      <instancedMesh ref={starsRef} args={[undefined, undefined, STAR_COUNT]} material={starMat}>
        <sphereGeometry args={[1, 4, 2]} />
      </instancedMesh>

      {/* Background color */}
      <color attach="background" args={['#000008']} />
    </>
  );
}
