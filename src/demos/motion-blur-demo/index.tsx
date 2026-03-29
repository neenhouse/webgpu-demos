import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';

/**
 * Motion Blur Demo — per-object ghost trails showing speed/direction
 *
 * Demonstrates:
 * - 5 objects at different animation speeds
 * - 8 ghost copies per object with decreasing opacity
 * - AdditiveBlending on ghosts for energy accumulation effect
 * - Static grid background as reference for motion
 * - Speed-based ghost brightness
 * - Different motion types: spin, orbit, swing, wobble, stationary
 */

const GHOST_COUNT = 8;
const OBJECT_COUNT = 5;

interface TrailedObject {
  id: number;
  label: string;
  basePosition: [number, number, number];
  motionType: 'spin' | 'orbit' | 'swing' | 'wobble' | 'static';
  speed: number;
  primaryColor: string;
  emissiveColor: string;
  shape: 'torusKnot' | 'sphere' | 'box' | 'cube' | 'torus';
  historyPositions: THREE.Vector3[];
  historyRotations: THREE.Euler[];
}

export default function MotionBlurDemo() {
  const objectRefs = useRef<THREE.Mesh[]>([]);
  const ghostRefs = useRef<THREE.Mesh[][]>(
    Array.from({ length: OBJECT_COUNT }, () => Array(GHOST_COUNT).fill(null))
  );

  const objects = useMemo<TrailedObject[]>(() => [
    {
      id: 0,
      label: 'Fast Spin',
      basePosition: [-4, 0, 0],
      motionType: 'spin',
      speed: 4.0,
      primaryColor: '#ff4422',
      emissiveColor: '#ff2200',
      shape: 'torusKnot',
      historyPositions: Array(GHOST_COUNT).fill(null).map(() => new THREE.Vector3(-4, 0, 0)),
      historyRotations: Array(GHOST_COUNT).fill(null).map(() => new THREE.Euler()),
    },
    {
      id: 1,
      label: 'Medium Orbit',
      basePosition: [0, 0, 0],
      motionType: 'orbit',
      speed: 1.5,
      primaryColor: '#44ff44',
      emissiveColor: '#22ff00',
      shape: 'sphere',
      historyPositions: Array(GHOST_COUNT).fill(null).map(() => new THREE.Vector3(0, 0, 2)),
      historyRotations: Array(GHOST_COUNT).fill(null).map(() => new THREE.Euler()),
    },
    {
      id: 2,
      label: 'Pendulum Swing',
      basePosition: [4, 1, 0],
      motionType: 'swing',
      speed: 2.5,
      primaryColor: '#4488ff',
      emissiveColor: '#2244ff',
      shape: 'box',
      historyPositions: Array(GHOST_COUNT).fill(null).map(() => new THREE.Vector3(4, 0, 0)),
      historyRotations: Array(GHOST_COUNT).fill(null).map(() => new THREE.Euler()),
    },
    {
      id: 3,
      label: 'Slow Rotation',
      basePosition: [-2, 0, 3],
      motionType: 'wobble',
      speed: 0.4,
      primaryColor: '#ffcc44',
      emissiveColor: '#ff9900',
      shape: 'cube',
      historyPositions: Array(GHOST_COUNT).fill(null).map(() => new THREE.Vector3(-2, 0, 3)),
      historyRotations: Array(GHOST_COUNT).fill(null).map(() => new THREE.Euler()),
    },
    {
      id: 4,
      label: 'Reference',
      basePosition: [2, 0, 3],
      motionType: 'static',
      speed: 0.0,
      primaryColor: '#aaaaaa',
      emissiveColor: '#444444',
      shape: 'torus',
      historyPositions: Array(GHOST_COUNT).fill(null).map(() => new THREE.Vector3(2, 0, 3)),
      historyRotations: Array(GHOST_COUNT).fill(null).map(() => new THREE.Euler()),
    },
  ], []);

  // Position history ring buffer
  const historyBuffer = useRef(
    objects.map((obj) => ({
      positions: Array(GHOST_COUNT).fill(null).map(() => obj.basePosition ? new THREE.Vector3(...obj.basePosition) : new THREE.Vector3()),
      rotations: Array(GHOST_COUNT).fill(null).map(() => new THREE.Euler()),
      writeIdx: 0,
    }))
  );

  const setObjRef = (mesh: THREE.Mesh | null, i: number) => {
    if (mesh) objectRefs.current[i] = mesh;
  };
  const setGhostRef = (mesh: THREE.Mesh | null, objIdx: number, ghostIdx: number) => {
    if (mesh) ghostRefs.current[objIdx][ghostIdx] = mesh;
  };

  // Ghost material: additive blending, opacity based on ghost age
  const makeGhostMat = (objColor: string, opacity: number) => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.color.set(objColor);
    mat.emissive.set(objColor);
    mat.emissiveIntensity = 1.5;
    mat.transparent = true;
    mat.opacity = opacity;
    mat.blending = THREE.AdditiveBlending;
    mat.depthWrite = false;
    mat.roughness = 0.8;
    mat.metalness = 0.0;
    return mat;
  };

  const ghostMaterials = useMemo(() =>
    objects.map((obj) =>
      Array(GHOST_COUNT).fill(null).map((_, gi) => {
        const age = (gi + 1) / GHOST_COUNT; // 0=newest, 1=oldest
        const opacity = (1 - age) * 0.25;
        return makeGhostMat(obj.primaryColor, opacity);
      })
    ), [objects]
  );

  const frameCount = useRef(0);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    frameCount.current++;

    objects.forEach((obj, oi) => {
      const mesh = objectRefs.current[oi];
      if (!mesh) return;

      // Compute current position & rotation
      let px = obj.basePosition[0];
      let py = obj.basePosition[1];
      let pz = obj.basePosition[2];
      let rx = 0, ry = 0, rz = 0;

      switch (obj.motionType) {
        case 'spin':
          rx = t * obj.speed * 2.3;
          ry = t * obj.speed;
          rz = t * obj.speed * 0.7;
          break;
        case 'orbit':
          px = Math.cos(t * obj.speed) * 2.5;
          pz = Math.sin(t * obj.speed) * 2.5;
          py = Math.sin(t * obj.speed * 1.3) * 0.5;
          ry = t * obj.speed;
          break;
        case 'swing':
          px = obj.basePosition[0] + Math.sin(t * obj.speed) * 2.0;
          py = obj.basePosition[1] - (1 - Math.abs(Math.sin(t * obj.speed))) * 0.5;
          rz = Math.sin(t * obj.speed) * 0.4;
          break;
        case 'wobble':
          ry = t * obj.speed;
          rx = t * obj.speed * 0.3;
          py = obj.basePosition[1] + Math.sin(t * 1.5) * 0.1;
          break;
        case 'static':
        default:
          // No motion — reference object
          ry = t * 0.05;
          break;
      }

      mesh.position.set(px, py, pz);
      mesh.rotation.set(rx, ry, rz);

      // Update history buffer (write every 3 frames for broader ghost spread)
      if (frameCount.current % 3 === oi) {
        const buf = historyBuffer.current[oi];
        buf.positions[buf.writeIdx].set(px, py, pz);
        buf.rotations[buf.writeIdx].set(rx, ry, rz);
        buf.writeIdx = (buf.writeIdx + 1) % GHOST_COUNT;
      }

      // Update ghost meshes from history
      const buf = historyBuffer.current[oi];
      for (let gi = 0; gi < GHOST_COUNT; gi++) {
        const ghost = ghostRefs.current[oi][gi];
        if (!ghost) continue;
        const histIdx = (buf.writeIdx - 1 - gi + GHOST_COUNT * 2) % GHOST_COUNT;
        ghost.position.copy(buf.positions[histIdx]);
        ghost.rotation.copy(buf.rotations[histIdx]);
      }
    });
  });

  const getGeometry = (shape: string) => {
    switch (shape) {
      case 'torusKnot': return <torusKnotGeometry args={[0.35, 0.1, 80, 14]} />;
      case 'sphere': return <sphereGeometry args={[0.45, 24, 24]} />;
      case 'box': return <boxGeometry args={[0.6, 0.8, 0.6]} />;
      case 'cube': return <boxGeometry args={[0.7, 0.7, 0.7]} />;
      case 'torus': return <torusGeometry args={[0.4, 0.15, 16, 32]} />;
      default: return <sphereGeometry args={[0.4, 16, 16]} />;
    }
  };

  return (
    <>
      {/* Background atmosphere */}
      <mesh>
        <sphereGeometry args={[30, 16, 16]} />
        <meshBasicMaterial side={THREE.BackSide} color="#020408" />
      </mesh>
      <ambientLight intensity={0.2} />
      <directionalLight position={[5, 8, 5]} intensity={0.6} />
      <directionalLight position={[-4, 5, -4]} intensity={0.3} color="#8899ff" />

      {/* Colored accent lights per object */}
      {objects.map((obj, i) => (
        <pointLight
          key={i}
          position={[obj.basePosition[0], obj.basePosition[1] + 3, obj.basePosition[2]]}
          intensity={3}
          color={obj.emissiveColor}
          distance={8}
        />
      ))}

      {/* Static reference grid background */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.9, 0]}>
        <planeGeometry args={[20, 14]} />
        <meshStandardMaterial color="#111122" roughness={0.95} />
      </mesh>

      {/* Grid lines */}
      {Array.from({ length: 11 }, (_, i) => (i - 5) * 2).map((x) => (
        <mesh key={`gx${x}`} position={[x, -0.89, 0]}>
          <boxGeometry args={[0.03, 0.01, 14]} />
          <meshStandardMaterial color="#334455" />
        </mesh>
      ))}
      {Array.from({ length: 8 }, (_, i) => (i - 3.5) * 2).map((z) => (
        <mesh key={`gz${z}`} position={[0, -0.89, z]}>
          <boxGeometry args={[20, 0.01, 0.03]} />
          <meshStandardMaterial color="#334455" />
        </mesh>
      ))}

      {/* Ghost trails — render first (additive blending) */}
      {objects.map((obj, oi) =>
        Array(GHOST_COUNT).fill(null).map((_, gi) => (
          <mesh
            key={`ghost-${oi}-${gi}`}
            ref={(m) => setGhostRef(m, oi, gi)}
            position={[...obj.basePosition]}
            frustumCulled={false}
          >
            {getGeometry(obj.shape)}
            <primitive object={ghostMaterials[oi][gi]} />
          </mesh>
        ))
      )}

      {/* Main objects — on top of ghosts */}
      {objects.map((obj, i) => (
        <mesh
          key={`obj-${i}`}
          ref={(m) => setObjRef(m, i)}
          position={[...obj.basePosition]}
        >
          {getGeometry(obj.shape)}
          <meshStandardMaterial
            color={obj.primaryColor}
            emissive={obj.emissiveColor}
            emissiveIntensity={1.2}
            roughness={0.35}
            metalness={0.4}
          />
        </mesh>
      ))}

      {/* Speed label markers — colored bars representing speed */}
      {objects.map((obj, i) => (
        <mesh key={`bar-${i}`} position={[obj.basePosition[0], -0.5, obj.basePosition[2]]}>
          <boxGeometry args={[0.15, obj.speed * 0.15 + 0.05, 0.15]} />
          <meshStandardMaterial
            color={obj.primaryColor}
            emissive={obj.emissiveColor}
            emissiveIntensity={0.8}
          />
        </mesh>
      ))}

      {/* Speed lines effect — streaks in background */}
      {Array.from({ length: 12 }, (_, i) => (
        <mesh
          key={`streak-${i}`}
          position={[
            (Math.sin(i * 2.3) * 8),
            -0.7 + Math.cos(i * 1.7) * 0.5,
            (Math.cos(i * 1.9) * 5)
          ]}
          rotation={[0, 0, (i * 0.4)]}
        >
          <boxGeometry args={[2.5 + Math.sin(i) * 1.5, 0.02, 0.02]} />
          <meshStandardMaterial
            color="#334466"
            emissive="#334466"
            emissiveIntensity={0.6}
            transparent
            opacity={0.4}
          />
        </mesh>
      ))}
    </>
  );
}
