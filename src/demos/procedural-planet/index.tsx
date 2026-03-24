import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
  color,
  time,
  normalWorld,
  cameraPosition,
  positionWorld,
  positionLocal,
  normalLocal,
  Fn,
  float,
  mix,
  smoothstep,
  hash,
  vec3,
} from 'three/tsl';

/**
 * Procedural Planet — Multi-layer planetary scene via TSL
 *
 * Features:
 * - Planet sphere with multi-octave hash noise biome coloring
 *   (deep ocean -> shallow ocean -> beach -> land -> mountain -> snow)
 * - Cloud layer: slightly larger transparent sphere with hash noise holes
 * - Atmosphere: 2 halo shells with blue fresnel glow (BackSide + AdditiveBlending)
 * - Starfield: 300 instanced tiny spheres at distance
 * - Slow Y-rotation on planet, slightly faster on clouds
 */

const STAR_COUNT = 300;

/** Creates the planet surface material with biome coloring */
function makePlanetMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();

  // Multi-octave hash noise for terrain height
  const terrainHeight = Fn(() => {
    const p = positionLocal.mul(3.0);
    const offset = vec3(float(42.0), float(17.0), float(91.0));

    // Three octaves at increasing frequency
    const n1 = hash(p.add(offset));
    const n2 = hash(p.mul(2.3).add(offset.mul(1.7)));
    const n3 = hash(p.mul(5.1).add(offset.mul(3.1)));

    // Weighted blend: low freq dominates
    return n1.mul(0.55).add(n2.mul(0.3)).add(n3.mul(0.15));
  });

  const h = terrainHeight();

  // 6-stop biome color gradient: deep ocean -> shallow ocean -> beach -> land -> mountain -> snow
  const deepOcean = color(0x0a1e44);
  const shallowOcean = color(0x1a6ea0);
  const beach = color(0xd4b86a);
  const land = color(0x3a8a2e);
  const mountain = color(0x6b4c3b);
  const snow = color(0xeef0f2);

  // Chain mix/smoothstep for multi-stop gradient
  const c1 = mix(deepOcean, shallowOcean, smoothstep(0.0, 0.35, h));
  const c2 = mix(c1, beach, smoothstep(0.33, 0.40, h));
  const c3 = mix(c2, land, smoothstep(0.38, 0.50, h));
  const c4 = mix(c3, mountain, smoothstep(0.55, 0.70, h));
  const c5 = mix(c4, snow, smoothstep(0.75, 0.88, h));

  mat.colorNode = c5;

  // Slight emissive for ocean glow (water shimmers)
  const oceanGlow = smoothstep(0.40, 0.0, h).mul(0.15);
  mat.emissiveNode = color(0x1a4488).mul(oceanGlow);

  // Vertex displacement along normals based on terrain height for subtle bumps
  const bump = h.sub(0.35).max(0.0).mul(0.06);
  mat.positionNode = positionLocal.add(normalLocal.mul(bump));

  mat.roughness = 0.7;
  mat.metalness = 0.05;

  return mat;
}

/** Creates cloud layer material with hash noise holes */
function makeCloudMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;
  mat.alphaTest = 0.3;
  mat.side = THREE.DoubleSide;
  mat.depthWrite = false;

  // Animated cloud density via hash noise
  const cloudDensity = Fn(() => {
    const p = positionLocal.mul(4.5);
    const t = time.mul(0.08);
    const offset1 = vec3(t, t.mul(0.6), t.mul(1.1));
    const offset2 = vec3(t.mul(1.3), float(20.0), t.mul(0.7));

    const n1 = hash(p.add(offset1));
    const n2 = hash(p.mul(2.1).add(offset2));

    const combined = n1.mul(0.65).add(n2.mul(0.35));
    return smoothstep(0.35, 0.65, combined);
  });

  const density = cloudDensity();

  mat.colorNode = color(0xffffff);
  mat.opacityNode = density.mul(0.7);
  mat.emissiveNode = color(0xffffff).mul(density.mul(0.15));

  mat.roughness = 1.0;
  mat.metalness = 0.0;

  return mat;
}

