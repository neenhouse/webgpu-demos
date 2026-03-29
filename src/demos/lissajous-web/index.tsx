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

  // Per-curve TSL materials
  const materials = useMemo(() => {
    return NEON_COLORS.map((col) => {
      const mat = new THREE.MeshStandardNodeMaterial();

      // Fresnel emissive glow
      const glow = Fn(() => {
        const viewDir = cameraPosition.sub(positionWorld).normalize();
        const nDotV = normalWorld.dot(viewDir).saturate();
        const f = float(1.0).sub(nDotV).pow(float(2.5));
        return vec3(col.r, col.g, col.b).mul(f).mul(float(3.0));
      });

      mat.colorNode = vec3(col.r * 0.5, col.g * 0.5, col.b * 0.5);
      mat.emissiveNode = glow();
      mat.roughness = 0.2;
      mat.metalness = 0.6;

      return mat;
    });
  }, []);

  // One shared instanced mesh for all spheres (we'll use a trick: separate mesh per curve)
  const curveMeshes = useMemo(() => {
    // Build 6 separate instanced meshes, one per curve
    return NEON_COLORS.map(() => ({ ref: null as THREE.InstancedMesh | null }));
  }, []);

  const setCurveMeshRef = useCallback((i: number) => (el: THREE.InstancedMesh | null) => {
    curveMeshes[i].ref = el;
  }, [curveMeshes]);

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
      if (!mesh) return;

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

      // Update sphere instances
      for (let i = 0; i < POINTS_PER_CURVE; i++) {
        const t = i / POINTS_PER_CURVE;
        const scale = 0.035 + t * 0.04;
        dummy.position.copy(pts[i]);
        dummy.scale.setScalar(scale);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    });

    // Slow group rotation
    if (groupRef.current) {
      groupRef.current.rotation.y = state.clock.elapsedTime * 0.12;
      groupRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.07) * 0.2;
    }
  });

  return (
    <>
      <ambientLight intensity={0.1} />
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
          >
            <sphereGeometry args={[1, 8, 6]} />
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
