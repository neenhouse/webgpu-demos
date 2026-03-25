import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three/webgpu';
import { PrefabRegistry, maybeRegisterPrefab, lookupPrefab } from '../index';
import type { Prefab } from '../types';
import type { Transform, SceneObject } from '../../spec/types';
import type { GeneratorResult } from '../../generators/types';

// ─── Helpers ──────────────────────────────────────────────────

function makePrefab(overrides: Partial<Prefab> = {}): Prefab {
  return {
    id: 'test-prefab',
    prompt: 'a test object',
    style: 'realistic',
    geometry: new THREE.BoxGeometry(1, 1, 1),
    material: new THREE.MeshStandardNodeMaterial(),
    ...overrides,
  };
}

function makeTransform(overrides: Partial<Transform> = {}): Transform {
  return {
    position: [0, 0, 0] as [number, number, number],
    rotation: [0, 0, 0] as [number, number, number],
    scale: 1,
    ...overrides,
  };
}

function makeSceneObject(overrides: Partial<SceneObject> = {}): SceneObject {
  return {
    id: 'obj-1',
    prompt: 'a cube',
    transform: {
      position: [0, 0, 0] as [number, number, number],
      rotation: [0, 0, 0] as [number, number, number],
      scale: 1,
    },
    lod: 'none',
    collision: 'none',
    visible: true,
    castShadow: true,
    receiveShadow: true,
    ...overrides,
  } as SceneObject;
}

