import { useRef, useMemo, useEffect, useCallback, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three/webgpu';
import { color, time, oscSine, Fn, float } from 'three/tsl';

/**
 * Paint Canvas — Draw on a 3D surface with mouse
 *
 * Techniques:
 * - Large plane with raycasting for pointer-to-3D mapping
 * - On drag, spawn instanced spheres at intersection point (max 2000)
 * - Color cycles through HSL rainbow based on draw time
 * - Brush size varies with speed: fast = thin, slow = thick
 * - TSL emissive material on paint dots for glow
 * - Clear button resets all paint
 * - Background: atmospheric dark canvas feel
 */

const MAX_PAINT = 2000;

interface PaintDot {
  pos: THREE.Vector3;
  hue: number;
  scale: number;
}

export default function PaintCanvas() {
  const { gl, camera } = useThree();
  const planeRef = useRef<THREE.Mesh>(null);
  const paintMeshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useRef(new THREE.Object3D());
  const raycaster = useRef(new THREE.Raycaster());

  const dots = useRef<PaintDot[]>([]);
  const isPainting = useRef(false);
  const lastPos = useRef<THREE.Vector3 | null>(null);
  const drawTime = useRef(0);
  const [dotCount, setDotCount] = useState(0);
  const _tempColor = useMemo(() => new THREE.Color(), []);

  const paintMat = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.roughness = 0.2;
    mat.metalness = 0.3;
    const pulse = oscSine(time.mul(2.0)).mul(0.15).add(0.85);
    mat.emissiveNode = color(0xffffff).mul(pulse.mul(float(1.5)));
    return mat;
  }, []);

  const planeMat = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.roughness = 0.9;
    mat.metalness = 0.0;
    mat.colorNode = color(0x0a0015);
    // Subtle grid glow
    const grid = Fn(() => {
      return color(0x110030).mul(float(0.5));
    });
    mat.emissiveNode = grid();
    return mat;
  }, []);

  const getRaycastPoint = useCallback((clientX: number, clientY: number) => {
    const rect = (gl.domElement as HTMLCanvasElement).getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.current.setFromCamera(new THREE.Vector2(x, y), camera);
    if (planeRef.current) {
      const hits = raycaster.current.intersectObject(planeRef.current);
      if (hits.length > 0) return hits[0].point.clone();
    }
    return null;
  }, [gl, camera]);

  const addDot = useCallback((point: THREE.Vector3, hue: number, scale: number) => {
    if (dots.current.length >= MAX_PAINT) {
      // Remove oldest
      dots.current.shift();
    }
    dots.current.push({ pos: point, hue, scale });
  }, []);

  const handlePointerDown = useCallback((e: PointerEvent) => {
    const pt = getRaycastPoint(e.clientX, e.clientY);
    if (pt) {
      isPainting.current = true;
      lastPos.current = pt;
      addDot(pt, (drawTime.current * 60) % 360, 0.04);
    }
  }, [getRaycastPoint, addDot]);

  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (!isPainting.current) return;
    const pt = getRaycastPoint(e.clientX, e.clientY);
    if (!pt) return;

    const speed = lastPos.current ? pt.distanceTo(lastPos.current) : 0;
    // Brush size: slow=thick, fast=thin
    const brushSize = Math.max(0.015, 0.06 - speed * 0.3);
    const hue = (drawTime.current * 60) % 360;

    // Add multiple dots along the stroke for smooth lines
    if (lastPos.current) {
      const dist = pt.distanceTo(lastPos.current);
      const steps = Math.max(1, Math.floor(dist / 0.02));
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const interpolated = lastPos.current.clone().lerp(pt, t);
        interpolated.z += (Math.random() - 0.5) * 0.005;
        addDot(interpolated, hue, brushSize);
      }
    }

    lastPos.current = pt.clone();
  }, [getRaycastPoint, addDot]);

  const handlePointerUp = useCallback(() => {
    isPainting.current = false;
    lastPos.current = null;
  }, []);

  useEffect(() => {
    const canvas = gl.domElement as HTMLCanvasElement;
    canvas.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      canvas.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [handlePointerDown, handlePointerMove, handlePointerUp, gl]);

  const handleClear = useCallback(() => {
    dots.current = [];
    setDotCount(0);
  }, []);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.033);
    if (isPainting.current) drawTime.current += dt;

    const mesh = paintMeshRef.current;
    if (!mesh) return;

    const count = dots.current.length;
    for (let i = 0; i < count; i++) {
      const d = dots.current[i];
      dummy.current.position.copy(d.pos);
      dummy.current.scale.setScalar(d.scale);
      dummy.current.updateMatrix();
      mesh.setMatrixAt(i, dummy.current.matrix);
      mesh.setColorAt(i, _tempColor.setHSL(d.hue / 360, 1.0, 0.6));
    }
    // Hide unused slots
    for (let i = count; i < MAX_PAINT; i++) {
      dummy.current.position.set(9999, 9999, 9999);
      dummy.current.scale.setScalar(0);
      dummy.current.updateMatrix();
      mesh.setMatrixAt(i, dummy.current.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.count = count;

    if (Math.abs(count - dotCount) > 10) {
      setDotCount(count);
    }
  });

  return (
    <>
      {/* Background atmosphere */}
      <mesh>
        <sphereGeometry args={[30, 16, 8]} />
        <meshBasicMaterial side={THREE.BackSide} color="#050008" />
      </mesh>

      <color attach="background" args={['#050008']} />

      <fogExp2 attach="fog" color="#020804" density={0.03} />
      <ambientLight intensity={0.08} />
      <hemisphereLight args={['#220044', '#050008', 0.3]} />
      <directionalLight position={[0, 5, 5]} intensity={0.4} />
      <pointLight position={[0, 0, 2]} intensity={15} color="#8844ff" distance={8} />

      {/* Canvas plane */}
      <mesh ref={planeRef} material={planeMat} position={[0, 0, 0]}>
        <planeGeometry args={[10, 7]} />
      </mesh>

      {/* Frame */}
      <lineSegments position={[0, 0, 0.01]}>
        <edgesGeometry args={[new THREE.PlaneGeometry(10.2, 7.2)]} />
        <lineBasicMaterial color="#440088" />
      </lineSegments>

      {/* Paint dots */}
      <instancedMesh
        ref={paintMeshRef}
        args={[undefined, undefined, MAX_PAINT]}
        material={paintMat}
        frustumCulled={false}
      >
        <sphereGeometry args={[1, 8, 8]} />
      </instancedMesh>

      {/* UI */}
      <Html position={[0, -4.2, 0]} center>
        <div style={{
          display: 'flex', gap: 12, alignItems: 'center',
          background: 'rgba(0,0,0,0.6)', padding: '8px 16px',
          borderRadius: 8, border: '1px solid rgba(136,68,255,0.4)',
        }}>
          <span style={{ color: 'rgba(180,130,255,0.8)', fontSize: 13, fontFamily: 'monospace' }}>
            Click + drag to paint · {dotCount}/{MAX_PAINT} dots
          </span>
          <button
            onClick={handleClear}
            style={{
              background: 'rgba(136,68,255,0.3)',
              color: '#cc88ff', border: '1px solid rgba(136,68,255,0.5)',
              padding: '4px 12px', borderRadius: 4, cursor: 'pointer',
              fontSize: 13, fontFamily: 'monospace',
            }}
          >
            Clear
          </button>
        </div>
      </Html>
    </>
  );
}
