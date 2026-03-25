import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three/webgpu';
import { useSceneLoader } from './scene-loader';
import EnvironmentRenderer from './EnvironmentRenderer';
import ObjectRenderer from './ObjectRenderer';

interface SceneFromYamlProps {
  scenePath: string;
}

/**
 * Top-level component that loads a scene YAML file and renders
 * the complete Three.js scene via R3F.
 *
 * Must be rendered INSIDE an R3F <Canvas> — the parent demo component
 * or Viewer provides the Canvas wrapper.
 */
export default function SceneFromYaml({ scenePath }: SceneFromYamlProps) {
  // Load and parse the scene YAML (Suspense-compatible)
  const scene = useSceneLoader(scenePath);

  // Shared material map for cross-object material inheritance
  const resolvedMaterials = useRef(
    new Map<string, THREE.MeshStandardNodeMaterial>(),
  );

  // Set up camera from scene spec
  const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera;

  useEffect(() => {
    if (!scene.camera) return;

    camera.position.set(...scene.camera.position);
    camera.fov = scene.camera.fov;
    camera.near = scene.camera.near;
    camera.far = scene.camera.far;
    camera.updateProjectionMatrix();
  }, [scene.camera, camera]);

  return (
    <>
      {/* Environment: fog, background, ambient light, lights */}
      <EnvironmentRenderer environment={scene.environment} />

      {/* OrbitControls with target from camera spec */}
      <OrbitControls
        target={scene.camera.target as unknown as THREE.Vector3}
        enableDamping
      />

      {/* Scene objects */}
      {scene.objects.map((obj) => (
        <ObjectRenderer
          key={obj.id}
          object={obj}
          resolvedMaterials={resolvedMaterials.current}
        />
      ))}
    </>
  );
}
