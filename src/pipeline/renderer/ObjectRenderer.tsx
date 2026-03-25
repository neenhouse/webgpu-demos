import { useMemo, useRef } from 'react';
import * as THREE from 'three/webgpu';
import { generateObject } from '../generators/index';
import type { SceneObject as GeneratorSceneObject } from '../generators/types';
import { resolveMaterial } from '../materials/resolver';
import type { SceneObject } from '../spec/types';

interface ObjectRendererProps {
  object: SceneObject;
  parentMaterial?: THREE.MeshStandardNodeMaterial;
  resolvedMaterials: Map<string, THREE.MeshStandardNodeMaterial>;
}

/**
 * Adapt the spec's SceneObject to the generator's simpler SceneObject interface.
 * The generator only needs: id, prompt, style, generator, params, material.
 */
function toGeneratorObject(obj: SceneObject): GeneratorSceneObject {
  return {
    id: obj.id,
    prompt: obj.prompt,
    style: obj.style,
    generator: obj.generator,
    params: obj.params,
    material: obj.material
      ? {
          shader: obj.material.shader,
          pbr: obj.material.pbr as Record<string, unknown> | undefined,
        }
      : undefined,
  };
}

export default function ObjectRenderer({
  object,
  parentMaterial,
  resolvedMaterials,
}: ObjectRendererProps) {
  const groupRef = useRef<THREE.Group>(null);
  const materialRef = useRef<THREE.MeshStandardNodeMaterial | null>(null);

  // Skip invisible objects
  if (!object.visible) {
    return null;
  }

  // Generate geometry
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const result = useMemo(() => {
    const genObj = toGeneratorObject(object);
    const res = generateObject(genObj);
    console.log(
      `[ObjectRenderer] ${object.id}: generator=${res.metadata.generator}, time=${res.metadata.generationTime}ms`,
    );
    return res;
  }, [object]);

  // Resolve material
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const resolvedMaterial = useMemo(() => {
    // SDF objects provide their own material
    if (result.isSdf && result.material) {
      return result.material as THREE.MeshStandardNodeMaterial;
    }

    let mat: THREE.MeshStandardNodeMaterial;

    if (object.material) {
      mat = resolveMaterial(object.material, {
        parentMaterial,
        resolvedMaterials,
        objectId: object.id,
      });
    } else {
      mat = new THREE.MeshStandardNodeMaterial();
    }

    // Store in resolved map for sibling/child inheritance
    resolvedMaterials.set(object.id, mat);
    materialRef.current = mat;

    return mat;
  }, [object, result, parentMaterial, resolvedMaterials]);

  // Compute transform values
  const position = object.transform.position as [number, number, number];
  const rotation = object.transform.rotation.map(
    (d) => (d * Math.PI) / 180,
  ) as [number, number, number];
  const scale: [number, number, number] =
    typeof object.transform.scale === 'number'
      ? [object.transform.scale, object.transform.scale, object.transform.scale]
      : (object.transform.scale as [number, number, number]);

  return (
    <group ref={groupRef} position={position} rotation={rotation} scale={scale}>
      <mesh
        geometry={result.geometry}
        material={resolvedMaterial}
        castShadow={object.castShadow}
        receiveShadow={object.receiveShadow}
      />

      {/* Render children recursively */}
      {object.children?.map((child) => (
        <ObjectRenderer
          key={child.id}
          object={child}
          parentMaterial={resolvedMaterial}
          resolvedMaterials={resolvedMaterials}
        />
      ))}
    </group>
  );
}
