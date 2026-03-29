import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';

/**
 * Shadow Cascade — cascaded shadow maps with 3 directional lights
 *
 * Demonstrates:
 * - 3 DirectionalLight instances each with shadow mapping
 * - Different shadow distance ranges per light (near/mid/far cascade)
 * - PCF soft shadows via Three.js built-in shadow map
 * - Color-coded cascade visualization (red/green/blue tinting per light)
 * - 8 varied scene objects with animated rotation
 * - Shadow bias tuning to reduce acne artifacts
 */

const OBJECT_COUNT = 8;

interface SceneObject {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  color: string;
  shape: 'box' | 'sphere' | 'torusKnot' | 'cylinder' | 'cone';
  animSpeed: number;
  cascadeColor: string;
}

export default function ShadowCascade() {
  const groupRef = useRef<THREE.Group>(null);
  const objectRefs = useRef<THREE.Mesh[]>([]);

  const objects = useMemo<SceneObject[]>(() => [
    { position: [-3, 0.5, -2], rotation: [0, 0, 0], scale: [1, 1, 1], color: '#cc4444', shape: 'box', animSpeed: 0.4, cascadeColor: '#ff8888' },
    { position: [0, 0.5, -3], rotation: [0, 0, 0], scale: [1, 1, 1], color: '#4444cc', shape: 'sphere', animSpeed: 0.6, cascadeColor: '#8888ff' },
    { position: [3, 0.6, -1], rotation: [0, 0, 0], scale: [0.7, 0.7, 0.7], color: '#44cc44', shape: 'torusKnot', animSpeed: 0.8, cascadeColor: '#88ff88' },
    { position: [-2, 0.7, 1], rotation: [0, 0, 0], scale: [0.8, 1.4, 0.8], color: '#cccc44', shape: 'cylinder', animSpeed: 0.3, cascadeColor: '#ffff88' },
    { position: [2, 0.5, 2], rotation: [0, 0, 0], scale: [0.8, 0.8, 0.8], color: '#cc44cc', shape: 'cone', animSpeed: 0.7, cascadeColor: '#ff88ff' },
    { position: [-1, 0.4, 3], rotation: [0, 0, 0], scale: [1.2, 0.8, 1.2], color: '#44cccc', shape: 'box', animSpeed: 0.5, cascadeColor: '#88ffff' },
    { position: [0, 0.5, 0], rotation: [0, 0, 0], scale: [0.9, 0.9, 0.9], color: '#ff8844', shape: 'sphere', animSpeed: 0.9, cascadeColor: '#ffcc88' },
    { position: [4, 0.5, -3], rotation: [0, 0, 0], scale: [0.6, 0.6, 0.6], color: '#884488', shape: 'torusKnot', animSpeed: 1.1, cascadeColor: '#cc88cc' },
  ], []);

  // Cascade zone indicator spheres — show regions covered by each light
  const cascadeZones = useMemo(() => [
    { center: [0, 0.05, 0] as [number, number, number], radius: 2.5, color: '#ff000022', label: 'Near' },
    { center: [0, 0.05, 0] as [number, number, number], radius: 5.0, color: '#00ff0015', label: 'Mid' },
    { center: [0, 0.05, 0] as [number, number, number], radius: 8.0, color: '#0000ff0e', label: 'Far' },
  ], []);
  void cascadeZones; // used conceptually in the rendering below

  useFrame((_, delta) => {
    objectRefs.current.forEach((mesh, i) => {
      if (!mesh) return;
      const obj = objects[i];
      mesh.rotation.y += delta * obj.animSpeed;
      mesh.rotation.x += delta * obj.animSpeed * 0.3;
    });
  });

  const shadowLight1 = useRef<THREE.DirectionalLight>(null);
  const shadowLight2 = useRef<THREE.DirectionalLight>(null);
  const shadowLight3 = useRef<THREE.DirectionalLight>(null);

  // Animate lights slightly for dramatic effect
  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    if (shadowLight1.current) {
      shadowLight1.current.position.x = Math.sin(t * 0.3) * 3;
      shadowLight1.current.position.z = Math.cos(t * 0.3) * 3;
    }
  });

  const setObjectRef = (mesh: THREE.Mesh | null, i: number) => {
    if (mesh) objectRefs.current[i] = mesh;
  };

  return (
    <>
      {/* Ambient fill */}
      <ambientLight intensity={0.12} color="#334455" />

      {/* Light 1 — Near cascade, red tint, highest resolution */}
      <directionalLight
        ref={shadowLight1}
        position={[4, 8, 4]}
        intensity={0.8}
        color="#ff9988"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-near={0.5}
        shadow-camera-far={12}
        shadow-camera-left={-6}
        shadow-camera-right={6}
        shadow-camera-top={6}
        shadow-camera-bottom={-6}
        shadow-bias={-0.001}
        shadow-normalBias={0.05}
      />

      {/* Light 2 — Mid cascade, green tint */}
      <directionalLight
        ref={shadowLight2}
        position={[-5, 10, 2]}
        intensity={0.5}
        color="#88cc88"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-near={1}
        shadow-camera-far={20}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
        shadow-bias={-0.002}
        shadow-normalBias={0.05}
      />

      {/* Light 3 — Far cascade, blue tint, wide area */}
      <directionalLight
        ref={shadowLight3}
        position={[1, 12, -6]}
        intensity={0.3}
        color="#8888ff"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-near={2}
        shadow-camera-far={30}
        shadow-camera-left={-15}
        shadow-camera-right={15}
        shadow-camera-top={15}
        shadow-camera-bottom={-15}
        shadow-bias={-0.003}
        shadow-normalBias={0.05}
      />

      {/* Ground plane — large, receives shadows */}
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[30, 30]} />
        <meshStandardMaterial color="#222233" roughness={0.9} metalness={0.1} />
      </mesh>

      {/* Grid lines on ground for reference */}
      {Array.from({ length: 13 }, (_, i) => i - 6).map((x) => (
        <mesh key={`gx-${x}`} position={[x, 0.001, 0]}>
          <boxGeometry args={[0.02, 0.001, 12]} />
          <meshStandardMaterial color="#334455" />
        </mesh>
      ))}
      {Array.from({ length: 13 }, (_, i) => i - 6).map((z) => (
        <mesh key={`gz-${z}`} position={[0, 0.001, z]}>
          <boxGeometry args={[12, 0.001, 0.02]} />
          <meshStandardMaterial color="#334455" />
        </mesh>
      ))}

      {/* Cascade zone indicators — translucent discs on the ground */}
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
        <ringGeometry args={[0, 2.5, 64]} />
        <meshStandardMaterial color="#ff2200" transparent opacity={0.08} />
      </mesh>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.003, 0]}>
        <ringGeometry args={[2.5, 5.0, 64]} />
        <meshStandardMaterial color="#00ff22" transparent opacity={0.06} />
      </mesh>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]}>
        <ringGeometry args={[5.0, 8.0, 64]} />
        <meshStandardMaterial color="#2222ff" transparent opacity={0.04} />
      </mesh>

      {/* Scene objects — varied shapes casting + receiving shadows */}
      {objects.map((obj, i) => (
        <mesh
          key={i}
          ref={(m) => setObjectRef(m, i)}
          position={obj.position}
          scale={obj.scale}
          castShadow
          receiveShadow
        >
          {obj.shape === 'box' && <boxGeometry args={[1, 1, 1]} />}
          {obj.shape === 'sphere' && <sphereGeometry args={[0.6, 32, 32]} />}
          {obj.shape === 'torusKnot' && <torusKnotGeometry args={[0.4, 0.12, 100, 16]} />}
          {obj.shape === 'cylinder' && <cylinderGeometry args={[0.4, 0.4, 1, 32]} />}
          {obj.shape === 'cone' && <coneGeometry args={[0.5, 1, 32]} />}
          <meshStandardMaterial
            color={obj.color}
            roughness={0.5}
            metalness={0.3}
            emissive={obj.cascadeColor}
            emissiveIntensity={0.15}
          />
        </mesh>
      ))}

      {/* Column pillars to show tall shadow casting */}
      {[-4, 4].map((x) => (
        <mesh key={`pillar-${x}`} position={[x, 1.0, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.25, 0.3, 2.0, 20]} />
          <meshStandardMaterial color="#556677" roughness={0.7} metalness={0.2} />
        </mesh>
      ))}
      {[-4, 4].map((x) => (
        <mesh key={`cap-${x}`} position={[x, 2.15, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.7, 0.3, 0.7]} />
          <meshStandardMaterial color="#667788" roughness={0.6} metalness={0.3} />
        </mesh>
      ))}

      {/* Camera setup */}
      <group ref={groupRef} />
    </>
  );
}
