import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
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
  mix,
  vec3,
  positionLocal,
  normalLocal,
} from 'three/tsl';

/**
 * Contact Shadows Demo — Floating objects with dynamic shadow simulation
 *
 * Since drei ContactShadows may not work with WebGPURenderer, we simulate
 * soft contact shadows using circular dark disc meshes that:
 * - Scale down as objects float higher (soft/small shadow = high object)
 * - Increase opacity as objects approach ground (dark/sharp = close)
 * - Use Gaussian-like falloff by scaling a blurred disc mesh
 *
 * Objects:
 * - Sphere, Torus, Box, Icosahedron, Cylinder, Diamond (octahedron), Capsule
 * - Each bobs at different frequency and phase
 * - Bright, desaturated materials — gallery feel
 * - Clean white studio environment
 */

const OBJECTS = [
  { x: -2.5, z: 0, color: 0xff6655, emissive: 0xff3322, type: 'sphere', freq: 0.7, phase: 0.0, height: 0.8 },
  { x: 0, z: 0, color: 0x55aaff, emissive: 0x2277ff, type: 'torus', freq: 0.9, phase: 1.05, height: 1.0 },
  { x: 2.5, z: 0, color: 0xaaff55, emissive: 0x77cc22, type: 'box', freq: 0.6, phase: 2.1, height: 0.7 },
  { x: -1.25, z: 2.5, color: 0xff55cc, emissive: 0xff22aa, type: 'icosahedron', freq: 1.1, phase: 3.15, height: 0.9 },
  { x: 1.25, z: 2.5, color: 0xffcc44, emissive: 0xff9900, type: 'octahedron', freq: 0.8, phase: 4.2, height: 1.1 },
  { x: -2.5, z: -2.5, color: 0xcc55ff, emissive: 0x9922ff, type: 'cone', freq: 1.0, phase: 0.5, height: 0.85 },
  { x: 2.5, z: -2.5, color: 0x55ffee, emissive: 0x22ccbb, type: 'dodecahedron', freq: 0.75, phase: 1.75, height: 0.95 },
];

function makeObjectMaterial(baseHex: number, emissiveHex: number, phase: number) {
  const mat = new THREE.MeshStandardNodeMaterial();
  const pulse = oscSine(time.mul(0.8).add(phase)).mul(0.25).add(0.75);
  mat.colorNode = color(baseHex);

  const fresnel = Fn(() => {
    const viewDir = cameraPosition.sub(positionWorld).normalize();
    const nDotV = normalWorld.dot(viewDir).saturate();
    return float(1.0).sub(nDotV).pow(3.0);
  });

  mat.emissiveNode = color(emissiveHex).mul(pulse.mul(1.8)).add(
    color(0xffffff).mul(fresnel().mul(pulse.mul(1.2)))
  );

  mat.positionNode = positionLocal.add(
    normalLocal.mul(oscSine(time.mul(1.5).add(phase)).mul(0.015))
  );

  mat.roughness = 0.2;
  mat.metalness = 0.15;
  return mat;
}

function makeGroundMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.colorNode = vec3(0.97, 0.97, 0.98);
  mat.roughness = 0.9;
  mat.metalness = 0.0;
  return mat;
}

function makeBackgroundMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.side = THREE.BackSide;

  const gradient = Fn(() => {
    const up = normalWorld.y.mul(0.5).add(0.5);
    const low = vec3(0.85, 0.86, 0.90);
    const high = vec3(0.96, 0.97, 1.0);
    return mix(low, high, up);
  });

  mat.colorNode = gradient();
  mat.emissiveNode = gradient().mul(0.1);
  mat.roughness = 1.0;
  return mat;
}

