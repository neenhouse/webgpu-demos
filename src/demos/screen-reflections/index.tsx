import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
  float,
  color,
  mix,
  smoothstep,
  positionWorld,
  uniform,
} from 'three/tsl';

/**
 * Screen Reflections — glossy floor reflections using Y-flip technique
 *
 * Demonstrates:
 * - 6 colorful objects (different shapes, bright emissive)
 * - Y-flip reflection: instanced mesh below floor with negated Y
 * - Dark glossy floor: high metalness 0.9, low roughness 0.1
 * - Multiple reflection copies with reduced opacity for blur effect
 * - Reflection fade with distance from floor
 * - Animated objects to show live reflection updating
 */


interface SceneObject {
  position: [number, number, number];
  color: string;
  emissive: string;
  rotSpeed: [number, number, number];
  shape: 'sphere' | 'box' | 'torusKnot' | 'cylinder' | 'cone' | 'torus';
}

export default function ScreenReflections() {
  const objectRefs = useRef<THREE.Mesh[]>([]);
  const reflectionRefs = useRef<THREE.Mesh[][]>([[], [], []]);
  const timeUniform = useMemo(() => uniform(0), []);

  const objects = useMemo<SceneObject[]>(() => [
    { position: [-3.5, 0.8, -1.5], color: '#ff4444', emissive: '#ff2200', rotSpeed: [0.3, 0.8, 0.1], shape: 'sphere' },
    { position: [-1.5, 1.0, 1.0], color: '#44ff44', emissive: '#22ff00', rotSpeed: [0.5, 0.4, 0.3], shape: 'box' },
    { position: [0.5, 0.9, -2.0], color: '#4444ff', emissive: '#2222ff', rotSpeed: [0.2, 1.0, 0.2], shape: 'torusKnot' },
    { position: [2.5, 0.7, 0.5], color: '#ffff44', emissive: '#ffcc00', rotSpeed: [0.7, 0.3, 0.5], shape: 'cylinder' },
    { position: [-0.5, 0.9, 2.5], color: '#ff44ff', emissive: '#ff00cc', rotSpeed: [0.4, 0.6, 0.8], shape: 'torus' },
    { position: [3.5, 1.1, -2.5], color: '#44ffff', emissive: '#00ffcc', rotSpeed: [0.6, 0.5, 0.2], shape: 'cone' },
  ], []);

  // Floor material: dark glossy with very low roughness
  const floorMat = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.color.set(0x080810);
    mat.roughness = 0.05;
    mat.metalness = 0.95;

    // Subtle floor pattern via hash
    const gridX = positionWorld.x.mul(2).fract().sub(0.5).abs();
    const gridZ = positionWorld.z.mul(2).fract().sub(0.5).abs();
    const gridLine = smoothstep(float(0.48), float(0.5), gridX.max(gridZ));
    mat.colorNode = mix(color(0x080810), color(0x112233), gridLine.mul(0.3));

    return mat;
  }, []);

  // Reflection layer materials — stacked copies with opacity fade for blur simulation
  const reflMat = (opacity: number, yOffset: number) => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.transparent = true;
    mat.depthWrite = false;
    mat.side = THREE.FrontSide;

    // Reflection fades with distance from floor (y below)
    const distFade = smoothstep(float(0.0), float(-yOffset * 3), positionWorld.y.negate());
    mat.opacityNode = float(opacity).mul(distFade.add(0.3));
    mat.roughness = 0.2;
    mat.metalness = 0.0;
    return mat;
  };

  const refMats = useMemo(() => [
    reflMat(0.55, 0.05),
    reflMat(0.25, 0.15),
    reflMat(0.12, 0.3),
  ], []);

  const setObjRef = (mesh: THREE.Mesh | null, i: number) => {
    if (mesh) objectRefs.current[i] = mesh;
  };
  const setReflRef = (mesh: THREE.Mesh | null, layer: number, i: number) => {
    if (mesh) {
      if (!reflectionRefs.current[layer]) reflectionRefs.current[layer] = [];
      reflectionRefs.current[layer][i] = mesh;
    }
  };

  // Reflection Y positions (below floor)
  const reflYOffsets = [-0.02, -0.08, -0.18];

  useFrame((state) => {
    // eslint-disable-next-line react-hooks/immutability
    timeUniform.value = state.clock.getElapsedTime();
    const t = state.clock.getElapsedTime();

    objects.forEach((obj, i) => {
      const mesh = objectRefs.current[i];
      if (mesh) {
        mesh.rotation.x += 0.016 * obj.rotSpeed[0];
        mesh.rotation.y += 0.016 * obj.rotSpeed[1];
        mesh.rotation.z += 0.016 * obj.rotSpeed[2];

        // Gentle bob animation
        mesh.position.y = obj.position[1] + Math.sin(t * 0.8 + i) * 0.15;

        // Update reflection meshes to mirror position/rotation
        reflectionRefs.current.forEach((layer, layerIdx) => {
          const refl = layer[i];
          if (refl) {
            refl.position.x = mesh.position.x;
            refl.position.y = reflYOffsets[layerIdx] - (mesh.position.y - obj.position[1]) * 0.8;
            refl.position.z = mesh.position.z;
            // Y-flip rotation
            refl.rotation.x = -mesh.rotation.x;
            refl.rotation.y = mesh.rotation.y;
            refl.rotation.z = -mesh.rotation.z;
          }
        });
      }
    });
  });

  const getGeometry = (obj: SceneObject) => {
    switch (obj.shape) {
      case 'sphere': return <sphereGeometry args={[0.6, 32, 32]} />;
      case 'box': return <boxGeometry args={[0.9, 0.9, 0.9]} />;
      case 'torusKnot': return <torusKnotGeometry args={[0.4, 0.13, 100, 16]} />;
      case 'cylinder': return <cylinderGeometry args={[0.4, 0.4, 1.0, 24]} />;
      case 'torus': return <torusGeometry args={[0.5, 0.2, 20, 40]} />;
      case 'cone': return <coneGeometry args={[0.5, 1.0, 24]} />;
    }
  };

  return (
    <>
      <ambientLight intensity={0.1} />
      <directionalLight position={[5, 8, 3]} intensity={0.5} color="#ffffff" />
      <directionalLight position={[-4, 6, -4]} intensity={0.3} color="#8899ff" />
      <pointLight position={[0, 6, 0]} intensity={10} color="#ffffff" distance={20} />

      {/* Colored accent lights to create interesting reflections */}
      <pointLight position={[-5, 3, -2]} intensity={4} color="#ff4444" distance={12} />
      <pointLight position={[5, 3, 2]} intensity={4} color="#4444ff" distance={12} />
      <pointLight position={[0, 3, -4]} intensity={3} color="#44ff44" distance={10} />

      {/* Glossy floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[16, 12]} />
        <primitive object={floorMat} />
      </mesh>

      {/* Background wall */}
      <mesh position={[0, 3, -5]}>
        <planeGeometry args={[16, 6]} />
        <meshStandardMaterial color="#0a0a15" roughness={0.95} />
      </mesh>

      {/* Main scene objects */}
      {objects.map((obj, i) => (
        <mesh
          key={i}
          ref={(m) => setObjRef(m, i)}
          position={[...obj.position]}
        >
          {getGeometry(obj)}
          <meshStandardMaterial
            color={obj.color}
            emissive={obj.emissive}
            emissiveIntensity={1.8}
            roughness={0.3}
            metalness={0.4}
          />
        </mesh>
      ))}

      {/* Reflection layers — Y-flip copies below floor */}
      {objects.map((obj, i) =>
        reflYOffsets.map((yOff, layerIdx) => (
          <mesh
            key={`refl-${layerIdx}-${i}`}
            ref={(m) => setReflRef(m, layerIdx, i)}
            position={[obj.position[0], yOff, obj.position[2]]}
            scale={[1, -1, 1]}
          >
            {getGeometry(obj)}
            <primitive object={refMats[layerIdx]} />
          </mesh>
        ))
      )}

      {/* Grid lines for visual reference */}
      {[-3, -1.5, 0, 1.5, 3].map((x) => (
        <mesh key={`gx${x}`} position={[x, 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.02, 12]} />
          <meshStandardMaterial color="#334455" />
        </mesh>
      ))}
      {[-4, -2, 0, 2, 4].map((z) => (
        <mesh key={`gz${z}`} position={[0, 0.001, z]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[16, 0.02]} />
          <meshStandardMaterial color="#334455" />
        </mesh>
      ))}

      {/* Subtle fog/vignette objects to frame scene */}
      {[-6, 6].map((x, i) => (
        <mesh key={`pillar-${i}`} position={[x, 2, -4]}>
          <cylinderGeometry args={[0.3, 0.3, 4, 16]} />
          <meshStandardMaterial color="#0a0a15" roughness={0.9} metalness={0.3} />
        </mesh>
      ))}
    </>
  );
}