function makeGeneratorResult(overrides: Partial<GeneratorResult> = {}): GeneratorResult {
  return {
    geometry: new THREE.BoxGeometry(1, 1, 1),
    material: new THREE.MeshStandardNodeMaterial(),
    metadata: {
      vertexCount: 24,
      faceCount: 12,
      generator: 'csg',
      prompt: 'a cube',
      generationTime: 10,
    },
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────

describe('PrefabRegistry', () => {
  let registry: PrefabRegistry;

  beforeEach(() => {
    registry = new PrefabRegistry();
  });

  // ─── Registry Basics ─────────────────────────────────────

  describe('Registry basics', () => {
    it('register() stores a prefab that can be retrieved with get()', () => {
      const prefab = makePrefab({ id: 'tree' });
      registry.register('tree', prefab);

      const result = registry.get('tree');
      expect(result).toBeDefined();
      expect(result!.id).toBe('tree');
      expect(result!.prompt).toBe('a test object');
      expect(result!.style).toBe('realistic');
      expect(result!.geometry).toBeInstanceOf(THREE.BoxGeometry);
      expect(result!.material).toBeInstanceOf(THREE.MeshStandardNodeMaterial);
    });

    it('register() throws on duplicate ID', () => {
      const prefab = makePrefab({ id: 'rock' });
      registry.register('rock', prefab);

      expect(() => registry.register('rock', prefab)).toThrow(
        'Prefab "rock" is already registered',
      );
    });

    it('get() returns undefined for unknown ID', () => {
      expect(registry.get('nonexistent')).toBeUndefined();
    });

    it('has() returns true for registered, false for unknown', () => {
      registry.register('lamp', makePrefab({ id: 'lamp' }));

      expect(registry.has('lamp')).toBe(true);
      expect(registry.has('unknown')).toBe(false);
    });

    it('list() returns all registered IDs', () => {
      registry.register('a', makePrefab({ id: 'a' }));
      registry.register('b', makePrefab({ id: 'b' }));
      registry.register('c', makePrefab({ id: 'c' }));

      const ids = registry.list();
      expect(ids).toHaveLength(3);
      expect(ids).toContain('a');
      expect(ids).toContain('b');
      expect(ids).toContain('c');
    });

    it('clear() removes all prefabs', () => {
      registry.register('x', makePrefab({ id: 'x' }));
      registry.register('y', makePrefab({ id: 'y' }));

      registry.clear();

      expect(registry.has('x')).toBe(false);
      expect(registry.has('y')).toBe(false);
      expect(registry.list()).toHaveLength(0);
    });
  });

  // ─── Instancing ──────────────────────────────────────────

  describe('instantiate()', () => {
    it('creates InstancedMesh with correct instance count', () => {
      registry.register('box', makePrefab({ id: 'box' }));

      const transforms: Transform[] = Array.from({ length: 5 }, () => makeTransform());
      const mesh = registry.instantiate('box', transforms);

      expect(mesh).toBeInstanceOf(THREE.InstancedMesh);
      expect(mesh.count).toBe(5);
    });

    it('applies position correctly', () => {
      registry.register('box', makePrefab({ id: 'box' }));

      const transforms = [makeTransform({ position: [3, 4, 5] as [number, number, number] })];
      const mesh = registry.instantiate('box', transforms);

      const matrix = new THREE.Matrix4();
      mesh.getMatrixAt(0, matrix);
      const elements = matrix.elements;

      // Translation components are at indices 12, 13, 14
      expect(elements[12]).toBeCloseTo(3);
      expect(elements[13]).toBeCloseTo(4);
      expect(elements[14]).toBeCloseTo(5);
    });

    it('converts rotation from degrees to radians', () => {
      registry.register('box', makePrefab({ id: 'box' }));

      // 90 degrees around Y axis
      const transforms = [makeTransform({ rotation: [0, 90, 0] as [number, number, number] })];
      const mesh = registry.instantiate('box', transforms);

      const matrix = new THREE.Matrix4();
      mesh.getMatrixAt(0, matrix);
      const elements = matrix.elements;

      // For a 90-degree Y rotation:
      // element[0] (cos) should be ~0
      // element[8] (sin) should be ~1
      expect(elements[0]).toBeCloseTo(0, 4);
      expect(elements[8]).toBeCloseTo(1, 4);
    });

    it('handles uniform scale (number)', () => {
      registry.register('box', makePrefab({ id: 'box' }));

      const transforms = [makeTransform({ scale: 2 })];
      const mesh = registry.instantiate('box', transforms);

      const matrix = new THREE.Matrix4();
      mesh.getMatrixAt(0, matrix);

      // Extract scale from matrix
      const scale = new THREE.Vector3();
      scale.setFromMatrixScale(matrix);

      expect(scale.x).toBeCloseTo(2);
      expect(scale.y).toBeCloseTo(2);
      expect(scale.z).toBeCloseTo(2);
    });

    it('handles per-axis scale ([x,y,z])', () => {
      registry.register('box', makePrefab({ id: 'box' }));

      const transforms = [makeTransform({ scale: [1, 2, 3] as [number, number, number] })];
      const mesh = registry.instantiate('box', transforms);

      const matrix = new THREE.Matrix4();
      mesh.getMatrixAt(0, matrix);

      const scale = new THREE.Vector3();
      scale.setFromMatrixScale(matrix);

      expect(scale.x).toBeCloseTo(1);
      expect(scale.y).toBeCloseTo(2);
      expect(scale.z).toBeCloseTo(3);
    });

    it('throws for unknown prefab ID', () => {
      expect(() => registry.instantiate('missing', [makeTransform()])).toThrow(
        'Prefab "missing" not found in registry',
      );
    });
  });

  // ─── Helper Functions ────────────────────────────────────

  describe('maybeRegisterPrefab()', () => {
    it('registers when register_prefab is true', () => {
      const obj = makeSceneObject({ id: 'tree', register_prefab: true, prompt: 'a tree' });
      const result = makeGeneratorResult();

      maybeRegisterPrefab(registry, obj, result);

      expect(registry.has('tree')).toBe(true);
      const prefab = registry.get('tree');
      expect(prefab!.prompt).toBe('a tree');
    });

    it('does nothing when register_prefab is false/undefined', () => {
      const obj1 = makeSceneObject({ id: 'a', register_prefab: false });
      const obj2 = makeSceneObject({ id: 'b' }); // undefined
      const result = makeGeneratorResult();

      maybeRegisterPrefab(registry, obj1, result);
      maybeRegisterPrefab(registry, obj2, result);

      expect(registry.list()).toHaveLength(0);
    });
  });

  describe('lookupPrefab()', () => {
    it('returns prefab when ref exists', () => {
      const prefab = makePrefab({ id: 'lamp' });
      registry.register('lamp', prefab);

      const obj = makeSceneObject({ id: 'lamp-copy', prefab_ref: 'lamp' });
      const result = lookupPrefab(registry, obj);

      expect(result).toBeDefined();
      expect(result!.id).toBe('lamp');
    });

    it('returns undefined and logs error for unknown ref', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const obj = makeSceneObject({ id: 'broken', prefab_ref: 'nonexistent' });
      const result = lookupPrefab(registry, obj);

      expect(result).toBeUndefined();
      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining('Unknown prefab_ref "nonexistent"'),
      );

      spy.mockRestore();
    });

    it('returns undefined when no prefab_ref is set', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const obj = makeSceneObject({ id: 'normal' }); // no prefab_ref
      const result = lookupPrefab(registry, obj);

      expect(result).toBeUndefined();
      expect(spy).not.toHaveBeenCalled();

      spy.mockRestore();
    });
  });
});
