import { useRef, useMemo, useEffect, useCallback } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three/webgpu';
import { color, time, oscSine, normalWorld, cameraPosition, positionWorld, Fn, float, mix, vec3 } from 'three/tsl';

/**
 * FPS Explorer — First-person camera through a glowing corridor
 *
 * Techniques:
 * - WASD keyboard movement with pointer lock mouse look
 * - Manual camera euler integration in useFrame
 * - Keyboard state tracked via keydown/keyup listeners
 * - TSL glowing wall material with fresnel + animated emissive
 * - Floating crystals with pulsing glow
 * - Archway openings built from box geometry
 * - Html crosshair overlay
 * - Atmospheric fog
 */

const MOVE_SPEED = 5.0;
const LOOK_SENSITIVITY = 0.002;
const CORRIDOR_LENGTH = 40;
const CORRIDOR_WIDTH = 4;
const CORRIDOR_HEIGHT = 3;

export default function FpsExplorer() {
  const { camera, gl, scene } = useThree();
  const keys = useRef<Record<string, boolean>>({});
  const euler = useRef(new THREE.Euler(0, 0, 0, 'YXZ'));
  const isLocked = useRef(false);
  const camRef = useRef<THREE.PerspectiveCamera | null>(null);

  // Set initial camera position
  useEffect(() => {
    camera.position.set(0, 1.6, 0);
    camera.fov = 75;
    (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
    camRef.current = camera as THREE.PerspectiveCamera;

    scene.fog = new THREE.FogExp2(0x050010, 0.04);
    return () => { scene.fog = null; };
  }, [camera, scene]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    keys.current[e.code] = true;
  }, []);
  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    keys.current[e.code] = false;
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isLocked.current) return;
    euler.current.setFromQuaternion(camera.quaternion);
    euler.current.y -= e.movementX * LOOK_SENSITIVITY;
    euler.current.x -= e.movementY * LOOK_SENSITIVITY;
    euler.current.x = Math.max(-Math.PI / 2.5, Math.min(Math.PI / 2.5, euler.current.x));
    camera.quaternion.setFromEuler(euler.current);
  }, [camera]);

  const handleClick = useCallback(() => {
    (gl.domElement as HTMLCanvasElement).requestPointerLock();
  }, [gl]);

  const handlePointerLockChange = useCallback(() => {
    isLocked.current = document.pointerLockElement === gl.domElement;
  }, [gl]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousemove', handleMouseMove);
    gl.domElement.addEventListener('click', handleClick);
    document.addEventListener('pointerlockchange', handlePointerLockChange);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousemove', handleMouseMove);
      gl.domElement.removeEventListener('click', handleClick);
      document.removeEventListener('pointerlockchange', handlePointerLockChange);
      if (document.pointerLockElement === gl.domElement) document.exitPointerLock();
    };
  }, [handleKeyDown, handleKeyUp, handleMouseMove, handleClick, handlePointerLockChange, gl]);

  const glowWallMat = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.roughness = 0.8;
    mat.metalness = 0.1;
    // Animated emissive strips
    const stripe = Fn(() => {
      const p = positionWorld;
      const t = time.mul(0.5);
      const wave = oscSine(p.y.mul(4.0).add(t)).mul(0.5).add(0.5);
      const zFade = float(1.0).sub(p.z.abs().mul(0.04)).saturate();
      return color(0x1a0840).mul(wave.mul(zFade).mul(0.8)).add(color(0x0a0020));
    });
    mat.colorNode = Fn(() => color(0x1a1030))();
    mat.emissiveNode = stripe();
    return mat;
  }, []);

  const glowFloorMat = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.roughness = 0.5;
    mat.metalness = 0.4;
    const pulse = oscSine(time.mul(0.3)).mul(0.2).add(0.1);
    mat.colorNode = color(0x080015);
    mat.emissiveNode = color(0x220060).mul(pulse);
    return mat;
  }, []);

  const crystalMat = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.transparent = true;
    mat.roughness = 0.0;
    mat.metalness = 0.8;
    const fresnel = Fn(() => {
      const viewDir = cameraPosition.sub(positionWorld).normalize();
      const nDotV = normalWorld.dot(viewDir).saturate();
      return float(1.0).sub(nDotV).pow(3.0);
    });
    const t = oscSine(time.mul(1.5)).mul(0.5).add(0.5);
    mat.colorNode = mix(vec3(0.2, 0.4, 1.0), vec3(0.8, 0.2, 1.0), t);
    mat.emissiveNode = color(0x4422ff).mul(float(2.5)).mul(fresnel().add(float(0.3)));
    mat.opacityNode = fresnel().mul(float(0.7)).add(float(0.3));
    return mat;
  }, []);

  const archwayMat = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.roughness = 0.3;
    mat.metalness = 0.7;
    const glow = oscSine(time.mul(0.8)).mul(0.4).add(0.6);
    mat.colorNode = color(0x220044);
    mat.emissiveNode = color(0x6600ff).mul(glow.mul(1.5));
    return mat;
  }, []);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.033);
    const k = keys.current;

    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();

    const right = new THREE.Vector3();
    right.crossVectors(forward, camera.up).normalize();

    const moveVec = new THREE.Vector3();
    if (k['KeyW'] || k['ArrowUp']) moveVec.addScaledVector(forward, MOVE_SPEED * dt);
    if (k['KeyS'] || k['ArrowDown']) moveVec.addScaledVector(forward, -MOVE_SPEED * dt);
    if (k['KeyA'] || k['ArrowLeft']) moveVec.addScaledVector(right, -MOVE_SPEED * dt);
    if (k['KeyD'] || k['ArrowRight']) moveVec.addScaledVector(right, MOVE_SPEED * dt);

    camera.position.add(moveVec);

    // Clamp to corridor bounds
    const hw = CORRIDOR_WIDTH / 2 - 0.5;
    camera.position.x = Math.max(-hw, Math.min(hw, camera.position.x));
    camera.position.y = 1.6;
    camera.position.z = Math.max(-CORRIDOR_LENGTH / 2 + 1, Math.min(CORRIDOR_LENGTH / 2 - 1, camera.position.z));
  });

  // Build corridor geometry
  const crystalPositions: [number, number, number, number][] = useMemo(() => {
    const pos: [number, number, number, number][] = [];
    for (let z = -16; z <= 16; z += 4) {
      pos.push([-1.2, 0.5 + Math.random() * 1.0, z, Math.random() * Math.PI * 2]);
      pos.push([1.2, 0.5 + Math.random() * 1.0, z, Math.random() * Math.PI * 2]);
    }
    return pos;
  }, []);

  const archwayZPositions = [-16, -8, 0, 8, 16];

  return (
    <>
      <color attach="background" args={['#050010']} />
      <ambientLight intensity={0.05} />
      <hemisphereLight args={['#220044', '#050010', 0.2]} />

      {/* Corridor floor */}
      <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]} material={glowFloorMat}>
        <planeGeometry args={[CORRIDOR_WIDTH, CORRIDOR_LENGTH]} />
      </mesh>
      {/* Ceiling */}
      <mesh position={[0, CORRIDOR_HEIGHT, 0]} rotation={[Math.PI / 2, 0, 0]} material={glowFloorMat}>
        <planeGeometry args={[CORRIDOR_WIDTH, CORRIDOR_LENGTH]} />
      </mesh>
      {/* Left wall */}
      <mesh position={[-CORRIDOR_WIDTH / 2, CORRIDOR_HEIGHT / 2, 0]} rotation={[0, Math.PI / 2, 0]} material={glowWallMat}>
        <planeGeometry args={[CORRIDOR_LENGTH, CORRIDOR_HEIGHT]} />
      </mesh>
      {/* Right wall */}
      <mesh position={[CORRIDOR_WIDTH / 2, CORRIDOR_HEIGHT / 2, 0]} rotation={[0, -Math.PI / 2, 0]} material={glowWallMat}>
        <planeGeometry args={[CORRIDOR_LENGTH, CORRIDOR_HEIGHT]} />
      </mesh>

      {/* Arched doorways */}
      {archwayZPositions.map((z, i) => (
        <group key={i} position={[0, 0, z]}>
          {/* Left pillar */}
          <mesh position={[-1.3, 1.2, 0]} material={archwayMat}>
            <boxGeometry args={[0.3, 2.4, 0.3]} />
          </mesh>
          {/* Right pillar */}
          <mesh position={[1.3, 1.2, 0]} material={archwayMat}>
            <boxGeometry args={[0.3, 2.4, 0.3]} />
          </mesh>
          {/* Lintel */}
          <mesh position={[0, 2.55, 0]} material={archwayMat}>
            <boxGeometry args={[2.9, 0.3, 0.3]} />
          </mesh>
          {/* Top cap light */}
          <pointLight position={[0, 2.8, 0]} intensity={8} color="#6600ff" distance={5} />
        </group>
      ))}

      {/* Floating crystals */}
      {crystalPositions.map(([x, y, z, rot], i) => (
        <mesh key={i} position={[x, y, z]} rotation={[0, rot, rot * 0.3]} material={crystalMat}>
          <octahedronGeometry args={[0.18, 0]} />
        </mesh>
      ))}

      {/* Ambient point lights along corridor */}
      {[-16, -8, 0, 8, 16].map((z, i) => (
        <pointLight key={i} position={[0, 2.5, z]} intensity={15} color={i % 2 === 0 ? '#3300aa' : '#660099'} distance={10} />
      ))}

      {/* Crosshair */}
      <Html center style={{ pointerEvents: 'none', userSelect: 'none' }}>
        <div style={{
          position: 'fixed', left: '50%', top: '50%',
          transform: 'translate(-50%,-50%)',
          width: 20, height: 20,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            width: 20, height: 2, background: 'rgba(255,255,255,0.8)',
            position: 'absolute',
          }} />
          <div style={{
            width: 2, height: 20, background: 'rgba(255,255,255,0.8)',
            position: 'absolute',
          }} />
        </div>
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          color: 'rgba(180,120,255,0.7)', fontSize: 13, fontFamily: 'monospace',
          background: 'rgba(0,0,0,0.4)', padding: '4px 12px', borderRadius: 4,
          pointerEvents: 'none',
        }}>
          Click to lock mouse · WASD / Arrow Keys to move
        </div>
      </Html>
    </>
  );
}
