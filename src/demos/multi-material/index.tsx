import { useRef, useMemo } from 'react';
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
  vec3,
  uv,
} from 'three/tsl';

/**
 * Multi-Material — Different TSL materials on a compound object
 *
 * Six planes assembled into a cube, each with a unique TSL-driven material:
 * - +X: Fire — hash noise flickering, warm orange-red emissive
 * - -X: Ice — cyan fresnel rim, deep blue metallic
 * - +Y: Electric — rapid purple arcs, magenta flashes
 * - -Y: Gold — breathing warm metallic with gold fresnel
 * - +Z: Nature — green pulsing with organic vertex displacement
 * - -Z: Plasma — pink UV-based concentric rings
 *
 * Each face is a separate mesh with its own MeshStandardNodeMaterial,
 * demonstrating how different TSL node graphs produce dramatically
 * different looks on the same geometry type.
 */

/** Shared fresnel helper */
function makeFresnel(power: number) {
  return Fn(() => {
    const viewDir = cameraPosition.sub(positionWorld).normalize();
    const nDotV = normalWorld.dot(viewDir).saturate();
    return float(1.0).sub(nDotV).pow(power);
  });
}

/** Fire — flickering warm emissive with hash noise */
function makeFireMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();

  const flicker = Fn(() => {
    const p = positionWorld.mul(8.0);
    const offset = vec3(time.mul(3.0), time.mul(2.1), time.mul(1.7));
    const n1 = hash(p.add(offset));
    const n2 = hash(p.mul(2.3).add(offset.mul(1.5)));
    return n1.mul(0.6).add(n2.mul(0.4));
  });

  const flickerVal = flicker();
  const fresnel = makeFresnel(2.0);
  const fresnelVal = fresnel();

  const baseColor = mix(color(0x991100), color(0xff5500), flickerVal);
  mat.colorNode = baseColor;

  const fireEmissive = mix(color(0xff2200), color(0xffbb00), flickerVal);
  const pulse = oscSine(time.mul(1.5)).mul(0.3).add(0.7);
  mat.emissiveNode = fireEmissive.mul(pulse.mul(2.5)).add(
    color(0xffcc44).mul(fresnelVal.mul(1.5))
  );

  mat.positionNode = positionLocal.add(
    normalLocal.mul(sin(time.mul(4.0).add(positionLocal.y.mul(6.0))).mul(0.012))
  );

  mat.roughness = 0.6;
  mat.metalness = 0.1;
  return mat;
}

/** Ice — cool cyan with strong fresnel rim */
function makeIceMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();

  const fresnel = makeFresnel(2.5);
  const fresnelVal = fresnel();

  const pulse = oscSine(time.mul(0.4)).mul(0.2).add(0.8);
  mat.colorNode = mix(color(0x0a1133), color(0x1a3366), pulse);

  mat.emissiveNode = color(0x00ddff).mul(fresnelVal.mul(3.0)).add(
    color(0x3366ff).mul(pulse.mul(0.6))
  );

  mat.roughness = 0.1;
  mat.metalness = 0.9;
  return mat;
}

/** Electric — purple-magenta with rapid arcs */
function makeElectricMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();

  const fresnel = makeFresnel(1.8);
  const fresnelVal = fresnel();

  const arc = Fn(() => {
    const p = positionWorld.mul(12.0);
    const fastTime = time.mul(6.0);
    const n = hash(p.add(vec3(fastTime, fastTime.mul(0.8), fastTime.mul(1.2))));
    return smoothstep(0.35, 0.65, n);
  });
  const arcVal = arc();

  mat.colorNode = mix(color(0x220044), color(0x7700cc), arcVal);

  const arcColor = mix(color(0xaa00ff), color(0xff55ff), arcVal);
  mat.emissiveNode = arcColor.mul(arcVal.mul(2.5)).add(
    color(0xeeccff).mul(fresnelVal.mul(2.0))
  );

  mat.positionNode = positionLocal.add(
    normalLocal.mul(sin(time.mul(8.0).add(positionLocal.x.mul(10.0))).mul(0.008))
  );

  mat.roughness = 0.3;
  mat.metalness = 0.5;
  return mat;
}

/** Gold — smooth warm metallic with breathing glow */
function makeGoldMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();

  const fresnel = makeFresnel(3.0);
  const fresnelVal = fresnel();

  const breathe = oscSine(time.mul(0.6)).mul(0.3).add(0.7);

  mat.colorNode = mix(color(0x664400), color(0xcc9922), breathe);

  mat.emissiveNode = color(0xffaa22).mul(breathe.mul(1.2)).add(
    color(0xffdd88).mul(fresnelVal.mul(2.0))
  );

  mat.roughness = 0.2;
  mat.metalness = 0.95;
  return mat;
}

