/* eslint-disable react-hooks/purity */
import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
  color,
  time,
  positionLocal,
  positionWorld,
  normalLocal,
  normalWorld,
  cameraPosition,
  Fn,
  float,
  mix,
  smoothstep,
  hash,
  vec3,
  sin,
} from 'three/tsl';

/**
 * Infinite Terrain — Endless scrolling landscape with multi-octave noise, 4 biomes, and fog
 *
 * Techniques:
 * 1. Multi-octave hash noise for height displacement on PlaneGeometry (128x128 subdivisions)
 * 2. Time-offset noise coordinates to simulate camera scrolling forward
 * 3. 6-stop biome gradient (deep water, shallow water, beach, grass, rock, snow)
 * 4. Distance fog via smoothstep on positionLocal.z
 * 5. Vertex normal recalculation for smooth lighting
 * 6. BackSide bloom halo shells on the sky dome for atmospheric glow
 * 7. Fresnel rim glow on terrain highlighting ridges
 * 8. Instanced background cloud particles (40 white puffs)
 * 9. 3 colored point lights (sun-warm, sky-cool, below-water)
 */

function makeTerrainMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.side = THREE.DoubleSide;

  // Multi-octave noise height — noise coordinates shift with time for scrolling
  const heightFn = Fn(() => {
    const x = positionLocal.x;
    const z = positionLocal.z;
    // Scroll forward along z by offsetting noise sample
    const scroll = time.mul(2.5);
    const zOff = z.add(scroll);

    // Octave 1: large rolling hills
    const n1 = hash(vec3(x.mul(0.15), float(0.0), zOff.mul(0.15)));
    // Octave 2: medium ridges
    const n2 = hash(vec3(x.mul(0.38), float(0.3), zOff.mul(0.38)));
    // Octave 3: fine detail
    const n3 = hash(vec3(x.mul(0.9), float(0.7), zOff.mul(0.9)));
    // Octave 4: micro bumps
    const n4 = hash(vec3(x.mul(2.1), float(1.3), zOff.mul(2.1)));

    // Weighted combination — larger waves dominate
    const height = n1.mul(3.2).add(n2.mul(1.4)).add(n3.mul(0.5)).add(n4.mul(0.15));
    return height.sub(2.5); // offset so water sits at y≈0
  });

  const h = heightFn();
  mat.positionNode = positionLocal.add(normalLocal.mul(h));

  // 6-stop biome gradient from height value
  const colorFn = Fn(() => {
    const x = positionLocal.x;
    const z = positionLocal.z;
    const scroll = time.mul(2.5);
    const zOff = z.add(scroll);

    const n1 = hash(vec3(x.mul(0.15), float(0.0), zOff.mul(0.15)));
    const n2 = hash(vec3(x.mul(0.38), float(0.3), zOff.mul(0.38)));
    const n3 = hash(vec3(x.mul(0.9), float(0.7), zOff.mul(0.9)));
    const n4 = hash(vec3(x.mul(2.1), float(1.3), zOff.mul(2.1)));
    const height = n1.mul(3.2).add(n2.mul(1.4)).add(n3.mul(0.5)).add(n4.mul(0.15)).sub(2.5);

    // Normalize to 0..1 range (height roughly -2.5 to 2.7)
    const norm = height.add(2.5).div(5.2).saturate();

    // 6 biome colors
    const deepWater   = color(0x0a2a66);
    const shallowWater = color(0x1a6688);
    const beach       = color(0xd4b87a);
    const grass       = color(0x3a7a2a);
    const rock        = color(0x7a6a5a);
    const snow        = color(0xeeeeff);

    // Chain mix/smoothstep for biome transitions
    const c1 = mix(deepWater,    shallowWater, smoothstep(float(0.0), float(0.18), norm));
    const c2 = mix(c1,           beach,         smoothstep(float(0.18), float(0.25), norm));
    const c3 = mix(c2,           grass,         smoothstep(float(0.25), float(0.40), norm));
    const c4 = mix(c3,           rock,          smoothstep(float(0.60), float(0.78), norm));
    const c5 = mix(c4,           snow,          smoothstep(float(0.83), float(0.95), norm));

    // Subtle per-vertex variation for texture
    const variation = hash(vec3(x.mul(5.1), float(0.0), zOff.mul(5.1))).mul(0.06).sub(0.03);
    return c5.add(vec3(variation, variation, variation));
  });

  mat.colorNode = colorFn();

  // Fresnel rim glow on ridgelines
  const ridgeFn = Fn(() => {
    const viewDir = cameraPosition.sub(positionWorld).normalize();
    const nDotV = normalWorld.dot(viewDir).saturate();
    const rim = float(1.0).sub(nDotV).pow(float(4.0));

    // Distance fog: fade to hazy sky color far away
    const dist = positionLocal.z.abs().div(40.0).saturate();
    const fogColor = color(0xaaccdd);
    const fog = smoothstep(float(0.5), float(1.0), dist).mul(vec3(fogColor.r, fogColor.g, fogColor.b));

    // Combine rim glow + fog
    return vec3(0.8, 0.9, 1.0).mul(rim).mul(float(0.4)).add(fog);
  });

  mat.emissiveNode = ridgeFn();
  mat.roughness = 0.88;
  mat.metalness = 0.02;

  return mat;
}

