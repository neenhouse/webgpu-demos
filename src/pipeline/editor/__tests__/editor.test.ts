import { describe, it, expect } from 'vitest';
import {
  readScene,
  writeScene,
  findObject,
  updateObject,
  addObject,
  removeObject,
  updateMaterial,
  addInstance,
  updateEnvironment,
  updateCamera,
} from '../index';
import type { Scene, SceneObject } from '../../spec/types';

// ─── Fixture ─────────────────────────────────────────────────

const MINIMAL_YAML = `
version: "1.0"
meta:
  name: Test Scene
  technique: test
  description: A test scene
objects:
  - id: ground
    prompt: flat ground plane
    transform:
      position: [0, 0, 0]
      rotation: [0, 0, 0]
      scale: 1
    material:
      preset: concrete-weathered
      pbr:
        roughness: 0.9
        color: "#555555"
  - id: car
    prompt: rusted sedan
    transform:
      position: [3, 0, -2]
      rotation: [0, 30, 0]
      scale: 1.2
    material:
      preset: rusted-metal
      pbr:
        roughness: 0.85
        metalness: 0.5
        color: "#8B4513"
    children:
      - id: car-tire
        prompt: flat tire
        transform:
          position: [-0.7, 0.2, 0.9]
          rotation: [0, 0, 0]
          scale: 0.3
        material:
          preset: rubber-worn
  - id: barrel
    prompt: rusty oil barrel
    transform:
      position: [7, 0, 1]
      rotation: [0, 0, 0]
      scale: 1
    material:
      preset: rusted-metal
    instances:
      - position: [7, 0, 1]
        rotation: [0, 0, 0]
        scale: 1
      - position: [7, 0.9, 1]
        rotation: [0, 45, 0]
        scale: 1
`;

function loadFixture(): Scene {
  return readScene(MINIMAL_YAML);
}

// ─── findObject ──────────────────────────────────────────────

describe('findObject', () => {
  it('finds a top-level object by id', () => {
    const scene = loadFixture();
    const obj = findObject(scene, 'car');
    expect(obj).toBeDefined();
    expect(obj!.id).toBe('car');
    expect(obj!.prompt).toBe('rusted sedan');
  });

  it('finds a nested child object by id', () => {
    const scene = loadFixture();
    const tire = findObject(scene, 'car-tire');
    expect(tire).toBeDefined();
    expect(tire!.id).toBe('car-tire');
    expect(tire!.prompt).toBe('flat tire');
  });

  it('returns undefined for a non-existent id', () => {
    const scene = loadFixture();
    expect(findObject(scene, 'nonexistent')).toBeUndefined();
  });
});

// ─── updateObject ────────────────────────────────────────────

describe('updateObject', () => {
  it('updates a top-level object with deep merge', () => {
    const scene = loadFixture();
    const updated = updateObject(scene, 'car', {
      prompt: 'heavily rusted sedan with broken windshield',
      style: 'realistic',
    });

    const car = findObject(updated, 'car');
    expect(car!.prompt).toBe('heavily rusted sedan with broken windshield');
    expect(car!.style).toBe('realistic');
    // Original transform preserved
    expect(car!.transform.position).toEqual([3, 0, -2]);
    // Original material preserved
    expect(car!.material!.preset).toBe('rusted-metal');
  });

  it('deep-merges nested properties (transform)', () => {
    const scene = loadFixture();
    const updated = updateObject(scene, 'car', {
      transform: { position: [5, 0, -2], rotation: [0, 30, 0], scale: 1.2 },
    });

    const car = findObject(updated, 'car');
    expect(car!.transform.position).toEqual([5, 0, -2]);
    // rotation remains from merge since we provided it
    expect(car!.transform.rotation).toEqual([0, 30, 0]);
  });

  it('does not mutate the original scene', () => {
    const scene = loadFixture();
    const updated = updateObject(scene, 'car', { prompt: 'new prompt' });

    expect(findObject(scene, 'car')!.prompt).toBe('rusted sedan');
    expect(findObject(updated, 'car')!.prompt).toBe('new prompt');
  });

  it('updates a nested child object', () => {
    const scene = loadFixture();
    const updated = updateObject(scene, 'car-tire', {
      prompt: 'completely destroyed tire',
    });

    const tire = findObject(updated, 'car-tire');
    expect(tire!.prompt).toBe('completely destroyed tire');
  });
});

// ─── addObject ───────────────────────────────────────────────

