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
];

export function getDemoByName(name: string): DemoEntry | undefined {
  return demos.find((d) => d.name === name);
}
