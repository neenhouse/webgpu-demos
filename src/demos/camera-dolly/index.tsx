import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
  normalWorld,
  cameraPosition,
  positionWorld,
  Fn,
  float,
  time,
  oscSine,
  mix,
  vec3,
  positionLocal,
  normalLocal,
} from 'three/tsl';

/**
 * Camera Dolly — Cinematic auto-fly through an archway corridor
 *
 * Features:
 * - 20 archway frames (instanced torus geometry) stretching into the distance
 * - Camera follows a sinusoidal weaving path through the corridor via useFrame
 * - Camera position and look-at both lerp smoothly for cinematic feel
 * - Speed lines: instanced thin cylinders aligned to Z-axis, semi-transparent
 * - Color gradient on arches: near=warm orange, far=cool blue
 * - Emissive glow on arch edges intensifies as camera approaches
 * - Side wall panels with subtle lighting
 * - TSL atmosphere sphere with tunnel-like gradient
 */

const ARCH_COUNT = 20;
const ARCH_SPACING = 3.5;

function makeArchMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();

  const fresnel = Fn(() => {
    const viewDir = cameraPosition.sub(positionWorld).normalize();
    const nDotV = normalWorld.dot(viewDir).saturate();
    return float(1.0).sub(nDotV).pow(2.5);
  });

  // Color: warm near camera, cool far away
  const warmColor = vec3(1.0, 0.6, 0.2);
  const coolColor = vec3(0.2, 0.5, 1.0);
  const midColor = vec3(0.5, 0.3, 0.8);

  mat.colorNode = midColor;
  mat.emissiveNode = warmColor.mul(fresnel().mul(2.5)).add(coolColor.mul(0.3));

  mat.positionNode = positionLocal.add(
    normalLocal.mul(oscSine(time.mul(0.5)).mul(0.01))
  );

  mat.roughness = 0.2;
  mat.metalness = 0.7;
  return mat;
}

function makeSpeedLineMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;
  mat.depthWrite = false;
  mat.blending = THREE.AdditiveBlending;

  const fresnel = Fn(() => {
    const viewDir = cameraPosition.sub(positionWorld).normalize();
    const nDotV = normalWorld.dot(viewDir).saturate();
    return float(1.0).sub(nDotV).pow(1.2);
  });

  mat.colorNode = vec3(0.7, 0.8, 1.0);
  mat.emissiveNode = vec3(0.5, 0.6, 1.0).mul(fresnel().mul(2.0));
  mat.opacityNode = fresnel().mul(0.4);
  mat.roughness = 0.0;
  return mat;
}

function makeTunnelWallMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();
  const gradient = Fn(() => {
    const up = normalWorld.y.mul(0.5).add(0.5);
    const dark = vec3(0.02, 0.01, 0.05);
    const mid = vec3(0.05, 0.03, 0.12);
    return mix(dark, mid, up);
  });
  mat.colorNode = gradient();
  mat.emissiveNode = gradient().mul(0.2);
  mat.roughness = 0.8;
  mat.metalness = 0.3;
  return mat;
}

function makeAtmosphereMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.side = THREE.BackSide;

  const gradient = Fn(() => {
    const up = normalWorld.y.mul(0.5).add(0.5);
    const deep = vec3(0.01, 0.0, 0.04);
    const mid = vec3(0.03, 0.01, 0.08);
    return mix(deep, mid, up);
  });

  mat.colorNode = gradient();
  mat.emissiveNode = gradient().mul(0.4);
  mat.roughness = 1.0;
  return mat;
}

/** 20 instanced archway tori */
function ArchCorridor() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const mat = useMemo(() => makeArchMaterial(), []);

  const matrices = useMemo(() => {
    const ms: THREE.Matrix4[] = [];
    for (let i = 0; i < ARCH_COUNT; i++) {
      const z = -i * ARCH_SPACING;
      const m = new THREE.Matrix4();
      m.makeRotationX(Math.PI / 2);
      m.setPosition(0, 0.5, z);
      ms.push(m);
    }
    return ms;
  }, []);

  useMemo(() => {
    matrices.forEach((m, i) => ref.current?.setMatrixAt(i, m));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <instancedMesh ref={ref} args={[undefined, mat, ARCH_COUNT]} frustumCulled={false}>
      <torusGeometry args={[2.2, 0.12, 16, 60]} />
    </instancedMesh>
  );
}

// Module-scope random values for SpeedLines (avoids Math.random() in useMemo)
const SPEED_LINE_DATA = Array.from({ length: 80 }, (_, i) => {
  const count = 80;
  const angle = (i / count) * Math.PI * 2 + Math.random() * 0.3;
  const r = 1.8 + Math.random() * 1.2;
  const z = -(Math.random() * ARCH_COUNT * ARCH_SPACING);
  return { x: Math.cos(angle) * r, y: Math.sin(angle) * r + 0.5, z };
});