describe('addObject', () => {
  const newObject: SceneObject = {
    id: 'lamp-post',
    prompt: 'broken street lamp',
    transform: { position: [1, 0, 5], rotation: [0, 0, 0], scale: 1 },
    visible: true,
    castShadow: true,
    receiveShadow: true,
    lod: 'none',
    collision: 'none',
  };

  it('adds an object to top-level objects', () => {
    const scene = loadFixture();
    const updated = addObject(scene, newObject);

    expect(updated.objects).toHaveLength(scene.objects.length + 1);
    expect(findObject(updated, 'lamp-post')).toBeDefined();
    expect(findObject(updated, 'lamp-post')!.prompt).toBe('broken street lamp');
  });

  it('adds an object as a child of a parent', () => {
    const scene = loadFixture();
    const updated = addObject(scene, newObject, 'car');

    // Top-level count unchanged
    expect(updated.objects).toHaveLength(scene.objects.length);
    // Car now has 2 children
    const car = findObject(updated, 'car');
    expect(car!.children).toHaveLength(2);
    expect(car!.children![1].id).toBe('lamp-post');
  });

  it('does not mutate the original scene', () => {
    const scene = loadFixture();
    addObject(scene, newObject);
    expect(scene.objects).toHaveLength(3);
  });
});

// ─── removeObject ────────────────────────────────────────────

describe('removeObject', () => {
  it('removes a top-level object', () => {
    const scene = loadFixture();
    const updated = removeObject(scene, 'barrel');

    expect(updated.objects).toHaveLength(2);
    expect(findObject(updated, 'barrel')).toBeUndefined();
    // Other objects still present
    expect(findObject(updated, 'car')).toBeDefined();
    expect(findObject(updated, 'ground')).toBeDefined();
  });

  it('removes a nested child object', () => {
    const scene = loadFixture();
    const updated = removeObject(scene, 'car-tire');

    expect(findObject(updated, 'car-tire')).toBeUndefined();
    // Parent still exists
    const car = findObject(updated, 'car');
    expect(car).toBeDefined();
    // Children array cleared (was the only child)
    expect(car!.children).toBeUndefined();
  });

  it('does not mutate the original scene', () => {
    const scene = loadFixture();
    removeObject(scene, 'barrel');
    expect(findObject(scene, 'barrel')).toBeDefined();
  });
});

// ─── updateMaterial ──────────────────────────────────────────

describe('updateMaterial', () => {
  it('deep-merges material updates with existing material', () => {
    const scene = loadFixture();
    const updated = updateMaterial(scene, 'car', {
      pbr: { roughness: 0.95 },
    });

    const car = findObject(updated, 'car');
    expect(car!.material!.pbr!.roughness).toBe(0.95);
    // Other PBR values preserved
    expect(car!.material!.pbr!.metalness).toBe(0.5);
    expect(car!.material!.pbr!.color).toBe('#8B4513');
    // Preset preserved
    expect(car!.material!.preset).toBe('rusted-metal');
  });

  it('adds material to an object without one', () => {
    // Create a scene with an object that has no material
    const yaml = `
version: "1.0"
meta:
  name: Bare
  technique: test
  description: test
objects:
  - id: bare-obj
    prompt: bare object
`;
    const scene = readScene(yaml);
    const updated = updateMaterial(scene, 'bare-obj', {
      preset: 'chrome',
      pbr: { metalness: 1.0, roughness: 0.05 },
    });

    const obj = findObject(updated, 'bare-obj');
    expect(obj!.material!.preset).toBe('chrome');
    expect(obj!.material!.pbr!.metalness).toBe(1.0);
  });

  it('can update material on a nested child', () => {
    const scene = loadFixture();
    const updated = updateMaterial(scene, 'car-tire', {
      pbr: { color: '#000000' },
    });

    const tire = findObject(updated, 'car-tire');
    expect(tire!.material!.pbr!.color).toBe('#000000');
    // Preset preserved
    expect(tire!.material!.preset).toBe('rubber-worn');
  });
});

// ─── addInstance ──────────────────────────────────────────────

describe('addInstance', () => {
  it('adds an instance to an object with existing instances', () => {
    const scene = loadFixture();
    const updated = addInstance(scene, 'barrel', {
      position: [8, 0, 2],
      rotation: [0, 90, 0],
      scale: 1,
    });

    const barrel = findObject(updated, 'barrel');
    expect(barrel!.instances).toHaveLength(3);
    expect(barrel!.instances![2].position).toEqual([8, 0, 2]);
  });

  it('creates instances array when none exists', () => {
    const scene = loadFixture();
    const updated = addInstance(scene, 'ground', {
      position: [10, 0, 10],
      rotation: [0, 0, 0],
      scale: 1,
    });

    const ground = findObject(updated, 'ground');
    expect(ground!.instances).toHaveLength(1);
    expect(ground!.instances![0].position).toEqual([10, 0, 10]);
  });

  it('does not mutate the original scene', () => {
    const scene = loadFixture();
    addInstance(scene, 'barrel', {
      position: [8, 0, 2],
      rotation: [0, 0, 0],
      scale: 1,
    });
    expect(findObject(scene, 'barrel')!.instances).toHaveLength(2);
  });
});

// ─── updateEnvironment ───────────────────────────────────────

