// Material pipeline public API
export { resolveMaterial, applyPbrOverrides } from './resolver.ts';
export { registerPreset, getPreset, listPresets } from './presets/index.ts';
export { compileShader } from './shader-compiler.ts';
export type { MaterialDef, MaterialContext, PbrValues, PresetFactory } from './types.ts';
