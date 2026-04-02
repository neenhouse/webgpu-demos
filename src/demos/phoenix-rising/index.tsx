/* eslint-disable react-hooks/purity */
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
  hash,
  smoothstep,
  mix,
  sin,
} from 'three/tsl';

/**
 * Phoenix Rising — Flaming bird emerging from ashes with particle trails
 *
 * Combines 5 proven techniques:
 * - Skeletal animation for wing flapping (bone chains — proven in skeletal-wave)
 * - Instanced particle fire (1500+ — proven in sprite-sparks)
 * - Bloom halo shells for fire glow (proven)
 * - Hash noise for flame flickering on body (proven in flame-orb patterns)
 * - Dissolve effect for "emerging from ashes" (alphaTest + opacityNode — proven in noise-dissolve)
 *
 * requiresWebGPU: false
 */

const BONE_COUNT = 5;
const SEGMENT_HEIGHT = 0.28;
const FIRE_PARTICLE_COUNT = 1500;
const ASH_PARTICLE_COUNT = 300;

// ─── Wing bone chain ───

function createWingGeometry(side: 'left' | 'right'): THREE.BufferGeometry {
  const totalLength = BONE_COUNT * SEGMENT_HEIGHT;
  // Flat wing shape: wide at base, narrow at tip
  const geo = new THREE.BoxGeometry(
    0.02,          // thin depth
    totalLength,   // length along bone chain
    0.4,           // width
    1,             // widthSegments
    BONE_COUNT * 3, // heightSegments for smooth bending
    4,             // depthSegments
  );

  // Taper: scale vertices based on Y position (narrower at tip)
  const posAttr = geo.getAttribute('position');
  for (let i = 0; i < posAttr.count; i++) {
    const y = posAttr.getY(i);
    const normalizedY = (y + totalLength / 2) / totalLength; // 0 at base, 1 at tip
    const taper = 1.0 - normalizedY * 0.7; // 1.0 at base, 0.3 at tip
    posAttr.setZ(i, posAttr.getZ(i) * taper);
  }
  posAttr.needsUpdate = true;

  // Shift so base is at y=0
  geo.translate(0, totalLength / 2, 0);

  // Mirror for left wing
  if (side === 'left') {
    for (let i = 0; i < posAttr.count; i++) {
      posAttr.setZ(i, -posAttr.getZ(i));
    }
    posAttr.needsUpdate = true;
  }

  return geo;
}

function createWingSkinData(geometry: THREE.BufferGeometry) {
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

  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
}

function createWingBones(): THREE.Bone[] {
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

/** Wing dissolve+fire material */
function makeWingMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.side = THREE.DoubleSide;
  mat.transparent = true;
  mat.alphaTest = 0.5;

  // Hash noise for dissolve
  const noise1 = hash(positionLocal.mul(18));
  const noise2 = hash(positionLocal.mul(47));
  const noise = noise1.mul(0.6).add(noise2.mul(0.4));

  // Animated dissolve threshold — partial dissolve cycling
  const threshold = oscSine(time.mul(0.15)).mul(0.2).add(0.45);

  // Alpha
  const alpha = smoothstep(threshold.sub(0.02), threshold.add(0.02), noise);
  mat.opacityNode = alpha;

  // Edge glow: 3-stop (dark red -> orange -> white)
  const edge = smoothstep(threshold, threshold.add(0.12), noise);
  const edgeGlow = float(1.0).sub(edge);

  const darkRed = color(0x660000);
  const hotOrange = color(0xff6600);
  const whiteHot = color(0xffeedd);

  const edgeColor = mix(mix(darkRed, hotOrange, smoothstep(0.0, 0.5, edgeGlow)), whiteHot, smoothstep(0.5, 1.0, edgeGlow));

  // Base body color: deep crimson
  const bodyColor = color(0x881100);
  mat.colorNode = mix(bodyColor, edgeColor, edgeGlow.pow(0.5));

  // Fresnel rim
  const fresnel = Fn(() => {
    const viewDir = cameraPosition.sub(positionWorld).normalize();
    const nDotV = normalWorld.dot(viewDir).saturate();
    return float(1.0).sub(nDotV).pow(2.5);
  });

  // Emissive: bright ember on dissolved edges, 3x on exposed areas
  const rimEmissive = color(0xff4400).mul(fresnel()).mul(0.8);
  const edgeEmissive = edgeColor.mul(edgeGlow.mul(3.0));
  mat.emissiveNode = rimEmissive.add(edgeEmissive);

  mat.roughness = 0.6;
  mat.metalness = 0.1;

  return mat;
}