/** Speed lines: instanced thin cylinders flying past */
function SpeedLines() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const mat = useMemo(() => makeSpeedLineMaterial(), []);
  const count = 80;

  const positions = useMemo(() => SPEED_LINE_DATA, []);

  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame(() => {
    if (!ref.current) return;
    const t = Date.now() * 0.001;

    positions.forEach((p, i) => {
      // Lines animate along Z, wrapping around
      const zOffset = ((p.z - t * 8) % (ARCH_COUNT * ARCH_SPACING) + ARCH_COUNT * ARCH_SPACING) % (ARCH_COUNT * ARCH_SPACING);
      dummy.position.set(p.x, p.y, -zOffset);
      dummy.rotation.set(0, 0, 0);
      const len = 0.3 + Math.sin(i * 1.7) * 0.15;
      dummy.scale.set(0.008, 0.008, len);
      dummy.updateMatrix();
      ref.current!.setMatrixAt(i, dummy.matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={ref} args={[undefined, mat, count]} frustumCulled={false}>
      <cylinderGeometry args={[1, 1, 1, 4]} />
    </instancedMesh>
  );
}

/** Floor and ceiling panels */
function TunnelSurfaces() {
  const wallMat = useMemo(() => makeTunnelWallMaterial(), []);

  return (
    <>
      {/* Floor */}
      <mesh material={wallMat} position={[0, -1.7, -(ARCH_COUNT * ARCH_SPACING) / 2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[4.4, ARCH_COUNT * ARCH_SPACING]} />
      </mesh>
      {/* Ceiling */}
      <mesh material={wallMat} position={[0, 2.7, -(ARCH_COUNT * ARCH_SPACING) / 2]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[4.4, ARCH_COUNT * ARCH_SPACING]} />
      </mesh>
      {/* Left wall */}
      <mesh material={wallMat} position={[-2.2, 0.5, -(ARCH_COUNT * ARCH_SPACING) / 2]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[ARCH_COUNT * ARCH_SPACING, 4.4]} />
      </mesh>
      {/* Right wall */}
      <mesh material={wallMat} position={[2.2, 0.5, -(ARCH_COUNT * ARCH_SPACING) / 2]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[ARCH_COUNT * ARCH_SPACING, 4.4]} />
      </mesh>
    </>
  );
}

export default function CameraDolly() {
  const atmMat = useMemo(() => makeAtmosphereMaterial(), []);
  const camState = useRef({
    pos: new THREE.Vector3(0, 0.5, 4),
    lookAt: new THREE.Vector3(0, 0.5, 0),
    progress: 0,
  });
  const targetPos = useMemo(() => new THREE.Vector3(), []);
  const targetLook = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ camera }, delta) => {
    const state = camState.current;
    state.progress += delta * 0.6;

    // Sinusoidal weaving path through the corridor
    const z = -(state.progress * 4.5) % (ARCH_COUNT * ARCH_SPACING);
    const wave = Math.sin(state.progress * 0.8) * 0.5;
    const waveY = Math.sin(state.progress * 0.6 + 1.2) * 0.2 + 0.3;

    targetPos.set(wave, waveY, z + 4);
    targetLook.set(wave * 1.2, waveY * 0.8, z);

    state.pos.lerp(targetPos, delta * 2.5);
    state.lookAt.lerp(targetLook, delta * 2.5);

    camera.position.copy(state.pos);
    camera.lookAt(state.lookAt);
  });

  return (
    <>
      <ambientLight intensity={0.15} />
      <fogExp2 attach="fog" args={["#020408", 0.04]} />      <hemisphereLight args={['#334466', '#111122', 0.3]} />

      {/* Tunnel interior lights */}
      <pointLight position={[-1.5, 1.5, -10]} intensity={1.5} color={0xff7733} distance={8} />
      <pointLight position={[1.5, 1.5, -25]} intensity={1.5} color={0x4488ff} distance={8} />
      <pointLight position={[-1, 0.5, -45]} intensity={1.5} color={0xaa44ff} distance={8} />
      <pointLight position={[1, 1.5, -60]} intensity={1.5} color={0x44ffaa} distance={8} />

      {/* Atmosphere */}
      <mesh material={atmMat}>
        <sphereGeometry args={[80, 32, 32]} />
      </mesh>

      {/* Tunnel geometry */}
      <ArchCorridor />
      <TunnelSurfaces />
      <SpeedLines />

      {/* End of tunnel: glowing portal */}
      <mesh position={[0, 0.5, -(ARCH_COUNT * ARCH_SPACING)]}>
        <torusGeometry args={[2.5, 0.08, 16, 60]} />
        <meshStandardMaterial color={0x4488ff} emissive={0x4488ff} emissiveIntensity={3.0} />
      </mesh>
      <mesh position={[0, 0.5, -(ARCH_COUNT * ARCH_SPACING)]}>
        <circleGeometry args={[2.3, 48]} />
        <meshStandardMaterial color={0x0022ff} emissive={0x2244ff} emissiveIntensity={2.0} transparent opacity={0.3} />
      </mesh>
    </>
  );
}
