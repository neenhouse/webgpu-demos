import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
  Fn,
  float,
  vec3,
  vec4,
  uniform,
  positionLocal,
  positionWorld,
  time,
  sin,
  floor,
  mix,
  smoothstep,
} from 'three/tsl';

/**
 * Synthwave Grid — 80s retrowave aesthetic
 *
 * Techniques:
 * 1. Infinite perspective grid in XZ with neon wireframe
 * 2. Large sunset gradient sphere (sun)
 * 3. Mountain silhouette at horizon
 * 4. Instanced star field
 * 5. Chrome metallic reflective ground
 * 6. Camera animated toward horizon
 */

const STAR_COUNT = 600;
const MOUNTAIN_SEGMENTS = 64;

function seededRand(seed: number) {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export default function SynthwaveGrid() {
  // Grid mesh
  const gridRef = useRef<THREE.Mesh>(null);
  // Ground plane
  const groundRef = useRef<THREE.Mesh>(null);
  // Stars
  const starsRef = useRef<THREE.InstancedMesh>(null);
  // Mountains
  const mountainRef = useRef<THREE.Mesh>(null);
  // Sun
  const sunRef = useRef<THREE.Mesh>(null);
  // Camera group
  const groupRef = useRef<THREE.Group>(null);

  // Time uniform for grid scroll
  const scrollTime = useMemo(() => uniform(0.0), []);

  // ── Grid material ──
  const gridMat = useMemo(() => {
    const mat = new THREE.MeshBasicNodeMaterial();
    mat.wireframe = true;
    mat.side = THREE.DoubleSide;

    const gridColor = Fn(() => {
      // Neon magenta/cyan color based on world position Z
      const worldZ = positionWorld.z;
      const distFromCam = worldZ.abs();
      const fade = smoothstep(float(40.0), float(5.0), distFromCam);
      const colorMagenta = vec3(float(1.0), float(0.0), float(1.0));
      const colorCyan = vec3(float(0.0), float(1.0), float(1.0));
      const t = positionWorld.x.abs().div(float(20.0)).saturate();
      const c = mix(colorCyan, colorMagenta, t);
      return vec4(c.mul(fade.mul(2.0).add(0.3)), float(1.0));
    });
    mat.colorNode = gridColor();
    return mat;
  }, []);

  // ── Ground plane (chrome/reflective) ──
  const groundMat = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.color = new THREE.Color(0x0a0010);
    mat.metalness = 0.9;
    mat.roughness = 0.15;
    mat.emissive = new THREE.Color(0x110022);
    return mat;
  }, []);

  // ── Sun material with gradient ──
  const sunMat = useMemo(() => {
    const mat = new THREE.MeshBasicNodeMaterial();
    mat.side = THREE.FrontSide;

    const sunColor = Fn(() => {
      // Gradient from top to bottom: yellow -> orange -> magenta -> purple
      const normalizedY = positionLocal.y.div(float(8.0)).add(float(0.5)).saturate();

      const yellow = vec3(float(1.0), float(0.95), float(0.0));
      const orange = vec3(float(1.0), float(0.4), float(0.0));
      const magenta = vec3(float(1.0), float(0.0), float(0.8));
      const purple = vec3(float(0.3), float(0.0), float(0.6));
      const deepPurple = vec3(float(0.05), float(0.0), float(0.15));

      const c1 = mix(deepPurple, purple, smoothstep(float(0.0), float(0.2), normalizedY));
      const c2 = mix(c1, magenta, smoothstep(float(0.2), float(0.5), normalizedY));
      const c3 = mix(c2, orange, smoothstep(float(0.5), float(0.75), normalizedY));
      const c4 = mix(c3, yellow, smoothstep(float(0.75), float(1.0), normalizedY));

      // Horizontal scan lines on the sun
      const scanY = positionLocal.y.mul(float(0.8));
      const scanLine = floor(scanY).mod(float(2.0));
      const sunWithLines = mix(c4, c4.mul(float(0.7)), scanLine.mul(smoothstep(float(0.25), float(0.35), normalizedY)));

      return vec4(sunWithLines, float(1.0));
    });

    mat.colorNode = sunColor();
    return mat;
  }, []);

  // ── Mountain silhouette material ──
  const mountainMat = useMemo(() => {
    const mat = new THREE.MeshBasicNodeMaterial();
    mat.color = new THREE.Color(0x0d0020);
    mat.side = THREE.DoubleSide;
    return mat;
  }, []);

  // ── Star material ──
  const starMat = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.emissiveNode = Fn(() => {
      const starIdx = positionWorld.x.add(positionWorld.y).add(positionWorld.z);
      const pulse = sin(time.mul(2.0).add(starIdx.mul(7.3))).mul(0.3).add(0.7);
      const starColor = vec3(
        sin(starIdx.mul(3.7)).mul(0.3).add(0.7),
        sin(starIdx.mul(5.1)).mul(0.3).add(0.7),
        sin(starIdx.mul(7.9)).mul(0.3).add(0.9)
      );
      return starColor.mul(pulse.mul(2.0));
    })();
    mat.roughness = 1.0;
    mat.metalness = 0.0;
    return mat;
  }, []);

  // Build mountain geometry (displaced plane)
  const mountainGeom = useMemo(() => {
    const width = 80;
    const depth = 6;
    const geom = new THREE.PlaneGeometry(width, depth, MOUNTAIN_SEGMENTS, 4);
    const positions = geom.attributes.position;

    // Displace vertices to create mountain silhouette
    for (let i = 0; i <= MOUNTAIN_SEGMENTS; i++) {
      for (let j = 0; j <= 4; j++) {
        const idx = j * (MOUNTAIN_SEGMENTS + 1) + i;
        const x = (i / MOUNTAIN_SEGMENTS - 0.5) * width;
        // Multi-octave mountain profile
        const h1 = Math.sin(x * 0.15) * 3.5;
        const h2 = Math.sin(x * 0.3 + 0.7) * 2.0;
        const h3 = Math.sin(x * 0.7 + 1.4) * 1.2;
        const h4 = seededRand(i * 0.3) * 0.8;
        const height = Math.max(0, h1 + h2 + h3 + h4);
        const jNorm = j / 4;
        positions.setY(idx, height * jNorm);
      }
    }
    geom.computeVertexNormals();
    return geom;
  }, []);

  // Set up star positions
  useEffect(() => {
    const mesh = starsRef.current;
    if (!mesh) return;
    const mat = new THREE.Matrix4();
    for (let i = 0; i < STAR_COUNT; i++) {
      const x = (seededRand(i * 3.1) - 0.5) * 100;
      const y = seededRand(i * 3.1 + 1) * 30 + 5;
      const z = (seededRand(i * 3.1 + 2) - 0.5) * 80;
      const s = seededRand(i * 3.1 + 3) * 0.12 + 0.04;
      mat.makeScale(s, s, s);
      mat.setPosition(x, y, z);
      mesh.setMatrixAt(i, mat);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, []);

  useFrame((state, delta) => {
    scrollTime.value += delta;

    // Animate grid scroll by moving it
    if (gridRef.current) {
      gridRef.current.position.z = ((scrollTime.value * 3.0) % 4) - 2;
    }

    // Subtle camera bob
    if (state.camera) {
      state.camera.position.y = 2.5 + Math.sin(scrollTime.value * 0.3) * 0.1;
    }
  });

  return (
    <group ref={groupRef}>
      {/* Ambient purple sky */}
      <ambientLight intensity={0.1} color="#220044" />
      <pointLight position={[0, 15, -20]} intensity={3} color="#ff00cc" distance={60} />
      <pointLight position={[-10, 2, 5]} intensity={1.5} color="#00ffff" distance={40} />
      <pointLight position={[10, 2, 5]} intensity={1.5} color="#ff00ff" distance={40} />

      {/* Sun sphere at horizon */}
      <mesh ref={sunRef} material={sunMat} position={[0, 3, -35]}>
        <sphereGeometry args={[8, 32, 16]} />
      </mesh>

      {/* Mountain silhouette */}
      <mesh
        ref={mountainRef}
        material={mountainMat}
        geometry={mountainGeom}
        position={[0, -0.5, -22]}
        rotation={[-Math.PI / 2, 0, 0]}
      />

      {/* Ground chrome plane */}
      <mesh ref={groundRef} material={groundMat} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]}>
        <planeGeometry args={[120, 120, 1, 1]} />
      </mesh>

      {/* Perspective grid — multiple tiles for infinite feel */}
      {[-2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((zi) => (
        <mesh
          key={zi}
          ref={zi === 0 ? gridRef : undefined}
          material={gridMat}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, -0.48, zi * 4]}
        >
          <planeGeometry args={[40, 4, 10, 1]} />
        </mesh>
      ))}

      {/* Stars */}
      <instancedMesh ref={starsRef} args={[undefined, undefined, STAR_COUNT]} material={starMat}>
        <sphereGeometry args={[1, 4, 2]} />
      </instancedMesh>

      {/* Fog effect via background */}
      <fog attach="fog" args={['#0d001a', 30, 80]} />
    </group>
  );
}
