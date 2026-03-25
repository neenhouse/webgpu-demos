// Re-export registry API
export { registerPreset, getPreset, listPresets } from './registry.ts';

// Eagerly load all presets -- each import triggers registerPreset() as a side effect.
// Since presets are small factory functions (no heavy assets), eager loading is fine.
// These imports must be AFTER the re-export above to avoid TDZ issues.
import './rusted-metal.ts';
import './concrete.ts';
import './chrome.ts';
import './wood.ts';
import './glass.ts';
import './organic.ts';
import './neon.ts';
import './cel-shaded.ts';
