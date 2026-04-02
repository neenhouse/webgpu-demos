import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
  Fn,
  float,
  vec3,
  vec4,
  uv,
  cameraPosition,
  positionWorld,
  normalWorld,
  mix,
  smoothstep,
  sin,
  hash,
  time,
} from 'three/tsl';

const U_SEGS = 80;
const V_SEGS = 30;

// Klein bottle parametric equations (Möbius-based immersion in R3)
function kleinPoint(u: number, v: number): THREE.Vector3 {
  // u in [0, 2π], v in [0, 2π]
  // Classic Klein bottle embedding (Breather bottle form)
  const cosu = Math.cos(u);
  const sinu = Math.sin(u);
  const cosv = Math.cos(v);
  const sinv = Math.sin(v);
  let x: number, y: number;

  if (u < Math.PI) {
    x = 3 * cosu * (1 + sinu) + (2 * (1 - cosu / 2)) * cosu * cosv;
    y = 8 * sinu + (2 * (1 - cosu / 2)) * sinu * cosv;
  } else {
    x = 3 * cosu * (1 + sinu) + (2 * (1 - cosu / 2)) * cosv;
    y = 8 * sinu;
  }
  const z = (2 * (1 - cosu / 2)) * sinv;

  // Scale down
  return new THREE.Vector3(x * 0.08, y * 0.08, z * 0.15);
}

