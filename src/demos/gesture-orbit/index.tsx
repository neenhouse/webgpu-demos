import { useRef, useMemo, useEffect, useCallback, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import { color, time, oscSine, normalWorld, cameraPosition, positionWorld, Fn, float, mix } from 'three/tsl';

/**
 * Gesture Orbit — Enhanced orbit controls with momentum and snap
 *
 * Techniques:
 * - Manual orbit: pointer drag → spherical coordinates
 * - Momentum: on release, angular velocity decays over time
 * - Double-tap to snap to preset camera angles with smooth transition
 * - Camera lerp for smooth snap transitions
 * - Central torus knot with wireframe overlay
 * - TSL glowing material on the subject
 * - Snap positions: front, top, side, isometric
 */

const SNAP_PRESETS = [
  { label: 'Front', phi: Math.PI / 2, theta: 0 },
  { label: 'Top', phi: 0.01, theta: 0 },
  { label: 'Side', phi: Math.PI / 2, theta: Math.PI / 2 },
  { label: 'ISO', phi: Math.PI / 4, theta: Math.PI / 4 },
];

const ORBIT_RADIUS = 5.0;
const DRAG_SPEED = 0.006;
const MOMENTUM_DECAY = 0.94;

export default function GestureOrbit() {
  const { camera, gl } = useThree();
  const spherical = useRef({ phi: Math.PI / 3, theta: 0.3 });
  const targetSpherical = useRef({ phi: Math.PI / 3, theta: 0.3 });
  const velocity = useRef({ dphi: 0, dtheta: 0 });
  const isDragging = useRef(false);
  const lastPointer = useRef({ x: 0, y: 0 });
  const lastTap = useRef(0);
  const snapIndex = useRef(-1);
  const isSnapping = useRef(false);
  const [activeSnap, setActiveSnap] = useState(-1);

  useEffect(() => {
    camera.position.set(0, 0, ORBIT_RADIUS);
    camera.lookAt(0, 0, 0);
  }, [camera]);

  const handlePointerDown = useCallback((e: PointerEvent) => {
    isDragging.current = true;
    lastPointer.current = { x: e.clientX, y: e.clientY };
    velocity.current = { dphi: 0, dtheta: 0 };
    isSnapping.current = false;

    // Double-tap detection
    const now = Date.now();
    if (now - lastTap.current < 300) {
      // Snap to next preset
      snapIndex.current = (snapIndex.current + 1) % SNAP_PRESETS.length;
      const preset = SNAP_PRESETS[snapIndex.current];
      targetSpherical.current = { phi: preset.phi, theta: preset.theta };
      isSnapping.current = true;
      setActiveSnap(snapIndex.current);
    }
    lastTap.current = now;
  }, []);

  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - lastPointer.current.x;
    const dy = e.clientY - lastPointer.current.y;

    const dtheta = -dx * DRAG_SPEED;
    const dphi = -dy * DRAG_SPEED;

    // Track velocity for momentum
    velocity.current.dtheta = dtheta;
    velocity.current.dphi = dphi;

    targetSpherical.current.theta += dtheta;
    targetSpherical.current.phi = Math.max(0.05, Math.min(Math.PI - 0.05,
      targetSpherical.current.phi + dphi
    ));

    lastPointer.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handlePointerUp = useCallback(() => {
    isDragging.current = false;
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

  const torusKnotMat = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.roughness = 0.1;
    mat.metalness = 0.7;
    const fresnel = Fn(() => {
      const viewDir = cameraPosition.sub(positionWorld).normalize();
      const nDotV = normalWorld.dot(viewDir).saturate();
      return float(1.0).sub(nDotV).pow(3.0);
    });
    const t = oscSine(time.mul(0.6)).mul(0.5).add(0.5);
    mat.colorNode = mix(color(0x4400cc), color(0x00ccff), t);
    mat.emissiveNode = mix(color(0x220066), color(0x0066cc), t).mul(fresnel().add(float(0.3)).mul(float(2.0)));
    return mat;
  }, []);

  const wireMat = useMemo(() => {
    const mat = new THREE.MeshBasicNodeMaterial();
    mat.wireframe = true;
    const pulse = oscSine(time.mul(1.5)).mul(0.5).add(0.5);
    mat.colorNode = mix(color(0x4400cc), color(0x44aaff), pulse).mul(float(0.6));
    return mat;
  }, []);

  const ringMat = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.roughness = 0.4;
    mat.metalness = 0.8;
    const pulse = oscSine(time.mul(0.8)).mul(0.2).add(0.8);
    mat.colorNode = color(0x220055);
    mat.emissiveNode = color(0x4422ff).mul(pulse.mul(0.8));
    return mat;
  }, []);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.033);

    if (!isDragging.current && !isSnapping.current) {
      // Apply momentum with decay
      targetSpherical.current.theta += velocity.current.dtheta;
      targetSpherical.current.phi = Math.max(0.05, Math.min(Math.PI - 0.05,
        targetSpherical.current.phi + velocity.current.dphi
      ));
      velocity.current.dtheta *= MOMENTUM_DECAY;
      velocity.current.dphi *= MOMENTUM_DECAY;

      // Auto-rotate when no momentum
      const totalVel = Math.abs(velocity.current.dtheta) + Math.abs(velocity.current.dphi);
      if (totalVel < 0.0001) {
        targetSpherical.current.theta += delta * 0.2;
      }
    }

    // Smooth lerp to target spherical
    const lerpFactor = isSnapping.current ? 1 - Math.pow(0.001, dt) : 0.15;
    spherical.current.theta += (targetSpherical.current.theta - spherical.current.theta) * lerpFactor;
    spherical.current.phi += (targetSpherical.current.phi - spherical.current.phi) * lerpFactor;

    if (isSnapping.current) {
      const diff = Math.abs(spherical.current.theta - targetSpherical.current.theta)
        + Math.abs(spherical.current.phi - targetSpherical.current.phi);
      if (diff < 0.001) isSnapping.current = false;
    }

    // Update camera position from spherical
    const { phi, theta } = spherical.current;
    camera.position.set(
      ORBIT_RADIUS * Math.sin(phi) * Math.sin(theta),
      ORBIT_RADIUS * Math.cos(phi),
      ORBIT_RADIUS * Math.sin(phi) * Math.cos(theta)
    );
    camera.lookAt(0, 0, 0);
  });

  return (
    <>
      {/* Background atmosphere */}
      <mesh>
        <sphereGeometry args={[30, 16, 8]} />
        <meshBasicMaterial side={THREE.BackSide} color="#030008" />
      </mesh>

      <color attach="background" args={['#030008']} />

      <fogExp2 attach="fog" args={["#020408", 0.04]} />
      <ambientLight intensity={0.08} />
      <hemisphereLight args={['#220055', '#030008', 0.4]} />
      <directionalLight position={[5, 8, 5]} intensity={0.6} />
      <pointLight position={[0, 0, 0]} intensity={40} color="#4422ff" distance={8} />
      <pointLight position={[3, 3, 3]} intensity={15} color="#44aaff" distance={8} />

      {/* Central torus knot */}
      <mesh material={torusKnotMat}>
        <torusKnotGeometry args={[0.8, 0.3, 128, 16, 2, 3]} />
      </mesh>

      {/* Wireframe overlay */}
      <mesh material={wireMat} scale={[1.02, 1.02, 1.02]}>
        <torusKnotGeometry args={[0.8, 0.3, 64, 8, 2, 3]} />
      </mesh>

      {/* Orbital rings for visual reference */}
      {[2.0, 2.5, 3.0].map((r, i) => (
        <mesh key={i} material={ringMat} rotation={[i * Math.PI / 6, i * Math.PI / 4, 0]}>
          <torusGeometry args={[r, 0.02, 8, 64]} />
        </mesh>
      ))}

      {/* Snap presets UI */}
      {SNAP_PRESETS.map((preset, i) => {
        const angle = (i / SNAP_PRESETS.length) * Math.PI * 2;
        const r = 4.5;
        return (
          <mesh
            key={i}
            position={[Math.cos(angle) * r, 0, Math.sin(angle) * r]}
            onClick={() => {
              snapIndex.current = i;
              targetSpherical.current = { phi: preset.phi, theta: preset.theta };
              isSnapping.current = true;
              setActiveSnap(i);
            }}
          >
            <sphereGeometry args={[0.12, 8, 8]} />
            <meshStandardMaterial
              color={activeSnap === i ? '#44aaff' : '#220055'}
              emissive={activeSnap === i ? '#4422ff' : '#110033'}
            />
          </mesh>
        );
      })}
    </>
  );
}
