/* eslint-disable react-hooks/purity */
import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
  color,
  time,
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
  oscSine,
  vec3,
} from 'three/tsl';

/**
 * Crystal Cavern — Underground cave with growing crystals and light refraction
 *
 * Combines 5 proven techniques:
 * 1. Multi-material composition (separate meshes in group)
 * 2. Bloom halo shells for crystal inner glow
 * 3. Hash noise for cave wall displacement
 * 4. Instanced mesh for crystal clusters
 * 5. Fresnel for crystal surface refraction look
 *
 * BackSide rendering on cave shell for interior view.
 * Per-crystal hash for 4-color palette (amethyst, emerald, sapphire, ruby).
 * Point lights matching crystal colors illuminate cave walls.
 */

const CRYSTAL_COUNT = 80;
const STALACTITE_COUNT = 40;

/** Creates the cave wall material (BackSide) with hash noise displacement */
function makeCaveWallMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.side = THREE.BackSide; // View interior

  // Hash noise for rocky displacement
  const displacement = Fn(() => {
    const p = positionLocal;
    const n1 = hash(p.mul(3.0));
    const n2 = hash(p.mul(7.5));
    const n3 = hash(p.mul(15.0));
    const noiseVal = n1.mul(0.5).add(n2.mul(0.3)).add(n3.mul(0.2));
    // Displace inward (BackSide means normals point inward to camera)
    return positionLocal.add(normalLocal.mul(noiseVal.mul(0.6).sub(0.15)));
  });
  mat.positionNode = displacement();

  // Cave wall coloring: dark rock with subtle warm/cool variation
  const colorFn = Fn(() => {
    const p = positionWorld;
    const n = hash(p.mul(2.0));
    const darkRock = color(0x1a1511);
    const warmRock = color(0x2a1f18);
    const coolRock = color(0x151a1f);
    const base = mix(darkRock, warmRock, smoothstep(0.3, 0.7, n));
    return mix(base, coolRock, smoothstep(0.5, 0.9, hash(p.mul(4.3))));
  });
  mat.colorNode = colorFn();

  mat.roughness = 0.95;
  mat.metalness = 0.05;

  return mat;
}

/** Creates a crystal material with fresnel refraction look and inner glow */
function makeCrystalMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;
  mat.opacity = 0.88;

  // Per-crystal color from 4-palette based on world position hash
  const crystalSeed = hash(positionWorld.x.mul(7.3).add(positionWorld.z.mul(13.7)));
  const colorIdx = crystalSeed.mul(4.0).floor();

  // 4-stop palette selection via chained mix/smoothstep
  const amethyst = vec3(0.6, 0.27, 0.8);
  const emerald = vec3(0.13, 0.8, 0.4);
  const sapphire = vec3(0.13, 0.4, 0.87);
  const ruby = vec3(0.8, 0.13, 0.27);

  const c1 = mix(amethyst, emerald, smoothstep(0.5, 1.5, colorIdx));
  const c2 = mix(c1, sapphire, smoothstep(1.5, 2.5, colorIdx));
  const crystalColor = mix(c2, ruby, smoothstep(2.5, 3.5, colorIdx));

  mat.colorNode = vec3(crystalColor.x, crystalColor.y, crystalColor.z);

  // Fresnel for glass-like surface refraction
  const fresnel = Fn(() => {
    const viewDir = cameraPosition.sub(positionWorld).normalize();
    const nDotV = normalWorld.dot(viewDir).saturate();
    return float(1.0).sub(nDotV).pow(1.5);
  });

  const fresnelVal = fresnel();

  // Strong emissive with fresnel rim and pulse
  const pulse = oscSine(time.mul(0.5).add(crystalSeed.mul(6.0))).mul(0.3).add(0.7);
  const emissiveBase = vec3(crystalColor.x, crystalColor.y, crystalColor.z).mul(pulse.mul(2.0));
  const fresnelEmissive = vec3(1.0, 1.0, 1.0).mul(fresnelVal.mul(1.5));
  mat.emissiveNode = emissiveBase.add(fresnelEmissive);

  // Subtle vertex breathing
  mat.positionNode = positionLocal.add(
    normalLocal.mul(oscSine(time.mul(1.5).add(positionLocal.y.mul(3.0))).mul(0.008)),
  );

  mat.roughness = 0.05;
  mat.metalness = 0.4;

  return mat;
}

