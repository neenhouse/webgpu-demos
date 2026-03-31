import { useRef, useMemo, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
  color,
  time,
  normalWorld,
  cameraPosition,
  positionWorld,
  screenUV,
  Fn,
  float,
  mix,
  smoothstep,
  hash,
  vec2,
  vec3,
  vec4,
  uv,
  sin,
} from 'three/tsl';

/**
 * Black Hole with Gravitational Lensing and Accretion Disk
 *
 * Inspired by Interstellar's Gargantua:
 * - Event horizon: pure black sphere (MeshBasicNodeMaterial)
 * - Accretion disk: flattened torus with animated UV turbulence,
 *   hot inner edge (white-yellow) fading to orange-red outer
 * - Photon ring: thin bright halo shells at event horizon edge
 * - Gravitational lensing: background plane with screenUV radial warping
 * - Starfield: instanced spheres distributed behind the scene
 */

const STAR_COUNT = 500;

/** Creates the event horizon material — pure black sphere */
function makeEventHorizonMaterial() {
  const mat = new THREE.MeshBasicNodeMaterial();
  mat.colorNode = vec4(0.0, 0.0, 0.0, 1.0);
  return mat;
}

/** Creates the accretion disk material with animated turbulence */
function makeAccretionDiskMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;
  mat.side = THREE.DoubleSide;
  mat.depthWrite = false;

  // UV-based polar coordinates for ring patterns
  const meshUV = uv();

  // The torus UV.x wraps around the ring, UV.y wraps around the tube cross-section
  // We want hot inner edge and cool outer edge
  const ringAngle = meshUV.x; // 0..1 around the major circle
  const tubeAngle = meshUV.y; // 0..1 around the tube cross-section

  // Turbulence via multi-octave hash noise, animated
  const turbulence = Fn(() => {
    const t = time.mul(0.3);
    const p = vec3(
      ringAngle.mul(12.0).add(t),
      tubeAngle.mul(6.0),
      t.mul(0.5),
    );
    const n1 = hash(p);
    const n2 = hash(p.mul(2.7).add(vec3(17.3, 41.7, 9.1)));
    const n3 = hash(p.mul(5.3).add(vec3(73.1, 23.9, 51.3)));
    return n1.mul(0.5).add(n2.mul(0.3)).add(n3.mul(0.2));
  });

  const turb = turbulence();

  // Cross-section position: 0.5 is the outer equator, 0/1 are inner edge
  // Map tube angle to a radial distance from center of the tube cross-section
  // tubeAngle: 0..1 around cross-section
  // sin(tubeAngle * PI) = 0 at inner/outer edge, 1 at sides
  // cos(tubeAngle * 2PI): -1 = inner edge of torus, +1 = outer edge
  const cosT = tubeAngle.mul(Math.PI * 2).cos();
  // Inner edge factor: 1 at inner edge (cosT=-1), 0 at outer edge (cosT=+1)
  const innerFactor = float(1.0).sub(cosT).mul(0.5);

  // Hot colors: inner edge is white/yellow, outer is orange-red, far outer is dim red
  const innerHot = color(0xffffff); // white-hot inner edge
  const midHot = color(0xffcc44);   // yellow-orange mid
  const outerWarm = color(0xff6622); // orange
  const outerCool = color(0xaa2200); // deep red outer

  const c1 = mix(outerCool, outerWarm, smoothstep(0.0, 0.3, innerFactor));
  const c2 = mix(c1, midHot, smoothstep(0.25, 0.55, innerFactor));
  const c3 = mix(c2, innerHot, smoothstep(0.5, 0.85, innerFactor));

  // Concentric ring bands — domain repetition for orbital structure
  const ringWave = sin(meshUV.x.mul(20.0).sub(time.mul(2.0)));
  const ringBands = smoothstep(-0.2, 0.3, ringWave).mul(0.5).add(0.5);

  // Modulate color by turbulence and ring bands for variation
  const diskColor = mix(c3, c3.mul(turb.mul(0.5).add(0.7)), 0.4).mul(ringBands);

  mat.colorNode = diskColor;

  // Emissive: strong glow, brighter at inner edge, modulated by ring bands
  const emissiveStrength = innerFactor.mul(3.0).add(0.5).mul(turb.mul(0.4).add(0.6)).mul(ringBands);
  mat.emissiveNode = diskColor.mul(emissiveStrength);

  // Opacity: brightest near equator of tube cross-section (top/bottom visible parts)
  // Fade near the edges of the tube for a thin disk appearance
  const sinT = tubeAngle.mul(Math.PI * 2).sin().abs();
  const diskOpacity = sinT.pow(0.3).mul(turb.mul(0.3).add(0.7)).mul(0.9);
  mat.opacityNode = diskOpacity;
  mat.alphaTest = 0.05;

  mat.roughness = 0.3;
  mat.metalness = 0.6;

  return mat;
}

