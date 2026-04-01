import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Float } from '@react-three/drei';
import * as THREE from 'three/webgpu';
import {
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
} from 'three/tsl';

/**
 * Float Island — Dreamy floating terrain scene with drei's Float wrapper
 *
 * Features:
 * - Entire island wrapped in <Float speed={1.5} rotationIntensity={0.2}>
 * - Island terrain: displaced icosahedron with biome split (green top / brown bottom)
 * - 30 cone trees instanced on top surface
 * - Water plane below the island
 * - Cloud wisps: BackSide shells with hash-based opacity variation
 * - Waterfall effect: animated point stream falling from island edge
 * - Warm dreamy atmosphere: peach sky, soft golden light
 * - Studio Ghibli aesthetic: soft, whimsical, magical
 */

function makeTerrainMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();

  // Biome split: green on top (y > 0), brown/rock on sides and bottom
  const biome = Fn(() => {
    const up = normalWorld.y.mul(0.5).add(0.5);
    const grassGreen = vec3(0.25, 0.65, 0.2);
    const earthBrown = vec3(0.5, 0.35, 0.18);
    const rockGray = vec3(0.4, 0.38, 0.36);
    // y position of vertex: above waterline = grass, else rock/earth
    const yNorm = positionLocal.y.add(0.3).div(0.6).saturate();
    const surfaceColor = mix(earthBrown, mix(rockGray, grassGreen, up), yNorm);
    return surfaceColor;
  });

  mat.colorNode = biome();

  // Subtle pulsing life in the vegetation
  const pulse = oscSine(time.mul(0.5)).mul(0.05).add(0.95);
  mat.emissiveNode = biome().mul(pulse.mul(0.3));

  mat.roughness = 0.9;
  mat.metalness = 0.0;
  return mat;
}

function makeWaterMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;

  // Animated water: ripple via time-based color
  const wave = oscSine(time.mul(1.2)).mul(0.05).add(0.95);
  mat.colorNode = vec3(0.15, 0.6, 0.8).mul(wave);
  mat.emissiveNode = vec3(0.05, 0.25, 0.4).mul(wave.mul(0.6));
  mat.opacityNode = float(0.75);

  const fresnel = Fn(() => {
    const viewDir = cameraPosition.sub(positionWorld).normalize();
    const nDotV = normalWorld.dot(viewDir).saturate();
    return float(1.0).sub(nDotV).pow(4.0);
  });

  mat.emissiveNode = vec3(0.3, 0.7, 1.0).mul(fresnel().mul(1.0)).add(
    vec3(0.05, 0.25, 0.4).mul(wave.mul(0.5))
  );

  mat.roughness = 0.1;
  mat.metalness = 0.3;
  return mat;
}

function makeTreeMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();
  // Stylized tree green with variation via instanceIndex hash
  mat.colorNode = vec3(0.18, 0.55, 0.18);
  mat.emissiveNode = vec3(0.05, 0.2, 0.05);
  mat.roughness = 0.85;
  mat.metalness = 0.0;
  return mat;
}

function makeTreeTrunkMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.colorNode = vec3(0.4, 0.26, 0.1);
  mat.roughness = 0.95;
  mat.metalness = 0.0;
  return mat;
}

function makeCloudMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;
  mat.side = THREE.BackSide;
  mat.depthWrite = false;

  const fresnel = Fn(() => {
    const viewDir = cameraPosition.sub(positionWorld).normalize();
    const nDotV = normalWorld.dot(viewDir).saturate();
    return float(1.0).sub(nDotV).pow(1.5);
  });

  mat.colorNode = vec3(1.0, 0.97, 0.95);
  mat.emissiveNode = vec3(0.9, 0.87, 0.85).mul(0.3);
  mat.opacityNode = fresnel().mul(0.35);
  mat.roughness = 1.0;
  return mat;
}

function makeSkyMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.side = THREE.BackSide;

  const gradient = Fn(() => {
    const up = normalWorld.y.mul(0.5).add(0.5);
    const peach = vec3(1.0, 0.75, 0.6);
    const lavender = vec3(0.7, 0.6, 0.9);
    const deepBlue = vec3(0.3, 0.4, 0.8);
    const t1 = up.saturate();
    return mix(mix(peach, lavender, t1), deepBlue, t1.mul(t1));
  });

  mat.colorNode = gradient();
  mat.emissiveNode = gradient().mul(0.5);
  mat.roughness = 1.0;
  return mat;
}

