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
  sin,
  hash,
} from 'three/tsl';

/**
 * Sprite Sparks — Instanced particle spark fountain with TSL
 *
 * Demonstrates TSL-driven particle-like effects:
 * - 600 instanced icosahedrons as spark particles
 * - TSL colorNode with height-based warm-to-cool gradient
 * - TSL emissiveNode with pulsing glow driven by hash per-particle phase
 * - Fresnel rim for bright edges on each spark
 * - Vertex breathing via positionNode
 * - Spiral fountain arrangement
 */

const PARTICLE_COUNT = 600;

export default function SpriteSparks() {
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.InstancedMesh>(null);

  // Build instance matrices: particles in a spiral fountain
  const matrices = useMemo(() => {
    const dummy = new THREE.Object3D();
    const result: THREE.Matrix4[] = [];

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const t = i / PARTICLE_COUNT;
      const angle = t * Math.PI * 16;
      const radius = 0.15 + t * 2.0;

      // Vertical distribution: denser in center
      const height = (t - 0.5) * 4.5 + (Math.random() - 0.5) * 0.8;

      const scatter = t * 0.35;
      const x = Math.cos(angle) * radius + (Math.random() - 0.5) * scatter;
      const z = Math.sin(angle) * radius + (Math.random() - 0.5) * scatter;

      // Generously sized sparks for visual impact
      const scale = 0.06 + Math.random() * 0.08 + (1 - Math.abs(t - 0.4)) * 0.06;

      dummy.position.set(x, height, z);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      result.push(dummy.matrix.clone());
    }

    return result;
  }, []);

  // Apply instance matrices
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    for (let i = 0; i < matrices.length; i++) {
      mesh.setMatrixAt(i, matrices[i]);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [matrices]);

  // TSL material with warm-to-cool gradient + pulsing emissive + fresnel
  const material = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();

    // Height in world space, normalized 0..1
    const heightNorm = positionWorld.y.add(2.5).div(5.0).clamp(0.0, 1.0);

    // Per-particle phase seed from world position
    const seed = hash(positionWorld.x.mul(37.7).add(positionWorld.z.mul(91.1)));

    // Color: warm-to-cool gradient based on height
    const warmColor = color(0xff4400); // hot orange-red
    const midColor = color(0xffcc33);  // bright gold
    const coolColor = color(0x22ddff); // electric cyan

    const lowerMix = mix(warmColor, midColor, smoothstep(0.0, 0.4, heightNorm));
    const fullColor = mix(lowerMix, coolColor, smoothstep(0.35, 1.0, heightNorm));
    mat.colorNode = fullColor;

    // Fresnel rim glow
    const fresnel = Fn(() => {
      const viewDir = cameraPosition.sub(positionWorld).normalize();
      const nDotV = normalWorld.dot(viewDir).saturate();
      return float(1.0).sub(nDotV).pow(2.5);
    });

    // Pulsing emissive with per-particle phase offset
    const pulse = oscSine(time.mul(1.2).add(seed.mul(6.283))).mul(0.4).add(0.6);

    // Strong emissive with visible color gradient + fresnel rim
    const emissiveBase = fullColor.mul(pulse.mul(2.5).add(1.5));
    const rimEmissive = color(0xffeedd).mul(fresnel()).mul(pulse.mul(1.5));
    mat.emissiveNode = emissiveBase.add(rimEmissive);

    // Gentle vertex breathing
    mat.positionNode = positionLocal.add(
      normalLocal.mul(
        sin(time.mul(2.5).add(positionLocal.y.mul(5.0))).mul(0.02),
      ),
    );

    mat.roughness = 0.2;
    mat.metalness = 0.4;

    return mat;
  }, []);

  // Rotate the fountain
  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.12;
    }
  });

  return (
    <>
      <ambientLight intensity={0.2} />
      <directionalLight position={[3, 5, 3]} intensity={0.5} />
      <pointLight position={[0, -1.5, 0]} intensity={5.0} color="#ff6622" distance={10} />
      <pointLight position={[0, 2.5, 0]} intensity={4.0} color="#22ccff" distance={10} />
      <pointLight position={[0, 0, 0]} intensity={3.0} color="#ffaa44" distance={6} />

      <group ref={groupRef}>
        <instancedMesh
          ref={meshRef}
          args={[undefined, undefined, PARTICLE_COUNT]}
          material={material}
        >
          <icosahedronGeometry args={[1, 2]} />
        </instancedMesh>
      </group>
    </>
  );
}
