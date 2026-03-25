/**
 * SDF Primitive Library — TSL functions for signed distance field shapes.
 *
 * Each primitive takes TSL node inputs (position, dimensions) and returns
 * a TSL float node representing the signed distance to the surface.
 *
 * Usage with three/tsl:
 *   import { sdfSphere, sdfBox, sdfSmoothUnion } from './sdf-lib.ts';
 *   const d = sdfSmoothUnion(sdfSphere(p, float(1)), sdfBox(p, vec3(0.5)), float(0.3));
 */

import {
  float,
  vec2,
  vec3,
  length,
  abs,
  max,
  min,
  normalize,
  sin,
  cos,
  clamp,
  dot,
} from 'three/tsl';
import type { Node } from 'three/webgpu';

// ─── Primitive SDFs ──────────────────────────────────────────────────────────

/** Sphere SDF: length(p) - r */
export const sdfSphere = (p: Node, r: Node): Node =>
  length(p).sub(r);

/** Box SDF: standard exact box distance */
export const sdfBox = (p: Node, b: Node): Node => {
  const q = abs(p).sub(b);
  return length(max(q, float(0.0))).add(min(max(q.x, max(q.y, q.z)), float(0.0)));
};

/** Torus SDF: ring with major radius and minor (tube) radius */
export const sdfTorus = (p: Node, majorR: Node, minorR: Node): Node => {
  const q = vec2(length(vec2(p.x, p.z)).sub(majorR), p.y);
  return length(q).sub(minorR);
};

/** Capped cylinder SDF: cylinder with radius r and half-height h */
export const sdfCylinder = (p: Node, r: Node, h: Node): Node => {
  const d = vec2(length(vec2(p.x, p.z)).sub(r), abs(p.y).sub(h));
  return min(max(d.x, d.y), float(0.0)).add(length(max(d, float(0.0))));
};

/** Cone SDF: cone with angle (radians) and height h */
export const sdfCone = (p: Node, angle: Node, h: Node): Node => {
  // c = vec2(sin(angle), cos(angle))
  const c = vec2(sin(angle), cos(angle));
  const q = length(vec2(p.x, p.z));
  // Project onto cone surface
  const d1 = dot(c, vec2(q, p.y));
  const d2 = abs(p.y).sub(h);
  return max(d1, d2);
};

/** Capsule SDF: line segment from a to b with radius r */
export const sdfCapsule = (p: Node, a: Node, b: Node, r: Node): Node => {
  const pa = p.sub(a);
  const ba = b.sub(a);
  const h = clamp(dot(pa, ba).div(dot(ba, ba)), float(0.0), float(1.0));
  return length(pa.sub(ba.mul(h))).sub(r);
};

/** Plane SDF: plane with normal n (must be normalized) at height h */
export const sdfPlane = (p: Node, n: Node, h: Node): Node =>
  dot(p, n).add(h);

// ─── Combination Operations ─────────────────────────────────────────────────

/** Union: min(d1, d2) — combines two shapes */
export const sdfUnion = (d1: Node, d2: Node): Node =>
  min(d1, d2);

/** Smooth union: blends two SDFs with smoothing factor k */
export const sdfSmoothUnion = (d1: Node, d2: Node, k: Node): Node => {
  const h = max(k.sub(abs(d1.sub(d2))), float(0.0)).div(k);
  return min(d1, d2).sub(h.mul(h).mul(k).mul(float(0.25)));
};

/** Subtract: max(d1, -d2) — removes shape 2 from shape 1 */
export const sdfSubtract = (d1: Node, d2: Node): Node =>
  max(d1, d2.negate());

/** Intersect: max(d1, d2) — keeps only the overlap */
export const sdfIntersect = (d1: Node, d2: Node): Node =>
  max(d1, d2);

// ─── Domain Operations ──────────────────────────────────────────────────────

/** Twist: rotates position around Y axis proportional to height */
export const sdfTwist = (p: Node, k: Node): Node => {
  const angle = p.y.mul(k);
  const c = cos(angle);
  const s = sin(angle);
  const xz = vec2(p.x.mul(c).sub(p.z.mul(s)), p.x.mul(s).add(p.z.mul(c)));
  return vec3(xz.x, p.y, xz.y);
};

/** Repeat: infinite repetition with given period */
export const sdfRepeat = (p: Node, period: Node): Node => {
  // mod(p + 0.5 * period, period) - 0.5 * period
  const halfPeriod = period.mul(float(0.5));
  return p.add(halfPeriod).mod(period).sub(halfPeriod);
};

/** Round: adds rounding to any SDF by subtracting radius */
export const sdfRound = (d: Node, r: Node): Node =>
  d.sub(r);

// ─── Normal Estimation ──────────────────────────────────────────────────────

/** Estimate surface normal via central differences of the SDF */
export const sdfNormal = (sdfFn: (p: Node) => Node, p: Node): Node => {
  const eps = float(0.001);
  return normalize(
    vec3(
      sdfFn(p.add(vec3(eps, 0, 0))).sub(sdfFn(p.sub(vec3(eps, 0, 0)))),
      sdfFn(p.add(vec3(0, eps, 0))).sub(sdfFn(p.sub(vec3(0, eps, 0)))),
      sdfFn(p.add(vec3(0, 0, eps))).sub(sdfFn(p.sub(vec3(0, 0, eps)))),
    ),
  );
};