/** Island terrain with displaced icosahedron */
function IslandTerrain() {
  const mat = useMemo(() => makeTerrainMaterial(), []);

  const geometry = useMemo(() => {
    const geo = new THREE.IcosahedronGeometry(1.2, 4);
    const pos = geo.attributes.position;
    const arr = pos.array as Float32Array;

    // Flatten bottom, bulge top, irregular sides
    for (let i = 0; i < pos.count; i++) {
      const x = arr[i * 3];
      const y = arr[i * 3 + 1];
      const z = arr[i * 3 + 2];

      // Flatten below the equator
      const yFlat = Math.max(y, y * 0.4 - 0.6);

      // Add terrain noise
      const noise = Math.sin(x * 4.2 + z * 3.7) * 0.08
        + Math.sin(x * 7.1 - z * 6.3) * 0.04
        + Math.cos(x * 2.0 + y * 3.0 + z * 1.5) * 0.06;

      arr[i * 3 + 1] = yFlat + noise;
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    return geo;
  }, []);

  return (
    <mesh geometry={geometry} material={mat} />
  );
}

/** 30 Instanced cone trees */
function Trees() {
  const treeMat = useMemo(() => makeTreeMaterial(), []);
  const trunkMat = useMemo(() => makeTreeTrunkMaterial(), []);
  const treeCount = 28;

  const { treeMatrices, trunkMatrices } = useMemo(() => {
    const treeMs: THREE.Matrix4[] = [];
    const trunkMs: THREE.Matrix4[] = [];

    let placed = 0;
    let attempts = 0;

    while (placed < treeCount && attempts < 500) {
      attempts++;
      const angle = Math.random() * Math.PI * 2;
      const r = Math.random() * 0.7 + 0.1;
      const tx = Math.cos(angle) * r;
      const tz = Math.sin(angle) * r;

      // Sample terrain height at this position (approximate)
      const ty = Math.sin(tx * 4.2 + tz * 3.7) * 0.08
        + Math.sin(tx * 7.1 - tz * 6.3) * 0.04
        + 0.5 + Math.random() * 0.2;

      if (ty < 0.4) continue; // skip water areas

      const scale = 0.12 + Math.random() * 0.1;
      const m = new THREE.Matrix4();
      m.makeRotationY(Math.random() * Math.PI * 2);
      m.setPosition(tx, ty, tz);
      m.scale(new THREE.Vector3(scale, scale + Math.random() * 0.05, scale));
      treeMs.push(m);

      // Trunk slightly below
      const tm = new THREE.Matrix4();
      tm.makeRotationY(0);
      tm.setPosition(tx, ty - 0.08, tz);
      tm.scale(new THREE.Vector3(scale * 0.3, scale * 0.5, scale * 0.3));
      trunkMs.push(tm);

      placed++;
    }

    return { treeMatrices: treeMs, trunkMatrices: trunkMs };
  }, []);

  const treeRef = useRef<THREE.InstancedMesh>(null);
  const trunkRef = useRef<THREE.InstancedMesh>(null);

  useMemo(() => {
    treeMatrices.forEach((m, i) => treeRef.current?.setMatrixAt(i, m));
    trunkMatrices.forEach((m, i) => trunkRef.current?.setMatrixAt(i, m));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <instancedMesh
        ref={treeRef}
        args={[undefined, undefined, treeCount]}
        material={treeMat}
        frustumCulled={false}
      >
        <coneGeometry args={[1, 2, 8]} />
      </instancedMesh>
      <instancedMesh
        ref={trunkRef}
        args={[undefined, undefined, treeCount]}
        material={trunkMat}
        frustumCulled={false}
      >
        <cylinderGeometry args={[0.5, 0.6, 2, 6]} />
      </instancedMesh>
    </>
  );
}

// Module-scope cloud data to avoid Math.random() in useMemo
const CLOUD_DATA = Array.from({ length: 8 }, (_, i) => {
  const angle = (i / 8) * Math.PI * 2;
  const r = 1.8 + Math.random() * 0.5;
  return {
    x: Math.cos(angle) * r,
    y: -0.1 + Math.random() * 0.4,
    z: Math.sin(angle) * r,
    scale: 0.35 + Math.random() * 0.25,
    phase: i * 0.785,
  };
});

/** Cloud wisps floating around the island */
function Clouds() {
  const cloudMat = useMemo(() => makeCloudMaterial(), []);

  const cloudData = useMemo(() => CLOUD_DATA, []);

  return (
    <>
      {cloudData.map((c, i) => (
        <mesh key={i} material={cloudMat} position={[c.x, c.y, c.z]} scale={[c.scale, c.scale * 0.6, c.scale]}>
          <sphereGeometry args={[1, 12, 12]} />
        </mesh>
      ))}
    </>
  );
}

/** Waterfall particle stream */
function Waterfall() {
  const count = 40;
  const ref = useRef<THREE.InstancedMesh>(null);

  const mat = useMemo(() => {
    const m = new THREE.MeshStandardNodeMaterial();
    m.transparent = true;
    m.colorNode = vec3(0.5, 0.8, 1.0);
    m.emissiveNode = vec3(0.2, 0.5, 0.8).mul(0.8);
    m.opacityNode = float(0.7);
    m.roughness = 0.1;
    return m;
  }, []);

  const startPos = useMemo(() => new THREE.Vector3(1.0, 0.5, 0.3), []);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame(() => {
    if (!ref.current) return;
    const t = Date.now() * 0.001;

    for (let i = 0; i < count; i++) {
      const progress = ((i / count + t * 0.5) % 1.0);
      dummy.position.set(
        startPos.x + Math.sin(progress * 3 + i * 0.5) * 0.05,
        startPos.y - progress * 1.4,
        startPos.z + Math.cos(progress * 2 + i * 0.3) * 0.05
      );
      const s = 0.015 + (1 - progress) * 0.025;
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      ref.current.setMatrixAt(i, dummy.matrix);
    }
    ref.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={ref} args={[undefined, mat, count]} frustumCulled={false}>
      <sphereGeometry args={[1, 6, 6]} />
    </instancedMesh>
  );
}

export default function FloatIsland() {
  const waterMat = useMemo(() => makeWaterMaterial(), []);
  const skyMat = useMemo(() => makeSkyMaterial(), []);

  return (
    <>
      <ambientLight intensity={0.4} />
      <hemisphereLight args={['#334466', '#111122', 0.3]} />
      {/* Warm sun */}
      <directionalLight position={[5, 8, 3]} intensity={1.8} color={0xffe8c0} />
      {/* Cool sky fill */}
      <directionalLight position={[-3, 4, -4]} intensity={0.5} color={0xaaddff} />

      {/* Sky dome */}
      <mesh material={skyMat}>
        <sphereGeometry args={[25, 32, 32]} />
      </mesh>

      {/* Water plane beneath the island */}
      <mesh material={waterMat} position={[0, -0.8, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[20, 20, 8, 8]} />
      </mesh>

      {/* The floating island group */}
      <Float
        speed={1.5}
        rotationIntensity={0.2}
        floatIntensity={0.4}
        floatingRange={[-0.1, 0.1]}
      >
        <group position={[0, 0.5, 0]}>
          <IslandTerrain />
          <Trees />
          <Clouds />
          <Waterfall />
        </group>
      </Float>

      {/* Distant cloud wisps at sky level */}
      {Array.from({ length: 5 }, (_, i) => {
        const angle = (i / 5) * Math.PI * 2;
        const r = 8;
        return (
          <mesh
            key={`far-cloud-${i}`}
            position={[Math.cos(angle) * r, 2 + Math.sin(i * 1.3) * 0.5, Math.sin(angle) * r]}
            scale={[1.5, 0.6, 1.0]}
          >
            <sphereGeometry args={[1, 10, 10]} />
            <meshStandardMaterial color={0xfff8f5} transparent opacity={0.5} />
          </mesh>
        );
      })}
    </>
  );
}
