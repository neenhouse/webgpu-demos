/* eslint-disable react-hooks/purity */
import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
  color,
  time,
  positionLocal,
  positionWorld,
  normalLocal,
  normalWorld,
  cameraPosition,
  Fn,
  float,
  mix,
  smoothstep,
  vec3,
  sin,
  hash,
} from 'three/tsl';

/**
 * Ocean World — Vast animated ocean with wave displacement, foam lines, and underwater caustics
 *
 * Techniques:
 * 1. Large PlaneGeometry (128x128 subdivisions) with positionNode wave displacement
 * 2. 4 sine waves at different frequencies, directions, and speeds for Gerstner-like surface
 * 3. Foam: white emissive where wave height exceeds threshold via smoothstep
 * 4. Caustic pattern: below-surface plane with animated sine interference on emissive
 * 5. Fresnel for surface reflectivity edge glow
 * 6. Deep blue-green color gradient by depth below surface
 * 7. BackSide bloom halo shells on sky dome for horizon glow
 * 8. Instanced seagull (tiny sphere) background particles with hash drift
 * 9. 3 colored atmosphere lights: sun-warm, cool sky, underwater
 */

function makeOceanMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.side = THREE.DoubleSide;

  // 4-wave Gerstner-like displacement
  const waveFn = Fn(() => {
    const x = positionLocal.x;
    const z = positionLocal.z;
    const t = time;

    // Wave 1: large primary swell
    const w1 = x.mul(float(0.22)).add(z.mul(float(0.18))).add(t.mul(float(1.1))).sin().mul(float(0.9));
    // Wave 2: secondary chop from different direction
    const w2 = x.mul(float(-0.15)).add(z.mul(float(0.28))).add(t.mul(float(0.85))).sin().mul(float(0.55));
    // Wave 3: high-frequency ripple
    const w3 = x.mul(float(0.45)).add(z.mul(float(-0.38))).add(t.mul(float(1.8))).sin().mul(float(0.22));
    // Wave 4: diagonal crossing wave
    const w4 = x.mul(float(0.3)).add(z.mul(float(0.35))).add(t.mul(float(1.3))).sin().mul(float(0.3));

    const h = w1.add(w2).add(w3).add(w4);
    return positionLocal.add(normalLocal.mul(h));
  });

  mat.positionNode = waveFn();

  // Color: deep blue-green with foam where waves crest
  const colorFn = Fn(() => {
    const x = positionLocal.x;
    const z = positionLocal.z;
    const t = time;

    const w1 = x.mul(float(0.22)).add(z.mul(float(0.18))).add(t.mul(float(1.1))).sin().mul(float(0.9));
    const w2 = x.mul(float(-0.15)).add(z.mul(float(0.28))).add(t.mul(float(0.85))).sin().mul(float(0.55));
    const w3 = x.mul(float(0.45)).add(z.mul(float(-0.38))).add(t.mul(float(1.8))).sin().mul(float(0.22));
    const w4 = x.mul(float(0.3)).add(z.mul(float(0.35))).add(t.mul(float(1.3))).sin().mul(float(0.3));
    const h = w1.add(w2).add(w3).add(w4);

    // Normalize wave height to 0..1
    const norm = h.add(float(2.0)).div(float(4.0)).saturate();

    const deepBlue   = color(0x02153d);
    const midOcean   = color(0x0a4a6e);
    const shallowTeal = color(0x0e7a7a);
    const crestWhite = color(0xd4f0f5);

    const c1 = mix(deepBlue, midOcean, smoothstep(float(0.0), float(0.4), norm));
    const c2 = mix(c1, shallowTeal, smoothstep(float(0.4), float(0.7), norm));
    return mix(c2, crestWhite, smoothstep(float(0.78), float(0.9), norm));
  });

  mat.colorNode = colorFn();

  // Foam emissive where crest exceeds threshold + Fresnel
  const foamFn = Fn(() => {
    const x = positionLocal.x;
    const z = positionLocal.z;
    const t = time;

    const w1 = x.mul(float(0.22)).add(z.mul(float(0.18))).add(t.mul(float(1.1))).sin().mul(float(0.9));
    const w2 = x.mul(float(-0.15)).add(z.mul(float(0.28))).add(t.mul(float(0.85))).sin().mul(float(0.55));
    const w3 = x.mul(float(0.45)).add(z.mul(float(-0.38))).add(t.mul(float(1.8))).sin().mul(float(0.22));
    const w4 = x.mul(float(0.3)).add(z.mul(float(0.35))).add(t.mul(float(1.3))).sin().mul(float(0.3));
    const h = w1.add(w2).add(w3).add(w4);
    const norm = h.add(float(2.0)).div(float(4.0)).saturate();

    // Foam: bright white-blue emissive on wave crests
    const foam = smoothstep(float(0.72), float(0.88), norm);
    // Fresnel for edge highlights
    const viewDir = cameraPosition.sub(positionWorld).normalize();
    const nDotV = normalWorld.dot(viewDir).saturate();
    const fresnel = float(1.0).sub(nDotV).pow(float(3.0));

    const foamColor = vec3(float(0.9), float(0.97), float(1.0));
    const fresnelColor = vec3(float(0.5), float(0.75), float(1.0));
    return foamColor.mul(foam.mul(float(1.5))).add(fresnelColor.mul(fresnel.mul(float(0.8))));
  });

  mat.emissiveNode = foamFn();
  mat.roughness = 0.05;
  mat.metalness = 0.25;

  return mat;
}

function makeCausticMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;
  mat.side = THREE.DoubleSide;

  const causticFn = Fn(() => {
    const x = positionWorld.x;
    const z = positionWorld.z;
    const t = time;

    // Caustic interference: multiple sine sources
    const c1 = x.mul(float(3.5)).add(z.mul(float(2.8))).add(t.mul(float(0.7))).sin();
    const c2 = x.mul(float(-2.8)).add(z.mul(float(3.2))).add(t.mul(float(0.9))).sin();
    const c3 = x.mul(float(1.8)).add(z.mul(float(-4.0))).add(t.mul(float(0.55))).sin();

    const caustic = c1.add(c2).add(c3).div(float(3.0)).mul(float(0.5)).add(float(0.5));
    const bright = smoothstep(float(0.6), float(0.9), caustic);

    const causticColor = vec3(float(0.3), float(0.7), float(0.95));
    return causticColor.mul(bright.mul(float(1.5)));
  });

  mat.emissiveNode = causticFn();
  mat.colorNode = color(0x010810);
  mat.opacityNode = float(0.65);
  mat.roughness = 0.1;
  mat.metalness = 0.0;

  return mat;
}

// Sky dome with horizon gradient
const oceanSkyMat = new THREE.MeshBasicNodeMaterial({
  side: THREE.BackSide,
  colorNode: Fn(() => {
    const py = positionWorld.y.add(float(5.0)).div(float(30.0)).saturate();
    return mix(color(0x4a7aaa), color(0x5b9dd1), py);
  })(),
});

// Sky bloom halo (BackSide, additive)
const skyHaloMat = (() => {
  const mat = new THREE.MeshBasicNodeMaterial();
  mat.transparent = true;
  mat.blending = THREE.AdditiveBlending;
  mat.depthWrite = false;
  mat.side = THREE.BackSide;
  mat.colorNode = Fn(() => {
    const py = positionWorld.y.add(float(5.0)).div(float(30.0)).saturate();
    const horizonGlow = smoothstep(float(0.2), float(0.0), py).mul(float(0.05));
    return vec3(1.0, 0.7, 0.3).mul(horizonGlow);
  })();
  return mat;
})();

export default function OceanWorld() {
  const oceanRef = useRef<THREE.Mesh>(null);
  const oceanMat = useMemo(() => makeOceanMaterial(), []);
  const causticMat = useMemo(() => makeCausticMaterial(), []);

  // Seagull-like floating particles above ocean
  const seagullPositions = useMemo(() => {
    const pos: [number, number, number][] = [];
    for (let i = 0; i < 30; i++) {
      pos.push([
        (Math.random() - 0.5) * 70,
        2 + Math.random() * 10,
        (Math.random() - 0.5) * 70,
      ]);
    }
    return pos;
  }, []);

  const seagullMat = useMemo(() => {
    const mat = new THREE.MeshBasicNodeMaterial();
    const fn = Fn(() => {
      const h = hash(positionWorld.x.mul(4.7).add(positionWorld.z.mul(6.3)));
      const drift = sin(time.mul(h.mul(0.8).add(0.2))).mul(float(0.15)).add(float(0.85));
      return vec3(0.95, 0.97, 1.0).mul(drift);
    });
    mat.colorNode = fn();
    return mat;
  }, []);

  useFrame((_, delta) => {
    if (oceanRef.current) {
      // Very slight tilt animation for drama
      oceanRef.current.rotation.z += delta * 0.002;
    }
  });

  return (
    <>
      {/* Sky-simulating ambient */}
      <ambientLight intensity={0.35} color="#7eb5d5" />
      <directionalLight position={[10, 18, 5]} intensity={1.8} color="#fffaec" />
      <directionalLight position={[-5, 6, -10]} intensity={0.3} color="#5599bb" />
      {/* Underwater blue fill, sun-warm, sky-cool */}
      <pointLight position={[0, -4, 0]} intensity={3.0} color="#0a4a8a" distance={40} />
      <pointLight position={[20, 12, 0]} intensity={4.0} color="#ffdd99" distance={60} />
      <pointLight position={[-15, 8, 15]} intensity={2.0} color="#88ccee" distance={50} />

      {/* Sky dome */}
      <mesh material={oceanSkyMat}>
        <sphereGeometry args={[90, 16, 10]} />
      </mesh>
      {/* Sky horizon bloom halo */}
      <mesh material={skyHaloMat} scale={0.99}>
        <sphereGeometry args={[90, 16, 10]} />
      </mesh>

      {/* Seagull particles above the ocean */}
      {seagullPositions.map(([x, y, z], i) => (
        <mesh key={i} position={[x, y, z]} material={seagullMat}>
          <sphereGeometry args={[0.15, 4, 4]} />
        </mesh>
      ))}

      {/* Ocean surface — 128x128 subdivisions */}
      <mesh
        ref={oceanRef}
        material={oceanMat}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
      >
        <planeGeometry args={[90, 90, 128, 128]} />
      </mesh>

      {/* Caustic pattern below surface */}
      <mesh material={causticMat} rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.5, 0]}>
        <planeGeometry args={[90, 90, 32, 32]} />
      </mesh>
    </>
  );
}
