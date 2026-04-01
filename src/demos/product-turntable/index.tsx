import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { PresentationControls } from '@react-three/drei';
import * as THREE from 'three/webgpu';
import {
  color,
  normalWorld,
  cameraPosition,
  positionWorld,
  Fn,
  float,
  time,
  oscSine,
  vec3,
  mix,
  positionLocal,
  normalLocal,
} from 'three/tsl';

/**
 * Product Turntable — PresentationControls showcase with a premium product aesthetic
 *
 * Features:
 * - drei PresentationControls for drag-to-rotate interaction
 * - Hero object: detailed torus knot on a reflective platform
 * - Reflective circular platform via Y-flipped mirror geometry
 * - Colored rim lighting (key, fill, back)
 * - TSL material: metallic surface with Fresnel highlights
 * - Subtle auto-rotation when not interacting
 * - Shadow disc beneath platform for grounding
 * - Particle ring orbiting the product
 */

function makeHeroMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();

  // Animated color shift: gold to copper to rose gold
  const t = time.mul(0.3);
  const r = oscSine(t).mul(0.2).add(0.8);
  const g = oscSine(t.add(2.09)).mul(0.15).add(0.55);
  const b = oscSine(t.add(4.19)).mul(0.1).add(0.2);
  mat.colorNode = vec3(r, g, b);

  const fresnel = Fn(() => {
    const viewDir = cameraPosition.sub(positionWorld).normalize();
    const nDotV = normalWorld.dot(viewDir).saturate();
    return float(1.0).sub(nDotV).pow(3.0);
  });

  // Rim light: blueish rim for product-photography style
  const rimColor = vec3(0.3, 0.5, 1.0);
  mat.emissiveNode = rimColor.mul(fresnel().mul(2.5));

  // Subtle breathing displacement
  mat.positionNode = positionLocal.add(
    normalLocal.mul(oscSine(time.mul(0.5)).mul(0.015))
  );

  mat.roughness = 0.05;
  mat.metalness = 0.95;
  return mat;
}

function makePlatformMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();

  // Near-white, very slight blue tint for studio look
  const fresnel = Fn(() => {
    const viewDir = cameraPosition.sub(positionWorld).normalize();
    const nDotV = normalWorld.dot(viewDir).saturate();
    return float(1.0).sub(nDotV).pow(5.0);
  });

  mat.colorNode = vec3(0.92, 0.93, 0.95);
  mat.emissiveNode = vec3(0.1, 0.15, 0.3).mul(fresnel().mul(1.5));
  mat.roughness = 0.02;
  mat.metalness = 0.8;
  return mat;
}

function makeReflectionMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;
  // Reflection: tinted blue platform color with transparency
  mat.colorNode = vec3(0.05, 0.07, 0.12);
  mat.opacityNode = float(0.6);
  mat.roughness = 0.0;
  mat.metalness = 0.9;
  return mat;
}

function makeBackgroundMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.side = THREE.BackSide;

  const gradient = Fn(() => {
    const up = normalWorld.y.mul(0.5).add(0.5);
    const dark = vec3(0.02, 0.02, 0.04);
    const mid = vec3(0.04, 0.05, 0.10);
    return mix(dark, mid, up);
  });

  mat.colorNode = gradient();
  mat.emissiveNode = gradient().mul(0.3);
  mat.roughness = 1.0;
  return mat;
}

