import { useRef, useMemo, useState, useCallback, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import { color, time, oscSine, float, uniform } from 'three/tsl';

/**
 * Drag Physics — Spring-physics drag interactions on 12 instanced spheres
 *
 * Techniques:
 * - Raycasting against instanced mesh to detect drag targets
 * - CPU spring physics: each sphere springs back to origin on release
 * - Trail particles spawned behind fast-moving spheres
 * - Click feedback via scale pulse animation
 * - Pointer lock for smooth drag across entire viewport
 */

const SPHERE_COUNT = 12;
const SPRING_K = 12.0;
const DAMPING = 4.5;
const MAX_TRAIL = 300;

interface SphereState {
  origin: THREE.Vector3;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  scale: number;
  pulsing: boolean;
  pulseTimer: number;
}

interface TrailParticle {
  pos: THREE.Vector3;
  life: number;
  maxLife: number;
  color: THREE.Color;
}

const SPHERE_COLORS = [
  0xff4466, 0xff7744, 0xffaa00, 0xddff00,
  0x44ff88, 0x00ffcc, 0x44ccff, 0x6688ff,
  0xaa44ff, 0xff44cc, 0xff88aa, 0x88ffaa,
];

// Pre-computed Color objects to avoid allocations in useFrame
const SPHERE_COLOR_OBJECTS = SPHERE_COLORS.map(hex => new THREE.Color(hex));

const SPHERE_ORIGINS: [number, number, number][] = [
  [-2.5, 1.5, 0], [0, 1.5, 0], [2.5, 1.5, 0],
  [-2.5, 0, 0], [0, 0, 0], [2.5, 0, 0],
  [-2.5, -1.5, 0], [0, -1.5, 0], [2.5, -1.5, 0],
  [-1.25, 0.75, 0.5], [1.25, 0.75, 0.5], [0, -0.75, 0.5],
];

export default function DragPhysics() {
  const { gl, camera, size } = useThree();
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const trailMeshRef = useRef<THREE.InstancedMesh>(null);
  const sphereStates = useRef<SphereState[]>([]);
  const trailParticles = useRef<TrailParticle[]>([]);
  const draggedIndex = useRef<number>(-1);
  const dragPlane = useRef<THREE.Plane>(new THREE.Plane());
  const dragOffset = useRef<THREE.Vector3>(new THREE.Vector3());
  const pointerWorld = useRef<THREE.Vector3>(new THREE.Vector3());
  const raycaster = useRef<THREE.Raycaster>(new THREE.Raycaster());
  const dummy = useRef<THREE.Object3D>(new THREE.Object3D());
  const [, forceUpdate] = useState(0);

  // Initialize sphere states
  useEffect(() => {
    sphereStates.current = SPHERE_ORIGINS.map(([x, y, z]) => ({
      origin: new THREE.Vector3(x, y, z),
      pos: new THREE.Vector3(x, y, z),
      vel: new THREE.Vector3(),
      scale: 1.0,
      pulsing: false,
      pulseTimer: 0,
    }));
    // Defer state update to avoid synchronous setState in effect
    requestAnimationFrame(() => forceUpdate(n => n + 1));
  }, []);

  const sphereMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.roughness = 0.15;
    mat.metalness = 0.7;
    const pulse = oscSine(time.mul(3.0)).mul(0.3).add(0.7);
    mat.emissiveNode = color(0xff4466).mul(pulse.mul(uniform(0.5)));
    return mat;
  }, []);

  const trailMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.transparent = true;
    mat.depthWrite = false;
    mat.blending = THREE.AdditiveBlending;
    mat.emissiveNode = color(0xff8866).mul(float(2.0));
    mat.opacityNode = float(0.6);
    return mat;
  }, []);

  const getPointerWorld = useCallback((event: MouseEvent | PointerEvent) => {
    const rect = (gl.domElement as HTMLCanvasElement).getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.current.setFromCamera(new THREE.Vector2(x, y), camera);
    return raycaster.current;
  }, [gl, camera, size]);

  const handlePointerDown = useCallback((e: PointerEvent) => {
    const rc = getPointerWorld(e);
    const mesh = meshRef.current;
    if (!mesh) return;

    const hits = rc.intersectObject(mesh);
    if (hits.length > 0 && hits[0].instanceId !== undefined) {
      const idx = hits[0].instanceId;
      draggedIndex.current = idx;

      const state = sphereStates.current[idx];
      // Drag plane: facing camera at sphere position
      const cameraDir = camera.getWorldDirection(new THREE.Vector3());
      dragPlane.current.setFromNormalAndCoplanarPoint(cameraDir, state.pos);
      // Offset from sphere center to hit point
      dragOffset.current.copy(hits[0].point).sub(state.pos);

      // Trigger scale pulse
      state.pulsing = true;
      state.pulseTimer = 0;

      e.preventDefault();
    }
  }, [getPointerWorld, camera]);

  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (draggedIndex.current < 0) return;
    const rc = getPointerWorld(e);
    const target = new THREE.Vector3();
    rc.ray.intersectPlane(dragPlane.current, target);
    pointerWorld.current.copy(target).sub(dragOffset.current);
  }, [getPointerWorld]);

  const handlePointerUp = useCallback(() => {
    draggedIndex.current = -1;
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
  }, [handlePointerDown, handlePointerMove, handlePointerUp, gl]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.033);
    const states = sphereStates.current;
    const mesh = meshRef.current;
    const trailMesh = trailMeshRef.current;
    if (!mesh || states.length === 0) return;

    for (let i = 0; i < SPHERE_COUNT; i++) {
      const s = states[i];
      if (i === draggedIndex.current) {
        // Spring toward pointer (soft follow)
        const toTarget = pointerWorld.current.clone().sub(s.pos);
        s.vel.addScaledVector(toTarget, 20 * dt);
        s.vel.multiplyScalar(1 - DAMPING * dt);
        s.pos.addScaledVector(s.vel, dt);
      } else {
        // Spring back to origin
        const toOrigin = s.origin.clone().sub(s.pos);
        s.vel.addScaledVector(toOrigin, SPRING_K * dt);
        s.vel.multiplyScalar(1 - DAMPING * dt);
        const speed = s.vel.length();
        s.pos.addScaledVector(s.vel, dt);

        // Spawn trail particles for fast movement
        if (speed > 2.0 && trailParticles.current.length < MAX_TRAIL) {
          trailParticles.current.push({
            pos: s.pos.clone(),
            life: 0,
            maxLife: 0.4 + Math.random() * 0.3,
            color: SPHERE_COLOR_OBJECTS[i].clone(),
          });
        }
      }

      // Scale pulse on click
      if (s.pulsing) {
        s.pulseTimer += dt;
        const t = s.pulseTimer / 0.4;
        if (t >= 1) {
          s.pulsing = false;
          s.scale = 1.0;
        } else {
          s.scale = 1.0 + Math.sin(t * Math.PI) * 0.4;
        }
      } else {
        s.scale = 1.0;
      }

      dummy.current.position.copy(s.pos);
      dummy.current.scale.setScalar(0.38 * s.scale);
      dummy.current.updateMatrix();
      mesh.setMatrixAt(i, dummy.current.matrix);

      // Set per-instance color
      mesh.setColorAt(i, SPHERE_COLOR_OBJECTS[i]);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    // Update trail particles
    const alive: TrailParticle[] = [];
    for (const p of trailParticles.current) {
      p.life += dt;
      if (p.life < p.maxLife) alive.push(p);
    }
    trailParticles.current = alive;

    // Render trail as instanced small spheres
    if (trailMesh) {
      const count = Math.min(alive.length, MAX_TRAIL);
      for (let i = 0; i < count; i++) {
        const p = alive[i];
        const t = p.life / p.maxLife;
        dummy.current.position.copy(p.pos);
        dummy.current.scale.setScalar(0.05 * (1 - t));
        dummy.current.updateMatrix();
        trailMesh.setMatrixAt(i, dummy.current.matrix);
        trailMesh.setColorAt(i, p.color);
      }
      // Hide unused slots
      for (let i = count; i < MAX_TRAIL; i++) {
        dummy.current.position.set(9999, 9999, 9999);
        dummy.current.scale.setScalar(0);
        dummy.current.updateMatrix();
        trailMesh.setMatrixAt(i, dummy.current.matrix);
      }
      trailMesh.instanceMatrix.needsUpdate = true;
      if (trailMesh.instanceColor) trailMesh.instanceColor.needsUpdate = true;
      trailMesh.count = count;
    }
  });

  return (
    <>
      {/* Background atmosphere */}
      <mesh>
        <sphereGeometry args={[30, 16, 8]} />
        <meshBasicMaterial side={THREE.BackSide} color="#0d0010" />
      </mesh>

      <color attach="background" args={['#0d0010']} />

      <fogExp2 attach="fog" args={["#020408", 0.04]} />
      <ambientLight intensity={0.1} />
      <hemisphereLight args={['#331144', '#110022', 0.5]} />
      <directionalLight position={[5, 8, 5]} intensity={0.8} />
      <pointLight position={[0, 0, 3]} intensity={20} color="#ff4466" distance={10} />

      <instancedMesh
        ref={meshRef}
        args={[undefined, undefined, SPHERE_COUNT]}
        material={sphereMaterial}
        frustumCulled={false}
      >
        <sphereGeometry args={[1, 24, 16]} />
      </instancedMesh>

      <instancedMesh
        ref={trailMeshRef}
        args={[undefined, undefined, MAX_TRAIL]}
        material={trailMaterial}
        frustumCulled={false}
      >
        <sphereGeometry args={[1, 8, 8]} />
      </instancedMesh>

      {/* Invisible large sphere to catch missed drags */}
      <mesh visible={false}>
        <sphereGeometry args={[8, 8, 8]} />
        <meshBasicMaterial side={THREE.BackSide} />
      </mesh>

      {/* Instructions */}
      <mesh position={[0, -2.8, 0]}>
        <planeGeometry args={[6, 0.5]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>
    </>
  );
}