function Wing({ side, phaseOffset }: { side: 'left' | 'right'; phaseOffset: number }) {
  const meshRef = useRef<THREE.SkinnedMesh>(null);
  const bonesRef = useRef<THREE.Bone[]>([]);

  const geometry = useMemo(() => {
    const geo = createWingGeometry(side);
    createWingSkinData(geo);
    return geo;
  }, [side]);

  const material = useMemo(() => makeWingMaterial(), []);

  useEffect(() => {
    if (!meshRef.current) return;
    const bones = createWingBones();
    bonesRef.current = bones;
    const skeleton = new THREE.Skeleton(bones);
    meshRef.current.add(bones[0]);
    meshRef.current.bind(skeleton);
  }, []);

  // Animate wing flap: sine-wave, amplitude 0.3 rad, speed 1.5
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const bones = bonesRef.current;
    if (bones.length === 0) return;

    const direction = side === 'right' ? 1 : -1;

    for (let i = 1; i < bones.length; i++) {
      const progress = i / bones.length;
      const phase = progress * Math.PI * 1.5;
      // Wing flap amplitude: 0.3 rad as specified, increasing toward tip
      const amplitude = 0.15 + progress * 0.15;
      const flapAngle = Math.sin(t * 1.5 + phase + phaseOffset) * amplitude;
      bones[i].rotation.z = flapAngle * direction;
      // Subtle forward-back motion
      bones[i].rotation.x = Math.sin(t * 1.5 + phase + phaseOffset + Math.PI * 0.3) * amplitude * 0.3;
    }
  });

  // Position: wings extend sideways from body
  const zOffset = side === 'right' ? 0.25 : -0.25;
  const tiltZ = side === 'right' ? -0.3 : 0.3;

  return (
    <skinnedMesh
      ref={meshRef}
      geometry={geometry}
      material={material}
      position={[0, 0.3, zOffset]}
      rotation={[0, 0, tiltZ]}
      frustumCulled={false}
    />
  );
}

// ─── Phoenix body ───

