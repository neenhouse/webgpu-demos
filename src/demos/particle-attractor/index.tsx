import { useRef, useMemo, useEffect, useCallback } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
  color, time, float, oscSine,
} from 'three/tsl';

/**
 * Particle Attractor — 5000 particles attracted to mouse pointer
 *
 * Techniques:
 * - 5000 InstancedMesh particles with CPU spring physics
 * - Raycasting to invisible plane for pointer world position
 * - Per-particle velocity with attraction toward pointer + drag
 * - Color by velocity magnitude: slow=blue, fast=orange
 * - Vortex effect: particles orbit around attractor
 * - Release mouse to scatter (attraction turns off)
 * - Background atmosphere + hemisphere light
 */

const PARTICLE_COUNT = 5000;
const ATTRACT_STRENGTH = 15.0;
const DRAG = 0.97;
const ORBIT_STRENGTH = 0.8;
const SCATTER_STRENGTH = 8.0;

// Module-scope initial particle state to avoid Math.random() in useMemo
const INITIAL_POSITIONS = new Float32Array(PARTICLE_COUNT * 3);
const INITIAL_VELOCITIES = new Float32Array(PARTICLE_COUNT * 3);
for (let i = 0; i < PARTICLE_COUNT; i++) {
  const r = 2.0 + Math.random() * 2.0;
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(2 * Math.random() - 1);
  INITIAL_POSITIONS[i * 3] = Math.sin(phi) * Math.cos(theta) * r;
  INITIAL_POSITIONS[i * 3 + 1] = Math.cos(phi) * r;
  INITIAL_POSITIONS[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * r;
  INITIAL_VELOCITIES[i * 3] = (Math.random() - 0.5) * 0.5;
  INITIAL_VELOCITIES[i * 3 + 1] = (Math.random() - 0.5) * 0.5;
  INITIAL_VELOCITIES[i * 3 + 2] = (Math.random() - 0.5) * 0.5;
}

export default function ParticleAttractor() {
  const { gl, camera } = useThree();
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const dummy = useRef(new THREE.Object3D());
  const raycaster = useRef(new THREE.Raycaster());
  const attractorPos = useRef(new THREE.Vector3(0, 0, 0));
  const isAttracting = useRef(false);

  // CPU particle state
  const positions = useRef<Float32Array>(new Float32Array(PARTICLE_COUNT * 3));
  const velocities = useRef<Float32Array>(new Float32Array(PARTICLE_COUNT * 3));
  const colors = useRef<THREE.Color[]>([]);

  // Initialize particles from module-scope precomputed data (useEffect to avoid ref access during render)
  useEffect(() => {
    positions.current.set(INITIAL_POSITIONS);
    velocities.current.set(INITIAL_VELOCITIES);
    const cols: THREE.Color[] = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      cols.push(new THREE.Color().setHSL(0.6, 1, 0.6));
    }
    colors.current = cols;
  }, []);

  const particleMat = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.roughness = 0.2;
    mat.metalness = 0.5;
    mat.transparent = true;
    mat.depthWrite = false;
    // Will update color per instance via instanceColor
    const pulse = oscSine(time.mul(3.0)).mul(0.1).add(0.9);
    mat.emissiveNode = color(0xffffff).mul(pulse.mul(float(2.0)));
    mat.opacityNode = float(0.85);
    return mat;
  }, []);

  const getPointerWorld = useCallback((e: PointerEvent) => {
    const rect = (gl.domElement as HTMLCanvasElement).getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.current.setFromCamera(new THREE.Vector2(x, y), camera);

    // Intersect with plane at z=0
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const target = new THREE.Vector3();
    raycaster.current.ray.intersectPlane(plane, target);
    return target;
  }, [gl, camera]);

  const handlePointerMove = useCallback((e: PointerEvent) => {
    const pt = getPointerWorld(e);
    if (pt) attractorPos.current.copy(pt);
  }, [getPointerWorld]);

  const handlePointerDown = useCallback((e: PointerEvent) => {
    isAttracting.current = true;
    const pt = getPointerWorld(e);
    if (pt) attractorPos.current.copy(pt);
  }, [getPointerWorld]);

  const handlePointerUp = useCallback(() => {
    isAttracting.current = false;
  }, []);

  useEffect(() => {
    const canvas = gl.domElement as HTMLCanvasElement;
    canvas.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      canvas.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [gl, handlePointerDown, handlePointerMove, handlePointerUp]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.025);
    const pos = positions.current;
    const vel = velocities.current;
    const mesh = meshRef.current;
    if (!mesh) return;

    const attractor = attractorPos.current;
    const attracting = isAttracting.current;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const ix = i * 3;
      const px = pos[ix], py = pos[ix + 1], pz = pos[ix + 2];
      let vx = vel[ix], vy = vel[ix + 1], vz = vel[ix + 2];

      if (attracting) {
        // Attraction force toward pointer
        const dx = attractor.x - px;
        const dy = attractor.y - py;
        const dz = attractor.z - pz;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.1;
        const invDist = 1 / dist;

        // Attraction component
        const force = ATTRACT_STRENGTH * dt * invDist;
        vx += dx * force;
        vy += dy * force;
        vz += dz * force;

        // Tangential (orbit) component — cross product of radial with up
        const orbitScale = ORBIT_STRENGTH * dt * invDist;
        vx += -dz * orbitScale;
        vz += dx * orbitScale;
      } else {
        // Scatter: small outward push from origin
        const dx = px, dy = py, dz = pz;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.1;
        const scatterForce = SCATTER_STRENGTH * 0.01 * dt / dist;
        vx += dx * scatterForce;
        vy += dy * scatterForce;
        vz += dz * scatterForce;
      }

      // Drag
      vx *= Math.pow(DRAG, dt * 60);
      vy *= Math.pow(DRAG, dt * 60);
      vz *= Math.pow(DRAG, dt * 60);

      // Integrate position
      pos[ix] = px + vx * dt;
      pos[ix + 1] = py + vy * dt;
      pos[ix + 2] = pz + vz * dt;
      vel[ix] = vx;
      vel[ix + 1] = vy;
      vel[ix + 2] = vz;

      // Color by speed
      const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);
      const t = Math.min(1, speed / 8.0);
      colors.current[i].setHSL(0.6 - t * 0.5, 1.0, 0.4 + t * 0.3);

      // Update instance
      dummy.current.position.set(pos[ix], pos[ix + 1], pos[ix + 2]);
      const scale = 0.02 + t * 0.02;
      dummy.current.scale.setScalar(scale);
      dummy.current.updateMatrix();
      mesh.setMatrixAt(i, dummy.current.matrix);
      mesh.setColorAt(i, colors.current[i]);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    // Update glow indicator position and visibility via ref (avoid reading refs during render)
    if (glowRef.current) {
      glowRef.current.position.copy(attractorPos.current);
      glowRef.current.visible = isAttracting.current;
    }
  });

  return (
    <>
      {/* Background atmosphere */}
      <mesh>
        <sphereGeometry args={[30, 16, 8]} />
        <meshBasicMaterial side={THREE.BackSide} color="#030008" />
      </mesh>

      <color attach="background" args={['#030008']} />
      <ambientLight intensity={0.15} />
      <fogExp2 attach="fog" args={["#020408", 0.04]} />      <hemisphereLight args={['#110033', '#030008', 0.3]} />
      <directionalLight position={[3, 5, 5]} intensity={0.4} />
      <pointLight position={[0, 0, 0]} intensity={30} color="#4422ff" distance={10} />

      {/* Particles */}
      <instancedMesh
        ref={meshRef}
        args={[undefined, undefined, PARTICLE_COUNT]}
        material={particleMat}
        frustumCulled={false}
      >
        <sphereGeometry args={[1, 6, 6]} />
      </instancedMesh>

      {/* Attractor indicator — invisible interaction plane */}
      <mesh visible={false}>
        <planeGeometry args={[20, 20]} />
        <meshBasicMaterial />
      </mesh>

      {/* Attractor glow indicator — position/visibility controlled in useFrame */}
      <mesh ref={glowRef} visible={false}>
        <sphereGeometry args={[0.1, 8, 8]} />
        <meshBasicMaterial color="#ff6644" transparent opacity={0.6} />
      </mesh>

      {/* Hint ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[4.8, 5.0, 64]} />
        <meshBasicMaterial color="#110033" transparent opacity={0.3} />
      </mesh>
    </>
  );
}
