import { useRef, useMemo, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
  Fn,
  float,
  vec3,
  positionWorld,
  cameraPosition,
  normalWorld,
  mix,
  sin,
  hash,
  time,
  smoothstep,
} from 'three/tsl';

const POINTS_PER_CURVE = 200;

// 6-curve Lissajous parameters: [a, b, c, delta, gamma]
const CURVE_PARAMS = [
  { a: 3, b: 2, c: 1, delta: 0.0, gamma: 0.5 },
  { a: 5, b: 4, c: 3, delta: 0.5, gamma: 1.0 },
  { a: 2, b: 3, c: 5, delta: 1.0, gamma: 0.3 },
  { a: 4, b: 1, c: 3, delta: 1.5, gamma: 0.8 },
  { a: 3, b: 5, c: 2, delta: 0.8, gamma: 1.5 },
  { a: 1, b: 4, c: 3, delta: 0.3, gamma: 1.2 },
];

// Neon palette for 6 curves
const NEON_COLORS = [
  new THREE.Color(0.0, 1.0, 1.0),   // cyan
  new THREE.Color(1.0, 0.0, 1.0),   // magenta
  new THREE.Color(0.0, 1.0, 0.0),   // green
  new THREE.Color(1.0, 0.5, 0.0),   // orange
  new THREE.Color(0.5, 0.0, 1.0),   // purple
  new THREE.Color(1.0, 1.0, 0.0),   // yellow
];

function computeLissajousPoints(a: number, b: number, c: number, delta: number, gamma: number, phase: number): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < POINTS_PER_CURVE; i++) {
    const t = (i / POINTS_PER_CURVE) * Math.PI * 2;
    const x = Math.sin(a * t + delta + phase) * 2.0;
    const y = Math.sin(b * t + phase * 0.7) * 2.0;
    const z = Math.sin(c * t + gamma + phase * 0.5) * 2.0;
    pts.push(new THREE.Vector3(x, y, z));
  }
  return pts;
}

