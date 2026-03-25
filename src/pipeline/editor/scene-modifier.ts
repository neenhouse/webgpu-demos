import type { Scene, SceneObject, MaterialDef, Transform, Environment, Camera } from '../spec/types';

// ─── Helpers ─────────────────────────────────────────────────

/**
 * Deep-merge two plain objects. Arrays are replaced, not concatenated.
 * `source` values overwrite `target` values at each key.
 */
function deepMerge<T extends Record<string, unknown>>(target: T, source: Partial<T>): T {
  const result = { ...target };
  for (const key of Object.keys(source) as Array<keyof T>) {
    const srcVal = source[key];
    const tgtVal = target[key];
    if (
      srcVal !== null &&
      srcVal !== undefined &&
      typeof srcVal === 'object' &&
      !Array.isArray(srcVal) &&
      tgtVal !== null &&
      tgtVal !== undefined &&
      typeof tgtVal === 'object' &&
      !Array.isArray(tgtVal)
    ) {
      result[key] = deepMerge(
        tgtVal as Record<string, unknown>,
        srcVal as Record<string, unknown>,
      ) as T[keyof T];
    } else if (srcVal !== undefined) {
      result[key] = srcVal as T[keyof T];
    }
  }
  return result;
}

/**
 * Walk the object tree (depth-first) and return the first object
 * whose `id` matches.
 */
function findInObjects(objects: SceneObject[], id: string): SceneObject | undefined {
  for (const obj of objects) {
    if (obj.id === id) return obj;
    if (obj.children) {
      const found = findInObjects(obj.children, id);
      if (found) return found;
    }
  }
  return undefined;
}

/**
 * Map over an object tree, replacing the object with the given id
 * using the provided mapper function. Returns a new array.
 */
function mapObjects(
  objects: SceneObject[],
  id: string,
  mapper: (obj: SceneObject) => SceneObject,
): SceneObject[] {
  return objects.map((obj) => {
    if (obj.id === id) return mapper(obj);
    if (obj.children) {
      const mappedChildren = mapObjects(obj.children, id, mapper);
      if (mappedChildren !== obj.children) {
        return { ...obj, children: mappedChildren };
      }
    }
    return obj;
  });
}

/**
 * Filter an object tree, removing the object with the given id.
 * Recurses into children. Returns a new array.
 */
function filterObjects(objects: SceneObject[], id: string): SceneObject[] {
  const result: SceneObject[] = [];
  for (const obj of objects) {
    if (obj.id === id) continue;
    if (obj.children) {
      const filteredChildren = filterObjects(obj.children, id);
      result.push({ ...obj, children: filteredChildren.length > 0 ? filteredChildren : undefined });
    } else {
      result.push(obj);
    }
  }
  return result;
}

/**
 * Add an object as a child of the object with the given parentId.
 * If parentId is not found, returns the original array unchanged.
 */
function addChildToObject(
  objects: SceneObject[],
  parentId: string,
  child: SceneObject,
): SceneObject[] {
  return mapObjects(objects, parentId, (parent) => ({
    ...parent,
    children: [...(parent.children ?? []), child],
  }));
}

// ─── Public API ──────────────────────────────────────────────

/**
 * Find an object by ID (recursive through children).
 */
export function findObject(scene: Scene, id: string): SceneObject | undefined {
  return findInObjects(scene.objects, id);
}

/**
 * Update an object's properties (deep merge, not replace).
 * Returns a new Scene with the updated object.
 */
export function updateObject(scene: Scene, id: string, updates: Partial<SceneObject>): Scene {
  return {
    ...scene,
    objects: mapObjects(scene.objects, id, (obj) =>
      deepMerge(obj as Record<string, unknown>, updates as Record<string, unknown>) as SceneObject,
    ),
  };
}

/**
 * Add a new object to the scene.
 * If parentId is provided, the object is added as a child of that parent.
 * Otherwise it is appended to the top-level objects array.
 */
export function addObject(scene: Scene, object: SceneObject, parentId?: string): Scene {
  if (parentId) {
    return {
      ...scene,
      objects: addChildToObject(scene.objects, parentId, object),
    };
  }
  return {
    ...scene,
    objects: [...scene.objects, object],
  };
}

/**
 * Remove an object by ID (searches recursively through children).
 * Returns a new Scene without the object.
 */
export function removeObject(scene: Scene, id: string): Scene {
  return {
    ...scene,
    objects: filterObjects(scene.objects, id),
  };
}

/**
 * Update material on an object (deep merge with existing material).
 * If the object has no material, the updates become the material.
 */
export function updateMaterial(scene: Scene, id: string, materialUpdates: Partial<MaterialDef>): Scene {
  return {
    ...scene,
    objects: mapObjects(scene.objects, id, (obj) => {
      const existing = (obj.material ?? {}) as Record<string, unknown>;
      const updates = materialUpdates as Record<string, unknown>;
      return {
        ...obj,
        material: deepMerge(existing, updates) as MaterialDef,
      };
    }),
  };
}

/**
 * Add an instance transform to an object's instances array.
 * Creates the instances array if it doesn't exist.
 */
export function addInstance(scene: Scene, id: string, transform: Transform): Scene {
  return {
    ...scene,
    objects: mapObjects(scene.objects, id, (obj) => ({
      ...obj,
      instances: [...(obj.instances ?? []), transform],
    })),
  };
}

/**
 * Update the scene environment (deep merge with existing).
 */
export function updateEnvironment(scene: Scene, envUpdates: Partial<Environment>): Scene {
  return {
    ...scene,
    environment: deepMerge(
      scene.environment as Record<string, unknown>,
      envUpdates as Record<string, unknown>,
    ) as Environment,
  };
}

/**
 * Update the scene camera (deep merge with existing).
 */
export function updateCamera(scene: Scene, cameraUpdates: Partial<Camera>): Scene {
  return {
    ...scene,
    camera: deepMerge(
      scene.camera as Record<string, unknown>,
      cameraUpdates as Record<string, unknown>,
    ) as Camera,
  };
}
