// Placeholder — will be implemented in Task 6
import type { Generator } from './types.ts';

export const sdfGenerator: Generator = {
  name: 'sdf',
  canHandle() { return 0; },
  generate() { throw new Error('SDF generator not yet implemented'); },
};
