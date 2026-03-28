/* eslint-disable react-hooks/purity */
import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
  color,
  time,
  oscSine,
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
 * Lava Planet — Procedural molten planet with eruptions and orbiting debris
 *
 * Techniques combined (5):
 * 1. Multi-octave hash noise for terrain/lava crack pattern
 * 2. Bloom halo shells for atmospheric rim (orange-red inner, dark red outer)
 * 3. Instanced mesh for 250 orbiting rock debris in elliptical orbits
 * 4. alphaTest + opacityNode for lava crack reveal through dark surface
 * 5. Fresnel for atmosphere glow
 *
 * The surface is dark rock with glowing lava cracks. Hash noise drives the
 * crack pattern; alphaTest makes cracks glow orange-red through the dark surface.
 * Lava pools pulse with emissive. 3 atmospheric halo shells (orange-red inner,
 * dark red outer). 250 orbiting rock debris (instanced, scattered in elliptical orbits).
 * Background starfield.
 */

const DEBRIS_COUNT = 250;
const STAR_COUNT = 300;

/** Creates the planet surface material with lava cracks */
function makePlanetSurfaceMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.side = THREE.DoubleSide;

  // Multi-octave hash noise for lava crack pattern
  const crackNoise = Fn(() => {
    const p = positionLocal.mul(4.0);
    const offset = vec3(float(13.7), float(29.3), float(67.1));

    // Three octaves at increasing frequency for crack variety
    const n1 = hash(p.add(offset));
    const n2 = hash(p.mul(2.7).add(offset.mul(1.9)));
    const n3 = hash(p.mul(6.3).add(offset.mul(3.7)));

    // Weighted blend
    return n1.mul(0.5).add(n2.mul(0.3)).add(n3.mul(0.2));
  });

  const noise = crackNoise();

  // Animated lava pulsing threshold
  const lavaPulse = oscSine(time.mul(0.15)).mul(0.08).add(0.48);

  // Lava crack detection: where noise crosses the threshold
  const crackMask = smoothstep(lavaPulse.sub(0.06), lavaPulse.add(0.06), noise);

  // Lava intensity: strongest near the crack edge
  const lavaEdge = smoothstep(lavaPulse.sub(0.02), lavaPulse.add(0.15), noise);
  const lavaGlow = float(1.0).sub(lavaEdge);

  // Dark rock base color
  const darkRock = color(0x1a1210);
  const darkRock2 = color(0x2a1a14);
  // Height-based rock variation
  const rockColor = mix(darkRock, darkRock2, noise.mul(0.6));

  // Lava colors: deep red core to bright orange-yellow
  const lavaDeep = color(0xcc2200);
  const lavaBright = color(0xff6622);
  const lavaHot = color(0xffaa44);
  const lavaColor = mix(lavaDeep, mix(lavaBright, lavaHot, lavaGlow.pow(0.5)), lavaGlow);

  // Final surface color: dark rock with lava cracks showing through
  mat.colorNode = mix(rockColor, lavaColor, lavaGlow.pow(0.8));

  // Emissive: lava cracks glow intensely (2-3x)
  const lavaEmissive = lavaColor.mul(lavaGlow.mul(2.5));
  // Secondary pulse on lava pools
  const poolPulse = oscSine(time.mul(0.3).add(noise.mul(6.0))).mul(0.3).add(0.7);
  mat.emissiveNode = lavaEmissive.mul(poolPulse);

  // Vertex displacement: slight bumps on rock, depressions in lava cracks
  const bump = crackMask.mul(0.04).sub(lavaGlow.mul(0.02));
  mat.positionNode = positionLocal.add(normalLocal.mul(bump));

  mat.roughness = 0.85;
  mat.metalness = 0.05;

  return mat;
}

