# Scene Editing -- Ralph Spec

## Overview

This document tells Ralph (or any AI agent) how to iteratively edit existing scenes via follow-up prompts. The tooling lives in `src/pipeline/editor/` and operates on the Scene YAML files in `public/scenes/`.

## Imports

```typescript
import {
  readScene,
  readSceneFile,
  writeScene,
  writeSceneFile,
  findObject,
  updateObject,
  addObject,
  removeObject,
  updateMaterial,
  addInstance,
  updateEnvironment,
  updateCamera,
} from '../pipeline/editor';
```

## How to Edit an Existing Scene

When the user says something like "make the car more rusted" or "add a street lamp":

1. **Read** the scene YAML file with `readSceneFile(path)` (or `readScene(yamlString)`)
2. **Find** the object(s) the prompt refers to with `findObject(scene, id)`
3. **Apply** modifications using the editor functions (see patterns below)
4. **Write** the updated YAML back with `writeSceneFile(path, scene)`
5. The renderer picks up changes on the next load

All modifier functions are **immutable** -- they return a new Scene object, leaving the original unchanged. Chain multiple edits by passing the result of one into the next:

```typescript
let scene = await readSceneFile('public/scenes/junkyard.scene.yaml');
scene = updateMaterial(scene, 'sedan-wreck', { pbr: { roughness: 0.95 } });
scene = addObject(scene, newLampObject);
await writeSceneFile('public/scenes/junkyard.scene.yaml', scene);
```

## Common Edit Patterns

### Modify material: "make the car more rusted"

Find the object by ID or by scanning prompts for keyword matches. Then update the material:

```typescript
scene = updateMaterial(scene, 'sedan-wreck', {
  preset: 'rusted-metal',
  prompt: 'heavily rusted metal with deep orange oxidation and flaking paint',
  pbr: {
    roughness: 0.95,
    metalness: 0.4,
    color: '#8B3A00',
  },
});
```

### Add object: "add a street lamp behind the car"

Create a new SceneObject and add it to the scene. Position it relative to the referenced object:

```typescript
const car = findObject(scene, 'sedan-wreck');
const carPos = car?.transform.position ?? [0, 0, 0];

scene = addObject(scene, {
  id: 'street-lamp',
  prompt: 'old broken street lamp, leaning slightly',
  style: 'realistic',
  generator: 'parametric/furniture',
  transform: {
    position: [carPos[0] - 2, 0, carPos[1] - 3],
    rotation: [0, 0, 5],
    scale: 1,
  },
  material: {
    preset: 'rusted-metal',
    pbr: { color: '#444444', metalness: 0.8 },
  },
  visible: true,
  castShadow: true,
  receiveShadow: true,
  lod: 'none',
  collision: 'none',
});
```

### Add as child: "add a hubcap to the car"

Use the `parentId` parameter to nest the new object under an existing one. Child transforms are parent-local:

```typescript
scene = addObject(scene, {
  id: 'sedan-hubcap',
  prompt: 'loose hubcap on the ground near tire',
  generator: 'parametric/debris',
  transform: {
    position: [0.8, 0.1, 0],
    rotation: [80, 0, 0],
    scale: 0.3,
  },
  material: { preset: 'chrome' },
  visible: true,
  castShadow: true,
  receiveShadow: true,
  lod: 'none',
  collision: 'none',
}, 'sedan-wreck');
```

### Change appearance: "make it cel-shaded"

Update the object's style and material preset:

```typescript
scene = updateObject(scene, 'alien-plant', {
  style: 'cel-shaded',
});
scene = updateMaterial(scene, 'alien-plant', {
  preset: 'cel-shaded',
});
```

### Reposition: "move the rock to the left"

Update the transform position. "Left" in screen space typically means negative X:

```typescript
const rock = findObject(scene, 'rock-scatter');
if (rock) {
  const [x, y, z] = rock.transform.position;
  scene = updateObject(scene, 'rock-scatter', {
    transform: { ...rock.transform, position: [x - 3, y, z] },
  });
}
```

### Scale: "make the tree bigger"

```typescript
scene = updateObject(scene, 'tree-01', {
  transform: { ...findObject(scene, 'tree-01')!.transform, scale: 2.5 },
});
```

### Remove: "remove the barrel"

```typescript
scene = removeObject(scene, 'barrel-stack');
```

### Add instances: "add more rocks scattered around"

Find the rock object and add more instance transforms:

```typescript
scene = addInstance(scene, 'rock-scatter', {
  position: [5, 0, -3],
  rotation: [0, 45, 0],
  scale: 0.7,
});
scene = addInstance(scene, 'rock-scatter', {
  position: [-4, 0, 8],
  rotation: [0, 120, 0],
  scale: 0.5,
});
```

### Change environment: "make it nighttime"

```typescript
scene = updateEnvironment(scene, {
  background: '#0a0a15',
  description: 'Dark junkyard at midnight with starless sky',
  ambient: { color: '#223344', intensity: 0.15 },
});
```

### Change camera: "zoom in on the car"

```typescript
scene = updateCamera(scene, {
  position: [5, 3, -1],
  target: [4, 1, -3],
  fov: 40,
});
```

## Object ID Conventions

- Use lowercase kebab-case: `sedan-wreck`, `barrel-stack`, `rock-scatter`
- Include a category hint: `tree-01`, `lamp-post-a`, `debris-pile`
- IDs must be unique within the scene
- When adding instances of existing objects, reuse the original ID

## Finding Objects by Description

When the user refers to an object by description rather than ID ("the big rock", "that car"):

1. Scan all object `id` fields for keyword matches
2. Scan all object `prompt` fields for keyword matches
3. If ambiguous, prefer the object whose `prompt` most closely matches the user's words
4. If still ambiguous, ask the user to clarify

## Validation

After editing, the scene should still pass Zod validation. Required fields on every object:
- `id` (string, unique)
- `prompt` (string)

Required top-level fields:
- `meta.name`, `meta.technique`, `meta.description`
- `objects` (at least one)

The `readScene()` / `readSceneFile()` functions validate on parse, so a roundtrip (read -> modify -> write -> read) serves as a correctness check.
