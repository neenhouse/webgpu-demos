import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseScene, parseSceneOrThrow } from '../parser';

const fixture = (name: string) =>
  readFileSync(
    resolve(__dirname, 'fixtures', name),
    'utf-8',
  );

describe('parseScene', () => {
  it('parses a valid full-featured scene', () => {
    const result = parseScene(fixture('valid-scene.scene.yaml'));
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.scene.meta.name).toBe('Test Junkyard');
    expect(result.scene.objects).toHaveLength(5);
    expect(result.scene.environment.lights).toHaveLength(2);
    expect(result.scene.camera.fov).toBe(55);
  });

  it('parses a minimal scene and applies all defaults', () => {
    const result = parseScene(fixture('minimal-scene.scene.yaml'));
    expect(result.success).toBe(true);
    if (!result.success) return;

    const scene = result.scene;
    // Camera defaults
    expect(scene.camera.fov).toBe(60);
    expect(scene.camera.near).toBe(0.1);
    expect(scene.camera.far).toBe(1000);
    expect(scene.camera.position).toEqual([0, 5, 10]);

    // Environment defaults
    expect(scene.environment.background).toBe('#000000');
    expect(scene.environment.ambient.intensity).toBe(0.5);
    expect(scene.environment.lights).toEqual([]);

    // Object defaults
    const obj = scene.objects[0];
    expect(obj.visible).toBe(true);
    expect(obj.castShadow).toBe(true);
    expect(obj.receiveShadow).toBe(true);
    expect(obj.lod).toBe('none');
    expect(obj.collision).toBe('none');
    expect(obj.transform).toEqual({
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: 1,
    });
  });

  it('rejects an invalid scene with field-level errors', () => {
    const result = parseScene(fixture('invalid-scene.scene.yaml'));
    expect(result.success).toBe(false);
    if (result.success) return;

    // Should have errors for missing required fields
    expect(result.errors.length).toBeGreaterThan(0);

    // Check that error paths are descriptive
    // meta.technique and meta.description are missing
    // objects.0.prompt is missing
    // PBR values out of range
    expect(
      result.errors.some((e) => e.path.includes('meta') || e.path.includes('objects')),
    ).toBe(true);
  });

  it('rejects broken YAML with a parse error', () => {
    const result = parseScene('{ invalid yaml: [');
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.errors[0].message).toMatch(/YAML parse error/i);
  });

  it('handles recursive children in parsed YAML', () => {
    const yaml = `
version: "1.0"
meta:
  name: Recursive Test
  technique: test
  description: test
objects:
  - id: parent
    prompt: a car
    children:
      - id: child
        prompt: a wheel
        children:
          - id: grandchild
            prompt: a hubcap
`;
    const result = parseScene(yaml);
    expect(result.success).toBe(true);
    if (!result.success) return;

    const parent = result.scene.objects[0];
    expect(parent.children).toHaveLength(1);
    expect(parent.children![0].id).toBe('child');
    expect(parent.children![0].children![0].id).toBe('grandchild');
  });
});

describe('parseSceneOrThrow', () => {
  it('returns a Scene for valid YAML', () => {
    const scene = parseSceneOrThrow(fixture('valid-scene.scene.yaml'));
    expect(scene.meta.name).toBe('Test Junkyard');
  });

  it('throws with descriptive message for invalid YAML', () => {
    expect(() => parseSceneOrThrow(fixture('invalid-scene.scene.yaml'))).toThrow(
      /Scene validation failed/,
    );
  });
});