function buildKleinGeometry() {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const eps = 0.001;

  // Generate vertices
  for (let j = 0; j <= V_SEGS; j++) {
    for (let i = 0; i <= U_SEGS; i++) {
      const u = (i / U_SEGS) * Math.PI * 2;
      const v = (j / V_SEGS) * Math.PI * 2;

      const pos = kleinPoint(u, v);
      positions.push(pos.x, pos.y, pos.z);
      uvs.push(i / U_SEGS, j / V_SEGS);

      // Finite-difference normals
      const pu = kleinPoint(u + eps, v);
      const pv = kleinPoint(u, v + eps);
      const du = pu.clone().sub(pos);
      const dv = pv.clone().sub(pos);
      const n = du.cross(dv).normalize();
      normals.push(n.x, n.y, n.z);
    }
  }

  // Generate indices
  for (let j = 0; j < V_SEGS; j++) {
    for (let i = 0; i < U_SEGS; i++) {
      const a = j * (U_SEGS + 1) + i;
      const b = j * (U_SEGS + 1) + i + 1;
      const c = (j + 1) * (U_SEGS + 1) + i;
      const d = (j + 1) * (U_SEGS + 1) + i + 1;
      indices.push(a, b, d);
      indices.push(a, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
}

export default function KleinBottle() {
  const meshRef = useRef<THREE.Mesh>(null);
  const wireMeshRef = useRef<THREE.Mesh>(null);
  const groupRef = useRef<THREE.Group>(null);

  const geometry = useMemo(() => buildKleinGeometry(), []);

  // Main surface material: inside=warm orange, outside=cool blue
  const material = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.side = THREE.DoubleSide;
    mat.transparent = true;

    // Color by UV coordinates: u=orange (outside), v-flipped=blue (inside)
    const surfaceColor = Fn(() => {
      const vCoord = uv().y;

      // Outside = warm orange-gold; inside = cool blue
      const outsideColor = vec3(1.0, 0.45, 0.08);
      const insideColor = vec3(0.1, 0.35, 0.95);

      // Use normal dot to camera to distinguish inside/outside
      const viewDir = cameraPosition.sub(positionWorld).normalize();
      const facing = normalWorld.dot(viewDir);
      const t = smoothstep(float(-0.1), float(0.1), facing);

      // Also blend by v-parameter for variety
      const vBlend = smoothstep(float(0.3), float(0.7), vCoord);
      const baseColor = mix(insideColor, outsideColor, t);
      const withV = mix(baseColor, vec3(0.6, 0.2, 0.8), vBlend.mul(float(0.3)));

      return withV;
    });

    mat.colorNode = surfaceColor();

    // Fresnel glow at edges + hash-based shimmer
    const fresnelGlow = Fn(() => {
      const viewDir = cameraPosition.sub(positionWorld).normalize();
      const nDotV = normalWorld.dot(viewDir).abs().saturate();
      const f = float(1.0).sub(nDotV).pow(float(3.5));
      // Glow shifts from orange to blue based on position
      const uCoord = uv().x;
      const glowColor = mix(
        vec3(1.0, 0.5, 0.0),
        vec3(0.2, 0.6, 1.0),
        uCoord
      );
      // Hash shimmer for sparkle effect
      const h = hash(positionWorld.x.mul(8.1).add(positionWorld.y.mul(5.3)));
      const shimmer = sin(time.mul(h.mul(4.0).add(1.0))).mul(float(0.2)).add(float(0.8));
      return glowColor.mul(f).mul(float(2.5)).mul(shimmer);
    });

    mat.emissiveNode = fresnelGlow();
    mat.opacity = 0.85;
    mat.roughness = 0.25;
    mat.metalness = 0.4;

    return mat;
  }, []);

  // Wireframe overlay material
  const wireMaterial = useMemo(() => {
    const mat = new THREE.MeshBasicNodeMaterial();
    mat.wireframe = true;
    mat.transparent = true;
    mat.colorNode = vec4(0.9, 0.4, 0.1, 0.15);
    return mat;
  }, []);

  // BackSide bloom halo shells (2 shells)
  const haloMat1 = useMemo(() => {
    const mat = new THREE.MeshBasicNodeMaterial();
    mat.transparent = true;
    mat.blending = THREE.AdditiveBlending;
    mat.depthWrite = false;
    mat.side = THREE.BackSide;
    const fn = Fn(() => {
      const viewDir = cameraPosition.sub(positionWorld).normalize();
      const nDotV = normalWorld.dot(viewDir).abs().saturate();
      const rim = float(1.0).sub(nDotV).pow(float(2.5));
      const pulse = sin(time.mul(0.8)).mul(float(0.3)).add(float(0.7));
      return vec3(1.0, 0.45, 0.1).mul(rim).mul(float(0.03)).mul(pulse);
    });
    mat.colorNode = fn();
    return mat;
  }, []);

  const haloMat2 = useMemo(() => {
    const mat = new THREE.MeshBasicNodeMaterial();
    mat.transparent = true;
    mat.blending = THREE.AdditiveBlending;
    mat.depthWrite = false;
    mat.side = THREE.BackSide;
    const fn = Fn(() => {
      const viewDir = cameraPosition.sub(positionWorld).normalize();
      const nDotV = normalWorld.dot(viewDir).abs().saturate();
      const rim = float(1.0).sub(nDotV).pow(float(3.0));
      return vec3(0.2, 0.5, 1.0).mul(rim).mul(float(0.02));
    });
    mat.colorNode = fn();
    return mat;
  }, []);

  // Background atmosphere sphere
  const atmMat = useMemo(() => {
    const mat = new THREE.MeshBasicNodeMaterial();
    mat.side = THREE.BackSide;
    const fn = Fn(() => {
      const py = positionWorld.y.add(float(3.0)).div(float(8.0)).saturate();
      return mix(vec3(0.02, 0.01, 0.0), vec3(0.0, 0.01, 0.03), py);
    });
    mat.colorNode = fn();
    return mat;
  }, []);

  // Background star particles (50 tiny spheres)
  const starPositions = useMemo(() => {
    const positions: [number, number, number][] = [];
    for (let i = 0; i < 50; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 6 + Math.random() * 3;
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
      const h = hash(positionWorld.x.mul(5.7).add(positionWorld.y.mul(8.3)));
      return vec3(0.8, 0.7, 1.0).mul(h.mul(0.5).add(0.5));
    });
    mat.colorNode = fn();
    return mat;
  }, []);

  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = state.clock.elapsedTime * 0.2;
      groupRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.13) * 0.3;
      groupRef.current.rotation.z = Math.cos(state.clock.elapsedTime * 0.09) * 0.15;
    }
  });

  return (
    <>
      <color attach="background" args={['#060204']} />

      <fogExp2 attach="fog" color="#030306" density={0.03} />
      {/* Background atmosphere sphere */}
      <mesh material={atmMat}>
        <sphereGeometry args={[11, 16, 10]} />
      </mesh>
      {/* Star particles */}
      {starPositions.map(([x, y, z], i) => (
        <mesh key={i} position={[x, y, z]} material={starMat}>
          <sphereGeometry args={[0.02, 4, 4]} />
        </mesh>
      ))}
      <ambientLight intensity={0.2} />
      <pointLight position={[3, 3, 5]} intensity={2.5} color={0xff8822} />
      <pointLight position={[-3, -2, 4]} intensity={2.0} color={0x2244ff} />
      <pointLight position={[0, 0, -5]} intensity={1.5} color={0xaa44ff} />

      <group ref={groupRef}>
        <mesh ref={meshRef} geometry={geometry} material={material} />
        <mesh ref={wireMeshRef} geometry={geometry} material={wireMaterial} />
        {/* Halo shells on Klein bottle surface */}
        <mesh geometry={geometry} material={haloMat1} scale={1.05} />
        <mesh geometry={geometry} material={haloMat2} scale={1.10} />
      </group>
    </>
  );
}
