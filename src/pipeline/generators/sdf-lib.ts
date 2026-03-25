/**
 * SDF Primitive Library — TSL functions for signed distance field shapes.
 *
 * Each primitive takes TSL node inputs (position, dimensions) and returns
 * a TSL float node representing the signed distance to the surface.
 *
 * TSL node types are complex and deeply generic in @types/three, so we use
 * a permissive TslNode type for the SDF composition API. The runtime
 * behavior is fully correct — TSL nodes compose via method chaining.
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TslNode = any;

// ─── Primitive SDFs ──────────────────────────────────────────────────────────

/** Sphere SDF: length(p) - r */
export const sdfSphere = (p: TslNode, r: TslNode): TslNode =>
  length(p).sub(r);

/** Box SDF: standard exact box distance */
export const sdfBox = (p: TslNode, b: TslNode): TslNode => {
  const q: TslNode = abs(p).sub(b);
  const outer = length(max(q, float(0.0)));
  const inner = min(max(q.x, max(q.y, q.z)), float(0.0));
  return outer.add(inner);
};

/** Torus SDF: ring with major radius and minor (tube) radius */
export const sdfTorus = (p: TslNode, majorR: TslNode, minorR: TslNode): TslNode => {
  const q = vec2(length(vec2(p.x, p.z)).sub(majorR), p.y);
  return length(q).sub(minorR);
};

/** Capped cylinder SDF: cylinder with radius r and half-height h */
export const sdfCylinder = (p: TslNode, r: TslNode, h: TslNode): TslNode => {
  const d = vec2(length(vec2(p.x, p.z)).sub(r), abs(p.y).sub(h));
  return min(max(d.x, d.y), float(0.0)).add(length(max(d, float(0.0))));
};

/** Cone SDF: cone with angle (radians) and height h */
export const sdfCone = (p: TslNode, angle: TslNode, h: TslNode): TslNode => {
  const c = vec2(sin(angle), cos(angle));
  const q = length(vec2(p.x, p.z));
  const d1 = dot(c, vec2(q, p.y));
  const d2 = abs(p.y).sub(h);
  return max(d1, d2);
};

/** Capsule SDF: line segment from a to b with radius r */
export const sdfCapsule = (p: TslNode, a: TslNode, b: TslNode, r: TslNode): TslNode => {
  const pa = p.sub(a);
  const ba = b.sub(a);
  const h = clamp(dot(pa, ba).div(dot(ba, ba)), float(0.0), float(1.0));
  return length(pa.sub(ba.mul(h))).sub(r);
};

/** Plane SDF: plane with normal n (must be normalized) at height h */
export const sdfPlane = (p: TslNode, n: TslNode, h: TslNode): TslNode =>
  dot(p, n).add(h);

// ─── Combination Operations ─────────────────────────────────────────────────

/** Union: min(d1, d2) — combines two shapes */
export const sdfUnion = (d1: TslNode, d2: TslNode): TslNode =>
  min(d1, d2);

/** Smooth union: blends two SDFs with smoothing factor k */
export const sdfSmoothUnion = (d1: TslNode, d2: TslNode, k: TslNode): TslNode => {
  const h = max(k.sub(abs(d1.sub(d2))), float(0.0)).div(k);
  return min(d1, d2).sub(h.mul(h).mul(k).mul(float(0.25)));
};

/** Subtract: max(d1, -d2) — removes shape 2 from shape 1 */
export const sdfSubtract = (d1: TslNode, d2: TslNode): TslNode =>
  max(d1, d2.negate());

/** Intersect: max(d1, d2) — keeps only the overlap */
export const sdfIntersect = (d1: TslNode, d2: TslNode): TslNode =>
  max(d1, d2);

// ─── Domain Operations ──────────────────────────────────────────────────────

/** Twist: rotates position around Y axis proportional to height */
export const sdfTwist = (p: TslNode, k: TslNode): TslNode => {
  const angle = p.y.mul(k);
  const c = cos(angle);
  const s = sin(angle);
  const xz = vec2(p.x.mul(c).sub(p.z.mul(s)), p.x.mul(s).add(p.z.mul(c)));
  return vec3(xz.x, p.y, xz.y);
};

/** Repeat: infinite repetition with given period */
export const sdfRepeat = (p: TslNode, period: TslNode): TslNode => {
  const halfPeriod = period.mul(float(0.5));
  return p.add(halfPeriod).mod(period).sub(halfPeriod);
};

/** Round: adds rounding to any SDF by subtracting radius */
export const sdfRound = (d: TslNode, r: TslNode): TslNode =>
  d.sub(r);

// ─── Normal Estimation ──────────────────────────────────────────────────────

/** Estimate surface normal via central differences of the SDF */
export const sdfNormal = (sdfFn: (p: TslNode) => TslNode, p: TslNode): TslNode => {
  const eps = float(0.001);
  return normalize(
    vec3(
      sdfFn(p.add(vec3(eps, 0, 0))).sub(sdfFn(p.sub(vec3(eps, 0, 0)))),
      sdfFn(p.add(vec3(0, eps, 0))).sub(sdfFn(p.sub(vec3(0, eps, 0)))),
      sdfFn(p.add(vec3(0, 0, eps))).sub(sdfFn(p.sub(vec3(0, 0, eps)))),
    ),
  );
};