/** Creates photon ring glow material (halo shell) */
function makePhotonRingMaterial(layer: number) {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;
  mat.side = THREE.BackSide;
  mat.depthWrite = false;
  mat.blending = THREE.AdditiveBlending;

  const layerF = float(layer);

  // Fresnel: strongest at grazing angles
  const fresnel = Fn(() => {
    const viewDir = cameraPosition.sub(positionWorld).normalize();
    const nDotV = normalWorld.dot(viewDir).saturate();
    return float(1.0).sub(nDotV).pow(float(2.0).add(layerF.mul(0.8)));
  });

  const fresnelVal = fresnel();

  // Photon ring is bright white-gold at inner, fading to warm orange outer
  const ringColor = mix(
    color(0xffddaa), // warm gold
    color(0xff8844), // orange
    layerF.mul(0.4),
  );

  // Pulsing subtle animation
  const pulse = time.mul(0.5).add(layerF.mul(1.5)).sin().mul(0.15).add(0.85);

  const layerFade = float(1.0).sub(layerF.mul(0.3));
  mat.opacityNode = fresnelVal.mul(layerFade).mul(pulse).mul(0.5);
  mat.colorNode = ringColor;
  mat.emissiveNode = ringColor.mul(fresnelVal.mul(pulse).mul(layerFade).mul(3.5));

  mat.roughness = 0.0;
  mat.metalness = 0.0;

  return mat;
}

/** Creates the inner accretion ring material — hotter, thinner */
function makeInnerRingMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;
  mat.side = THREE.BackSide;
  mat.depthWrite = false;
  mat.blending = THREE.AdditiveBlending;

  mat.colorNode = color(0xffeecc);

  const emissiveGlow = Fn(() => {
    const meshUVVal = uv();
    const turb = hash(
      vec3(
        meshUVVal.x.mul(20.0).add(time.mul(0.5)),
        meshUVVal.y.mul(10.0),
        time.mul(0.3),
      ),
    );
    return turb.mul(2.0).add(1.5);
  });
  mat.emissiveNode = color(0xffdd88).mul(emissiveGlow());

  const ringOpacity = Fn(() => {
    const meshUVVal = uv();
    const sinT = meshUVVal.y.mul(Math.PI * 2).sin().abs();
    return sinT.pow(0.5).mul(0.6);
  });
  mat.opacityNode = ringOpacity();
  mat.alphaTest = 0.05;

  mat.roughness = 0.1;
  mat.metalness = 0.5;

  return mat;
}

/** Creates gravitational lensing background material */
function makeLensingBackgroundMaterial() {
  const mat = new THREE.MeshBasicNodeMaterial();

  // Screen-space gravitational lensing effect
  const lensedColor = Fn(() => {
    const suv = screenUV;
    // Center of screen
    const center = vec2(0.5, 0.5);
    const offset = suv.sub(center);
    const dist = offset.length();

    // Gravitational lensing: radial UV distortion
    // Objects near the center (black hole) get their UVs bent outward
    // Einstein ring effect: UV coordinates near a certain radius get pulled inward
    const lensRadius = float(0.15);
    const lensStrength = float(0.08);

    // Radial distortion: stronger closer to the center
    // Inverse-square falloff from the lens radius
    const distortion = lensStrength.div(dist.max(0.01)).mul(
      smoothstep(0.05, 0.4, dist),
    );

    // Warp UVs radially outward near the black hole
    const warpedUV = suv.add(offset.normalize().mul(distortion));

    // Generate a starfield pattern from the warped UVs
    // Multi-layer procedural stars
    const starP1 = vec3(warpedUV.x.mul(50.0), warpedUV.y.mul(50.0), float(1.0));
    const starP2 = vec3(warpedUV.x.mul(120.0), warpedUV.y.mul(120.0), float(2.0));
    const starP3 = vec3(warpedUV.x.mul(250.0), warpedUV.y.mul(250.0), float(3.0));

    const s1 = hash(starP1);
    const s2 = hash(starP2);
    const s3 = hash(starP3);

    // Sharp stars: only very high hash values become visible
    const star1 = smoothstep(0.97, 0.99, s1).mul(1.5);
    const star2 = smoothstep(0.96, 0.99, s2).mul(0.8);
    const star3 = smoothstep(0.95, 0.99, s3).mul(0.4);

    const starBrightness = star1.add(star2).add(star3);

    // Tint stars slightly blue-white
    const starColor = mix(
      vec3(0.7, 0.8, 1.0),
      vec3(1.0, 0.95, 0.85),
      hash(vec3(warpedUV.x.mul(7.3), warpedUV.y.mul(11.7), float(5.0))),
    );

    // Einstein ring glow: bright ring at a specific radius
    const einsteinRing = smoothstep(0.01, 0.0, dist.sub(lensRadius).abs())
      .mul(0.6)
      .mul(smoothstep(0.0, 0.1, dist));
    const ringGlow = vec3(1.0, 0.85, 0.6).mul(einsteinRing);

    // Darken the very center (event horizon shadow)
    const shadowMask = smoothstep(0.0, 0.12, dist);

    const finalColor = starColor.mul(starBrightness).add(ringGlow).mul(shadowMask);

    // Faint background nebula glow
    const nebulaP = vec3(warpedUV.x.mul(3.0), warpedUV.y.mul(3.0), float(0.5));
    const nebula = hash(nebulaP).mul(0.03);
    const nebulaColor = mix(
      vec3(0.02, 0.01, 0.04),
      vec3(0.05, 0.02, 0.08),
      hash(vec3(warpedUV.x.mul(2.1), warpedUV.y.mul(1.7), float(7.0))),
    );

    return vec4(
      finalColor.add(nebulaColor.mul(nebula)).add(vec3(0.005, 0.003, 0.01)),
      float(1.0),
    );
  });

  mat.colorNode = lensedColor();

  return mat;
}

