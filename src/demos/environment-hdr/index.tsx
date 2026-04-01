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
 * Environment HDR — Roughness study across 5 chrome spheres
 *
 * Since drei Environment may not work with WebGPURenderer, we simulate HDR
 * environment mapping using a hand-crafted environment texture approach:
 * - A high-detail BackSide sphere serves as the "environment"
 * - Multiple directional lights simulate environment light zones
 * - EnvMap is simulated via reflection-like Fresnel + specular TSL nodes
 * - 5 spheres from roughness 0.0 (mirror) to 1.0 (matte)
 *
 * The key insight: roughness affects how "tight" the highlight is.
 * We simulate this with material roughness and varying emissive rim widths.
 *
 * Visual: Curved studio backdrop, 5 chrome spheres on pedestals,
 * environment "probes" (small indicator spheres showing the simulated HDR map).
 */

// Environment color zones (simulating a city HDR: sky, sun, buildings, etc.)
const ENV_LIGHTS = [
  { pos: [10, 8, 5] as [number, number, number], color: 0xfffae0, intensity: 2.5, name: 'Sun' },
  { pos: [-8, 4, 3] as [number, number, number], color: 0xc0d8ff, intensity: 1.0, name: 'Sky Fill' },
  { pos: [0, -3, 6] as [number, number, number], color: 0xff9955, intensity: 0.5, name: 'Ground Bounce' },
  { pos: [5, 2, -6] as [number, number, number], color: 0xaaccff, intensity: 0.7, name: 'Backlight' },
  { pos: [-5, 6, -4] as [number, number, number], color: 0x88aacc, intensity: 0.4, name: 'Ambient Sky' },
];

const ROUGHNESS_VALUES = [0.0, 0.25, 0.5, 0.75, 1.0];
const SPHERE_X = [-3.2, -1.6, 0, 1.6, 3.2];

function makeSphereMaterial(roughness: number, phase: number) {
  const mat = new THREE.MeshStandardNodeMaterial();

  // Pure chrome: white base
  mat.colorNode = vec3(1.0, 1.0, 1.0);

  // Rim effect — narrower for low roughness (tight highlight), wider for high roughness
  const rimWidth = 1.5 + roughness * 2.5;
  const fresnel = Fn(() => {
    const viewDir = cameraPosition.sub(positionWorld).normalize();
    const nDotV = normalWorld.dot(viewDir).saturate();
    return float(1.0).sub(nDotV).pow(float(rimWidth));
  });

  // For rough spheres, add scattered warm ambient bounce
  const scatterColor = mix(vec3(1.0, 0.98, 0.9), vec3(0.4, 0.55, 0.8), float(roughness));
  const rimIntensity = (1.0 - roughness * 0.7) * 1.8;
  mat.emissiveNode = scatterColor.mul(fresnel().mul(float(rimIntensity)));

  // Gentle breathing for roughness 0 (perfect mirror catches all detail)
  if (roughness < 0.1) {
    mat.positionNode = positionLocal.add(
      normalLocal.mul(oscSine(time.mul(0.8).add(phase)).mul(0.008))
    );
  }

  mat.roughness = roughness;
  mat.metalness = 1.0;
  return mat;
}

function makePedestalMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.colorNode = vec3(0.88, 0.88, 0.9);
  mat.roughness = 0.6;
  mat.metalness = 0.05;
  return mat;
}

function makeBackdropMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.side = THREE.BackSide;

  // City-HDR style gradient: warm horizon, cool sky, dark ground
  const gradient = Fn(() => {
    const up = normalWorld.y.mul(0.5).add(0.5);
    const ground = vec3(0.12, 0.08, 0.06);
    const horizon = vec3(0.65, 0.55, 0.4);
    const sky = vec3(0.3, 0.45, 0.7);
    const t1 = up.saturate();
    const t2 = normalWorld.y.add(0.2).saturate();
    return mix(mix(ground, horizon, t2), sky, t1.mul(t1));
  });

  mat.colorNode = gradient();
  mat.emissiveNode = gradient().mul(0.5);
  mat.roughness = 1.0;
  return mat;
}

function makeLabelMaterial(labelRoughness: number) {
  const mat = new THREE.MeshStandardNodeMaterial();
  // Color-code by roughness: 0=blue, 0.5=white, 1.0=amber
  const r = labelRoughness;
  const labelColor = new THREE.Color(
    0.3 + r * 0.6,
    0.5 - r * 0.2,
    1.0 - r * 0.8
  );
  mat.colorNode = color(labelColor.getHex());
  mat.emissiveNode = color(labelColor.getHex()).mul(0.8);
  mat.roughness = 0.3;
  mat.metalness = 0.1;
  return mat;
}

