import { z } from 'zod';

export const TAG_TAXONOMY = [
  'tsl', 'shader-art', 'compute', 'scene', 'emergent', 'data-viz',
  'audio', 'physics', 'procedural', 'retro', 'organic', 'math', 'game-ready',
] as const;

export const TECHNIQUE_LIST = [
  'compute-shader', 'instanced-mesh', 'gpu-physics', 'flocking-algorithm',
  'tsl-material', 'sdf-raymarching', 'screen-space-effect', 'skeletal-animation',
  'volumetric-shells', 'particle-system', 'fresnel', 'hash-noise',
  'verlet-integration', 'wave-equation', 'l-system', 'dla-growth',
  'fractal-rendering', 'parametric-surface', 'cel-shading', 'shadow-mapping',
  'ssao', 'pbr-exploration', 'deferred-rendering', 'gpu-culling',
  'csg-boolean', 'scene-composition', 'data-visualization', 'interactive-ui',
  'camera-transitions', 'html-overlays', 'audio-simulation',
] as const;

export const ManifestSchema = z.object({
  version: z.literal('2.0'),
  meta: z.object({
    name: z.string().regex(/^[a-z0-9-]+$/),
    title: z.string().min(1),
    description: z.string().min(10),
    tags: z.array(z.enum(TAG_TAXONOMY)).min(1),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    requiresWebGPU: z.boolean(),
  }),
  renderer: z.discriminatedUnion('type', [
    z.object({ type: z.literal('component'), module: z.string() }),
    z.object({ type: z.literal('scene'), scene: z.string() }),
  ]),
  camera: z.object({
    position: z.tuple([z.number(), z.number(), z.number()]),
    target: z.tuple([z.number(), z.number(), z.number()]),
    fov: z.number(),
  }).optional(),
  environment: z.object({
    background: z.string().optional(),
    ambient: z.object({
      color: z.string().optional(),
      intensity: z.number().optional(),
    }).optional(),
    lights: z.array(z.object({
      type: z.enum(['directional', 'point', 'spot', 'hemisphere']),
      position: z.tuple([z.number(), z.number(), z.number()]).optional(),
      target: z.tuple([z.number(), z.number(), z.number()]).optional(),
      color: z.string().optional(),
      intensity: z.number().optional(),
      distance: z.number().optional(),
    })).optional(),
  }).optional(),
  techniques: z.array(z.enum(TECHNIQUE_LIST)).optional(),
  quality: z.object({
    complexity: z.enum(['basic', 'intermediate', 'advanced']).optional(),
    min_lines: z.number().optional(),
  }).optional(),
});

export type Manifest = z.infer<typeof ManifestSchema>;
