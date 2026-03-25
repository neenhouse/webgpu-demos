import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three/webgpu';
import { compileShader } from '../shader-compiler.ts';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('compileShader', () => {
  it('assigns colorNode to the material with valid code', () => {
    const mat = new THREE.MeshStandardNodeMaterial();
    compileShader('mat.colorNode = color(0xff0000);', mat);
    expect(mat.colorNode).not.toBeNull();
  });

  it('is a no-op with empty string', () => {
    const mat = new THREE.MeshStandardNodeMaterial();
    const colorBefore = mat.colorNode;
    compileShader('', mat);
    expect(mat.colorNode).toBe(colorBefore);
  });

  it('is a no-op with whitespace-only string', () => {
    const mat = new THREE.MeshStandardNodeMaterial();
    const colorBefore = mat.colorNode;
    compileShader('   \n  ', mat);
    expect(mat.colorNode).toBe(colorBefore);
  });

  it('catches error and logs it for invalid code', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const mat = new THREE.MeshStandardNodeMaterial();
    compileShader('this is not valid javascript!!!', mat);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to compile'),
      expect.anything(),
    );
  });

  it('sets roughnessNode when shader code assigns it', () => {
    const mat = new THREE.MeshStandardNodeMaterial();
    compileShader('mat.roughnessNode = float(0.5);', mat);
    expect(mat.roughnessNode).not.toBeNull();
  });

  it('material retains pre-shader state when compilation fails', () => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.wireframe = true;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    compileShader('throw new Error("intentional failure");', mat);
    // Material should still have its pre-shader properties
    expect(mat.wireframe).toBe(true);
    expect(mat).toBeInstanceOf(THREE.MeshStandardNodeMaterial);
  });

  it('provides TSL scope functions to shader code', () => {
    const mat = new THREE.MeshStandardNodeMaterial();
    // Use multiple TSL functions to verify they're in scope
    compileShader(
      'mat.colorNode = mix(color(0x000000), color(0xffffff), float(0.5));',
      mat,
    );
    expect(mat.colorNode).not.toBeNull();
  });
});