/** Starfield component using instanced mesh */
function Starfield() {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  const matrices = useMemo(() => {
    const dummy = new THREE.Object3D();
    const result: THREE.Matrix4[] = [];

    for (let i = 0; i < STAR_COUNT; i++) {
      // Distribute on a large sphere behind the scene
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 18 + Math.random() * 12;

      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.sin(phi) * Math.sin(theta);
      const z = r * Math.cos(phi);

      const scale = 0.01 + Math.random() * 0.03;

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

  const starMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    const brightness = Fn(() => {
      const seed = hash(positionWorld.mul(100.0));
      return seed.mul(0.6).add(0.4);
    });
    const b = brightness();
    mat.colorNode = color(0xffffff);
    mat.emissiveNode = color(0xeeeeff).mul(b.mul(2.5));
    mat.roughness = 0.0;
    mat.metalness = 0.0;
    return mat;
  }, []);

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, STAR_COUNT]}
      material={starMaterial}
      frustumCulled={false}
    >
      <icosahedronGeometry args={[1, 1]} />
    </instancedMesh>
  );
}

export default function BlackHole() {
  const diskRef = useRef<THREE.Mesh>(null);
  const groupRef = useRef<THREE.Group>(null);
  const { viewport } = useThree();

  const eventHorizonMaterial = useMemo(() => makeEventHorizonMaterial(), []);
  const accretionDiskMaterial = useMemo(() => makeAccretionDiskMaterial(), []);
  const photonRingMaterials = useMemo(
    () => [makePhotonRingMaterial(0), makePhotonRingMaterial(1), makePhotonRingMaterial(2)],
    [],
  );
  const innerRingMaterial = useMemo(() => makeInnerRingMaterial(), []);
  const lensingMaterial = useMemo(() => makeLensingBackgroundMaterial(), []);

  // Rotate the accretion disk
  useFrame((_, delta) => {
    if (diskRef.current) {
      diskRef.current.rotation.z += delta * 0.15;
    }
  });

  return (
    <>
      {/* Minimal lighting — the scene is mostly emissive-driven */}
      <ambientLight intensity={0.1} />
      <hemisphereLight args={['#222244', '#111111', 0.25]} />
      <pointLight position={[0, 0, 0]} intensity={0.5} color={0xff8844} distance={8} />

      {/* Background plane with gravitational lensing starfield */}
      <mesh
        position={[0, 0, -10]}
        material={lensingMaterial}
      >
        <planeGeometry args={[viewport.width * 4, viewport.height * 4]} />
      </mesh>

      {/* 3D Starfield behind the black hole */}
      <Starfield />

      <group ref={groupRef}>
        {/* Event horizon — pure black sphere */}
        <mesh material={eventHorizonMaterial} renderOrder={10}>
          <icosahedronGeometry args={[0.8, 5]} />
        </mesh>

        {/* Photon ring glow shells */}
        {photonRingMaterials.map((mat, i) => (
          <mesh key={i} material={mat} renderOrder={5}>
            <icosahedronGeometry args={[0.8 + (i + 1) * 0.12, 4]} />
          </mesh>
        ))}

        {/* Accretion disk — flattened torus, tilted */}
        <mesh
          ref={diskRef}
          material={accretionDiskMaterial}
          rotation={[Math.PI * 0.42, 0, 0]}
          renderOrder={8}
        >
          <torusGeometry args={[1.8, 0.5, 32, 128]} />
        </mesh>

        {/* Secondary inner accretion ring — hotter, thinner */}
        <mesh
          rotation={[Math.PI * 0.42, 0, 0]}
          material={innerRingMaterial}
          renderOrder={7}
        >
          <torusGeometry args={[1.15, 0.18, 24, 96]} />
        </mesh>
      </group>
    </>
  );
}
