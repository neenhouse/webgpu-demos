import { describe, it, expect } from 'vitest';
import { ManifestSchema, TAG_TAXONOMY, TECHNIQUE_LIST } from '../manifest-schema';

const VALID_COMPONENT_MANIFEST = {
  version: '2.0' as const,
  meta: {
    name: 'test-demo',
    title: 'Test Demo',
    description: 'A test demo for validation',
    tags: ['tsl'] as const,
    color: '#ff0000',
    requiresWebGPU: false,
  },
  renderer: { type: 'component' as const, module: 'test-demo' },
};

const VALID_SCENE_MANIFEST = {
  version: '2.0' as const,
  meta: {
    name: 'test-scene',
    title: 'Test Scene',
    description: 'A test scene for validation',
    tags: ['scene'] as const,
    color: '#00ff00',
    requiresWebGPU: false,
  },
  renderer: { type: 'scene' as const, scene: 'test-scene.scene.yaml' },
};

describe('ManifestSchema', () => {
  it('validates a minimal component manifest', () => {
    const result = ManifestSchema.safeParse(VALID_COMPONENT_MANIFEST);
    expect(result.success).toBe(true);
  });

  it('validates a minimal scene manifest', () => {
    const result = ManifestSchema.safeParse(VALID_SCENE_MANIFEST);
    expect(result.success).toBe(true);
  });

  it('validates a full manifest with all optional fields', () => {
    const full = {
      ...VALID_COMPONENT_MANIFEST,
      camera: { position: [0, 0, 4], target: [0, 0, 0], fov: 70 },
      environment: {
        background: '#000000',
        ambient: { color: '#ffffff', intensity: 0.5 },
        lights: [
          { type: 'point', position: [5, 5, 5], color: '#ffffff', intensity: 1.0, distance: 10 },
        ],
      },
      techniques: ['tsl-material', 'fresnel'] as const,
      quality: { complexity: 'basic' as const, min_lines: 60 },
    };
    const result = ManifestSchema.safeParse(full);
    expect(result.success).toBe(true);
  });

  it('rejects missing meta.name', () => {
    const bad = { ...VALID_COMPONENT_MANIFEST, meta: { ...VALID_COMPONENT_MANIFEST.meta, name: undefined } };
    const result = ManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('rejects invalid tag', () => {
    const bad = { ...VALID_COMPONENT_MANIFEST, meta: { ...VALID_COMPONENT_MANIFEST.meta, tags: ['nonexistent'] } };
    const result = ManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('rejects empty tags array', () => {
    const bad = { ...VALID_COMPONENT_MANIFEST, meta: { ...VALID_COMPONENT_MANIFEST.meta, tags: [] } };
    const result = ManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('rejects invalid color format', () => {
    const bad = { ...VALID_COMPONENT_MANIFEST, meta: { ...VALID_COMPONENT_MANIFEST.meta, color: 'red' } };
    const result = ManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('rejects name with uppercase', () => {
    const bad = { ...VALID_COMPONENT_MANIFEST, meta: { ...VALID_COMPONENT_MANIFEST.meta, name: 'BadName' } };
    const result = ManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('rejects description shorter than 10 chars', () => {
    const bad = { ...VALID_COMPONENT_MANIFEST, meta: { ...VALID_COMPONENT_MANIFEST.meta, description: 'Short' } };
    const result = ManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('TAG_TAXONOMY has 15 tags', () => {
    expect(TAG_TAXONOMY.length).toBe(15);
  });

  it('TECHNIQUE_LIST has entries', () => {
    expect(TECHNIQUE_LIST.length).toBeGreaterThan(20);
  });
});
