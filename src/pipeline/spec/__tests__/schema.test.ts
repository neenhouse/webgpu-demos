import { describe, it, expect } from 'vitest';
import {
  TransformSchema,
  LightSchema,
  AnimationSchema,
  LodDefSchema,
  LodSchema,
  PbrSchema,
  MaterialDefSchema,
  TextureDefSchema,
  ObjectSchema,
  SceneSchema,
  Vec3Schema,
} from '../schema';

describe('Vec3Schema', () => {
  it('accepts a valid 3-number tuple', () => {
    expect(Vec3Schema.parse([1, 2, 3])).toEqual([1, 2, 3]);
  });

  it('rejects a 2-number tuple', () => {
    expect(() => Vec3Schema.parse([1, 2])).toThrow();
  });

  it('rejects non-numeric values', () => {
    expect(() => Vec3Schema.parse(['a', 'b', 'c'])).toThrow();
  });
});

describe('TransformSchema', () => {
  it('applies defaults for all fields', () => {
    const result = TransformSchema.parse({});
    expect(result).toEqual({
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: 1,
    });
  });

  it('accepts uniform scale as number', () => {
    const result = TransformSchema.parse({ scale: 2 });
    expect(result.scale).toBe(2);
  });

  it('accepts per-axis scale as tuple', () => {
    const result = TransformSchema.parse({ scale: [1, 2, 3] });
    expect(result.scale).toEqual([1, 2, 3]);
  });
});

describe('LightSchema', () => {
  it('requires type', () => {
    expect(() => LightSchema.parse({})).toThrow();
  });

  it('accepts a valid directional light', () => {
    const result = LightSchema.parse({
      type: 'directional',
      position: [10, 20, 10],
      color: '#ffffff',
      intensity: 1.5,
    });
    expect(result.type).toBe('directional');
    expect(result.castShadow).toBe(false); // default
  });

  it('rejects an invalid light type', () => {
    expect(() => LightSchema.parse({ type: 'laser' })).toThrow();
  });
});

describe('AnimationSchema', () => {
  it('applies defaults for optional fields', () => {
    const result = AnimationSchema.parse({
      property: 'transform.rotation.y',
      type: 'rotate',
    });
    expect(result.speed).toBe(1);
    expect(result.amplitude).toBe(1);
    expect(result.delay).toBe(0);
    expect(result.loop).toBe(true);
  });

  it('rejects unknown animation type', () => {
    expect(() =>
      AnimationSchema.parse({ property: 'x', type: 'explode' }),
    ).toThrow();
  });
});

describe('LodSchema', () => {
  it('accepts "auto"', () => {
    expect(LodSchema.parse('auto')).toBe('auto');
  });

  it('accepts "none"', () => {
    expect(LodSchema.parse('none')).toBe('none');
  });

  it('accepts a LodDef object', () => {
    const result = LodSchema.parse({
      levels: [
        { distance: 0, detail: 1.0 },
        { distance: 50, detail: 0.5 },
      ],
    });
    expect(result).toEqual({
      levels: [
        { distance: 0, detail: 1.0 },
        { distance: 50, detail: 0.5 },
      ],
    });
  });

  it('rejects detail values outside [0, 1]', () => {
    expect(() =>
      LodDefSchema.parse({ levels: [{ distance: 0, detail: 1.5 }] }),
    ).toThrow();
  });
});

describe('PbrSchema', () => {
  it('rejects roughness > 1', () => {
    expect(() => PbrSchema.parse({ roughness: 1.5 })).toThrow();
  });

  it('rejects metalness < 0', () => {
    expect(() => PbrSchema.parse({ metalness: -0.3 })).toThrow();
  });

  it('accepts valid PBR values', () => {
    const result = PbrSchema.parse({
      color: '#ff0000',
      roughness: 0.5,
      metalness: 0.8,
      opacity: 1,
    });
    expect(result.roughness).toBe(0.5);
  });
});

describe('MaterialDefSchema', () => {
  it('applies defaults for side and blending', () => {
    const result = MaterialDefSchema.parse({});
    expect(result.side).toBe('front');
    expect(result.blending).toBe('normal');
  });

  it('accepts a full material definition', () => {
    const result = MaterialDefSchema.parse({
      prompt: 'shiny gold surface',
      preset: 'chrome',
      pbr: { color: '#ffd700', roughness: 0.1, metalness: 1.0 },
      side: 'double',
      transparent: true,
    });
    expect(result.preset).toBe('chrome');
    expect(result.pbr?.metalness).toBe(1.0);
  });
});

describe('TextureDefSchema', () => {
  it('applies defaults for resolution and tiling', () => {
    const result = TextureDefSchema.parse({});
    expect(result.resolution).toBe(1024);
    expect(result.tiling).toEqual([1, 1]);
    expect(result.source).toBe('procedural');
  });
});

describe('ObjectSchema', () => {
  it('requires id and prompt', () => {
    expect(() => ObjectSchema.parse({})).toThrow();
    expect(() => ObjectSchema.parse({ id: 'test' })).toThrow();
  });

  it('parses a minimal object with defaults', () => {
    const result = ObjectSchema.parse({ id: 'cube', prompt: 'a cube' });
    expect(result.id).toBe('cube');
    expect(result.visible).toBe(true);
    expect(result.castShadow).toBe(true);
    expect(result.receiveShadow).toBe(true);
    expect(result.lod).toBe('none');
    expect(result.collision).toBe('none');
    expect(result.transform).toEqual({
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: 1,
    });
  });

  it('supports recursive children', () => {
    const result = ObjectSchema.parse({
      id: 'parent',
      prompt: 'a car',
      children: [
        {
          id: 'child',
          prompt: 'a wheel',
          children: [
            { id: 'grandchild', prompt: 'a hubcap' },
          ],
        },
      ],
    });
    expect(result.children).toHaveLength(1);
    expect(result.children![0].children).toHaveLength(1);
    expect(result.children![0].children![0].id).toBe('grandchild');
  });
});

describe('SceneSchema', () => {
  it('requires meta and objects', () => {
    expect(() => SceneSchema.parse({})).toThrow();
  });

  it('requires at least one object', () => {
    expect(() =>
      SceneSchema.parse({
        meta: { name: 'Test', technique: 'test', description: 'test' },
        objects: [],
      }),
    ).toThrow();
  });

  it('applies defaults for camera and environment', () => {
    const result = SceneSchema.parse({
      meta: { name: 'Test', technique: 'test', description: 'test' },
      objects: [{ id: 'cube', prompt: 'a cube' }],
    });
    expect(result.version).toBe('1.0');
    expect(result.camera.fov).toBe(60);
    expect(result.camera.position).toEqual([0, 5, 10]);
    expect(result.environment.background).toBe('#000000');
    expect(result.environment.ambient.intensity).toBe(0.5);
  });
});
