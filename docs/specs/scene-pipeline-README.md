# Scene Pipeline Specification

This directory contains the extractable, engine-agnostic specification for the 3D Scene Pipeline format.

## Documents

| File | Description |
|------|-------------|
| [scene-pipeline-spec-v1.md](./scene-pipeline-spec-v1.md) | The full specification (v1.0). Self-contained -- everything needed to implement a compatible renderer. |

## What Is This?

The Scene Pipeline Spec defines a YAML-based file format for describing complete 3D scenes: geometry, materials, lighting, animation, instancing, and LOD. It is designed to be implemented by any 3D engine.

A scene file looks like this:

```yaml
version: "1.0"

meta:
  name: My Scene
  technique: parametric
  description: A simple example

objects:
  - id: ground
    prompt: flat grassy terrain
    generator: parametric/terrain
    material:
      preset: earth-dirt
```

## Who Is This For?

- **Engine developers** who want to add scene-file support to their renderer
- **Tool builders** who want to generate or manipulate 3D scenes programmatically
- **AI systems** that produce structured 3D content from natural language

## Reference Implementation

The reference implementation lives in this repository under `src/pipeline/`. It uses Three.js with WebGPURenderer, Zod for schema validation, and TSL for shader node graphs. See the appendix in the spec for details.

## Version

Current version: **1.0** (2026-03-25)
