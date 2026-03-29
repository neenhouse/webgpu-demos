---
title: "Spike: Visual Quality, GPU Performance, Bundle Size"
date: 2026-03-29
status: COMPLETE
decision: Fix 39 demos missing atmosphere, add lighting to 7 flat-lit demos, document GPU hotspots
time_spent: 2 hours
---

## Question

What visual quality, GPU performance, and bundle size issues exist across the 146 demos?

## Findings

### Bundle Size

| Category | Size | Notes |
|----------|------|-------|
| R3F + Three.js shared chunk | 1,503 KB (410 KB gzipped) | Unavoidable core dependency |
| SceneFromYaml pipeline | 327 KB (94 KB gzipped) | Only loaded by scene-mode demos |
| App shell (index) | 257 KB (79 KB gzipped) | React + routing + gallery |
| 146 demo chunks | 623 KB total | Median 3.7 KB per demo |
| Full dist | 6.4 MB | Including thumbnails and scene YAML |

**Verdict:** Bundle size is healthy. Demos are well code-split. The largest demo chunk (architecture-blueprint at 44 KB) is an outlier. No action needed.

### Visual Quality Issues

| Issue | Count | Severity |
|-------|-------|----------|
| Missing background/atmosphere | 39 demos | HIGH — renders against plain black |
| Low polygon geometry (≤4 segments) | 48 demos | LOW — acceptable for instanced particles |
| Flat lighting (ambient only) | 7 demos | MEDIUM — looks dull |
| Missing emissive | 4 demos | LOW — missed glow opportunity |

**Key insight:** The 48 "low polygon" demos are mostly using low-poly spheres for instanced particles (boids, sparks, etc.) which is correct — you want fast geometry for 5000+ instances. No fix needed.

The 39 missing-atmosphere demos and 7 flat-lit demos need fixes.

### GPU Performance Hotspots

| Demo | Issue | Risk |
|------|-------|------|
| fluid-sim | 8 compute dispatches/frame | HIGH |
| gpu-culling | 10,000 instances + compute | HIGH |
| boids-murmuration | 10,000 instances + compute | HIGH |
| deferred-lights | 100 point lights | HIGH |
| toon-outline | 30 meshes (60 draw calls) | MEDIUM |
| fractal-zoom | Loop(80) shader | MEDIUM |
| terrain-erosion | 6 compute dispatches | MEDIUM |

**Verdict:** These are inherent to the demos' concepts (you can't do boids with fewer particles). Document as "heavy" in manifests rather than optimize away the visual impact. The main optimization opportunity is the 39 demos without atmosphere — adding a background gradient/fog makes them look dramatically better at near-zero GPU cost.

## Recommendation

1. **Fix 39 demos missing atmosphere** — add BackSide gradient sphere + subtle fog
2. **Fix 7 flat-lit demos** — add directional + point light
3. **Fix 4 demos missing emissive** — add emissiveIntensity
4. **Document GPU hotspots** — add `quality.complexity: advanced` to manifests of heavy demos
5. **No bundle size changes needed** — architecture is healthy

## Impact

- 39 demo source files need atmosphere additions
- 7 demo source files need lighting improvements
- 4 demo source files need emissive additions
- docs/ralph-specs/batch-playbook.md — add atmosphere rule
