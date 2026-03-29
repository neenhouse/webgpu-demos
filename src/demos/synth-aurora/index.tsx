import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
  time,
  uv,
  positionWorld,
  Fn,
  float,
  vec3,
  mix,
  smoothstep,
  sin,
  hash,
} from 'three/tsl';

/**
 * Synth Aurora — Aurora ribbon curtains with color and sway driven by synth tones
 *
 * Techniques: 8 instanced PlaneGeometry ribbon strips vertically stacked,
 * CPU useFrame updates ribbon positions via sine waves at different frequencies,
 * 5-stop aurora gradient, AdditiveBlending + transparent, Y-flip reflection,
 * BackSide bloom halos.
 *
 * Each ribbon strip sways at a different "synth tone" frequency. The vertical
 * strips are wide curtains that flutter with UV-based vertex displacement
 * encoded in the material. Color fades from green at base to pink at top.
 *
 * Additional: instanced background star particles (60) with hash twinkle,
 * 3 colored atmosphere point lights (green, purple, teal), subtle vertex
 * breathing on ribbon strips for organic motion, background atmosphere sphere.
 */

const STRIP_COUNT = 8;
const STRIP_WIDTH = 14;
const STRIP_HEIGHT = 8;
const STRIP_SPACING = 0.8; // Z separation

// Synth tone frequencies per strip (in Hz — simulated)
const SYNTH_FREQS = [0.3, 0.45, 0.6, 0.8, 1.1, 1.4, 1.7, 2.0];
const SYNTH_PHASES = [0, 0.7, 1.4, 2.1, 2.8, 3.5, 4.2, 4.9];

const synthGroundMat = (() => {
  const m = new THREE.MeshStandardNodeMaterial();
  m.color.set(0x010108);
  m.emissive = new THREE.Color(0x002211);
  m.emissiveIntensity = 1.5;
  m.roughness = 0.05;
  m.metalness = 0.95;
  return m;
})();