/** Creates crystal inner glow halo material */
function makeCrystalHaloMaterial(layer: number) {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;
  mat.side = THREE.BackSide;
  mat.depthWrite = false;
  mat.blending = THREE.AdditiveBlending;

  const layerF = float(layer);
  const layerFade = float(1.0).sub(layerF.mul(0.3));

  // Per-crystal color from world position hash (same seed as crystal material)
  const crystalSeed = hash(positionWorld.x.mul(7.3).add(positionWorld.z.mul(13.7)));
  const colorIdx = crystalSeed.mul(4.0).floor();

  const amethyst = vec3(0.75, 0.33, 1.0);
  const emerald = vec3(0.2, 1.0, 0.5);
  const sapphire = vec3(0.2, 0.5, 1.0);
  const ruby = vec3(1.0, 0.2, 0.33);

  const c1 = mix(amethyst, emerald, smoothstep(0.5, 1.5, colorIdx));
  const c2 = mix(c1, sapphire, smoothstep(1.5, 2.5, colorIdx));
  const glowColor = mix(c2, ruby, smoothstep(2.5, 3.5, colorIdx));

  // Fresnel for halo edge brightness
  const fresnel = Fn(() => {
    const viewDir = cameraPosition.sub(positionWorld).normalize();
    const nDotV = normalWorld.dot(viewDir).saturate();
    return float(1.0).sub(nDotV).pow(float(1.5).add(layerF.mul(0.5)));
  });

  const fresnelVal = fresnel();
  const pulse = oscSine(time.mul(0.5).add(crystalSeed.mul(6.0))).mul(0.2).add(0.8);

  mat.opacityNode = fresnelVal.mul(pulse).mul(layerFade).mul(0.4);
  mat.colorNode = vec3(glowColor.x, glowColor.y, glowColor.z);
  mat.emissiveNode = vec3(glowColor.x, glowColor.y, glowColor.z).mul(
    fresnelVal.mul(pulse).mul(layerFade).mul(3.0),
  );

  mat.roughness = 0.0;
  mat.metalness = 0.0;

  return mat;
}

/** Creates stalactite material — darker, rocky */
function makeStalactiteMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();

  const rockColor = Fn(() => {
    const n = hash(positionWorld.mul(5.0));
    const dark = color(0x2a2520);
    const light = color(0x3a3530);
    return mix(dark, light, n);
  });
  mat.colorNode = rockColor();

  mat.roughness = 0.9;
  mat.metalness = 0.1;

  return mat;
}

