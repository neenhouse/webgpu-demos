// Placeholder — will be implemented in Task 9
import type { Generator } from '../types.ts';

export const vegetationGenerator: Generator = {
  name: 'parametric/vegetation',
  canHandle() { return 0; },
  generate() { throw new Error('Vegetation generator not yet implemented'); },
};