export default function SynthAurora() {
  const meshRefs = useRef<(THREE.Mesh | null)[]>([]);
  const reflMeshRefs = useRef<(THREE.Mesh | null)[]>([]);

  // TSL aurora material (shared, additive)
  const material = useMemo(() => {
    const mat = new THREE.MeshBasicNodeMaterial();
    mat.transparent = true;
    mat.blending = THREE.AdditiveBlending;
    mat.depthWrite = false;
    mat.side = THREE.BackSide;

    const auroraFn = Fn(() => {
      const uvCoord = uv();
      const t = time;

      // Vertical fade: full at center, transparent at edges
      const vFade = smoothstep(float(0.0), float(0.15), uvCoord.y)
        .mul(smoothstep(float(1.0), float(0.85), uvCoord.y));

      // Horizontal waviness
      const waveU = sin(uvCoord.y.mul(8.0).add(t.mul(2.0))).mul(float(0.04)).add(uvCoord.x);

      // 5-stop aurora gradient from base (green) to top (pink)
      // green -> cyan -> blue -> purple -> pink
      const green = vec3(0.1, 0.95, 0.4);
      const cyan = vec3(0.0, 0.9, 0.9);
      const blue = vec3(0.2, 0.3, 1.0);
      const purple = vec3(0.6, 0.1, 0.9);
      const pink = vec3(1.0, 0.3, 0.8);

      const py = uvCoord.y;
      const t1 = smoothstep(float(0.0), float(0.25), py);
      const t2 = smoothstep(float(0.25), float(0.5), py);
      const t3 = smoothstep(float(0.5), float(0.75), py);
      const t4 = smoothstep(float(0.75), float(1.0), py);

      const c1 = mix(green, cyan, t1);
      const c2 = mix(c1, blue, t2);
      const c3 = mix(c2, purple, t3);
      const c4 = mix(c3, pink, t4);

      // Luminosity shimmer
      const shimmer = sin(waveU.mul(12.0).add(t.mul(3.0))).mul(float(0.15)).add(float(0.85));

      // Subtle vertex breathing: UV-based displacement
      const breathe = sin(uvCoord.x.mul(6.0).add(t.mul(1.5))).mul(float(0.03)).add(float(1.0));

      const alpha = vFade.mul(float(0.35)).mul(shimmer).mul(breathe);

      return vec3(c4.x, c4.y, c4.z).mul(alpha);
    });

    mat.colorNode = auroraFn();

    return mat;
  }, []);

  // Halo material: slightly different, BackSide glow
  const haloMaterial = useMemo(() => {
    const mat = new THREE.MeshBasicNodeMaterial();
    mat.transparent = true;
    mat.blending = THREE.AdditiveBlending;
    mat.depthWrite = false;
    mat.side = THREE.BackSide;

    const haloFn = Fn(() => {
      const uvCoord = uv();
      const vFade = smoothstep(float(0.0), float(0.1), uvCoord.y)
        .mul(smoothstep(float(1.0), float(0.85), uvCoord.y));
      return vec3(0.3, 0.6, 1.0).mul(vFade.mul(float(0.15)));
    });
    mat.colorNode = haloFn();
    return mat;
  }, []);

  // Background atmosphere sphere
  const atmMat = useMemo(() => {
    const mat = new THREE.MeshBasicNodeMaterial();
    mat.side = THREE.BackSide;
    const fn = Fn(() => {
      const py = positionWorld.y.add(float(5.0)).div(float(20.0)).saturate();
      return mix(vec3(0.0, 0.02, 0.08), vec3(0.0, 0.0, 0.03), py);
    });
    mat.colorNode = fn();
    return mat;
  }, []);

  // Star particle material with hash twinkle
  const starMat = useMemo(() => {
    const mat = new THREE.MeshBasicNodeMaterial();
    const fn = Fn(() => {
      const h = hash(positionWorld.x.mul(6.3).add(positionWorld.y.mul(11.7)).add(positionWorld.z.mul(4.1)));
      const twinkle = sin(time.mul(h.mul(3.0).add(0.5))).mul(float(0.4)).add(float(0.6));
      return mix(vec3(0.3, 0.9, 0.5), vec3(0.8, 0.5, 1.0), h).mul(twinkle).mul(float(0.8));
    });
    mat.colorNode = fn();
    return mat;
  }, []);

  // Star positions (60 background stars)
  const starPositions = useMemo(() => {
    const positions: [number, number, number][] = [];
    for (let i = 0; i < 60; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 20 + Math.random() * 8;
      positions.push([
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.sin(phi) * Math.sin(theta) * 0.5 + 3,
        r * Math.cos(phi),
      ]);
    }
    return positions;
  }, []);

  useFrame(() => {
    const t = performance.now() * 0.001;

    for (let i = 0; i < STRIP_COUNT; i++) {
      const freq = SYNTH_FREQS[i];
      const phase = SYNTH_PHASES[i];

      // Synth amplitude: sharp sine pulse per strip at its tone frequency
      const amp = Math.sin(t * Math.PI * 2 * freq + phase) * 0.5 + 0.5;
      const sway = Math.sin(t * freq * 1.7 + phase * 0.5) * 1.2 * amp;
      const heightScale = 0.8 + amp * 0.4;

      const mesh = meshRefs.current[i];
      if (mesh) {
        mesh.position.x = sway;
        mesh.scale.y = heightScale;
      }

      const reflMesh = reflMeshRefs.current[i];
      if (reflMesh) {
        reflMesh.position.x = sway;
        reflMesh.scale.y = heightScale * 0.6;
      }
    }
  });

  return (
    <>
      <color attach="background" args={['#000008']} />
      {/* Background atmosphere sphere */}
      <mesh material={atmMat}>
        <sphereGeometry args={[35, 16, 10]} />
      </mesh>
      {/* Star field */}
      {starPositions.map(([x, y, z], i) => (
        <mesh key={i} position={[x, y, z]} material={starMat}>
          <sphereGeometry args={[0.08, 4, 4]} />
        </mesh>
      ))}
      <ambientLight intensity={0.02} />
      <pointLight position={[0, 4, 0]} intensity={3} color="#00ff88" distance={20} />
      <pointLight position={[-4, 6, 2]} intensity={2} color="#8800ff" distance={15} />
      {/* Additional teal atmosphere light */}
      <pointLight position={[4, 2, -4]} intensity={1.5} color="#00aacc" distance={18} />

      {/* Aurora strips */}
      {Array.from({ length: STRIP_COUNT }, (_, i) => {
        const z = (i - STRIP_COUNT / 2) * STRIP_SPACING;
        return (
          <group key={i}>
            <mesh
              ref={(el) => { meshRefs.current[i] = el; }}
              position={[0, 2, z]}
              material={material}
            >
              <planeGeometry args={[STRIP_WIDTH, STRIP_HEIGHT, 32, 64]} />
            </mesh>
            {/* Backside halo */}
            <mesh
              position={[0, 2, z]}
              scale={[1.05, 1.05, 1.05]}
              material={haloMaterial}
            >
              <planeGeometry args={[STRIP_WIDTH, STRIP_HEIGHT, 8, 16]} />
            </mesh>
            {/* Y-flip reflection below horizon */}
            <mesh
              ref={(el) => { reflMeshRefs.current[i] = el; }}
              position={[0, -1.5, z]}
              rotation={[Math.PI, 0, 0]}
              material={material}
            >
              <planeGeometry args={[STRIP_WIDTH, STRIP_HEIGHT * 0.4, 16, 32]} />
            </mesh>
          </group>
        );
      })}

      {/* Ground plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.6, 0]} material={synthGroundMat}>
        <planeGeometry args={[60, 60]} />
      </mesh>
    </>
  );
}