/** Creates lava crack overlay material using alphaTest for fragment discard */
function makeLavaCrackMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;
  mat.alphaTest = 0.5;
  mat.side = THREE.DoubleSide;
  mat.depthWrite = false;

  // Same noise pattern as surface but shifted slightly outward
  const crackNoise = Fn(() => {
    const p = positionLocal.mul(4.0);
    const offset = vec3(float(13.7), float(29.3), float(67.1));
    const n1 = hash(p.add(offset));
    const n2 = hash(p.mul(2.7).add(offset.mul(1.9)));
    const n3 = hash(p.mul(6.3).add(offset.mul(3.7)));
    return n1.mul(0.5).add(n2.mul(0.3)).add(n3.mul(0.2));
  });

  const noise = crackNoise();
  const lavaPulse = oscSine(time.mul(0.15)).mul(0.08).add(0.48);

  // Only show where lava cracks are: narrow band around threshold
  const crackWidth = float(0.12);
  const crackCenter = lavaPulse;
  const dist = noise.sub(crackCenter).abs();
  const inCrack = smoothstep(crackWidth, float(0.0), dist);

  // alphaTest 0.5 discards non-crack fragments
  mat.opacityNode = inCrack;

  // Bright lava glow on cracks
  const lavaHot = color(0xff8833);
  const lavaWhite = color(0xffdd88);
  const intensity = smoothstep(crackWidth, float(0.0), dist);
  mat.colorNode = mix(lavaHot, lavaWhite, intensity.pow(2.0));
  mat.emissiveNode = mix(lavaHot, lavaWhite, intensity.pow(2.0)).mul(3.0);

  mat.roughness = 0.1;
  mat.metalness = 0.0;

  return mat;
}

/** Creates atmosphere halo shell material (orange-red tones) */
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
    return float(1.0).sub(nDotV).pow(float(1.5).add(layerF.mul(0.5)));
  });

  const fresnelVal = fresnel();

  // Orange-red inner to dark red outer
  const innerColor = color(0xff4422);
  const outerColor = color(0x881100);
  const atmoColor = mix(innerColor, outerColor, layerF.mul(0.4));

  // Opacity: fresnel-driven, outer layers dimmer
  const baseOpacity = float(0.3).sub(layerF.mul(0.08));
  mat.opacityNode = fresnelVal.mul(baseOpacity);

  mat.colorNode = atmoColor;
  mat.emissiveNode = atmoColor.mul(fresnelVal.mul(float(2.5).sub(layerF.mul(0.6))));

  mat.roughness = 0.0;
  mat.metalness = 0.0;

  return mat;
}

/** Creates debris rock material with per-instance hash variation */
function makeDebrisMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();

  // Per-debris color variation via hash of world position
  const seed = Fn(() => {
    return hash(positionWorld.x.mul(73.0).add(positionWorld.z.mul(137.0)));
  });

  const s = seed();

  // Dark rocky colors with slight reddish tint from lava light
  const rock1 = color(0x2a2018);
  const rock2 = color(0x3a2a1a);
  const rock3 = color(0x1a1410);
  const debrisColor = mix(mix(rock1, rock2, s), rock3, s.mul(0.7));

  mat.colorNode = debrisColor;

  // Subtle warm emissive from reflected lava light
  mat.emissiveNode = color(0x441100).mul(s.mul(0.3).add(0.1));

  mat.roughness = 0.9;
  mat.metalness = 0.1;

  return mat;
}

