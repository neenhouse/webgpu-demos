import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
  Fn,
  float,
  vec3,
  cameraPosition,
  positionWorld,
  normalWorld,
} from 'three/tsl';

// Penrose P3 tiling: thick (36°) and thin (72°) rhombi
// Using substitution rules to generate aperiodic tiling

const PHI = (1 + Math.sqrt(5)) / 2; // golden ratio ≈ 1.618
const DEG = Math.PI / 180;

type TileType = 'thick' | 'thin';
interface Rhombus {
  type: TileType;
  cx: number;
  cy: number;
  angle: number; // rotation angle in radians
  depth: number;
}

// Generate P3 Penrose tiling via substitution starting from a "sun" (5 thick tiles)
function generatePenroseTiles(iterations: number): Rhombus[] {
  // Represent tiles as triangles and subdivide
  // We use the half-tile triangle representation (golden gnomon + golden triangle)
  type HalfTile = {
    type: 'A' | 'B'; // A=half thick, B=half thin
    // triangle vertices
    p1: [number, number];
    p2: [number, number];
    p3: [number, number];
  };

  // Initial configuration: "sun" from 10 half-tiles around origin
  let triangles: HalfTile[] = [];
  for (let i = 0; i < 10; i++) {
    const angle1 = ((2 * i - 1) * 18) * DEG;
    const angle2 = ((2 * i + 1) * 18) * DEG;
    triangles.push({
      type: 'A',
      p1: [0, 0],
      p2: [Math.cos(angle1) * 2, Math.sin(angle1) * 2],
      p3: [Math.cos(angle2) * 2, Math.sin(angle2) * 2],
    });
  }

  // Subdivide
  for (let iter = 0; iter < iterations; iter++) {
    const next: HalfTile[] = [];

    for (const t of triangles) {
      if (t.type === 'A') {
        // Thick triangle subdivision
        // P = P1 + (P2-P1)/phi
        const px = t.p1[0] + (t.p2[0] - t.p1[0]) / PHI;
        const py = t.p1[1] + (t.p2[1] - t.p1[1]) / PHI;
        next.push({ type: 'A', p1: t.p3, p2: [px, py], p3: t.p2 });
        next.push({ type: 'B', p1: [px, py], p2: t.p3, p3: t.p1 });
      } else {
        // Thin triangle subdivision
        // Q = P2 + (P3-P2)/phi
        const qx = t.p2[0] + (t.p3[0] - t.p2[0]) / PHI;
        const qy = t.p2[1] + (t.p3[1] - t.p2[1]) / PHI;
        // R = P2 + (P1-P2)/phi
        const rx = t.p2[0] + (t.p1[0] - t.p2[0]) / PHI;
        const ry = t.p2[1] + (t.p1[1] - t.p2[1]) / PHI;
        next.push({ type: 'B', p1: [rx, ry], p2: t.p3, p3: t.p2 });
        next.push({ type: 'B', p1: [rx, ry], p2: t.p2, p3: [qx, qy] });
        next.push({ type: 'A', p1: [rx, ry], p2: t.p1, p3: t.p3 });
      }
    }

    triangles = next;
  }

  // Convert half-tiles to rhombus centers (pair matching would be complex,
  // so we approximate: each triangle becomes a tile with centroid)
  const tiles: Rhombus[] = [];
  for (const t of triangles) {
    const cx = (t.p1[0] + t.p2[0] + t.p3[0]) / 3;
    const cy = (t.p1[1] + t.p2[1] + t.p3[1]) / 3;
    const angle = Math.atan2(t.p2[1] - t.p1[1], t.p2[0] - t.p1[0]);
    tiles.push({
      type: t.type === 'A' ? 'thick' : 'thin',
      cx,
      cy,
      angle,
      depth: 0,
    });
  }

  return tiles.slice(0, 500);
}

