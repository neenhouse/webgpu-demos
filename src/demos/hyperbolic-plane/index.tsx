import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
  Fn,
  float,
  vec3,
  uniform,
  cameraPosition,
  positionWorld,
  normalWorld,
} from 'three/tsl';

// ── Möbius transformation: (z - a) / (1 - conj(a)*z) ──
// All arithmetic in real 2D (x,y = real,imag)
function mobiusTransform(
  zx: number, zy: number,
  ax: number, ay: number
): [number, number] {
  // numerator: z - a
  const nx = zx - ax;
  const ny = zy - ay;
  // denominator: 1 - conj(a)*z = 1 - (ax - i*ay)*(zx + i*zy)
  //            = 1 - (ax*zx + ay*zy) - i*(ax*zy - ay*zx)
  const dr = 1 - (ax * zx + ay * zy);
  const di = -(ax * zy - ay * zx);
  const denom = dr * dr + di * di;
  if (denom < 1e-12) return [0, 0];
  return [
    (nx * dr + ny * di) / denom,
    (ny * dr - nx * di) / denom,
  ];
}

// Generate a hyperbolic triangle tessellation using reflections in the Poincaré disk
// We use a {3,7} tiling (triangles, 7 around each vertex)
const P = 3; // polygon sides
const Q = 7; // polygons around each vertex