describe('updateEnvironment', () => {
  it('deep-merges environment updates', () => {
    const scene = loadFixture();
    const updated = updateEnvironment(scene, {
      background: '#0a0a15',
      ambient: { color: '#223344', intensity: 0.15 },
    });

    expect(updated.environment.background).toBe('#0a0a15');
    expect(updated.environment.ambient.color).toBe('#223344');
    expect(updated.environment.ambient.intensity).toBe(0.15);
  });

  it('preserves unmodified environment fields', () => {
    const scene = loadFixture();
    const updated = updateEnvironment(scene, {
      background: '#111111',
    });

    // Ambient is preserved from defaults
    expect(updated.environment.ambient).toBeDefined();
    expect(updated.environment.lights).toBeDefined();
  });

  it('does not mutate the original scene', () => {
    const scene = loadFixture();
    const originalBg = scene.environment.background;
    updateEnvironment(scene, { background: '#ffffff' });
    expect(scene.environment.background).toBe(originalBg);
  });
});

// ─── updateCamera ────────────────────────────────────────────

describe('updateCamera', () => {
  it('deep-merges camera updates', () => {
    const scene = loadFixture();
    const updated = updateCamera(scene, {
      position: [5, 3, -1],
      fov: 40,
    });

    expect(updated.camera.position).toEqual([5, 3, -1]);
    expect(updated.camera.fov).toBe(40);
    // Target preserved from defaults
    expect(updated.camera.target).toBeDefined();
  });

  it('does not mutate the original scene', () => {
    const scene = loadFixture();
    const originalFov = scene.camera.fov;
    updateCamera(scene, { fov: 90 });
    expect(scene.camera.fov).toBe(originalFov);
  });
});

// ─── Roundtrip: read → modify → write → read ────────────────

describe('roundtrip', () => {
  it('parse → modify → serialize → parse produces the same result', () => {
    const scene = loadFixture();

    // Apply several edits
    let edited = updateObject(scene, 'car', {
      prompt: 'modified sedan prompt',
    });
    edited = updateMaterial(edited, 'car', {
      pbr: { roughness: 0.99 },
    });
    edited = addInstance(edited, 'barrel', {
      position: [8, 0, 2],
      rotation: [0, 90, 0],
      scale: 1,
    });

    // Serialize to YAML
    const yaml = writeScene(edited);

    // Parse back
    const reparsed = readScene(yaml);

    // Verify the edits survived the roundtrip
    const car = findObject(reparsed, 'car');
    expect(car!.prompt).toBe('modified sedan prompt');
    expect(car!.material!.pbr!.roughness).toBe(0.99);
    // Other car material values preserved
    expect(car!.material!.pbr!.metalness).toBe(0.5);

    const barrel = findObject(reparsed, 'barrel');
    expect(barrel!.instances).toHaveLength(3);
    expect(barrel!.instances![2].position).toEqual([8, 0, 2]);
  });

  it('preserves multi-line shader strings through roundtrip', () => {
    const yaml = `
version: "1.0"
meta:
  name: Shader Test
  technique: sdf
  description: test
objects:
  - id: glowy
    prompt: glowing orb
    material:
      shader: |
        mat.colorNode = mix(
          color(0x003300),
          color(0x00ff88),
          positionLocal.y
        );
`;
    const scene = readScene(yaml);
    const serialized = writeScene(scene);
    const reparsed = readScene(serialized);

    const obj = findObject(reparsed, 'glowy');
    expect(obj!.material!.shader).toContain('mat.colorNode = mix(');
    expect(obj!.material!.shader).toContain('color(0x003300)');
    expect(obj!.material!.shader).toContain('positionLocal.y');
  });

  it('preserves scene structure through multiple edit cycles', () => {
    let scene = loadFixture();

    // Cycle 1: add an object
    scene = addObject(scene, {
      id: 'new-rock',
      prompt: 'big boulder',
      transform: { position: [5, 0, 5], rotation: [0, 0, 0], scale: 2 },
      visible: true,
      castShadow: true,
      receiveShadow: true,
      lod: 'none',
      collision: 'none',
    });
    const yaml1 = writeScene(scene);
    scene = readScene(yaml1);

    // Cycle 2: modify the new object
    scene = updateMaterial(scene, 'new-rock', {
      preset: 'earth-dirt',
      pbr: { roughness: 0.95 },
    });
    const yaml2 = writeScene(scene);
    scene = readScene(yaml2);

    // Cycle 3: remove an old object
    scene = removeObject(scene, 'barrel');
    const yaml3 = writeScene(scene);
    scene = readScene(yaml3);

    // Verify final state
    expect(scene.objects).toHaveLength(3); // ground, car, new-rock
    expect(findObject(scene, 'barrel')).toBeUndefined();
    expect(findObject(scene, 'new-rock')!.material!.preset).toBe('earth-dirt');
    expect(findObject(scene, 'car')!.prompt).toBe('rusted sedan');
  });
});
