// Placeholder — will be implemented in Task 7
import type { Generator } from '../types.ts';

export const parametricGenerator: Generator = {
  name: 'parametric',
  canHandle() { return 0; },
  generate() { throw new Error('Parametric generator not yet implemented'); },
};