// Compute fundamental triangle vertices using hyperbolic geometry
function computeTriangleTiling(depth: number): Array<[number, number, number, number, number, number, number]> {
  // Angles: pi/p, pi/q, pi/2 (right triangle)
  const angleP = Math.PI / P;
  const angleQ = Math.PI / Q;

  // Hyperbolic distances to triangle vertices
  const cosP = Math.cos(angleP);
  const cosQ = Math.cos(angleQ);
  const sinP = Math.sin(angleP);
  const sinQ = Math.sin(angleQ);

  // Vertices of the fundamental triangle in the Poincaré disk
  // Center vertex
  const v0 = [0, 0] as [number, number];
  // Using the formula for hyperbolic triangle
  const coshC = (cosP * cosQ + Math.cos(Math.PI / 2)) / (sinP * sinQ);
  const sinhC = Math.sqrt(coshC * coshC - 1);
  const tanhHalfC = sinhC / (1 + coshC);

  const v1 = [tanhHalfC, 0] as [number, number];

  // Third vertex by rotation
  const coshB = (cosP * Math.cos(Math.PI / 2) + cosQ) / (sinP * Math.sin(Math.PI / 2));
  const sinhB = Math.sqrt(Math.max(0, coshB * coshB - 1));
  const tanhHalfB = sinhB / (1 + coshB);
  const v2 = [tanhHalfB * Math.cos(angleP), tanhHalfB * Math.sin(angleP)] as [number, number];

  // color: signed area of fundamental triangle
  const tiles: Array<[number, number, number, number, number, number, number]> = [];

  // BFS expansion up to given depth
  type TileState = {
    va: [number, number];
    vb: [number, number];
    vc: [number, number];
    depth: number;
    parity: number;
  };

  const queue: TileState[] = [{ va: v0, vb: v1, vc: v2, depth: 0, parity: 0 }];
  const seen = new Set<string>();

  while (queue.length > 0) {
    const state = queue.shift()!;
    const { va, vb, vc, depth: d, parity } = state;

    // Canonical key from center
    const cx = (va[0] + vb[0] + vc[0]) / 3;
    const cy = (va[1] + vb[1] + vc[1]) / 3;
    const key = `${(cx * 200).toFixed(0)},${(cy * 200).toFixed(0)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    // Check all vertices are inside disk
    const maxR = Math.max(
      va[0] ** 2 + va[1] ** 2,
      vb[0] ** 2 + vb[1] ** 2,
      vc[0] ** 2 + vc[1] ** 2,
    );
    if (maxR > 0.98) continue;

    // Compute hyperbolic distance of centroid from origin
    const r2 = cx * cx + cy * cy;
    const hypDist = Math.log((1 + Math.sqrt(r2)) / (1 - Math.sqrt(r2))); // Simplified

    tiles.push([va[0], va[1], vb[0], vb[1], vc[0], vc[1], hypDist]);

    if (d < depth) {
      // Reflect through each edge (Möbius reflection)
      // Reflection of vertex A through edge BC: invert through the geodesic
      // Use Möbius transform to move B to origin, reflect, move back
      const reflectVertex = (
        p: [number, number],
        e1: [number, number],
        e2: [number, number]
      ): [number, number] => {
        // Move e1 to origin
        const [pMx, pMy] = mobiusTransform(p[0], p[1], e1[0], e1[1]);
        const [e2Mx, e2My] = mobiusTransform(e2[0], e2[1], e1[0], e1[1]);
        // Rotate so e2M is on real axis
        const angle = Math.atan2(e2My, e2Mx);
        const pRx = pMx * Math.cos(-angle) - pMy * Math.sin(-angle);
        const pRy = pMx * Math.sin(-angle) + pMy * Math.cos(-angle);
        // Reflect imaginary part
        const pRefx = pRx;
        const pRefy = -pRy;
        // Rotate back
        const pBackx = pRefx * Math.cos(angle) - pRefy * Math.sin(angle);
        const pBacky = pRefx * Math.sin(angle) + pRefy * Math.cos(angle);
        // Move origin back to e1
        const [negE1x, negE1y] = [-e1[0], -e1[1]];
        return mobiusTransform(pBackx, pBacky, negE1x, negE1y);
      };

      // Three reflected triangles (one per edge)
      const ra = reflectVertex(va, vb, vc);
      const rb = reflectVertex(vb, va, vc);
      const rc = reflectVertex(vc, va, vb);

      queue.push({ va: ra, vb: vb, vc: vc, depth: d + 1, parity: 1 - parity });
      queue.push({ va: va, vb: rb, vc: vc, depth: d + 1, parity: 1 - parity });
      queue.push({ va: va, vb: vb, vc: rc, depth: d + 1, parity: 1 - parity });
    }
  }

  return tiles.slice(0, 220);
}

export default function HyperbolicPlane() {
  const groupRef = useRef<THREE.Group>(null);

  // Pre-compute tile geometry
  const tiles = useMemo(() => computeTriangleTiling(5), []);

  // Build a single merged geometry for all triangles
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const positions: number[] = [];
    const colors: number[] = [];
    const normals: number[] = [];

    for (const [ax, ay, bx, by, cx, cy, hypDist] of tiles) {
      // Scale to screen size (disk radius ~2.5)
      const s = 2.5;
      const zOff = 0;

      const pa = [ax * s, ay * s, zOff];
      const pb = [bx * s, by * s, zOff];
      const pc = [cx * s, cy * s, zOff];

      // Extrude slightly for depth
      const extrude = 0.04 + Math.random() * 0.06;
      const backFaces = [
        [pa[0], pa[1], pa[2] - extrude],
        [pb[0], pb[1], pb[2] - extrude],
        [pc[0], pc[1], pc[2] - extrude],
      ];

      // Color by hyperbolic distance
      const t = Math.min(hypDist / 3.5, 1.0);
      const r = 1.0 - t * 0.9;
      const g = 1.0 - t * 0.7;
      const b = 0.2 + t * 0.8;

      const addTri = (
        p1: number[],
        p2: number[],
        p3: number[],
        nx: number,
        ny: number,
        nz: number
      ) => {
        positions.push(...p1, ...p2, ...p3);
        normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
        colors.push(r, g, b, r, g, b, r, g, b);
      };

      addTri(pa, pb, pc, 0, 0, 1);
      addTri(backFaces[0], backFaces[2], backFaces[1], 0, 0, -1);
    }

    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return geo;
  }, [tiles]);

  // TSL material with fresnel edge glow and vertex-color support
  const material = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.vertexColors = true;
    mat.side = THREE.DoubleSide;

    // Fresnel glow at edges
    const fresnelGlow = Fn(() => {
      const viewDir = cameraPosition.sub(positionWorld).normalize();
      const nDotV = normalWorld.dot(viewDir).saturate();
      const f = float(1.0).sub(nDotV).pow(float(2.5));
      return vec3(0.4, 0.2, 1.0).mul(f).mul(float(2.0));
    });

    mat.emissiveNode = fresnelGlow();
    mat.roughness = 0.2;
    mat.metalness = 0.3;

    return mat;
  }, []);

  // Disk edge ring
  const diskEdge = useMemo(() => {
    const curve = new THREE.EllipseCurve(0, 0, 2.5, 2.5, 0, Math.PI * 2, false, 0);
    const points = curve.getPoints(128);
    const geo = new THREE.BufferGeometry().setFromPoints(
      points.map((p) => new THREE.Vector3(p.x, p.y, 0.1))
    );
    return geo;
  }, []);

  const edgeMat = useMemo(() => {
    const mat = new THREE.LineBasicMaterial({ color: 0x8822ff, linewidth: 2 });
    return mat;
  }, []);

  // Uniform for time-based animation
  const timeUniform = useMemo(() => uniform(0), []);
  const rotSpeed = 0.05;

  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.rotation.z = state.clock.elapsedTime * rotSpeed;
    }
    timeUniform.value = state.clock.elapsedTime;
  });

  return (
    <>

      <fogExp2 attach="fog" color="#030306" density={0.03} />
      {/* Background atmosphere */}
      <mesh>
        <sphereGeometry args={[30, 16, 16]} />
        <meshBasicMaterial side={THREE.BackSide} color="#020408" />
      </mesh>

      <ambientLight intensity={0.3} />
      <pointLight position={[0, 0, 5]} intensity={3} color={0x8822ff} />
      <pointLight position={[2, 2, 3]} intensity={1.5} color={0x4400ff} />

      <group ref={groupRef}>
        <mesh geometry={geometry} material={material} />
        <lineLoop geometry={diskEdge} material={edgeMat} />
      </group>
    </>
  );
}
