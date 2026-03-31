import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
  positionWorld,
  normalWorld,
  cameraPosition,
  Fn,
  float,
  mix,
  hash,
  smoothstep,
  vec3,
  screenUV,
} from 'three/tsl';

// --- Buildings ---
const BUILDING_COUNT = 350;
const CITY_SPREAD = 14;
const MIN_HEIGHT = 0.4;
const MAX_HEIGHT = 4.5;
const MIN_WIDTH = 0.15;
const MAX_WIDTH = 0.55;

// --- Ground plane ---
const GROUND_SIZE = 40;

// Seeded random for reproducible city layout
function seededRandom(seed: number) {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export default function CyberCity() {
  const buildingRef = useRef<THREE.InstancedMesh>(null);
  const reflectionRef = useRef<THREE.InstancedMesh>(null);
  const groupRef = useRef<THREE.Group>(null);

  // Generate building layout data
  const buildingData = useMemo(() => {
    const data: { x: number; z: number; w: number; d: number; h: number }[] = [];
    for (let i = 0; i < BUILDING_COUNT; i++) {
      const seed = i * 3.7 + 0.5;
      const x = (seededRandom(seed) - 0.5) * CITY_SPREAD * 2;
      const z = (seededRandom(seed + 1) - 0.5) * CITY_SPREAD * 2;
      const h = MIN_HEIGHT + seededRandom(seed + 2) * (MAX_HEIGHT - MIN_HEIGHT);
      // Taller buildings in the center
      const distFromCenter = Math.sqrt(x * x + z * z) / CITY_SPREAD;
      const centerBoost = Math.max(0, 1 - distFromCenter) * 2.5;
      const finalH = h + centerBoost;
      const w = MIN_WIDTH + seededRandom(seed + 3) * (MAX_WIDTH - MIN_WIDTH);
      const d = MIN_WIDTH + seededRandom(seed + 4) * (MAX_WIDTH - MIN_WIDTH);
      data.push({ x, z, w, d, h: finalH });
    }
    return data;
  }, []);

  // Set instance matrices for buildings
  useEffect(() => {
    const mesh = buildingRef.current;
    const reflMesh = reflectionRef.current;
    if (!mesh || !reflMesh) return;

    const dummy = new THREE.Object3D();

    for (let i = 0; i < buildingData.length; i++) {
      const { x, z, w, d, h } = buildingData[i];
      // Buildings grow upward from ground (y=0)
      dummy.position.set(x, h / 2, z);
      dummy.scale.set(w, h, d);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      // Reflection: flip Y, position below ground
      dummy.position.set(x, -h / 2, z);
      dummy.scale.set(w, h, d);
      dummy.updateMatrix();
      reflMesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    reflMesh.instanceMatrix.needsUpdate = true;
  }, [buildingData]);

  // TSL material for buildings: neon edge glow with per-building color variation
  const buildingMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();

    // Per-building color selection based on world position hash
    const colorFn = Fn(() => {
      // Hash based on building world position for per-instance variation
      const seed = hash(positionWorld.x.mul(7.3).add(positionWorld.z.mul(13.1)));

      // 4 neon accent colors
      const neonPink = vec3(1.0, 0.05, 0.4);
      const neonCyan = vec3(0.0, 0.85, 1.0);
      const neonYellow = vec3(1.0, 0.9, 0.1);
      const neonPurple = vec3(0.6, 0.1, 1.0);

      // Select color based on hash
      const c1 = mix(neonPink, neonCyan, smoothstep(0.0, 0.25, seed));
      const c2 = mix(c1, neonYellow, smoothstep(0.25, 0.5, seed));
      const c3 = mix(c2, neonPurple, smoothstep(0.5, 0.75, seed));
      const finalNeon = mix(c3, neonPink, smoothstep(0.75, 1.0, seed));

      // Dark base building color
      const darkBase = vec3(0.02, 0.02, 0.05);

      // Use height to blend: tops of buildings get more neon
      const heightFactor = smoothstep(0.5, 3.0, positionWorld.y);
      return mix(darkBase, finalNeon, heightFactor.mul(0.3));
    });

    mat.colorNode = colorFn();

    // Fresnel-based neon edge glow
    const fresnelFn = Fn(() => {
      const viewDir = cameraPosition.sub(positionWorld).normalize();
      const nDotV = normalWorld.dot(viewDir).saturate();
      return float(1.0).sub(nDotV).pow(2.0);
    });

    // Emissive: neon glow on edges and building tops
    const emissiveFn = Fn(() => {
      const seed = hash(positionWorld.x.mul(7.3).add(positionWorld.z.mul(13.1)));

      const neonPink = vec3(1.0, 0.05, 0.4);
      const neonCyan = vec3(0.0, 0.85, 1.0);
      const neonYellow = vec3(1.0, 0.9, 0.1);
      const neonPurple = vec3(0.6, 0.1, 1.0);

      const c1 = mix(neonPink, neonCyan, smoothstep(0.0, 0.25, seed));
      const c2 = mix(c1, neonYellow, smoothstep(0.25, 0.5, seed));
      const c3 = mix(c2, neonPurple, smoothstep(0.5, 0.75, seed));
      const finalNeon = mix(c3, neonPink, smoothstep(0.75, 1.0, seed));

      const fresnel = fresnelFn();
      const heightFactor = smoothstep(0.3, 4.0, positionWorld.y);

      // Neon edge lines: simulate window rows with position-based stripes
      const windowRows = hash(positionWorld.y.mul(20.0).floor());
      const windowCols = hash(positionWorld.x.mul(15.0).add(positionWorld.z.mul(15.0)).floor());
      const windowLit = smoothstep(0.4, 0.6, windowRows.mul(windowCols));

      // Combine fresnel edge glow + window lights + height glow
      const edgeGlow = fresnel.mul(2.5);
      const heightGlow = heightFactor.mul(0.5);
      const windowGlow = windowLit.mul(0.6);

      return finalNeon.mul(edgeGlow.add(heightGlow).add(windowGlow));
    });

    mat.emissiveNode = emissiveFn();

    mat.metalnessNode = float(0.7);
    mat.roughnessNode = float(0.3);

    return mat;
  }, []);

  // Reflection material: darker, faded version of building material
  const reflectionMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();

    const colorFn = Fn(() => {
      const seed = hash(positionWorld.x.mul(7.3).add(positionWorld.z.mul(13.1)));

      const neonPink = vec3(1.0, 0.05, 0.4);
      const neonCyan = vec3(0.0, 0.85, 1.0);
      const neonYellow = vec3(1.0, 0.9, 0.1);
      const neonPurple = vec3(0.6, 0.1, 1.0);

      const c1 = mix(neonPink, neonCyan, smoothstep(0.0, 0.25, seed));
      const c2 = mix(c1, neonYellow, smoothstep(0.25, 0.5, seed));
      const c3 = mix(c2, neonPurple, smoothstep(0.5, 0.75, seed));
      const finalNeon = mix(c3, neonPink, smoothstep(0.75, 1.0, seed));

      const darkBase = vec3(0.01, 0.01, 0.03);
      const heightFactor = smoothstep(-3.0, -0.5, positionWorld.y);
      return mix(darkBase, finalNeon, heightFactor.mul(0.15));
    });

    mat.colorNode = colorFn();

    // Dimmer emissive for reflections
    const emissiveFn = Fn(() => {
      const seed = hash(positionWorld.x.mul(7.3).add(positionWorld.z.mul(13.1)));

      const neonPink = vec3(1.0, 0.05, 0.4);
      const neonCyan = vec3(0.0, 0.85, 1.0);
      const neonYellow = vec3(1.0, 0.9, 0.1);
      const neonPurple = vec3(0.6, 0.1, 1.0);

      const c1 = mix(neonPink, neonCyan, smoothstep(0.0, 0.25, seed));
      const c2 = mix(c1, neonYellow, smoothstep(0.25, 0.5, seed));
      const c3 = mix(c2, neonPurple, smoothstep(0.5, 0.75, seed));
      const finalNeon = mix(c3, neonPink, smoothstep(0.75, 1.0, seed));

      const fresnel = float(1.0).sub(normalWorld.dot(cameraPosition.sub(positionWorld).normalize()).saturate()).pow(2.0);
      const heightFactor = smoothstep(-3.0, -0.5, positionWorld.y);

      return finalNeon.mul(fresnel.mul(1.0).add(heightFactor.mul(0.2))).mul(0.35);
    });

    mat.emissiveNode = emissiveFn();
    mat.transparent = true;
    mat.opacity = 0.4;
    mat.metalnessNode = float(0.9);
    mat.roughnessNode = float(0.1);

    return mat;
  }, []);

  // Ground plane material: dark reflective surface
  const groundMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();

    // Dark wet-looking surface with subtle neon reflections
    const groundColor = Fn(() => {
      const base = vec3(0.01, 0.01, 0.02);
      // Subtle grid lines on ground for cyberpunk feel
      const gridX = smoothstep(0.95, 1.0, hash(positionWorld.x.mul(3.0).floor()));
      const gridZ = smoothstep(0.95, 1.0, hash(positionWorld.z.mul(3.0).floor()));
      const grid = gridX.add(gridZ).clamp(0.0, 1.0);
      const gridColor = vec3(0.0, 0.15, 0.2);
      return mix(base, gridColor, grid.mul(0.3));
    });

    mat.colorNode = groundColor();

    // Ground emissive: faint neon reflections using screenUV
    const groundEmissive = Fn(() => {
      const neonTint = mix(
        vec3(0.0, 0.3, 0.5),
        vec3(0.5, 0.0, 0.3),
        screenUV.x
      );
      // Fade the reflection based on distance from center
      const distFade = smoothstep(0.8, 0.2, screenUV.sub(0.5).length());
      return neonTint.mul(distFade).mul(0.15);
    });

    mat.emissiveNode = groundEmissive();
    mat.metalnessNode = float(0.95);
    mat.roughnessNode = float(0.05);

    return mat;
  }, []);

  // Fog / atmosphere material for a large enclosing backplane
  const fogMaterial = useMemo(() => {
    const mat = new THREE.MeshBasicNodeMaterial();

    // Dark atmospheric gradient: purple at bottom, deep blue/black at top
    const fogColor = Fn(() => {
      const bottomColor = vec3(0.05, 0.0, 0.1);
      const topColor = vec3(0.0, 0.0, 0.02);
      const midGlow = vec3(0.08, 0.02, 0.12);

      const yFactor = screenUV.y;
      const base = mix(bottomColor, topColor, yFactor);
      // Subtle mid-height glow band
      const glowBand = smoothstep(0.2, 0.4, yFactor).mul(smoothstep(0.6, 0.4, yFactor));
      return mix(base, midGlow, glowBand);
    });

    mat.colorNode = fogColor();
    mat.side = THREE.BackSide;

    return mat;
  }, []);

  // Neon sign / accent glow shell material (BackSide + Additive for bloom effect)
  const makeGlowMaterial = useMemo(() => {
    return (glowColor: THREE.Color, intensity: number) => {
      const mat = new THREE.MeshStandardNodeMaterial();
      const c = vec3(glowColor.r, glowColor.g, glowColor.b);

      const fresnel = Fn(() => {
        const viewDir = cameraPosition.sub(positionWorld).normalize();
        const nDotV = normalWorld.dot(viewDir).saturate();
        return float(1.0).sub(nDotV).pow(1.5);
      });

      mat.emissiveNode = c.mul(fresnel()).mul(float(intensity));
      mat.colorNode = c.mul(0.1);
      mat.transparent = true;
      mat.opacity = 0.25;
      mat.side = THREE.BackSide;
      mat.blending = THREE.AdditiveBlending;
      mat.depthWrite = false;

      return mat;
    };
  }, []);

  // Slow camera orbit
  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.04;
    }
  });

  // Glow orb positions & colors for neon accent lights
  const glowOrbs = useMemo(() => [
    { pos: [2, 3.5, 1] as [number, number, number], color: new THREE.Color(1, 0.05, 0.4), lightColor: 0xff1166 },
    { pos: [-3, 2.5, -2] as [number, number, number], color: new THREE.Color(0, 0.85, 1), lightColor: 0x00ddff },
    { pos: [0.5, 5, -1] as [number, number, number], color: new THREE.Color(1, 0.9, 0.1), lightColor: 0xffee22 },
    { pos: [-1.5, 4, 3] as [number, number, number], color: new THREE.Color(0.6, 0.1, 1), lightColor: 0x9922ff },
    { pos: [4, 1.5, -3] as [number, number, number], color: new THREE.Color(0, 0.85, 1), lightColor: 0x00ddff },
    { pos: [-4, 3, 0] as [number, number, number], color: new THREE.Color(1, 0.05, 0.4), lightColor: 0xff1166 },
  ], []);

  return (
    <>
      {/* Atmosphere / sky dome */}
      <mesh>
        <sphereGeometry args={[30, 16, 16]} />
        <primitive object={fogMaterial} attach="material" />
      </mesh>

      {/* Scene lighting */}
      <ambientLight intensity={0.1} color={0x111122} />
      <hemisphereLight args={['#334466', '#111122', 0.3]} />
      <directionalLight position={[5, 10, 3]} intensity={0.15} color={0x4444ff} />

      {/* Neon accent point lights */}
      {glowOrbs.map((orb, i) => (
        <pointLight
          key={`light-${i}`}
          position={orb.pos}
          intensity={4}
          color={orb.lightColor}
          distance={8}
          decay={2}
        />
      ))}

      {/* Faint overhead purple light for mood */}
      <pointLight position={[0, 8, 0]} intensity={2} color={0x6622aa} distance={20} />

      <group ref={groupRef}>
        {/* Buildings */}
        <instancedMesh
          ref={buildingRef}
          args={[undefined, undefined, BUILDING_COUNT]}
          material={buildingMaterial}
          frustumCulled={false}
        >
          <boxGeometry args={[1, 1, 1]} />
        </instancedMesh>

        {/* Building reflections (below ground) */}
        <instancedMesh
          ref={reflectionRef}
          args={[undefined, undefined, BUILDING_COUNT]}
          material={reflectionMaterial}
          frustumCulled={false}
        >
          <boxGeometry args={[1, 1, 1]} />
        </instancedMesh>

        {/* Ground plane */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
          <planeGeometry args={[GROUND_SIZE, GROUND_SIZE]} />
          <primitive object={groundMaterial} attach="material" />
        </mesh>

        {/* Neon glow orbs (BackSide + Additive bloom) */}
        {glowOrbs.map((orb, i) => (
          <mesh key={`glow-${i}`} position={orb.pos}>
            <sphereGeometry args={[0.6, 12, 8]} />
            <primitive object={makeGlowMaterial(orb.color, 3.0)} attach="material" />
          </mesh>
        ))}
      </group>
    </>
  );
}
