import { describe, it, expect, vi } from 'vitest';
import { codegenGenerator } from '../codegen.ts';
import type { SceneObject } from '../types.ts';

function makeObj(overrides: Partial<SceneObject> = {}): SceneObject {
  return { id: 'test', prompt: 'a test object', ...overrides };
}

describe('Codegen Generator — canHandle', () => {
  it('returns 0.9 for generator hint "codegen"', () => {
    expect(codegenGenerator.canHandle(makeObj({ generator: 'codegen' }))).toBe(0.9);
  });

  it('returns 0 for any other object (only used when explicitly specified)', () => {
    expect(codegenGenerator.canHandle(makeObj({ prompt: 'a wooden chair' }))).toBe(0);
  });

  it('returns 0 for objects with other generator hints', () => {
    expect(codegenGenerator.canHandle(makeObj({ generator: 'csg' }))).toBe(0);
  });
});

describe('Codegen Generator — generate', () => {
  it('returns geometry with position attribute', () => {
    const result = codegenGenerator.generate(makeObj({ generator: 'codegen', prompt: 'a lamp' }));
    expect(result.geometry).toBeDefined();
    expect(result.geometry.attributes.position.count).toBeGreaterThan(0);
  });

  it('returns OctahedronGeometry as placeholder', () => {
    const result = codegenGenerator.generate(makeObj({ generator: 'codegen', prompt: 'a lamp' }));
    // OctahedronGeometry(0.5, 2) has 162 vertices
    expect(result.geometry.attributes.position.count).toBeGreaterThan(0);
  });

  it('does not set isSdf', () => {
    const result = codegenGenerator.generate(makeObj({ generator: 'codegen', prompt: 'test' }));
    expect(result.isSdf).toBeUndefined();
  });

  it('does not return a material (handled by material pipeline)', () => {
    const result = codegenGenerator.generate(makeObj({ generator: 'codegen', prompt: 'test' }));
    expect(result.material).toBeUndefined();
  });

  it('populates metadata correctly', () => {
    const result = codegenGenerator.generate(makeObj({ generator: 'codegen', prompt: 'my lamp' }));
    expect(result.metadata.generator).toBe('codegen');
    expect(result.metadata.prompt).toBe('my lamp');
    expect(result.metadata.generationTime).toBeGreaterThanOrEqual(0);
    expect(result.metadata.vertexCount).toBeGreaterThan(0);
  });

  it('logs info when params.source is provided', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    codegenGenerator.generate(
      makeObj({
        generator: 'codegen',
        prompt: 'a lamp',
        params: { source: 'generated/junkyard/lamp.ts' },
      }),
    );
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('generated/junkyard/lamp.ts'),
    );
    spy.mockRestore();
  });

  it('works without params.source', () => {
    const result = codegenGenerator.generate(
      makeObj({ generator: 'codegen', prompt: 'a thing' }),
    );
    expect(result.geometry).toBeDefined();
  });
});