/** Environment probe — small sphere showing env map colors */
function EnvProbe({ position, envColor }: { position: [number, number, number]; envColor: number }) {
  const mat = useMemo(() => {
    const m = new THREE.MeshStandardNodeMaterial();
    m.colorNode = color(envColor);
    m.emissiveNode = color(envColor).mul(2.0);
    m.roughness = 0.0;
    m.metalness = 0.8;
    return m;
  }, [envColor]);

  const haloMat = useMemo(() => {
    const m = new THREE.MeshStandardNodeMaterial();
    m.transparent = true;
    m.side = THREE.BackSide;
    m.depthWrite = false;
    m.blending = THREE.AdditiveBlending;
    const fresnel = Fn(() => {
      const viewDir = cameraPosition.sub(positionWorld).normalize();
      const nDotV = normalWorld.dot(viewDir).saturate();
      return float(1.0).sub(nDotV).pow(2.0);
    });
    m.colorNode = color(envColor);
    m.emissiveNode = color(envColor).mul(fresnel().mul(2.5));
    m.opacityNode = fresnel().mul(0.5);
    m.roughness = 0.0;
    return m;
  }, [envColor]);

  return (
    <group position={position}>
      <mesh material={mat}>
        <sphereGeometry args={[0.06, 12, 12]} />
      </mesh>
      <mesh material={haloMat} scale={[2.2, 2.2, 2.2]}>
        <sphereGeometry args={[0.06, 8, 8]} />
      </mesh>
    </group>
  );
}

export default function EnvironmentHDR() {
  const sphereMats = useMemo(() =>
    ROUGHNESS_VALUES.map((r, i) => makeSphereMaterial(r, i * 1.26)),
    []
  );
  const pedestalMat = useMemo(() => makePedestalMaterial(), []);
  const backdropMat = useMemo(() => makeBackdropMaterial(), []);
  const labelMats = useMemo(() =>
    ROUGHNESS_VALUES.map(r => makeLabelMaterial(r)),
    []
  );

  const groupRef = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.04;
    }
  });

  return (
    <>
      <ambientLight intensity={0.3} />
      <hemisphereLight args={['#334466', '#111122', 0.3]} />

      {/* Environment lights simulating HDR */}
      {ENV_LIGHTS.map((l, i) => (
        <directionalLight
          key={i}
          position={l.pos}
          intensity={l.intensity}
          color={l.color}
        />
      ))}

      {/* Curved studio backdrop */}
      <mesh material={backdropMat}>
        <sphereGeometry args={[18, 64, 32]} />
      </mesh>

      {/* Curved floor/backdrop cyc — connects floor to wall */}
      <mesh position={[0, -0.5, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[12, 12]} />
        <meshStandardMaterial color={0xf0f0f2} roughness={0.7} metalness={0.0} />
      </mesh>

      {/* Slowly rotating group for dynamic reflections */}
      <group ref={groupRef}>
        {/* Environment probes scattered around the scene */}
        {ENV_LIGHTS.map((l, i) => (
          <EnvProbe
            key={i}
            position={[l.pos[0] * 0.4, l.pos[1] * 0.3, l.pos[2] * 0.4]}
            envColor={l.color}
          />
        ))}
      </group>

      {/* The 5 roughness spheres */}
      {ROUGHNESS_VALUES.map((r, i) => (
        <group key={i} position={[SPHERE_X[i], 0, 0]}>
          {/* Sphere */}
          <mesh material={sphereMats[i]} position={[0, 0.82, 0]}>
            <sphereGeometry args={[0.45, 48, 48]} />
          </mesh>

          {/* Pedestal cylinder */}
          <mesh material={pedestalMat} position={[0, 0.18, 0]}>
            <cylinderGeometry args={[0.22, 0.28, 0.36, 32]} />
          </mesh>

          {/* Pedestal base */}
          <mesh material={pedestalMat} position={[0, 0.03, 0]}>
            <cylinderGeometry args={[0.38, 0.38, 0.06, 32]} />
          </mesh>

          {/* Roughness indicator dot below pedestal */}
          <mesh material={labelMats[i]} position={[0, -0.02, 0.42]}>
            <sphereGeometry args={[0.06, 12, 12]} />
          </mesh>

          {/* Small "R=" label panel */}
          <mesh position={[0, -0.01, 0.42]}>
            <planeGeometry args={[0.22, 0.06]} />
            <meshStandardMaterial color={0xffffff} transparent opacity={0.0} />
          </mesh>
        </group>
      ))}

      {/* Decorative ground reflection strip */}
      <mesh position={[0, -0.499, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[8, 4]} />
        <meshStandardMaterial color={0xffffff} transparent opacity={0.15} roughness={0.0} metalness={0.9} />
      </mesh>
    </>
  );
}
