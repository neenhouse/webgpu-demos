import { describe, it, expect } from 'vitest';
import { demos } from '../registry';

const KNOWN_TAGS = [
  'tsl',
  'shader-art',
  'compute',
  'scene',
  'emergent',
  'data-viz',
  'audio',
  'physics',
  'procedural',
  'retro',
  'organic',
  'math',
  'game-ready',
];

describe('registry tags', () => {
  it('every demo has at least one tag', () => {
    for (const demo of demos) {
      expect(
        demo.tags.length,
        `Demo "${demo.name}" has no tags`,
      ).toBeGreaterThan(0);
    }
  });

  it('every tag used is from the known tag list', () => {
    for (const demo of demos) {
      for (const tag of demo.tags) {
        expect(
          KNOWN_TAGS,
          `Demo "${demo.name}" uses unknown tag "${tag}"`,
        ).toContain(tag);
      }
    }
  });

  it('filtering by each known tag returns at least 1 demo', () => {
    for (const tag of KNOWN_TAGS) {
      const matches = demos.filter((d) => d.tags.includes(tag));
      expect(
        matches.length,
        `Tag "${tag}" matches no demos`,
      ).toBeGreaterThan(0);
    }
  });

  it('text search on title returns expected results', () => {
    const query = 'torus';
    const results = demos.filter((d) =>
      d.title.toLowerCase().includes(query.toLowerCase()),
    );
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((d) => d.name === 'tsl-torus')).toBe(true);
  });

  it('text search on description returns expected results', () => {
    const query = 'GPU compute';
    const results = demos.filter((d) =>
      d.description.toLowerCase().includes(query.toLowerCase()),
    );
    expect(results.length).toBeGreaterThan(0);
    // compute-particles has "GPU-driven" - search for something that is in descriptions
    expect(results.some((d) => d.requiresWebGPU || d.tags.includes('compute'))).toBe(true);
  });

  it('text search is case-insensitive', () => {
    const upper = demos.filter((d) =>
      d.title.toLowerCase().includes('PARTICLE'.toLowerCase()),
    );
    const lower = demos.filter((d) =>
      d.title.toLowerCase().includes('particle'.toLowerCase()),
    );
    expect(upper).toEqual(lower);
  });

  it('combined search and tag filter uses AND logic', () => {
    const query = 'spiral';
    const tag = 'tsl';
    const results = demos.filter((d) => {
      const matchesSearch =
        d.title.toLowerCase().includes(query.toLowerCase()) ||
        d.description.toLowerCase().includes(query.toLowerCase());
      const matchesTag = d.tags.includes(tag);
      return matchesSearch && matchesTag;
    });
    // spiral-galaxy is in tsl batch
    expect(results.some((d) => d.name === 'spiral-galaxy')).toBe(true);
  });

  it('tag filter uses OR logic (demo matches if it has ANY active tag)', () => {
    const activeTags = new Set(['tsl', 'compute']);
    const results = demos.filter((d) => d.tags.some((t) => activeTags.has(t)));
    // Should include both tsl demos and compute demos
    expect(results.some((d) => d.tags.includes('tsl'))).toBe(true);
    expect(results.some((d) => d.tags.includes('compute'))).toBe(true);
  });

  it('demos with secondary compute tag are included when filtering by compute', () => {
    const computeDemos = demos.filter((d) => d.tags.includes('compute'));
    const names = computeDemos.map((d) => d.name);
    expect(names).toContain('compute-particles');
    expect(names).toContain('galaxy-collision');
    expect(names).toContain('fluid-sim');
    expect(names).toContain('aurora-cascade');
    expect(names).toContain('particle-galaxy-portrait');
    expect(names).toContain('quantum-field');
  });

  it('fluid-sim has both compute and physics tags', () => {
    const demo = demos.find((d) => d.name === 'fluid-sim');
    expect(demo).toBeDefined();
    expect(demo!.tags).toContain('compute');
    expect(demo!.tags).toContain('physics');
  });

  it('pendulum-wave has both emergent and physics tags', () => {
    const demo = demos.find((d) => d.name === 'pendulum-wave');
    expect(demo).toBeDefined();
    expect(demo!.tags).toContain('emergent');
    expect(demo!.tags).toContain('physics');
  });
});
