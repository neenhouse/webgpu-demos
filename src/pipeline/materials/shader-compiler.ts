import type * as THREE from 'three/webgpu';
import {
  color,
  float,
  vec2,
  vec3,
  vec4,
  mix,
  smoothstep,
  hash,
  positionLocal,
  positionWorld,
  normalLocal,
  normalWorld,
  cameraPosition,
  time,
  oscSine,
  uv,
  Fn,
  screenUV,
} from 'three/tsl';

/**
 * Mapping of TSL functions available in shader scope.
 * Shaders reference these by name (e.g., `mat.colorNode = color(0xff0000)`).
 */
const tslScope: Record<string, unknown> = {
  color,
  float,
  vec2,
  vec3,
  vec4,
  mix,
  smoothstep,
  hash,
  positionLocal,
  positionWorld,
  normalLocal,
  normalWorld,
  cameraPosition,
  time,
  oscSine,
  uv,
  Fn,
  screenUV,
};

/**
 * Compile inline TSL shader code and apply it to a material.
 *
 * The shader string from scene YAML contains TSL expressions that reference
 * `mat` (the material being configured) and standard TSL imports. The compiler
 * builds a function using `new Function()` that receives the TSL utilities
 * and material as arguments and executes the shader code.
 *
 * SECURITY NOTE: Inline shaders execute arbitrary JavaScript via `new Function()`.
 * This is acceptable because scene YAML files are authored by Ralph (trusted AI)
 * or the developer, not user-supplied content. Never expose this to untrusted input.
 *
 * @param shaderCode - TSL code string to compile and execute
 * @param mat - The MeshStandardNodeMaterial to apply shader nodes to
 */
export function compileShader(shaderCode: string, mat: THREE.MeshStandardNodeMaterial): void {
  // Handle empty shader string: no-op
  if (!shaderCode || shaderCode.trim() === '') return;

  // Build argument names and values arrays
  const argNames = ['mat', ...Object.keys(tslScope)];
  const argValues = [mat, ...Object.values(tslScope)];

  try {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const fn = new Function(...argNames, shaderCode);
    fn(...argValues);
  } catch (err) {
    // Shader that throws: catch error, log it, leave material in pre-shader state.
    // Shaders that reference unavailable TSL functions will throw ReferenceError
    // because the Function scope only provides what we pass in.
    console.error('[shader-compiler] Failed to compile inline TSL shader:', err);
    console.error('[shader-compiler] Shader code:', shaderCode.substring(0, 200));
  }
}
