import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
  uniform,
  time,
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
 * Bass Nebula — Volumetric shell cloud pulsing to simulated bass frequency
 *
 * Techniques: 8 nested icosahedron shells (subdivision 5) with BackSide +
 * AdditiveBlending, uniform() for bass intensity updated from CPU, shell scale
 * driven by bass pulse, per-shell opacity 0.02-0.04, hash noise density with
 * time + bass offsets, warm gradient (deep purple core -> magenta -> orange ->
 * white at peaks).
 */

// Shell configuration: radius, base opacity, color weight
const SHELLS = [
  { radius: 0.7, opacity: 0.04, colorT: 0.0 },
  { radius: 1.0, opacity: 0.035, colorT: 0.14 },
  { radius: 1.35, opacity: 0.03, colorT: 0.28 },
  { radius: 1.7, opacity: 0.025, colorT: 0.42 },
  { radius: 2.1, opacity: 0.022, colorT: 0.57 },
  { radius: 2.55, opacity: 0.02, colorT: 0.71 },
  { radius: 3.0, opacity: 0.018, colorT: 0.85 },
  { radius: 3.5, opacity: 0.015, colorT: 1.0 },
];

export default function BassNebula() {
  const bassUniform = useMemo(() => uniform(0.0), []);
  const groupRef = useRef<THREE.Group>(null);
  const starMat = useMemo(() => {
    const mat = new THREE.MeshBasicNodeMaterial();
    mat.color.set(0.9, 0.9, 1.0);
    return mat;
  }, []);

  // Create one material per shell with unique opacity and color position
  const shellMaterials = useMemo(() => {
    return SHELLS.map((cfg) => {
      const mat = new THREE.MeshBasicNodeMaterial();
      mat.transparent = true;
      mat.blending = THREE.AdditiveBlending;
      mat.depthWrite = false;
      mat.side = THREE.BackSide;

      const colorT = float(cfg.colorT);
      const baseOpacity = float(cfg.opacity);

      const nebulaMat = Fn(() => {
        const t = time;
        const bass = bassUniform;

        // Hash-based density variation per vertex
        const h1 = hash(positionWorld.mul(float(3.7)).add(t.mul(float(0.15))));
        const h2 = hash(positionWorld.mul(float(7.3)).sub(t.mul(float(0.08))));
        const density = h1.mul(float(0.6)).add(h2.mul(float(0.4)));

        // Pulsing density with bass
        const bassPulse = bass.mul(float(0.4)).add(float(1.0));
        const finalDensity = density.mul(bassPulse);

        // Swirling turbulence
        const swirl = sin(positionWorld.x.mul(2.0).add(t.mul(0.3)))
          .mul(sin(positionWorld.z.mul(2.0).add(t.mul(0.25))))
          .mul(float(0.5)).add(float(0.5));

        // 4-stop warm gradient: deep purple -> magenta -> orange -> white
        const deepPurple = vec3(0.15, 0.0, 0.35);
        const magenta = vec3(0.9, 0.05, 0.7);
        const orange = vec3(1.0, 0.45, 0.1);
        const white = vec3(1.0, 0.95, 0.9);

        const t1 = smoothstep(float(0.0), float(0.35), colorT);
        const t2 = smoothstep(float(0.35), float(0.7), colorT);
        const t3 = smoothstep(float(0.7), float(1.0), colorT);

        const c1 = mix(deepPurple, magenta, t1);
        const c2 = mix(c1, orange, t2);
        const c3 = mix(c2, white, t3);

        // Bass brightens the core
        const bassGlow = bass.mul(float(1.5)).add(float(1.0));

        // Alpha from density + swirl + bass
        const alpha = baseOpacity.mul(finalDensity).mul(swirl.mul(float(0.5)).add(float(0.5))).mul(float(4.0));

        return vec3(c3.x, c3.y, c3.z).mul(alpha).mul(bassGlow);
      });

      mat.colorNode = nebulaMat();
      return mat;
    });
  }, [bassUniform]);

  useFrame(() => {
    const t = performance.now() * 0.001;

    // Sharp bass pulse at 120 BPM
    const bass = Math.pow(Math.max(0, Math.sin(t * Math.PI * 2 * 2.0)), 8);
    bassUniform.value = bass;

    // Slow rotation of the entire nebula
    if (groupRef.current) {
      groupRef.current.rotation.y += 0.002;
      groupRef.current.rotation.x = Math.sin(t * 0.15) * 0.2;
    }
  });

  // Shell scale driven by bass
  const shellMeshRefs = useRef<(THREE.Mesh | null)[]>([]);
  useFrame(() => {
    const bass = bassUniform.value;
    SHELLS.forEach((cfg, i) => {
      const mesh = shellMeshRefs.current[i];
      if (mesh) {
        const pulse = 1.0 + bass * 0.08 * (i * 0.1 + 0.5);
        mesh.scale.setScalar(cfg.radius * pulse);
      }
    });
  });

  return (
    <>
      <color attach="background" args={['#020005']} />
      <ambientLight intensity={0.02} />
      <pointLight position={[0, 0, 0]} intensity={15} color="#ff2288" distance={10} />
      <pointLight position={[3, 2, -2]} intensity={5} color="#8800ff" distance={15} />
      <pointLight position={[-2, -3, 3]} intensity={5} color="#ff6600" distance={12} />

      <group ref={groupRef}>
        {SHELLS.map((cfg, i) => (
          <mesh
            key={i}
            ref={(el) => { shellMeshRefs.current[i] = el; }}
            material={shellMaterials[i]}
            scale={cfg.radius}
          >
            <icosahedronGeometry args={[1, 5]} />
          </mesh>
        ))}
      </group>

      {/* Star field background: tiny distant spheres */}
      {Array.from({ length: 80 }, (_, i) => {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const r = 8 + Math.random() * 4;
        return (
          <mesh
            key={`star-${i}`}
            position={[
              r * Math.sin(phi) * Math.cos(theta),
              r * Math.sin(phi) * Math.sin(theta),
              r * Math.cos(phi),
            ]}
            material={starMat}
          >
            <sphereGeometry args={[0.025, 4, 4]} />
          </mesh>
        );
      })}
    </>
  );
}
