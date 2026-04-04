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
 * Skeletal Wave — Programmatic skinned mesh with TSL node overrides
 *
 * Demonstrates:
 * - Programmatic bone chain (Skeleton + SkinnedMesh without GLTF)
 * - CPU-driven bone animation (sine wave propagation along spine)
 * - TSL colorNode using positionWorld for gradient along body
 * - TSL emissiveNode with fresnel rim and height-based pulse
 * - Multiple tentacles radiating from a central hub (jellyfish shape)
 */

const BONE_COUNT = 12;
const SEGMENT_HEIGHT = 0.18;
const TENTACLE_COUNT = 7;

function createTentacleGeometry(): THREE.CylinderGeometry {
  const totalHeight = BONE_COUNT * SEGMENT_HEIGHT;
  const geo = new THREE.CylinderGeometry(
    0.02,      // radiusTop (thin tip)
    0.12,      // radiusBottom (thick base)
    totalHeight,
    8,         // radialSegments
    BONE_COUNT * 3, // heightSegments for smooth bending
  );
  // Shift geometry so base is at y=0, extends upward
  geo.translate(0, totalHeight / 2, 0);
  return geo;
}

function createSkinData(geometry: THREE.CylinderGeometry) {
  const position = geometry.getAttribute('position');
  const totalHeight = BONE_COUNT * SEGMENT_HEIGHT;
  const vertexCount = position.count;

  const skinIndices: number[] = [];
  const skinWeights: number[] = [];

  for (let i = 0; i < vertexCount; i++) {
    const y = position.getY(i);
    const normalizedY = Math.max(0, Math.min(y / totalHeight, 0.9999));
    const boneFloat = normalizedY * (BONE_COUNT - 1);
    const boneIndex = Math.floor(boneFloat);
    const weight = boneFloat - boneIndex;

    const bi0 = Math.min(boneIndex, BONE_COUNT - 1);
    const bi1 = Math.min(boneIndex + 1, BONE_COUNT - 1);

    skinIndices.push(bi0, bi1, 0, 0);
    skinWeights.push(1 - weight, weight, 0, 0);
  }

  geometry.setAttribute(
    'skinIndex',
    new THREE.Uint16BufferAttribute(skinIndices, 4),
  );
  geometry.setAttribute(
    'skinWeight',
    new THREE.Float32BufferAttribute(skinWeights, 4),
  );
}

function createBones(): THREE.Bone[] {
  const bones: THREE.Bone[] = [];
  for (let i = 0; i < BONE_COUNT; i++) {
    const bone = new THREE.Bone();
    if (i === 0) {
      bone.position.set(0, 0, 0);
    } else {
      bone.position.set(0, SEGMENT_HEIGHT, 0);
    }
    if (i > 0) {
      bones[i - 1].add(bone);
    }
    bones.push(bone);
  }
  return bones;
}

