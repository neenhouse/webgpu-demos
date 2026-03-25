import type * as THREE from 'three/webgpu';

/**
 * Compile inline TSL shader code and apply it to a material.
 *
 * SECURITY NOTE: Inline shaders execute arbitrary JavaScript via `new Function()`.
 * This is acceptable because scene YAML files are authored by Ralph (trusted AI)
 * or the developer, not user-supplied content.
 *
 * Stub implementation -- will be fully implemented in Task 6.
 */
export function compileShader(shaderCode: string, _mat: THREE.MeshStandardNodeMaterial): void {
  if (!shaderCode || shaderCode.trim() === '') return;

  console.warn('[shader-compiler] Shader compilation not yet implemented. Code:', shaderCode.substring(0, 100));
}