/** Nature — green organic with vertex breathing */
function makeNatureMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();

  const fresnel = makeFresnel(2.2);
  const fresnelVal = fresnel();

  const sway = Fn(() => {
    const p = positionWorld.mul(5.0);
    const n1 = hash(p.add(vec3(time.mul(1.0), time.mul(0.7), float(0.0))));
    const n2 = hash(p.mul(1.8).add(vec3(float(3.0), time.mul(1.2), time.mul(0.5))));
    return n1.mul(0.5).add(n2.mul(0.5));
  });
  const swayVal = sway();

  const greenPulse = oscSine(time.mul(0.8)).mul(0.2).add(0.8);
  mat.colorNode = mix(color(0x0a2a0a), color(0x1a6622), greenPulse);

  mat.emissiveNode = mix(color(0x00cc44), color(0x88ff44), swayVal).mul(greenPulse.mul(1.8)).add(
    color(0xaaffcc).mul(fresnelVal.mul(1.5))
  );

  mat.positionNode = positionLocal.add(
    normalLocal.mul(sin(time.mul(1.5).add(positionLocal.y.mul(3.0))).mul(0.01))
  );

  mat.roughness = 0.5;
  mat.metalness = 0.2;
  return mat;
}

/** Plasma — pink-white hot with UV ring pattern */
function makePlasmaMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();

  const fresnel = makeFresnel(1.5);
  const fresnelVal = fresnel();

  // UV-based concentric rings
  const uvCoord = uv();
  const centered = uvCoord.sub(vec3(0.5, 0.5, 0.0));
  const dist = centered.length();
  const rings = sin(dist.mul(40.0).sub(time.mul(3.0)));
  const ringMask = smoothstep(0.0, 0.4, rings);

  mat.colorNode = mix(color(0x440022), color(0xcc2266), ringMask);

  const plasmaGlow = mix(color(0xff2288), color(0xffaadd), ringMask);
  const pulse = oscSine(time.mul(1.2)).mul(0.25).add(0.75);
  mat.emissiveNode = plasmaGlow.mul(pulse.mul(2.0)).add(
    color(0xffddee).mul(fresnelVal.mul(2.5))
  );

  mat.roughness = 0.15;
  mat.metalness = 0.6;
  return mat;
}

/** Face config: position offset + rotation for each cube face */
const FACE_CONFIGS: Array<{
  position: [number, number, number];
  rotation: [number, number, number];
}> = [
  { position: [1, 0, 0], rotation: [0, Math.PI / 2, 0] },     // +X
  { position: [-1, 0, 0], rotation: [0, -Math.PI / 2, 0] },   // -X
  { position: [0, 1, 0], rotation: [-Math.PI / 2, 0, 0] },    // +Y
  { position: [0, -1, 0], rotation: [Math.PI / 2, 0, 0] },    // -Y
  { position: [0, 0, 1], rotation: [0, 0, 0] },                // +Z
  { position: [0, 0, -1], rotation: [0, Math.PI, 0] },         // -Z
];

export default function MultiMaterial() {
  const groupRef = useRef<THREE.Group>(null);

  const materials = useMemo(() => [
    makeFireMaterial(),
    makeIceMaterial(),
    makeElectricMaterial(),
    makeGoldMaterial(),
    makeNatureMaterial(),
    makePlasmaMaterial(),
  ], []);

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.25;
      groupRef.current.rotation.x += delta * 0.15;
    }
  });

  return (
    <>

      <fogExp2 attach="fog" color="#020408" density={0.04} />
      {/* Background atmosphere */}
      <mesh>
        <sphereGeometry args={[30, 16, 16]} />
        <meshBasicMaterial side={THREE.BackSide} color="#020408" />
      </mesh>
      <ambientLight intensity={0.15} />
      <hemisphereLight args={['#334466', '#111122', 0.3]} />
      <directionalLight position={[4, 5, 3]} intensity={0.5} />
      {/* Colored accent lights — each reinforces one face's palette */}
      <pointLight position={[3, 0, 0]} intensity={2.0} color="#ff4400" distance={8} />
      <pointLight position={[-3, 0, 0]} intensity={2.0} color="#00ccff" distance={8} />
      <pointLight position={[0, 3, 0]} intensity={1.5} color="#aa00ff" distance={8} />
      <pointLight position={[0, -3, 0]} intensity={1.5} color="#ffaa22" distance={8} />
      <pointLight position={[0, 0, 3]} intensity={1.5} color="#00ff44" distance={8} />
      <pointLight position={[0, 0, -3]} intensity={1.5} color="#ff2288" distance={8} />

      <group ref={groupRef} rotation={[0.6, 0.8, 0.0]}>
        {FACE_CONFIGS.map((face, i) => (
          <mesh
            key={i}
            material={materials[i]}
            position={face.position}
            rotation={face.rotation}
          >
            <planeGeometry args={[2, 2]} />
          </mesh>
        ))}
      </group>
    </>
  );
}
