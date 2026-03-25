import { useMemo, useEffect, useRef } from 'react';
import * as THREE from 'three/webgpu';
import { generateObject } from '../generators/index';
import type { SceneObject as GeneratorSceneObject } from '../generators/types';
import { resolveMaterial } from '../materials/resolver';
import { useAnimations } from './animation';
import type { SceneObject, Transform } from '../spec/types';

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

/**
 * Build a Matrix4 from a Transform (position, rotation in degrees, scale).
 */
function buildMatrix4(transform: Transform): THREE.Matrix4 {
  const pos = new THREE.Vector3(...transform.position);
  const rot = transform.rotation.map((d) => (d * Math.PI) / 180);
  const euler = new THREE.Euler(rot[0], rot[1], rot[2]);
  const quat = new THREE.Quaternion().setFromEuler(euler);
  const s = typeof transform.scale === 'number'
    ? new THREE.Vector3(transform.scale, transform.scale, transform.scale)
    : new THREE.Vector3(...transform.scale);
  return new THREE.Matrix4().compose(pos, quat, s);
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

  const hasInstances = object.instances && object.instances.length > 0;

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

  // Create instanced mesh when instances are present
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const instancedMesh = useMemo(() => {
    if (!hasInstances || !object.instances) return null;
    const mesh = new THREE.InstancedMesh(
      result.geometry,
      resolvedMaterial,
      object.instances.length,
    );
    mesh.castShadow = object.castShadow;
    mesh.receiveShadow = object.receiveShadow;
    return mesh;
  }, [hasInstances, object, result.geometry, resolvedMaterial]);

  // Set instance transforms
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (!instancedMesh || !object.instances) return;
    for (let i = 0; i < object.instances.length; i++) {
      const matrix = buildMatrix4(object.instances[i]);
      instancedMesh.setMatrixAt(i, matrix);
    }
    instancedMesh.instanceMatrix.needsUpdate = true;
  }, [instancedMesh, object.instances]);

  // Drive animations via useFrame
  // For non-instanced: animate the group (transform animations affect whole object + children)
  // For instanced: animate the primitive wrapper
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useAnimations(object.animation, groupRef, materialRef);

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
      {hasInstances && instancedMesh ? (
        <primitive object={instancedMesh} />
      ) : (
        <mesh
          geometry={result.geometry}
          material={resolvedMaterial}
          castShadow={object.castShadow}
          receiveShadow={object.receiveShadow}
        />
      )}

      {/* Render children recursively (children are NOT instanced) */}
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
