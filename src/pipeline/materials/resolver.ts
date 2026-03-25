import * as THREE from 'three/webgpu';
import { color, float } from 'three/tsl';
import type { MaterialDef, MaterialContext, PbrValues } from './types.ts';
import { getPreset } from './presets/index.ts';
import { compileShader } from './shader-compiler.ts';

/**
 * Clamp a numeric value to [0, 1].
 */
function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Apply PBR overrides to a MeshStandardNodeMaterial using TSL nodes.
 * Shared between the main pbr step and the overrides step.
 */
export function applyPbrOverrides(mat: THREE.MeshStandardNodeMaterial, pbr: PbrValues | undefined): void {
  if (!pbr) return;

  if (pbr.color !== undefined) {
    mat.colorNode = color(pbr.color);
  }
  if (pbr.roughness !== undefined) {
    mat.roughnessNode = float(clamp01(pbr.roughness));
  }
  if (pbr.metalness !== undefined) {
    mat.metalnessNode = float(clamp01(pbr.metalness));
  }
  if (pbr.opacity !== undefined) {
    mat.transparent = true;
    mat.opacityNode = float(clamp01(pbr.opacity));
  }
  if (pbr.emissive !== undefined) {
    const emissiveColor = color(pbr.emissive);
    const intensity = pbr.emissive_intensity ?? 1;
    mat.emissiveNode = emissiveColor.mul(float(intensity));
  }
  if (pbr.emissive_intensity !== undefined && pbr.emissive === undefined) {
    // Only intensity provided without color -- apply to existing emissive
    mat.emissiveIntensity = pbr.emissive_intensity;
  }
}

/**
 * Apply rendering hints (side, transparent, blending, wireframe, flatShading) to a material.
 */
function applyRenderingHints(mat: THREE.MeshStandardNodeMaterial, def: MaterialDef): void {
  if (def.side !== undefined) {
    const sideMap: Record<string, THREE.Side> = {
      front: THREE.FrontSide,
      back: THREE.BackSide,
      double: THREE.DoubleSide,
    };
    mat.side = sideMap[def.side] ?? THREE.FrontSide;
  }

  if (def.transparent !== undefined) {
    mat.transparent = def.transparent;
  }

  if (def.blending !== undefined) {
    mat.blending = def.blending === 'additive' ? THREE.AdditiveBlending : THREE.NormalBlending;
  }

  if (def.wireframe !== undefined) {
    mat.wireframe = def.wireframe;
  }

  if (def.flatShading !== undefined) {
    mat.flatShading = def.flatShading;
  }
}

/**
 * Resolve a MaterialDef into a configured MeshStandardNodeMaterial.
 *
 * Resolution order:
 * 1. inherit -- clone parent or referenced material
 * 2. preset  -- load from preset registry
 * 3. pbr     -- apply structured PBR overrides
 * 4. prompt  -- AI prompt interpretation (TODO)
 * 5. shader  -- inline TSL shader compilation
 * 6. overrides -- final property overrides
 *
 * Rendering hints (side, transparent, blending, wireframe, flatShading) are applied last.
 */
export function resolveMaterial(
  def: MaterialDef,
  context?: MaterialContext,
): THREE.MeshStandardNodeMaterial {
  let mat: THREE.MeshStandardNodeMaterial | null = null;

  // Step 1: inherit -- clone from parent or referenced object
  // Note: MeshStandardNodeMaterial.clone() copies node references (shallow clone
  // of node graph). This is correct -- inherited children share the same node graph
  // unless they override specific nodes in subsequent steps.
  // Shader is atomic -- if a child provides def.shader, it replaces all node
  // assignments from the inherited material's shader (compileShader assigns directly).
  if (def.inherit) {
    if (def.inherit === 'parent') {
      if (context?.parentMaterial) {
        mat = context.parentMaterial.clone() as THREE.MeshStandardNodeMaterial;
      } else {
        console.warn(
          `[material-resolver] inherit: "parent" but no parent material in context for object "${context?.objectId ?? 'unknown'}"`,
        );
      }
    } else {
      // String ID reference -- look up already-resolved material
      const resolvedMat = context?.resolvedMaterials?.get(def.inherit);
      if (resolvedMat) {
        mat = resolvedMat.clone() as THREE.MeshStandardNodeMaterial;
      } else {
        console.warn(
          `[material-resolver] inherit: "${def.inherit}" but no resolved material found for that object ID`,
        );
      }
    }
  }

  // Step 2: preset -- load from preset registry
  if (def.preset) {
    const factory = getPreset(def.preset);
    if (factory) {
      // Preset factory creates the base material (overrides are applied in step 3)
      mat = factory();
    } else {
      console.warn(
        `[material-resolver] Unknown preset "${def.preset}" -- using default grey material`,
      );
    }
  }

  // Ensure we have a material at this point
  if (!mat) {
    mat = new THREE.MeshStandardNodeMaterial();
  }

  // Step 3: pbr -- apply structured PBR overrides on top of whatever base material
  // exists from steps 1-2. Uses node assignments so PBR values work alongside
  // TSL node graphs from presets.
  if (def.pbr) {
    applyPbrOverrides(mat, def.pbr);
  }

  // Step 4: prompt -- AI prompt interpretation
  // TODO: Implement AI prompt -> material mapping when AI integration layer is built

  // Step 5: shader -- inline TSL shader compilation
  if (def.shader) {
    compileShader(def.shader, mat);
  }

  // Step 6: overrides -- final property overrides
  if (def.overrides) {
    const pbrOverrides: PbrValues = {};
    if ('color' in def.overrides) pbrOverrides.color = def.overrides.color as string;
    if ('roughness' in def.overrides) pbrOverrides.roughness = def.overrides.roughness as number;
    if ('metalness' in def.overrides) pbrOverrides.metalness = def.overrides.metalness as number;
    if ('opacity' in def.overrides) pbrOverrides.opacity = def.overrides.opacity as number;
    if ('emissive' in def.overrides) pbrOverrides.emissive = def.overrides.emissive as string;
    if ('emissive_intensity' in def.overrides) pbrOverrides.emissive_intensity = def.overrides.emissive_intensity as number;
    applyPbrOverrides(mat, pbrOverrides);
  }

  // Apply rendering hints last
  applyRenderingHints(mat, def);

  return mat;
}
