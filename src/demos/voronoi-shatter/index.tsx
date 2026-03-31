import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
  Fn,
  float,
  vec3,
  hash,
  time,
  color,
  mix,
  smoothstep,
  positionLocal,
  positionWorld,
  normalLocal,
  normalWorld,
  cameraPosition,
  Loop,
} from 'three/tsl';

/**
 * Voronoi Shatter — Animated Voronoi cell pattern on a sphere surface
 *
 * Demonstrates pure TSL material effects (no compute):
 * - Voronoi cell centers generated from hash, normalized to sphere surface
 * - Per-fragment nearest/second-nearest cell distance calculation
 * - Edge detection for bright crack lines with pulsing width
 * - Per-cell unique colors with dark interiors
 * - Emissive neon glow on crack edges
 * - Subtle vertex displacement for cracked look
 * - BackSide bloom halo shells (3 shells) for glow aura
 * - Background atmosphere sphere with radial gradient
 * - Instanced background star particles with hash twinkle
 * - 3 colored point lights matching cyan palette
 */

const CELL_COUNT = 16;

export default function VoronoiShatter() {
  const meshRef = useRef<THREE.Mesh>(null);

  // TSL Voronoi material with crack lines
  const material = (() => {
    const mat = new THREE.MeshStandardNodeMaterial();

    // Voronoi calculation: find nearest and second-nearest cell center
    const voronoi = Fn(() => {
      const pos = positionLocal.normalize();

      // Track nearest and second-nearest distances plus nearest cell index
      const d1 = float(100.0).toVar();
      const d2 = float(100.0).toVar();
      const nearestIdx = float(0.0).toVar();

      Loop(CELL_COUNT, ({ i }) => {
        const fi = float(i);

        // Generate cell center on unit sphere using hash
        const cx = hash(fi).mul(2.0).sub(1.0);
        const cy = hash(fi.add(100)).mul(2.0).sub(1.0);
        const cz = hash(fi.add(200)).mul(2.0).sub(1.0);

        // Normalize to sphere surface
        const cellLen = cx.mul(cx).add(cy.mul(cy)).add(cz.mul(cz)).max(0.001).sqrt();
        const ncx = cx.div(cellLen);
        const ncy = cy.div(cellLen);
        const ncz = cz.div(cellLen);

        // Animate cell centers: gentle movement
        const animSpeed = hash(fi.add(300)).mul(0.8).add(0.2);
        const animPhase = hash(fi.add(400)).mul(Math.PI * 2);
        const wobble = time.mul(animSpeed).add(animPhase).sin().mul(0.08);

        // Perturb and re-normalize
        const acx = ncx.add(wobble.mul(hash(fi.add(500)).sub(0.5)));
        const acy = ncy.add(wobble.mul(hash(fi.add(600)).sub(0.5)));
        const acz = ncz.add(wobble.mul(hash(fi.add(700)).sub(0.5)));
        const aLen = acx.mul(acx).add(acy.mul(acy)).add(acz.mul(acz)).max(0.001).sqrt();
        const fcx = acx.div(aLen);
        const fcy = acy.div(aLen);
        const fcz = acz.div(aLen);

        // Distance on sphere surface (using euclidean distance of normalized points as proxy)
        const dx = pos.x.sub(fcx);
        const dy = pos.y.sub(fcy);
        const dz = pos.z.sub(fcz);
        const dist = dx.mul(dx).add(dy.mul(dy)).add(dz.mul(dz)).sqrt();

        // Update nearest and second-nearest
        const isNearest = dist.lessThan(d1);
        const isBetween = dist.greaterThanEqual(d1).and(dist.lessThan(d2));

        // When nearest: d2 = d1, d1 = dist
        d2.assign(mix(d2, d1, float(isNearest)));
        d1.assign(mix(d1, dist, float(isNearest)));
        nearestIdx.assign(mix(nearestIdx, fi, float(isNearest)));

        // When between: just update d2
        d2.assign(mix(d2, dist, float(isBetween)));
      });

      return vec3(d1, d2, nearestIdx);
    });

    const voronoiResult = voronoi();
    const d1 = voronoiResult.x;
    const d2 = voronoiResult.y;
    const cellIdx = voronoiResult.z;

    // Edge detection: where (d2 - d1) < threshold = crack line
    const crackPulse = time.mul(1.5).sin().mul(0.3).add(0.7); // breathing 0.4 to 1.0
    const edgeDist = d2.sub(d1);
    const crackThreshold = float(0.06).mul(crackPulse);
    const crackIntensity = smoothstep(crackThreshold, float(0.0), edgeDist);

    // Per-cell color: unique dark tone based on cell index
    const cellHue = hash(cellIdx.add(800));
    const cellSat = float(0.3);
    // Dark cell interiors with slight per-cell tint
    const darkBase = color(0x0a0a12);
    const cellTint = vec3(
      cellHue.mul(0.15).add(0.05),
      hash(cellIdx.add(900)).mul(0.1).add(0.05),
      hash(cellIdx.add(1000)).mul(0.15).add(0.08),
    );
    const cellColor = mix(darkBase, vec3(cellTint.x, cellTint.y, cellTint.z), cellSat);

    // Crack color: bright neon cyan/white
    const crackColor = vec3(0.6, 1.0, 1.0);

    mat.colorNode = mix(cellColor, crackColor, crackIntensity);

    // Roughness: high in cells, low on cracks (shiny cracks)
    mat.roughnessNode = mix(float(0.8), float(0.1), crackIntensity);
    mat.metalness = 0.2;

    // Emissive: bright on cracks, dark elsewhere
    const crackGlow = vec3(0.3, 0.9, 1.0).mul(crackIntensity).mul(float(4.0));
    mat.emissiveNode = crackGlow;

    // Subtle vertex displacement along normals using hash noise for rough cracked look
    const dispNoise = Fn(() => {
      const p = positionLocal;
      const n1 = hash(p.x.mul(5.0).add(p.y.mul(7.0)).add(p.z.mul(3.0)).add(10.0));
      const n2 = hash(p.x.mul(11.0).add(p.y.mul(3.0)).add(p.z.mul(8.0)).add(20.0));
      return n1.mul(0.6).add(n2.mul(0.4)).sub(0.5).mul(0.04);
    });

    mat.positionNode = positionLocal.add(normalLocal.mul(dispNoise()));

    return mat;
  })();

  // BackSide bloom halo shells (3 shells)
  const haloMaterials = useMemo(() => {
    return [
      { scale: 1.06, opacity: 0.035 },
      { scale: 1.12, opacity: 0.025 },
      { scale: 1.20, opacity: 0.018 },
    ].map(({ opacity }) => {
      const mat = new THREE.MeshBasicNodeMaterial();
      mat.transparent = true;
      mat.blending = THREE.AdditiveBlending;
      mat.depthWrite = false;
      mat.side = THREE.BackSide;
      // Fresnel-like radial glow on shell
      const fn = Fn(() => {
        const viewDir = cameraPosition.sub(positionWorld).normalize();
        const nDotV = normalWorld.dot(viewDir).saturate();
        const rim = float(1.0).sub(nDotV).pow(float(2.5));
        return vec3(0.2, 0.9, 1.0).mul(rim).mul(float(opacity));
      });
      mat.colorNode = fn();
      return mat;
    });
  }, []);

  // Background atmosphere sphere
  const atmMat = useMemo(() => {
    const mat = new THREE.MeshBasicNodeMaterial();
    mat.side = THREE.BackSide;
    const fn = Fn(() => {
      const py = positionWorld.y.add(float(6.0)).div(float(12.0)).saturate();
      const bottom = vec3(0.0, 0.02, 0.06);
      const top = vec3(0.0, 0.0, 0.02);
      return mix(bottom, top, py);
    });
    mat.colorNode = fn();
    return mat;
  }, []);

  // Background star particles
  const starPositions = useMemo(() => {
    const positions: [number, number, number][] = [];
    for (let i = 0; i < 60; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 8 + Math.random() * 4;
      positions.push([
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.sin(phi) * Math.sin(theta),
        r * Math.cos(phi),
      ]);
    }
    return positions;
  }, []);

  const starMat = useMemo(() => {
    const mat = new THREE.MeshBasicNodeMaterial();
    const fn = Fn(() => {
      const h = hash(positionWorld.x.mul(6.1).add(positionWorld.y.mul(11.3)));
      const twinkle = float(0.5).add(float(0.5).mul(h));
      return vec3(0.6, 0.9, 1.0).mul(twinkle);
    });
    mat.colorNode = fn();
    return mat;
  }, []);

  // Slow rotation
  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.15;
      meshRef.current.rotation.x += delta * 0.05;
    }
  });

  return (
    <>
      <color attach="background" args={['#000810']} />
      {/* Background atmosphere */}
      <mesh material={atmMat}>
        <sphereGeometry args={[14, 16, 10]} />
      </mesh>
      {/* Star particles */}
      {starPositions.map(([x, y, z], i) => (
        <mesh key={i} position={[x, y, z]} material={starMat}>
          <sphereGeometry args={[0.025, 4, 4]} />
        </mesh>
      ))}
      <ambientLight intensity={0.1} />
      <hemisphereLight args={['#334466', '#111122', 0.3]} />
      <directionalLight position={[3, 4, 5]} intensity={0.3} />
      <pointLight position={[2, 2, 2]} intensity={3.0} color="#00ccff" distance={10} />
      <pointLight position={[-2, -1, -2]} intensity={2.0} color="#0088ff" distance={8} />
      <pointLight position={[0, 3, -3]} intensity={2.5} color="#00ffcc" distance={12} />

      <mesh ref={meshRef} material={material}>
        <icosahedronGeometry args={[2, 5]} />
      </mesh>

      {/* Bloom halo shells */}
      {haloMaterials.map((haloMat, i) => {
        const scales = [1.06, 1.12, 1.20];
        return (
          <mesh key={i} material={haloMat} scale={scales[i]}>
            <icosahedronGeometry args={[2, 3]} />
          </mesh>
        );
      })}
    </>
  );
}