function PhoenixBody() {
  const meshRef = useRef<THREE.Mesh>(null);

  const material = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.side = THREE.DoubleSide;
    mat.transparent = true;
    mat.alphaTest = 0.5;

    // Hash noise dissolve (body appears to be on fire)
    const noise1 = hash(positionLocal.mul(20));
    const noise2 = hash(positionLocal.mul(55));
    const noise3 = hash(positionLocal.mul(120));
    const noise = noise1.mul(0.5).add(noise2.mul(0.3)).add(noise3.mul(0.2));

    // Slowly cycling threshold — body is perpetually partially dissolved
    const threshold = oscSine(time.mul(0.12)).mul(0.15).add(0.42);

    const alpha = smoothstep(threshold.sub(0.02), threshold.add(0.02), noise);
    mat.opacityNode = alpha;

    // 3-stop edge glow: dark red -> orange -> white-hot
    const edge = smoothstep(threshold, threshold.add(0.1), noise);
    const edgeGlow = float(1.0).sub(edge);

    const darkRed = color(0x660000);
    const hotOrange = color(0xff6600);
    const whiteHot = color(0xffeedd);
    const edgeColor = mix(
      mix(darkRed, hotOrange, smoothstep(0.0, 0.5, edgeGlow)),
      whiteHot,
      smoothstep(0.5, 1.0, edgeGlow),
    );

    // Deep red body
    const bodyColor = color(0x991100);
    mat.colorNode = mix(bodyColor, edgeColor, edgeGlow.pow(0.5));

    // Flame flicker on body surface (hash noise displacement like flame-orb)
    const flicker = Fn(() => {
      const t = time.mul(3.0);
      const px = positionLocal.x;
      const py = positionLocal.y;
      const pz = positionLocal.z;

      const wave1 = px.mul(4.0).add(py.mul(3.0)).add(t.mul(1.5)).sin()
        .mul(py.mul(3.0).add(pz.mul(2.0)).add(t.mul(0.8)).sin())
        .mul(0.06);

      const upBias = py.add(0.5).mul(0.7).clamp(0.0, 1.0);
      const wave2 = py.mul(5.0).add(t.mul(2.5)).sin()
        .mul(px.mul(3.0).add(t.mul(1.5)).sin())
        .mul(0.04).mul(upBias);

      return wave1.add(wave2);
    });
    mat.positionNode = positionLocal.add(normalLocal.mul(flicker()));

    // Fresnel
    const fresnel = Fn(() => {
      const viewDir = cameraPosition.sub(positionWorld).normalize();
      const nDotV = normalWorld.dot(viewDir).saturate();
      return float(1.0).sub(nDotV).pow(2.0);
    });

    // Emissive: 3x on exposed ember areas + orange fresnel rim
    const rimEmissive = color(0xff4400).mul(fresnel()).mul(1.2);
    const edgeEmissive = edgeColor.mul(edgeGlow.mul(3.0));
    mat.emissiveNode = rimEmissive.add(edgeEmissive);

    mat.roughness = 0.7;
    mat.metalness = 0.0;

    return mat;
  }, []);

  useFrame(() => {
    if (meshRef.current) {
      // Gentle body sway
      meshRef.current.rotation.z = Math.sin(Date.now() * 0.001) * 0.05;
    }
  });

  return (
    <group>
      {/* Elongated ellipsoid body */}
      <mesh ref={meshRef} material={material} scale={[0.35, 0.6, 0.35]}>
        <icosahedronGeometry args={[1, 4]} />
      </mesh>
      {/* Cone head */}
      <PhoenixHead />
    </group>
  );
}

function PhoenixHead() {
  const material = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();

    // Flame flicker on head
    const flicker = Fn(() => {
      const t = time.mul(3.5);
      const px = positionLocal.x;
      const py = positionLocal.y;
      const wave = px.mul(5.0).add(py.mul(4.0)).add(t).sin()
        .mul(0.04);
      return wave;
    });
    mat.positionNode = positionLocal.add(normalLocal.mul(flicker()));

    // Deep red-orange
    const blend = oscSine(time.mul(0.5)).mul(0.3).add(0.5);
    mat.colorNode = mix(color(0x991100), color(0xcc3300), blend);

    // Fresnel
    const fresnel = Fn(() => {
      const viewDir = cameraPosition.sub(positionWorld).normalize();
      const nDotV = normalWorld.dot(viewDir).saturate();
      return float(1.0).sub(nDotV).pow(2.0);
    });
    mat.emissiveNode = color(0xff4400).mul(fresnel().mul(2.0).add(0.5));

    mat.roughness = 0.5;
    mat.metalness = 0.0;

    return mat;
  }, []);

  return (
    <group position={[0, 0.65, 0]}>
      {/* Head sphere */}
      <mesh material={material} scale={[0.18, 0.2, 0.18]}>
        <icosahedronGeometry args={[1, 3]} />
      </mesh>
      {/* Beak */}
      <Beak />
    </group>
  );
}

function Beak() {
  const material = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.colorNode = color(0xffaa00);
    mat.emissiveNode = color(0xff6600).mul(1.5);
    mat.roughness = 0.4;
    mat.metalness = 0.2;
    return mat;
  }, []);

  return (
    <mesh material={material} position={[0.22, 0, 0]} rotation={[0, 0, -Math.PI / 4]} scale={[0.15, 0.05, 0.05]}>
      <coneGeometry args={[1, 2, 4]} />
    </mesh>
  );
}

// ─── Fire particles trailing behind ───