/** A single floating object with its contact shadow disc */
function FloatingObject({ obj }: { obj: (typeof OBJECTS)[0] }) {
  const groupRef = useRef<THREE.Group>(null);
  const shadowRef = useRef<THREE.Mesh>(null);
  const mat = useMemo(() => makeObjectMaterial(obj.color, obj.emissive, obj.phase), [obj]);

  const baseY = 0.5 + obj.height;
  const shadowBaseY = 0.01;

  useFrame(() => {
    const t = Date.now() * 0.001;
    if (!groupRef.current || !shadowRef.current) return;

    // Bob animation
    const bobOffset = Math.sin(t * obj.freq + obj.phase) * 0.35;
    const currentY = baseY + bobOffset;
    groupRef.current.position.y = currentY;
    groupRef.current.rotation.y = t * 0.3;
    groupRef.current.rotation.x = Math.sin(t * 0.2 + obj.phase) * 0.1;

    // Shadow: closer = darker + larger, further = lighter + smaller
    const distToGround = currentY - shadowBaseY;
    const normalizedDist = Math.min(distToGround / 2.0, 1.0);
    const shadowScale = THREE.MathUtils.lerp(0.85, 0.25, normalizedDist);
    const shadowOpacity = THREE.MathUtils.lerp(0.6, 0.08, normalizedDist);

    shadowRef.current.scale.set(shadowScale, 1, shadowScale);
    const shadowMat = shadowRef.current.material as THREE.MeshStandardMaterial;
    shadowMat.opacity = shadowOpacity;
  });

  const getGeometry = () => {
    switch (obj.type) {
      case 'sphere': return <sphereGeometry args={[0.32, 24, 24]} />;
      case 'torus': return <torusGeometry args={[0.24, 0.1, 16, 48]} />;
      case 'box': return <boxGeometry args={[0.5, 0.5, 0.5]} />;
      case 'icosahedron': return <icosahedronGeometry args={[0.32, 1]} />;
      case 'octahedron': return <octahedronGeometry args={[0.34, 1]} />;
      case 'cone': return <coneGeometry args={[0.28, 0.6, 24]} />;
      case 'dodecahedron': return <dodecahedronGeometry args={[0.3, 0]} />;
      default: return <sphereGeometry args={[0.32, 16, 16]} />;
    }
  };

  return (
    <>
      {/* Floating object */}
      <group ref={groupRef} position={[obj.x, baseY, obj.z]}>
        <mesh material={mat}>
          {getGeometry()}
        </mesh>
      </group>

      {/* Contact shadow — simple dark ellipse */}
      <mesh
        ref={shadowRef}
        position={[obj.x, shadowBaseY, obj.z]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <circleGeometry args={[0.5, 32]} />
        <meshStandardMaterial
          color={0x000000}
          transparent
          opacity={0.5}
          depthWrite={false}
        />
      </mesh>

      {/* Soft outer shadow ring */}
      <mesh
        position={[obj.x, shadowBaseY - 0.001, obj.z]}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[1.8, 1, 1.8]}
      >
        <circleGeometry args={[0.5, 32]} />
        <meshStandardMaterial
          color={0x000000}
          transparent
          opacity={0.12}
          depthWrite={false}
        />
      </mesh>
    </>
  );
}

export default function ContactShadowsDemo() {
  const groundMat = useMemo(() => makeGroundMaterial(), []);
  const bgMat = useMemo(() => makeBackgroundMaterial(), []);

  return (
    <>
      <ambientLight intensity={0.6} />
      <hemisphereLight args={['#334466', '#111122', 0.3]} />
      <directionalLight position={[3, 8, 4]} intensity={1.5} color={0xffffff} castShadow />
      <directionalLight position={[-4, 4, -2]} intensity={0.4} color={0xbbccff} />

      {/* Studio background */}
      <mesh material={bgMat}>
        <sphereGeometry args={[25, 32, 32]} />
      </mesh>

      {/* Ground plane */}
      <mesh material={groundMat} position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[20, 20]} />
      </mesh>

      {/* Floating objects with contact shadows */}
      {OBJECTS.map((obj, i) => (
        <FloatingObject key={i} obj={obj} />
      ))}

      {/* Decorative grid lines on floor */}
      {Array.from({ length: 9 }, (_, i) => {
        const offset = (i - 4) * 1.2;
        return (
          <group key={i}>
            <mesh position={[offset, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[0.01, 12]} />
              <meshStandardMaterial color={0xddddee} transparent opacity={0.4} />
            </mesh>
            <mesh position={[0, 0.002, offset]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[12, 0.01]} />
              <meshStandardMaterial color={0xddddee} transparent opacity={0.4} />
            </mesh>
          </group>
        );
      })}
    </>
  );
}