// Build extruded rhombus geometry for thick/thin types
function buildRhombusGeometry(type: TileType, scale: number = 0.95): THREE.BufferGeometry {
  // Thick: 36° acute angle; Thin: 72° acute angle
  const halfAngle = type === 'thick' ? 18 * DEG : 36 * DEG;
  const sideLength = 1.0;

  // Rhombus vertices
  const a: [number, number] = [Math.cos(halfAngle) * sideLength, 0];
  const b: [number, number] = [0, Math.sin(halfAngle) * sideLength];
  const c: [number, number] = [-Math.cos(halfAngle) * sideLength, 0];
  const d: [number, number] = [0, -Math.sin(halfAngle) * sideLength];

  const verts = [a, b, c, d].map(([x, y]) => [x * scale, y * scale]);
  const height = type === 'thick' ? 0.18 : 0.12;
  const halfH = height / 2;

  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];

  // Front face (z = halfH)
  for (const [x, y] of verts) {
    positions.push(x, y, halfH);
    normals.push(0, 0, 1);
  }
  indices.push(0, 1, 2, 0, 2, 3);

  // Back face (z = -halfH)
  const backOffset = 4;
  for (const [x, y] of verts) {
    positions.push(x, y, -halfH);
    normals.push(0, 0, -1);
  }
  indices.push(backOffset + 0, backOffset + 2, backOffset + 1);
  indices.push(backOffset + 0, backOffset + 3, backOffset + 2);

  // Side faces
  const sideVerts = [[0, 1], [1, 2], [2, 3], [3, 0]];
  for (const [i, j] of sideVerts) {
    const [x1, y1] = verts[i];
    const [x2, y2] = verts[j];
    const nx = (y2 - y1);
    const ny = -(x2 - x1);
    const nl = Math.sqrt(nx * nx + ny * ny);
    const nnx = nx / nl;
    const nny = ny / nl;

    const baseIdx = positions.length / 3;
    positions.push(x1, y1, halfH, x2, y2, halfH, x1, y1, -halfH, x2, y2, -halfH);
    normals.push(nnx, nny, 0, nnx, nny, 0, nnx, nny, 0, nnx, nny, 0);
    indices.push(baseIdx, baseIdx + 1, baseIdx + 2);
    indices.push(baseIdx + 1, baseIdx + 3, baseIdx + 2);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setIndex(indices);
  return geo;
}

export default function PenroseTiles() {
  const groupRef = useRef<THREE.Group>(null);

  const tiles = useMemo(() => generatePenroseTiles(4), []);

  const thickGeo = useMemo(() => buildRhombusGeometry('thick'), []);
  const thinGeo = useMemo(() => buildRhombusGeometry('thin'), []);

  // Thick tile material: gold
  const thickMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();

    const col = Fn(() => {
      return vec3(0.95, 0.78, 0.1); // gold
    });

    const glow = Fn(() => {
      const viewDir = cameraPosition.sub(positionWorld).normalize();
      const nDotV = normalWorld.dot(viewDir).saturate();
      const f = float(1.0).sub(nDotV).pow(float(3.5));
      return vec3(1.0, 0.85, 0.2).mul(f).mul(float(1.5));
    });

    mat.colorNode = col();
    mat.emissiveNode = glow();
    mat.roughness = 0.25;
    mat.metalness = 0.7;
    return mat;
  }, []);

  // Thin tile material: blue
  const thinMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();

    const col = Fn(() => {
      return vec3(0.1, 0.35, 0.9);
    });

    const glow = Fn(() => {
      const viewDir = cameraPosition.sub(positionWorld).normalize();
      const nDotV = normalWorld.dot(viewDir).saturate();
      const f = float(1.0).sub(nDotV).pow(float(3.5));
      return vec3(0.2, 0.5, 1.0).mul(f).mul(float(1.5));
    });

    mat.colorNode = col();
    mat.emissiveNode = glow();
    mat.roughness = 0.25;
    mat.metalness = 0.6;
    return mat;
  }, []);

  const scale = 0.45;

  useFrame((state) => {
    if (groupRef.current) {
      // Very slow zoom effect
      const zoom = 1.0 + Math.sin(state.clock.elapsedTime * 0.05) * 0.15;
      groupRef.current.scale.setScalar(zoom * scale);
      groupRef.current.rotation.z = state.clock.elapsedTime * 0.01;
    }
  });

  return (
    <>
      {/* Background atmosphere */}
      <mesh>
        <sphereGeometry args={[30, 16, 16]} />
        <meshBasicMaterial side={THREE.BackSide} color="#020408" />
      </mesh>

      <ambientLight intensity={0.25} />
      <directionalLight position={[0, 10, 5]} intensity={2} color={0xffffff} />
      <pointLight position={[0, 0, 4]} intensity={2} color={0xffdd88} />
      <pointLight position={[3, 3, 3]} intensity={1} color={0x4488ff} />

      {/* Bird's eye view: camera looking straight down, group in XY plane */}
      <group ref={groupRef} scale={scale}>
        {tiles.map((tile, i) => {
          const geo = tile.type === 'thick' ? thickGeo : thinGeo;
          const mat = tile.type === 'thick' ? thickMaterial : thinMaterial;
          // Vary extrusion height slightly per tile for visual interest
          const hScale = 0.9 + (i % 7) * 0.03;
          return (
            <mesh
              key={i}
              geometry={geo}
              material={mat}
              position={[tile.cx, tile.cy, 0]}
              rotation={[0, 0, tile.angle]}
              scale={[1, 1, hScale]}
            />
          );
        })}
      </group>
    </>
  );
}