/** Instanced crystal clusters */
function CrystalClusters() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const haloRefs = [
    useRef<THREE.InstancedMesh>(null),
    useRef<THREE.InstancedMesh>(null),
  ];

  const crystalMaterial = useMemo(() => makeCrystalMaterial(), []);
  const haloMaterials = useMemo(
    () => [makeCrystalHaloMaterial(0), makeCrystalHaloMaterial(1)],
    [],
  );

  // Halo scale multipliers
  const haloScales = [1.3, 1.7];

  // Crystal positions - distributed on cave floor, walls, and ceiling
  const crystalData = useMemo(() => {
    const data: { pos: THREE.Vector3; rot: THREE.Euler; scale: number }[] = [];
    for (let i = 0; i < CRYSTAL_COUNT; i++) {
      // Distribute around spherical cave interior surface
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI; // full sphere
      const r = 3.8 + Math.random() * 0.4; // near cave wall

      // Position on sphere interior
      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.cos(phi);
      const z = r * Math.sin(phi) * Math.sin(theta);

      // Rotation: point crystal away from center (outward from wall)
      const rotX = Math.atan2(Math.sqrt(x * x + z * z), y);
      const rotY = Math.atan2(z, x);
      // Add random tilt for natural look
      const tiltX = (Math.random() - 0.5) * 0.6;
      const tiltZ = (Math.random() - 0.5) * 0.6;

      // Vary crystal elongation
      const scale = 0.15 + Math.random() * 0.25;

      data.push({
        pos: new THREE.Vector3(x, y, z),
        rot: new THREE.Euler(rotX + tiltX, rotY, tiltZ),
        scale,
      });
    }
    return data;
  }, []);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const dummy = new THREE.Object3D();
    for (let i = 0; i < crystalData.length; i++) {
      const { pos, rot, scale } = crystalData[i];
      dummy.position.copy(pos);
      dummy.rotation.copy(rot);
      // Elongate crystals vertically (pointed shape)
      dummy.scale.set(scale, scale * 2.5, scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;

    // Set halo instance matrices too (same positions, scaled up)
    haloRefs.forEach((ref, li) => {
      const haloMesh = ref.current;
      if (!haloMesh) return;
      for (let i = 0; i < crystalData.length; i++) {
        const { pos, rot, scale } = crystalData[i];
        dummy.position.copy(pos);
        dummy.rotation.copy(rot);
        const hs = scale * haloScales[li];
        dummy.scale.set(hs, hs * 2.5, hs);
        dummy.updateMatrix();
        haloMesh.setMatrixAt(i, dummy.matrix);
      }
      haloMesh.instanceMatrix.needsUpdate = true;
    });
  }, [crystalData, haloScales]);

  return (
    <>
      {/* Crystal cores */}
      <instancedMesh
        ref={meshRef}
        args={[undefined, undefined, CRYSTAL_COUNT]}
        material={crystalMaterial}
        frustumCulled={false}
      >
        <octahedronGeometry args={[1, 0]} />
      </instancedMesh>
      {/* Crystal bloom halos */}
      {haloMaterials.map((mat, i) => (
        <instancedMesh
          key={i}
          ref={haloRefs[i]}
          args={[undefined, undefined, CRYSTAL_COUNT]}
          material={mat}
          frustumCulled={false}
        >
          <octahedronGeometry args={[1, 0]} />
        </instancedMesh>
      ))}
    </>
  );
}

/** Stalactites hanging from ceiling */
function Stalactites() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const stalactiteMaterial = useMemo(() => makeStalactiteMaterial(), []);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const dummy = new THREE.Object3D();
    for (let i = 0; i < STALACTITE_COUNT; i++) {
      // Hang from upper hemisphere
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * 0.6; // upper portion of sphere
      const r = 3.9;

      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.cos(phi); // positive y = ceiling
      const z = r * Math.sin(phi) * Math.sin(theta);

      dummy.position.set(x, y, z);
      // Point downward
      dummy.rotation.set(Math.PI + (Math.random() - 0.5) * 0.3, theta, 0);
      const scale = 0.06 + Math.random() * 0.1;
      dummy.scale.set(scale, scale * 4 + Math.random() * 2, scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, []);

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, STALACTITE_COUNT]}
      material={stalactiteMaterial}
      frustumCulled={false}
    >
      <coneGeometry args={[1, 1, 6]} />
    </instancedMesh>
  );
}

export default function CrystalCavern() {
  const groupRef = useRef<THREE.Group>(null);

  const caveWallMaterial = useMemo(() => makeCaveWallMaterial(), []);

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.03;
    }
  });

  return (
    <>
      <fogExp2 attach="fog" args={["#020804", 0.03]} />

      {/* Very low ambient — crystals illuminate the cave */}
      <ambientLight intensity={0.1} />
      <hemisphereLight args={['#334466', '#111122', 0.3]} />

      {/* Crystal-colored point lights */}
      <pointLight position={[1.5, -2.0, 1.0]} intensity={4.0} color="#bb66ee" distance={8} />
      <pointLight position={[-2.0, 0.5, 1.5]} intensity={3.5} color="#44ee88" distance={8} />
      <pointLight position={[0.5, 2.0, -2.0]} intensity={3.5} color="#4488ff" distance={8} />
      <pointLight position={[-1.0, -1.5, -1.5]} intensity={3.0} color="#ee4466" distance={8} />
      {/* Central warm fill */}
      <pointLight position={[0, 0, 0]} intensity={1.0} color="#ffddcc" distance={6} />

      <group ref={groupRef}>
        {/* Cave shell — large icosahedron viewed from inside */}
        <mesh material={caveWallMaterial}>
          <icosahedronGeometry args={[5.0, 5]} />
        </mesh>

        {/* Crystal clusters */}
        <CrystalClusters />

        {/* Stalactites */}
        <Stalactites />
      </group>
    </>
  );
}
