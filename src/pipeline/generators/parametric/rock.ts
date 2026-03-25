// Placeholder — will be implemented in Task 8
import type { Generator } from '../types.ts';

export const rockGenerator: Generator = {
  name: 'parametric/rock',
  canHandle() { return 0; },
  generate() { throw new Error('Rock generator not yet implemented'); },
};