function FireParticles() {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  const matrices = useMemo(() => {
    const dummy = new THREE.Object3D();
    const result: THREE.Matrix4[] = [];

    for (let i = 0; i < FIRE_PARTICLE_COUNT; i++) {
      const t = i / FIRE_PARTICLE_COUNT;

      // Particles concentrated around wing tips and tail, spreading behind
      const spread = 0.3 + t * 1.5;
      const angle = Math.random() * Math.PI * 2;
      const r = Math.random() * spread;

      // Y distribution: mostly around body level, trailing downward
      const y = (Math.random() - 0.3) * 2.0 - t * 1.5;
      // X: trailing behind (negative x)
      const x = -Math.random() * t * 2.5 + Math.cos(angle) * r * 0.3;
      const z = Math.sin(angle) * r;

      const scale = 0.02 + Math.random() * 0.04;
      dummy.position.set(x, y, z);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      result.push(dummy.matrix.clone());
    }
    return result;
  }, []);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    for (let i = 0; i < matrices.length; i++) {
      mesh.setMatrixAt(i, matrices[i]);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [matrices]);

  const material = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();

    // Height-based fire gradient: yellow top, orange mid, red bottom
    const heightNorm = positionWorld.y.add(2.0).div(4.0).clamp(0.0, 1.0);

    const redBottom = color(0xcc2200);
    const orangeMid = color(0xff6600);
    const yellowTop = color(0xffdd22);

    const lowerMix = mix(redBottom, orangeMid, smoothstep(0.0, 0.4, heightNorm));
    const fullColor = mix(lowerMix, yellowTop, smoothstep(0.3, 1.0, heightNorm));
    mat.colorNode = fullColor;

    // Per-particle flicker via hash
    const seed = hash(positionWorld.x.mul(31.3).add(positionWorld.z.mul(77.7)));
    const flicker = oscSine(time.mul(3.0).add(seed.mul(6.283))).mul(0.4).add(0.6);

    // Strong emissive
    mat.emissiveNode = fullColor.mul(flicker.mul(2.5));

    // Vertex breathing
    mat.positionNode = positionLocal.add(
      normalLocal.mul(sin(time.mul(4.0).add(positionLocal.y.mul(6.0))).mul(0.015)),
    );

    mat.roughness = 0.3;
    mat.metalness = 0.0;

    return mat;
  }, []);

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, FIRE_PARTICLE_COUNT]}
      material={material}
      frustumCulled={false}
    >
      <icosahedronGeometry args={[1, 1]} />
    </instancedMesh>
  );
}

// ─── Ash particles (grey, falling slowly) ───

function AshParticles() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dataRef = useRef<{ positions: THREE.Vector3[]; velocities: THREE.Vector3[] }>({ positions: [], velocities: [] });

  const matrices = useMemo(() => {
    const dummy = new THREE.Object3D();
    const result: THREE.Matrix4[] = [];
    const positions: THREE.Vector3[] = [];
    const velocities: THREE.Vector3[] = [];

    for (let i = 0; i < ASH_PARTICLE_COUNT; i++) {
      const x = (Math.random() - 0.5) * 3.0;
      const y = -0.5 - Math.random() * 2.5;
      const z = (Math.random() - 0.5) * 2.0;

      const pos = new THREE.Vector3(x, y, z);
      positions.push(pos);
      velocities.push(new THREE.Vector3(
        (Math.random() - 0.5) * 0.1,
        -0.2 - Math.random() * 0.3, // falling
        (Math.random() - 0.5) * 0.1,
      ));

      dummy.position.copy(pos);
      dummy.scale.setScalar(0.015 + Math.random() * 0.02);
      dummy.updateMatrix();
      result.push(dummy.matrix.clone());
    }

    dataRef.current = { positions, velocities };
    return result;
  }, []);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    for (let i = 0; i < matrices.length; i++) {
      mesh.setMatrixAt(i, matrices[i]);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [matrices]);

  const material = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.transparent = true;
    // Grey ash
    mat.colorNode = color(0x444444);
    mat.opacityNode = float(0.3);
    mat.emissiveNode = color(0x221100).mul(0.3);
    mat.roughness = 0.9;
    mat.metalness = 0.0;
    return mat;
  }, []);

  const dummy = useMemo(() => new THREE.Object3D(), []);

  // Animate ash falling
  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const dt = Math.min(delta, 0.03);
    const { positions, velocities } = dataRef.current;

    for (let i = 0; i < ASH_PARTICLE_COUNT; i++) {
      positions[i].addScaledVector(velocities[i], dt);
      // Gentle drift
      positions[i].x += Math.sin(Date.now() * 0.001 + i) * 0.002;

      // Recycle ash that falls below -3
      if (positions[i].y < -3) {
        positions[i].set(
          (Math.random() - 0.5) * 2.5,
          0.5 + Math.random() * 0.5,
          (Math.random() - 0.5) * 1.5,
        );
      }

      dummy.position.copy(positions[i]);
      dummy.scale.setScalar(0.015 + (i % 10) * 0.002);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, ASH_PARTICLE_COUNT]}
      material={material}
      frustumCulled={false}
    >
      <icosahedronGeometry args={[1, 1]} />
    </instancedMesh>
  );
}

