---
title: "Spike: Scene Pipeline Quality + Cross-Demo Consistency"
date: 2026-03-31
status: COMPLETE
decision: Added animations to 7 YAML scenes, updated playbook with animation speed tiers
time_spent: 1.5 hours
---

## Question

What quality issues exist in the 11 YAML scene demos and across the 135 component demos for cross-demo consistency?

## Findings

### Scene Pipeline (11 YAML demos)

| Metric | Result |
|--------|--------|
| Camera | All good (10-18 units away, FOV 55) |
| Lighting | All have ambient + directional/point |
| Fog | 11/11 have fog |
| Background | 11/11 set custom color |
| Animations | **4/11 had animations, 7/11 had NONE** |
| Generator diversity | 9/11 parametric-only (2 had CSG/SDF) |
| Overall grades | 1 A, 1 B+, 8 B, 1 C |

**Critical fix applied:** Added 2-4 animations to each of the 7 scene files lacking them.

### Cross-Demo Consistency (135 component demos)

| Dimension | Status | Detail |
|-----------|--------|--------|
| Camera | GOOD | 131/134 use default [0,0,4], 3 justified overrides |
| Rotation speed | MODERATE | 7 demos > 0.5 (playbook says 0.05-0.15) |
| Ambient light | GOOD | median 0.15, 7 zeros are all shader demos (no fix needed) |
| Point lights | GOOD | median 3, mode 3 |
| OrbitControls | EXCELLENT | 0 conflicts |
| Background sphere | GOOD | consistent radii 30-80 |

**All 7 zero-ambient demos confirmed to be MeshBasicNodeMaterial shader effects — no fix needed.**

## Actions Taken

1. Added animations to 7 YAML scene files (cyberpunk-street, desert-outpost, gladiator-arena, junkyard, medieval-forge, robot-factory, underwater-ruins)
2. Updated batch playbook with 4-tier animation speed guide (slow/medium/fast/extreme)
3. Added minimum ambient light rule to playbook

## Remaining (not fixed, low priority)

- 9/11 YAML scenes use only parametric generators (adding CSG/SDF would require scene rewrites)
- 7 component demos have rotation > 0.5 (intentional for their visual style)
- test-scene.scene.yaml is sparse (4 objects) — acceptable as a test fixture