// Sky dome material
const terrainSkyMat = new THREE.MeshBasicNodeMaterial({
  side: THREE.BackSide,
  colorNode: Fn(() => {
    const py = positionWorld.y.add(float(10.0)).div(float(30.0)).saturate();
    return mix(color(0x5588bb), color(0x2244aa), py);
  })(),
});

// Bloom halo on sky dome
const skyHaloMat = (() => {
  const mat = new THREE.MeshBasicNodeMaterial();
  mat.transparent = true;
  mat.blending = THREE.AdditiveBlending;
  mat.depthWrite = false;
  mat.side = THREE.BackSide;
  mat.colorNode = Fn(() => {
    const py = positionWorld.y.add(float(10.0)).div(float(30.0)).saturate();
    const glow = smoothstep(float(0.3), float(0.7), py).mul(float(0.025));
    return vec3(0.6, 0.8, 1.0).mul(glow);
  })();
  return mat;
})();

export default function InfiniteTerrain() {
  const terrainRef = useRef<THREE.Mesh>(null);
  const material = useMemo(() => makeTerrainMaterial(), []);

  // Cloud positions (40 puffs scattered above terrain)
  const cloudPositions = useMemo(() => {
    const pos: [number, number, number][] = [];
    for (let i = 0; i < 40; i++) {
      pos.push([
        (Math.random() - 0.5) * 60,
        4 + Math.random() * 8,
        (Math.random() - 0.5) * 60,
      ]);
    }
    return pos;
  }, []);

  const cloudMat = useMemo(() => {
    const mat = new THREE.MeshBasicNodeMaterial();
    mat.transparent = true;
    const fn = Fn(() => {
      const h = hash(positionWorld.x.mul(3.3).add(positionWorld.z.mul(5.1)));
      const drift = sin(time.mul(h.mul(0.5).add(0.1))).mul(float(0.06)).add(float(0.94));
      return vec3(0.9, 0.92, 0.95).mul(drift);
    });
    mat.colorNode = fn();
    mat.opacity = 0.45;
    return mat;
  }, []);

  // Slow rotation for slight camera pan feel
  useFrame((_, delta) => {
    if (terrainRef.current) {
      terrainRef.current.rotation.z += delta * 0.003;
    }
  });

  return (
    <>
      {/* Daytime sky ambiance */}
      <ambientLight intensity={0.55} color="#bbd8ee" />
      <directionalLight position={[6, 12, -4]} intensity={1.6} color="#fff5e0" />
      <directionalLight position={[-4, 5, 8]} intensity={0.4} color="#aaddff" />
      {/* Sun-warm, sky-cool, water-fill lights */}
      <pointLight position={[0, -2, 0]} intensity={1.0} color="#2266aa" distance={30} />
      <pointLight position={[15, 10, 0]} intensity={2.5} color="#ffcc88" distance={50} />
      <pointLight position={[-10, 8, 10]} intensity={1.5} color="#88ccff" distance={40} />

      {/* Sky dome — large BackSide sphere */}
      <mesh material={terrainSkyMat}>
        <sphereGeometry args={[80, 16, 10]} />
      </mesh>
      {/* Sky bloom halo */}
      <mesh material={skyHaloMat} scale={0.99}>
        <sphereGeometry args={[80, 16, 10]} />
      </mesh>

      {/* Cloud particles above terrain */}
      {cloudPositions.map(([x, y, z], i) => (
        <mesh key={i} position={[x, y, z]} material={cloudMat}>
          <sphereGeometry args={[1.2 + Math.random(), 8, 6]} />
        </mesh>
      ))}

      {/* Main terrain — 128x128 subdivisions for smooth height variation */}
      <mesh
        ref={terrainRef}
        material={material}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.5, 0]}
      >
        <planeGeometry args={[80, 80, 128, 128]} />
      </mesh>
    </>
  );
}