// ─── Bloom halo shells around the bird ───

function FireHalo() {
  const haloMats = useMemo(() => {
    return [0, 1, 2].map((layer) => {
      const mat = new THREE.MeshStandardNodeMaterial();
      mat.transparent = true;
      mat.side = THREE.BackSide;
      mat.depthWrite = false;
      mat.blending = THREE.AdditiveBlending;

      const layerFade = float(1.0).sub(float(layer).mul(0.25));
      const pulse = oscSine(time.mul(0.8).add(float(layer).mul(1.0))).mul(0.2).add(0.8);

      const fresnel = Fn(() => {
        const viewDir = cameraPosition.sub(positionWorld).normalize();
        const nDotV = normalWorld.dot(viewDir).saturate();
        return float(1.0).sub(nDotV).pow(float(1.5).add(float(layer).mul(0.5)));
      });

      // Warm fire glow color
      const warmColor = mix(
        color(0xff4400),
        color(0xff8800),
        float(layer).div(2.0),
      );
      mat.opacityNode = fresnel().mul(pulse).mul(layerFade).mul(0.35);
      mat.colorNode = warmColor;
      mat.emissiveNode = warmColor.mul(fresnel().mul(pulse).mul(layerFade).mul(2.5));

      mat.roughness = 0.0;
      mat.metalness = 0.0;

      return mat;
    });
  }, []);

  const scales: [number, number, number][] = [[1.4, 1.6, 1.4], [1.8, 2.0, 1.8], [2.3, 2.6, 2.3]];

  return (
    <group position={[0, 0.2, 0]}>
      {haloMats.map((mat, i) => (
        <mesh key={i} material={mat} scale={scales[i]}>
          <icosahedronGeometry args={[0.5, 3]} />
        </mesh>
      ))}
    </group>
  );
}

// ─── Main component ───

export default function PhoenixRising() {
  const groupRef = useRef<THREE.Group>(null);

  // Slow rotation + gentle bob
  useFrame((state, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.15;
      groupRef.current.position.y = Math.sin(state.clock.elapsedTime * 0.8) * 0.15;
    }
  });

  return (
    <>

      <fogExp2 attach="fog" color="#080402" density={0.04} />
      <ambientLight intensity={0.1} />
      <hemisphereLight args={['#443322', '#221111', 0.3]} />
      <directionalLight position={[3, 5, 3]} intensity={0.4} color={0xffaa66} />

      {/* Fire lighting */}
      <pointLight position={[0, 0, 0]} intensity={6.0} color="#ff4400" distance={10} />
      <pointLight position={[0, 1.5, 0]} intensity={4.0} color="#ffaa00" distance={8} />
      <pointLight position={[-2, -1, 0]} intensity={3.0} color="#ff2200" distance={8} />
      <pointLight position={[1, 0, 2]} intensity={2.0} color="#ffcc44" distance={8} />

      <group ref={groupRef}>
        {/* Phoenix body with dissolve fire */}
        <PhoenixBody />

        {/* Wings with bone animation and dissolve */}
        <Wing side="right" phaseOffset={0} />
        <Wing side="left" phaseOffset={Math.PI * 0.1} />

        {/* Fire particle trail */}
        <FireParticles />

        {/* Ash particles falling below */}
        <AshParticles />

        {/* Bloom halo shells */}
        <FireHalo />
      </group>
    </>
  );
}