/** Creates atmosphere halo shell material */
function makeAtmosphereMaterial(layer: number) {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;
  mat.side = THREE.BackSide;
  mat.depthWrite = false;
  mat.blending = THREE.AdditiveBlending;

  const layerF = float(layer);

  // Fresnel-driven atmosphere glow
  const fresnel = Fn(() => {
    const viewDir = cameraPosition.sub(positionWorld).normalize();
    const nDotV = normalWorld.dot(viewDir).saturate();
    return float(1.0).sub(nDotV).pow(float(2.0).add(layerF.mul(0.5)));
  });

  const fresnelVal = fresnel();

  // Blue-cyan atmospheric color, slightly shifted per layer
  const atmoColor = mix(
    color(0x4488ff),
    color(0x66ccff),
    layerF.mul(0.5),
  );

  // Opacity: fresnel-driven, outer layer dimmer
  const baseOpacity = float(0.35).sub(layerF.mul(0.12));
  mat.opacityNode = fresnelVal.mul(baseOpacity);

  mat.colorNode = atmoColor;
  mat.emissiveNode = atmoColor.mul(fresnelVal.mul(float(2.0).sub(layerF.mul(0.5))));

  mat.roughness = 0.0;
  mat.metalness = 0.0;

  return mat;
}

/** Starfield component using instanced mesh */
function Starfield() {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  const matrices = useMemo(() => {
    const dummy = new THREE.Object3D();
    const result: THREE.Matrix4[] = [];

    for (let i = 0; i < STAR_COUNT; i++) {
      // Distribute on a large sphere
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 15 + Math.random() * 10;

      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.sin(phi) * Math.sin(theta);
      const z = r * Math.cos(phi);

      const scale = 0.01 + Math.random() * 0.025;

      dummy.position.set(x, y, z);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      result.push(dummy.matrix.clone());
    }

    return result;
  }, []);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    for (let i = 0; i < matrices.length; i++) {
      mesh.setMatrixAt(i, matrices[i]);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [matrices]);

  const starMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();

    // Per-star brightness variation via hash
    const brightness = Fn(() => {
      const seed = hash(positionWorld.mul(100.0));
      return seed.mul(0.5).add(0.5);
    });

    const b = brightness();
    mat.colorNode = color(0xffffff);
    mat.emissiveNode = color(0xeeeeff).mul(b.mul(2.0));
    mat.roughness = 0.0;
    mat.metalness = 0.0;

    return mat;
  }, []);

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, STAR_COUNT]}
      material={starMaterial}
    >
      <icosahedronGeometry args={[1, 1]} />
    </instancedMesh>
  );
}

export default function ProceduralPlanet() {
  const planetRef = useRef<THREE.Mesh>(null);
  const cloudRef = useRef<THREE.Mesh>(null);

  const planetMaterial = useMemo(() => makePlanetMaterial(), []);
  const cloudMaterial = useMemo(() => makeCloudMaterial(), []);
  const atmosphereMaterials = useMemo(
    () => [makeAtmosphereMaterial(0), makeAtmosphereMaterial(1)],
    [],
  );

  // Rotate planet and clouds at different speeds
  useFrame((_, delta) => {
    if (planetRef.current) {
      planetRef.current.rotation.y += delta * 0.06;
    }
    if (cloudRef.current) {
      cloudRef.current.rotation.y += delta * 0.09;
      cloudRef.current.rotation.x += delta * 0.01;
    }
  });

  return (
    <>
      {/* Scene lighting: directional sunlight + faint ambient */}
      <ambientLight intensity={0.15} />
      <directionalLight position={[5, 3, 4]} intensity={1.4} color={0xfff5e6} />
      <directionalLight position={[-3, -1, -2]} intensity={0.2} color={0x4488cc} />

      {/* Starfield background */}
      <Starfield />

      <group>
        {/* Planet surface */}
        <mesh ref={planetRef} material={planetMaterial}>
          <icosahedronGeometry args={[1.5, 5]} />
        </mesh>

        {/* Cloud layer — slightly larger sphere */}
        <mesh ref={cloudRef} material={cloudMaterial}>
          <icosahedronGeometry args={[1.55, 5]} />
        </mesh>

        {/* Atmosphere halo shells */}
        {atmosphereMaterials.map((mat, i) => (
          <mesh key={i} material={mat}>
            <icosahedronGeometry args={[1.55 + (i + 1) * 0.15, 4]} />
          </mesh>
        ))}
      </group>
    </>
  );
}
