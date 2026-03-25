import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
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
 * or Viewer provides the Canvas wrapper. The Viewer already provides
 * OrbitControls, so this component only sets camera position/target
 * and updates the existing controls' target.
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
  // Access the controls (provided by the Viewer's OrbitControls)
  const controls = useThree((state) => state.controls) as unknown as {
    target?: THREE.Vector3;
    update?: () => void;
  } | null;

  useEffect(() => {
    if (!scene.camera) return;

    camera.position.set(...scene.camera.position);
    camera.fov = scene.camera.fov;
    camera.near = scene.camera.near;
    camera.far = scene.camera.far;
    camera.updateProjectionMatrix();

    // Update OrbitControls target if available
    if (controls?.target) {
      controls.target.set(...scene.camera.target);
      controls.update?.();
    } else {
      // Fallback: just use camera.lookAt
      camera.lookAt(...scene.camera.target);
    }
  }, [scene.camera, camera, controls]);

  return (
    <>
      {/* Environment: fog, background, ambient light, lights */}
      <EnvironmentRenderer environment={scene.environment} />

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