function Tentacle({ angle, phaseOffset }: { angle: number; phaseOffset: number }) {
  const meshRef = useRef<THREE.SkinnedMesh>(null);
  const bonesRef = useRef<THREE.Bone[]>([]);

  const geometry = useMemo(() => {
    const geo = createTentacleGeometry();
    createSkinData(geo);
    return geo;
  }, []);

  const material = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.side = THREE.DoubleSide;

    // Color gradient along height: warm at base, cool at tip
    const heightNorm = positionWorld.y.add(0.5).div(3.0).saturate();
    const baseColor = color(0xff6622); // warm orange-red
    const midColor = color(0xbb33ff);  // violet
    const tipColor = color(0x22ccff);  // cyan
    const lower = mix(baseColor, midColor, smoothstep(0.0, 0.5, heightNorm));
    mat.colorNode = mix(lower, tipColor, smoothstep(0.4, 1.0, heightNorm));

    // Fresnel rim
    const fresnel = Fn(() => {
      const viewDir = cameraPosition.sub(positionWorld).normalize();
      const nDotV = normalWorld.dot(viewDir).saturate();
      return float(1.0).sub(nDotV).pow(2.5);
    });

    // Per-segment seed from world position for shimmer variation
    const segSeed = hash(positionWorld.x.mul(7.0).add(positionWorld.z.mul(11.0)));
    const shimmer = oscSine(time.mul(1.5).add(segSeed.mul(6.28)));

    // Emissive: fresnel rim + pulsing wave along the body + per-segment shimmer
    const pulse = oscSine(time.mul(2.0).add(positionWorld.y.mul(3.0)).add(float(phaseOffset)));
    const rimGlow = vec3(0.6, 0.2, 1.0).mul(fresnel()).mul(1.5);
    const bodyGlow = mix(
      vec3(1.0, 0.3, 0.1),
      vec3(0.1, 0.7, 1.0),
      heightNorm,
    ).mul(pulse.mul(0.5).add(0.5)).mul(shimmer.mul(0.4).add(0.6));
    mat.emissiveNode = rimGlow.add(bodyGlow);

    // Subtle vertex breathing
    mat.positionNode = positionLocal.add(
      normalLocal.mul(oscSine(time.mul(1.5).add(positionLocal.y.mul(5.0)).add(float(phaseOffset))).mul(0.005)),
    );

    mat.roughness = 0.35;
    mat.metalness = 0.4;

    return mat;
  }, [phaseOffset]);

  useEffect(() => {
    if (!meshRef.current) return;
    const bones = createBones();
    bonesRef.current = bones;

    const skeleton = new THREE.Skeleton(bones);
    meshRef.current.add(bones[0]);
    meshRef.current.bind(skeleton);
  }, []);

  // Animate bones with sine wave propagation
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const bones = bonesRef.current;
    if (bones.length === 0) return;

    for (let i = 1; i < bones.length; i++) {
      const progress = i / bones.length;
      const phase = progress * Math.PI * 2.5;
      // Amplitude increases toward tip for whip-like motion
      const amplitude = 0.08 + progress * 0.15;
      const waveX = Math.sin(t * 2.0 + phase + phaseOffset) * amplitude;
      const waveZ = Math.cos(t * 1.6 + phase * 0.8 + phaseOffset * 1.3) * amplitude * 0.7;
      bones[i].rotation.x = waveX;
      bones[i].rotation.z = waveZ;
    }
  });

  // Position tentacle radiating outward from center, tilted outward like jellyfish
  const px = Math.cos(angle) * 0.3;
  const pz = Math.sin(angle) * 0.3;
  // Tilt strongly outward from center — tentacles droop down and outward
  const tiltX = Math.sin(angle) * 1.2;
  const tiltZ = -Math.cos(angle) * 1.2;

  return (
    <skinnedMesh
      ref={meshRef}
      geometry={geometry}
      material={material}
      position={[px, 0, pz]}
      rotation={[tiltX, 0, tiltZ]}
      frustumCulled={false}
    />
  );
}

function CentralHub() {
  const meshRef = useRef<THREE.Mesh>(null);

  const material = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();

    // Pulsing core color
    const pulse = oscSine(time.mul(0.8));
    mat.colorNode = mix(color(0x551188), color(0x8833cc), pulse);

    // Strong emissive glow
    const fresnel = Fn(() => {
      const viewDir = cameraPosition.sub(positionWorld).normalize();
      const nDotV = normalWorld.dot(viewDir).saturate();
      return float(1.0).sub(nDotV).pow(2.0);
    });
    mat.emissiveNode = mix(
      vec3(0.4, 0.1, 0.8),
      vec3(1.0, 0.3, 0.6),
      fresnel(),
    ).mul(2.0);

    // Gentle vertex breathing
    mat.positionNode = positionLocal.add(
      normalLocal.mul(oscSine(time.mul(1.0).add(positionLocal.y.mul(3.0))).mul(0.02)),
    );

    mat.roughness = 0.2;
    mat.metalness = 0.6;
    return mat;
  }, []);

  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.3;
    }
  });

  return (
    <mesh ref={meshRef} material={material} position={[0, 0.2, 0]}>
      <icosahedronGeometry args={[0.45, 3]} />
    </mesh>
  );
}

export default function SkeletalWave() {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.2;
    }
  });

  const tentacles = useMemo(() => {
    const items = [];
    for (let i = 0; i < TENTACLE_COUNT; i++) {
      const angle = (i / TENTACLE_COUNT) * Math.PI * 2;
      const phaseOffset = (i / TENTACLE_COUNT) * Math.PI * 2;
      items.push(
        <Tentacle key={i} angle={angle} phaseOffset={phaseOffset} />,
      );
    }
    return items;
  }, []);

  return (
    <>

      <fogExp2 attach="fog" args={["#030306", 0.03]} />
      {/* Background atmosphere */}
      <mesh>
        <sphereGeometry args={[30, 16, 16]} />
        <meshBasicMaterial side={THREE.BackSide} color="#020408" />
      </mesh>

      <ambientLight intensity={0.15} />
      <hemisphereLight args={['#334466', '#111122', 0.3]} />
      <directionalLight position={[4, 6, 3]} intensity={0.8} />
      <pointLight position={[0, 0.5, 0]} intensity={5.0} color="#bb44ff" distance={10} />
      <pointLight position={[0, -2, 0]} intensity={3.0} color="#22ccff" distance={8} />
      <pointLight position={[2, 0, 2]} intensity={3.0} color="#ff4488" distance={8} />
      <pointLight position={[-2, 1, -1]} intensity={2.0} color="#44ff88" distance={8} />

      <group ref={groupRef}>
        <CentralHub />
        {tentacles}
      </group>
    </>
  );
}
