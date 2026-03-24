import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

export interface DemoMeta {
  name: string;
  title: string;
  description: string;
  requiresWebGPU: boolean;
  color: string; // accent color for gallery card
}

export interface DemoEntry extends DemoMeta {
  component: LazyExoticComponent<ComponentType>;
}

export const demos: DemoEntry[] = [
  {
    name: 'tsl-torus',
    title: 'TSL Torus Knot',
    description: 'Animated torus knot with TSL fresnel glow and color oscillation',
    requiresWebGPU: false,
    color: '#0088ff',
    component: lazy(() => import('../demos/tsl-torus')),
  },
  {
    name: 'particle-field',
    title: 'Particle Field',
    description: '2000 instanced spheres with position-driven color gradients and fresnel glow',
    requiresWebGPU: false,
    color: '#ff44aa',
    component: lazy(() => import('../demos/particle-field')),
  },
  {
    name: 'procedural-terrain',
    title: 'Procedural Terrain',
    description: 'Rolling hills with layered sine-wave displacement and height-based coloring',
    requiresWebGPU: false,
    color: '#1a9926',
    component: lazy(() => import('../demos/procedural-terrain')),
  },
  {
    name: 'crystal-grid',
    title: 'Crystal Grid',
    description: 'Faceted icosahedrons with rainbow wave animation and metallic fresnel rim',
    requiresWebGPU: false,
    color: '#8844ff',
    component: lazy(() => import('../demos/crystal-grid')),
  },
  {
    name: 'aurora-waves',
    title: 'Aurora Waves',
    description: 'Translucent ribbons flowing through green, cyan, purple, and pink',
    requiresWebGPU: false,
    color: '#00ff88',
    component: lazy(() => import('../demos/aurora-waves')),
  },
  {
    name: 'morphing-sphere',
    title: 'Morphing Sphere',
    description: 'Organic alien blob with layered sine-wave vertex displacement',
    requiresWebGPU: false,
    color: '#ff6600',
    component: lazy(() => import('../demos/morphing-sphere')),
  },
  {
    name: 'neon-rings',
    title: 'Neon Rings',
    description: 'Concentric torus rings with pulsing neon emissive glow',
    requiresWebGPU: false,
    color: '#ff00ff',
    component: lazy(() => import('../demos/neon-rings')),
  },
  {
    name: 'ocean-surface',
    title: 'Ocean Surface',
    description: 'Stylized ocean with layered wave displacement and glossy surface',
    requiresWebGPU: false,
    color: '#0066cc',
    component: lazy(() => import('../demos/ocean-surface')),
  },
  {
    name: 'pulse-grid',
    title: 'Pulse Grid',
    description: '400 boxes pulsing in expanding circular ripple waves',
    requiresWebGPU: false,
    color: '#1144aa',
    component: lazy(() => import('../demos/pulse-grid')),
  },
  {
    name: 'spiral-galaxy',
    title: 'Spiral Galaxy',
    description: '3000 instanced stars in three spiral arms with warm-to-cool gradient',
    requiresWebGPU: false,
    color: '#ffcc44',
    component: lazy(() => import('../demos/spiral-galaxy')),
  },
  {
    name: 'flame-orb',
    title: 'Flame Orb',
    description: 'Sphere with aggressive fire-like flickering and warm emission',
    requiresWebGPU: false,
    color: '#ff3300',
    component: lazy(() => import('../demos/flame-orb')),
  },
  {
    name: 'dna-helix',
    title: 'DNA Helix',
    description: 'Double helix of instanced spheres with blue-red gradient and connecting rungs',
    requiresWebGPU: false,
    color: '#4488ff',
    component: lazy(() => import('../demos/dna-helix')),
  },
  {
    name: 'wireframe-landscape',
    title: 'Wireframe Landscape',
    description: 'Retro Tron-style scrolling wireframe terrain with neon glow',
    requiresWebGPU: false,
    color: '#00ffff',
    component: lazy(() => import('../demos/wireframe-landscape')),
  },
  {
    name: 'plasma-globe',
    title: 'Plasma Globe',
    description: 'Electric purple-blue sphere with swirling plasma discharge patterns',
    requiresWebGPU: false,
    color: '#6600ff',
    component: lazy(() => import('../demos/plasma-globe')),
  },
  {
    name: 'ribbon-dance',
    title: 'Ribbon Dance',
    description: 'Colorful ribbons twisting and spiraling through space',
    requiresWebGPU: false,
    color: '#ff2244',
    component: lazy(() => import('../demos/ribbon-dance')),
  },
  {
    name: 'noise-dissolve',
    title: 'Noise Dissolve',
    description: 'Dodecahedron dissolving and reforming with hash noise, burning edges, and fresnel rim',
    requiresWebGPU: false,
    color: '#ee8833',
    component: lazy(() => import('../demos/noise-dissolve')),
  },
  {
    name: 'screen-hologram',
    title: 'Screen Hologram',
    description: 'Holographic projection with screen-space scanlines, glitch bands, and fresnel rim glow',
    requiresWebGPU: false,
    color: '#22ddcc',
    component: lazy(() => import('../demos/screen-hologram')),
  },
  {
    name: 'uv-kaleidoscope',
    title: 'UV Kaleidoscope',
    description: 'Procedural mandala with polar UV folding, spherize warping, and animated concentric patterns',
    requiresWebGPU: false,
    color: '#dd2288',
    component: lazy(() => import('../demos/uv-kaleidoscope')),
  },
  {
    name: 'bloom-orbs',
    title: 'Bloom Orbs',
    description: 'Floating orbs with TSL-driven glow halos, fresnel rims, additive blending, and pulsing emissive bloom',
    requiresWebGPU: false,
    color: '#ccff00',
    component: lazy(() => import('../demos/bloom-orbs')),
  },
  {
    name: 'sprite-sparks',
    title: 'Sprite Sparks',
    description: 'Billboard point-sprite particle fountain with TSL-driven size, color gradients, and pulsing opacity',
    requiresWebGPU: false,
    color: '#ff8844',
    component: lazy(() => import('../demos/sprite-sparks')),
  },
  {
    name: 'volumetric-cloud',
    title: 'Volumetric Cloud',
    description: 'Layered shell volumetric nebula with TSL Fn() noise-driven density, animated swirling, and warm-to-cool emissive glow',
    requiresWebGPU: false,
    color: '#aa44cc',
    component: lazy(() => import('../demos/volumetric-cloud')),
  },
  {
    name: 'multi-material',
    title: 'Multi-Material',
    description: 'Cube assembled from 6 planes, each with a unique TSL material: fire, ice, electric, gold, nature, and plasma',
    requiresWebGPU: false,
    color: '#33cc99',
    component: lazy(() => import('../demos/multi-material')),
  },
  {
    name: 'compute-particles',
    title: 'Compute Particles',
    description: '20,000 GPU-driven particles with compute shader physics, gravity, respawn, and velocity-based color',
    requiresWebGPU: true,
    color: '#ff5577',
    component: lazy(() => import('../demos/compute-particles')),
  },
  {
    name: 'resolution-warp',
    title: 'Resolution Warp',
    description: 'CRT pixelation sphere using TSL screenSize for pixel-scale grids, phosphor sub-pixels, scanlines, and moiré patterns',
    requiresWebGPU: false,
    color: '#44bbdd',
    component: lazy(() => import('../demos/resolution-warp')),
  },
  {
    name: 'skeletal-wave',
    title: 'Skeletal Wave',
    description: 'Programmatic skinned mesh tentacles with CPU-driven bone animation and TSL height-based color gradients',
    requiresWebGPU: false,
    color: '#bb44ff',
    component: lazy(() => import('../demos/skeletal-wave')),
  },
  {
    name: 'galaxy-collision',
    title: 'Galaxy Collision',
    description: 'Two spiral galaxies collide with GPU compute gravity driving 10000+ stars',
    requiresWebGPU: true,
    color: '#2244aa',
    component: lazy(() => import('../demos/galaxy-collision')),
  },
  {
    name: 'fractal-zoom',
    title: 'Fractal Zoom',
    description: 'Mandelbrot set with infinite zoom, smooth coloring, and cycling vivid gradients rendered in TSL',
    requiresWebGPU: false,
    color: '#ff6622',
    component: lazy(() => import('../demos/fractal-zoom')),
  },
  {
    name: 'fluid-sim',
    title: 'Fluid Simulation',
    description: '256x256 GPU compute fluid with semi-Lagrangian advection, vorticity confinement, and multi-color dye injection',
    requiresWebGPU: true,
    color: '#11ccaa',
    component: lazy(() => import('../demos/fluid-sim')),
  },
];

export function getDemoByName(name: string): DemoEntry | undefined {
  return demos.find((d) => d.name === name);
}

export function getAdjacentDemos(name: string): { prev: DemoEntry | null; next: DemoEntry | null } {
  const idx = demos.findIndex((d) => d.name === name);
  if (idx === -1) return { prev: null, next: null };
  return {
    prev: idx > 0 ? demos[idx - 1] : demos[demos.length - 1],
    next: idx < demos.length - 1 ? demos[idx + 1] : demos[0],
  };
}