export default function LissajousWeb() {
  const groupRef = useRef<THREE.Group>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const phaseRef = useRef(0);

  // Per-curve TSL materials with Fresnel + hash twinkle
  const materials = useMemo(() => {
    return NEON_COLORS.map((col) => {
      const mat = new THREE.MeshStandardNodeMaterial();

      // Fresnel emissive glow + hash shimmer
      const glow = Fn(() => {
        const viewDir = cameraPosition.sub(positionWorld).normalize();
        const nDotV = normalWorld.dot(viewDir).saturate();
        const f = float(1.0).sub(nDotV).pow(float(2.5));
        const h = hash(positionWorld.x.mul(6.1).add(positionWorld.y.mul(4.3)));
        const shimmer = sin(time.mul(h.mul(4.0).add(1.0))).mul(float(0.25)).add(float(0.75));
        return vec3(col.r, col.g, col.b).mul(f).mul(float(3.0)).mul(shimmer);
      });

      mat.colorNode = vec3(col.r * 0.5, col.g * 0.5, col.b * 0.5);
      mat.emissiveNode = glow();
      mat.roughness = 0.2;
      mat.metalness = 0.6;

      return mat;
    });
  }, []);

  // Per-curve BackSide bloom halo materials
  const haloMaterials = useMemo(() => {
    return NEON_COLORS.map((col) => {
      const mat = new THREE.MeshBasicNodeMaterial();
      mat.transparent = true;
      mat.blending = THREE.AdditiveBlending;
      mat.depthWrite = false;
      mat.side = THREE.BackSide;
      const fn = Fn(() => {
        const viewDir = cameraPosition.sub(positionWorld).normalize();
        const nDotV = normalWorld.dot(viewDir).saturate();
        const rim = float(1.0).sub(nDotV).pow(float(2.0));
        return vec3(col.r, col.g, col.b).mul(rim).mul(float(0.025));
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
      const py = positionWorld.y.add(float(4.0)).div(float(10.0)).saturate();
      return mix(vec3(0.0, 0.02, 0.04), vec3(0.0, 0.0, 0.01), py);
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
      const h = hash(positionWorld.x.mul(7.1).add(positionWorld.y.mul(9.3)));
      const twinkle = smoothstep(float(0.0), float(1.0), h).mul(float(0.8)).add(float(0.2));
      return vec3(0.7, 0.9, 1.0).mul(twinkle);
    });
    mat.colorNode = fn();
    return mat;
  }, []);

  // One shared instanced mesh for all spheres (we'll use a trick: separate mesh per curve)
  const curveMeshes = useMemo(() => {
    // Build 6 separate instanced meshes, one per curve
    return NEON_COLORS.map(() => ({ ref: null as THREE.InstancedMesh | null }));
  }, []);

  // Halo instanced meshes (one per curve, larger spheres)
  const haloMeshes = useMemo(() => {
    return NEON_COLORS.map(() => ({ ref: null as THREE.InstancedMesh | null }));
  }, []);

  const setCurveMeshRef = useCallback((i: number) => (el: THREE.InstancedMesh | null) => {
    curveMeshes[i].ref = el;
  }, [curveMeshes]);

  const setHaloMeshRef = useCallback((i: number) => (el: THREE.InstancedMesh | null) => {
    haloMeshes[i].ref = el;
  }, [haloMeshes]);

  // Build connecting line segments between consecutive points per curve
  const lineGeometries = useMemo(() => {
    return CURVE_PARAMS.map((p) => {
      const pts = computeLissajousPoints(p.a, p.b, p.c, p.delta, p.gamma, 0);
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      return geo;
    });
  }, []);

  const lineMaterials = useMemo(() => {
    return NEON_COLORS.map((col) => {
      return new THREE.LineBasicMaterial({
        color: col,
        transparent: true,
        opacity: 0.3,
      });
    });
  }, []);

  const lineObjects = useMemo(() => {
    return CURVE_PARAMS.map((_, i) => new THREE.Line(lineGeometries[i], lineMaterials[i]));
  }, [lineGeometries, lineMaterials]);

  useFrame((state) => {
    const phase = state.clock.elapsedTime * 0.25;
    phaseRef.current = phase;

    // Update each curve's instanced spheres
    CURVE_PARAMS.forEach((p, curveIdx) => {
      const mesh = curveMeshes[curveIdx].ref;
      const haloMesh = haloMeshes[curveIdx].ref;

      const pts = computeLissajousPoints(p.a, p.b, p.c, p.delta, p.gamma, phase);

      // Update line geometry too
      const linePts = pts;
      const lineGeo = lineGeometries[curveIdx];
      const arr = lineGeo.attributes.position.array as Float32Array;
      for (let i = 0; i < linePts.length; i++) {
        arr[i * 3 + 0] = linePts[i].x;
        arr[i * 3 + 1] = linePts[i].y;
        arr[i * 3 + 2] = linePts[i].z;
      }
      lineGeo.attributes.position.needsUpdate = true;

      // Update sphere instances + halo instances
      for (let i = 0; i < POINTS_PER_CURVE; i++) {
        const t = i / POINTS_PER_CURVE;
        const scale = 0.035 + t * 0.04;
        dummy.position.copy(pts[i]);
        dummy.scale.setScalar(scale);
        dummy.updateMatrix();
        if (mesh) mesh.setMatrixAt(i, dummy.matrix);

        // Halo slightly larger
        dummy.scale.setScalar(scale * 1.6);
        dummy.updateMatrix();
        if (haloMesh) haloMesh.setMatrixAt(i, dummy.matrix);
      }
      if (mesh) mesh.instanceMatrix.needsUpdate = true;
      if (haloMesh) haloMesh.instanceMatrix.needsUpdate = true;
    });

    // Slow group rotation
    if (groupRef.current) {
      groupRef.current.rotation.y = state.clock.elapsedTime * 0.12;
      groupRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.07) * 0.2;
    }
  });

  return (
    <>
      <color attach="background" args={['#000208']} />

      <fogExp2 attach="fog" color="#030306" density={0.03} />
      {/* Background atmosphere sphere */}
      <mesh material={atmMat}>
        <sphereGeometry args={[14, 16, 10]} />
      </mesh>
      {/* Background stars */}
      {starPositions.map(([x, y, z], i) => (
        <mesh key={i} position={[x, y, z]} material={starMat}>
          <sphereGeometry args={[0.025, 4, 4]} />
        </mesh>
      ))}
      <ambientLight intensity={0.1} />
      <hemisphereLight args={['#334466', '#111122', 0.3]} />
      <pointLight position={[0, 0, 6]} intensity={2} color={0x00ffff} />
      <pointLight position={[4, 4, -4]} intensity={1.5} color={0xff00ff} />
      <pointLight position={[-4, -4, 4]} intensity={1.5} color={0x00ff88} />

      <group ref={groupRef}>
        {/* Sphere particles per curve */}
        {CURVE_PARAMS.map((_, curveIdx) => (
          <instancedMesh
            key={curveIdx}
            ref={setCurveMeshRef(curveIdx)}
            args={[undefined, undefined, POINTS_PER_CURVE]}
            material={materials[curveIdx]}
            frustumCulled={false}
          >
            <sphereGeometry args={[1, 8, 6]} />
          </instancedMesh>
        ))}

        {/* Bloom halo shells per curve */}
        {CURVE_PARAMS.map((_, curveIdx) => (
          <instancedMesh
            key={`halo-${curveIdx}`}
            ref={setHaloMeshRef(curveIdx)}
            args={[undefined, undefined, POINTS_PER_CURVE]}
            material={haloMaterials[curveIdx]}
            frustumCulled={false}
          >
            <sphereGeometry args={[1, 6, 4]} />
          </instancedMesh>
        ))}

        {/* Connecting lines */}
        {lineObjects.map((lineObj, curveIdx) => (
          <primitive key={`line-${curveIdx}`} object={lineObj} />
        ))}
      </group>
    </>
  );
}