/** Orbiting debris field */
function DebrisField() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const orbitDataRef = useRef<
    { a: number; b: number; speed: number; phase: number; tilt: number; y: number }[]
  >([]);

  const debrisMaterial = useMemo(() => makeDebrisMaterial(), []);

  // Generate orbital parameters for each debris piece
  const orbitData = useMemo(() => {
    const data: { a: number; b: number; speed: number; phase: number; tilt: number; y: number }[] =
      [];
    for (let i = 0; i < DEBRIS_COUNT; i++) {
      const baseRadius = 2.0 + Math.random() * 2.5;
      data.push({
        a: baseRadius + (Math.random() - 0.5) * 0.8, // semi-major axis
        b: baseRadius * (0.7 + Math.random() * 0.3), // semi-minor axis (elliptical)
        speed: 0.15 + Math.random() * 0.25, // orbital speed
        phase: Math.random() * Math.PI * 2, // starting angle
        tilt: (Math.random() - 0.5) * 0.6, // orbital plane tilt
        y: (Math.random() - 0.5) * 0.8, // vertical offset
      });
    }
    orbitDataRef.current = data;
    return data;
  }, []);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < DEBRIS_COUNT; i++) {
      const d = orbitData[i];
      const angle = d.phase;
      const x = d.a * Math.cos(angle);
      const z = d.b * Math.sin(angle);
      const y = d.y + z * Math.sin(d.tilt);

      const scale = 0.02 + Math.random() * 0.06;
      dummy.position.set(x, y, z * Math.cos(d.tilt));
      dummy.scale.setScalar(scale);
      dummy.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix.clone());
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [orbitData]);

  // Animate orbiting debris
  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    const data = orbitDataRef.current;
    const t = performance.now() * 0.001;

    for (let i = 0; i < DEBRIS_COUNT; i++) {
      const d = data[i];
      const angle = d.phase + t * d.speed;
      const x = d.a * Math.cos(angle);
      const z = d.b * Math.sin(angle);
      const y = d.y + z * Math.sin(d.tilt);

      dummy.position.set(x, y, z * Math.cos(d.tilt));
      dummy.scale.setScalar(0.02 + (i % 20) * 0.003);
      // Tumbling rotation
      dummy.rotation.set(
        t * (0.5 + (i % 7) * 0.1),
        t * (0.3 + (i % 11) * 0.08),
        t * (0.2 + (i % 13) * 0.06),
      );
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, DEBRIS_COUNT]} material={debrisMaterial}>
      <icosahedronGeometry args={[1, 0]} />
    </instancedMesh>
  );
}

/** Background starfield */
function Starfield() {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  const matrices = useMemo(() => {
    const dummy = new THREE.Object3D();
    const result: THREE.Matrix4[] = [];
    for (let i = 0; i < STAR_COUNT; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 18 + Math.random() * 12;
      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.sin(phi) * Math.sin(theta);
      const z = r * Math.cos(phi);
      const scale = 0.01 + Math.random() * 0.02;
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
    const brightness = Fn(() => {
      const s = hash(positionWorld.mul(100.0));
      return s.mul(0.6).add(0.4);
    });
    const b = brightness();
    mat.colorNode = color(0xffffff);
    mat.emissiveNode = color(0xeeeeff).mul(b.mul(2.0));
    mat.roughness = 0.0;
    mat.metalness = 0.0;
    return mat;
  }, []);

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, STAR_COUNT]} material={starMaterial}>
      <icosahedronGeometry args={[1, 1]} />
    </instancedMesh>
  );
}

export default function LavaPlanet() {
  const planetRef = useRef<THREE.Mesh>(null);
  const crackRef = useRef<THREE.Mesh>(null);

  const surfaceMaterial = useMemo(() => makePlanetSurfaceMaterial(), []);
  const crackMaterial = useMemo(() => makeLavaCrackMaterial(), []);
  const atmosphereMaterials = useMemo(
    () => [makeAtmosphereMaterial(0), makeAtmosphereMaterial(1), makeAtmosphereMaterial(2)],
    [],
  );

  // Slow rotation
  useFrame((_, delta) => {
    if (planetRef.current) {
      planetRef.current.rotation.y += delta * 0.04;
    }
    if (crackRef.current) {
      crackRef.current.rotation.y += delta * 0.04;
    }
  });

  return (
    <>
      {/* Minimal scene lighting - emissive lava provides most light */}
      <ambientLight intensity={0.08} />
      <directionalLight position={[4, 2, 3]} intensity={0.4} color={0xffaa66} />
      <pointLight position={[0, 0, 0]} intensity={2.0} color={0xff4400} distance={8} />

      {/* Starfield background */}
      <Starfield />

      <group>
        {/* Planet surface - dark rock */}
        <mesh ref={planetRef} material={surfaceMaterial}>
          <icosahedronGeometry args={[1.5, 6]} />
        </mesh>

        {/* Lava crack overlay - slightly above surface */}
        <mesh ref={crackRef} material={crackMaterial}>
          <icosahedronGeometry args={[1.505, 6]} />
        </mesh>

        {/* Atmosphere halo shells - orange-red */}
        {atmosphereMaterials.map((mat, i) => (
          <mesh key={i} material={mat}>
            <icosahedronGeometry args={[1.6 + i * 0.2, 4]} />
          </mesh>
        ))}
      </group>

      {/* Orbiting debris field */}
      <DebrisField />
    </>
  );
}