/** Orbital particle ring around the hero */
function OrbitRing() {
  const particleCount = 60;
  const groupRef = useRef<THREE.Group>(null);

  const positions = useMemo(() => {
    return Array.from({ length: particleCount }, (_, i) => {
      const angle = (i / particleCount) * Math.PI * 2;
      const r = 1.5 + Math.sin(i * 0.7) * 0.15;
      return {
        x: Math.cos(angle) * r,
        y: Math.sin(i * 1.3) * 0.12,
        z: Math.sin(angle) * r,
        size: 0.025 + Math.random() * 0.025,
        phase: i * 0.3,
      };
    });
  }, []);

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.4;
    }
  });

  return (
    <group ref={groupRef}>
      {positions.map((p, i) => (
        <mesh key={i} position={[p.x, p.y, p.z]}>
          <sphereGeometry args={[p.size, 6, 6]} />
          <meshStandardMaterial
            color={i % 3 === 0 ? 0xffcc66 : i % 3 === 1 ? 0x88aaff : 0xff88cc}
            emissive={i % 3 === 0 ? 0xffcc66 : i % 3 === 1 ? 0x88aaff : 0xff88cc}
            emissiveIntensity={2.0}
          />
        </mesh>
      ))}
    </group>
  );
}

export default function ProductTurntable() {
  const heroMat = useMemo(() => makeHeroMaterial(), []);
  const platformMat = useMemo(() => makePlatformMaterial(), []);
  const reflectionMat = useMemo(() => makeReflectionMaterial(), []);
  const bgMat = useMemo(() => makeBackgroundMaterial(), []);
  const autoRotateRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    // Subtle auto-rotation hint — PresentationControls will override this
    if (autoRotateRef.current) {
      autoRotateRef.current.rotation.y += delta * 0.25;
    }
  });

  return (
    <>
      <ambientLight intensity={0.05} />
      <hemisphereLight args={['#334466', '#111122', 0.3]} />

      {/* Key light — warm, from top-right */}
      <directionalLight position={[3, 5, 2]} intensity={1.2} color={0xffeedd} />
      {/* Fill light — cool, from left */}
      <directionalLight position={[-4, 2, -1]} intensity={0.4} color={0xaabbff} />
      {/* Back/rim light — from behind */}
      <directionalLight position={[-1, 3, -5]} intensity={0.8} color={0x8899ff} />

      {/* Background */}
      <mesh material={bgMat}>
        <sphereGeometry args={[25, 32, 32]} />
      </mesh>

      {/* Product showcase group */}
      <PresentationControls
        global
        snap={{ mass: 1, tension: 120 }}
        rotation={[0, 0, 0]}
        polar={[-0.4, 0.4]}
        azimuth={[-Infinity, Infinity]}
        speed={1.5}
        zoom={0.8}
      >
        <group ref={autoRotateRef} position={[0, 0.2, 0]}>
          {/* Hero torus knot */}
          <mesh material={heroMat} position={[0, 0.7, 0]}>
            <torusKnotGeometry args={[0.55, 0.18, 180, 24, 2, 3]} />
          </mesh>

          {/* Orbital ring */}
          <group position={[0, 0.7, 0]}>
            <OrbitRing />
          </group>
        </group>

        {/* Platform */}
        <mesh material={platformMat} position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[2, 2, 0.08, 64]} />
        </mesh>

        {/* Reflection plane — slightly below platform, Y-flipped visually */}
        <mesh material={reflectionMat} position={[0, -0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[2, 64]} />
        </mesh>
      </PresentationControls>

      {/* Shadow disc for grounding */}
      <mesh position={[0, -0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[2.2, 64]} />
        <meshStandardMaterial color={0x000000} transparent opacity={0.4} />
      </mesh>

      {/* Subtle fog particles in background */}
      <points>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[
              (() => {
                const a = new Float32Array(300 * 3);
                for (let i = 0; i < 300; i++) {
                  const r = 4 + Math.random() * 8;
                  const theta = Math.random() * Math.PI * 2;
                  const phi = Math.acos(2 * Math.random() - 1);
                  a[i * 3] = r * Math.sin(phi) * Math.cos(theta);
                  a[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) - 1;
                  a[i * 3 + 2] = r * Math.cos(phi);
                }
                return a;
              })(),
              3
            ]}
          />
        </bufferGeometry>
        <pointsMaterial color={0xaabbff} size={0.03} sizeAttenuation transparent opacity={0.4} />
      </points>
    </>
  );
}
