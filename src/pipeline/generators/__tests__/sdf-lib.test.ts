import { describe, it, expect } from 'vitest';
import {
  sdfSphere,
  sdfBox,
  sdfTorus,
  sdfCylinder,
  sdfCone,
  sdfCapsule,
  sdfPlane,
  sdfUnion,
  sdfSmoothUnion,
  sdfSubtract,
  sdfIntersect,
  sdfTwist,
  sdfRepeat,
  sdfRound,
  sdfNormal,
} from '../sdf-lib.ts';
import { float, vec3 } from 'three/tsl';

describe('SDF Primitive Library', () => {
  describe('primitives', () => {
    it('sdfSphere returns a node', () => {
      const p = vec3(1, 0, 0);
      const r = float(0.5);
      const result = sdfSphere(p, r);
      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
    });

    it('sdfBox returns a node', () => {
      const p = vec3(0, 0, 0);
      const b = vec3(0.5, 0.5, 0.5);
      const result = sdfBox(p, b);
      expect(result).toBeDefined();
    });

    it('sdfTorus returns a node', () => {
      const p = vec3(0, 0, 0);
      const result = sdfTorus(p, float(1), float(0.3));
      expect(result).toBeDefined();
    });

    it('sdfCylinder returns a node', () => {
      const p = vec3(0, 0, 0);
      const result = sdfCylinder(p, float(0.5), float(1));
      expect(result).toBeDefined();
    });

    it('sdfCone returns a node', () => {
      const p = vec3(0, 0, 0);
      const result = sdfCone(p, float(0.5), float(1));
      expect(result).toBeDefined();
    });

    it('sdfCapsule returns a node', () => {
      const p = vec3(0, 0, 0);
      const a = vec3(0, -1, 0);
      const b = vec3(0, 1, 0);
      const result = sdfCapsule(p, a, b, float(0.3));
      expect(result).toBeDefined();
    });

    it('sdfPlane returns a node', () => {
      const p = vec3(0, 0, 0);
      const n = vec3(0, 1, 0);
      const result = sdfPlane(p, n, float(0));
      expect(result).toBeDefined();
    });
  });

  describe('combination operations', () => {
    it('sdfUnion returns a node', () => {
      const d1 = float(0.5);
      const d2 = float(1.0);
      const result = sdfUnion(d1, d2);
      expect(result).toBeDefined();
    });

    it('sdfSmoothUnion returns a node', () => {
      const d1 = float(0.5);
      const d2 = float(1.0);
      const result = sdfSmoothUnion(d1, d2, float(0.3));
      expect(result).toBeDefined();
    });

    it('sdfSubtract returns a node', () => {
      const d1 = float(0.5);
      const d2 = float(1.0);
      const result = sdfSubtract(d1, d2);
      expect(result).toBeDefined();
    });

    it('sdfIntersect returns a node', () => {
      const d1 = float(0.5);
      const d2 = float(1.0);
      const result = sdfIntersect(d1, d2);
      expect(result).toBeDefined();
    });
  });

  describe('domain operations', () => {
    it('sdfTwist returns a node', () => {
      const p = vec3(1, 2, 3);
      const result = sdfTwist(p, float(0.5));
      expect(result).toBeDefined();
    });

    it('sdfRepeat returns a node', () => {
      const p = vec3(1, 2, 3);
      const result = sdfRepeat(p, vec3(2, 2, 2));
      expect(result).toBeDefined();
    });

    it('sdfRound returns a node', () => {
      const result = sdfRound(float(0.5), float(0.1));
      expect(result).toBeDefined();
    });
  });

  describe('normal estimation', () => {
    it('sdfNormal returns a node', () => {
      const p = vec3(1, 0, 0);
      const sphereSdf = (pos: Parameters<typeof sdfSphere>[0]) => sdfSphere(pos, float(1));
      const result = sdfNormal(sphereSdf, p);
      expect(result).toBeDefined();
    });
  });

  describe('exports', () => {
    it('all SDF functions are exported as functions', () => {
      expect(typeof sdfSphere).toBe('function');
      expect(typeof sdfBox).toBe('function');
      expect(typeof sdfTorus).toBe('function');
      expect(typeof sdfCylinder).toBe('function');
      expect(typeof sdfCone).toBe('function');
      expect(typeof sdfCapsule).toBe('function');
      expect(typeof sdfPlane).toBe('function');
      expect(typeof sdfUnion).toBe('function');
      expect(typeof sdfSmoothUnion).toBe('function');
      expect(typeof sdfSubtract).toBe('function');
      expect(typeof sdfIntersect).toBe('function');
      expect(typeof sdfTwist).toBe('function');
      expect(typeof sdfRepeat).toBe('function');
      expect(typeof sdfRound).toBe('function');
      expect(typeof sdfNormal).toBe('function');
    });
  });
});
