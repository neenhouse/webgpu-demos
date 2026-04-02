import { useRef, useMemo, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import { color, time, oscSine, normalWorld, cameraPosition, positionWorld, Fn, float, mix, vec3 } from 'three/tsl';

/**
 * Click to Reveal — 16 mystery cubes that open to reveal inner objects
 *
 * Techniques:
 * - Grid of 16 cubes, each storing an animation state
 * - Click triggers open/close animation (scale + rotation over 0.5s)
 * - Different inner shapes per cube: sphere, torus, octahedron, crystal, etc.
 * - Inner objects pulse with emissive glow once revealed
 * - Previously opened cube closes when a new one is clicked
 * - TSL materials with fresnel glow on outer shells
 */

const GRID_SIZE = 4;
const CUBE_COUNT = GRID_SIZE * GRID_SIZE;
const SPACING = 1.4;
const ANIM_DURATION = 0.5;

type RevealShape = 'sphere' | 'torus' | 'octahedron' | 'tetrahedron' | 'icosahedron' | 'torusKnot' | 'cone' | 'cylinder';

const SHAPES: RevealShape[] = [
  'sphere', 'torus', 'octahedron', 'tetrahedron',
  'icosahedron', 'torusKnot', 'cone', 'cylinder',
  'sphere', 'octahedron', 'torus', 'icosahedron',
  'tetrahedron', 'torusKnot', 'cone', 'sphere',
];

const INNER_COLORS = [
  0xff4466, 0x44ffcc, 0xffaa00, 0x8844ff,
  0x44ff88, 0xff44cc, 0x44aaff, 0xffff44,
  0xff6644, 0x44ffaa, 0xcc44ff, 0xff8844,
  0x4488ff, 0xff44aa, 0x88ff44, 0xffcc44,
];

interface CubeState {
  open: number; // 0=closed, 1=open
  animDir: number; // 1=opening, -1=closing
  animT: number; // 0..1
}

function InnerShape({ shape, colorHex }: { shape: RevealShape; colorHex: number }) {
  const mat = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.roughness = 0.1;
    mat.metalness = 0.3;
    const pulse = oscSine(time.mul(2.0)).mul(0.4).add(0.6);
    mat.colorNode = color(colorHex);
    mat.emissiveNode = color(colorHex).mul(pulse.mul(2.5));
    return mat;
  }, [colorHex]);

  const haloMat = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.transparent = true;
    mat.side = THREE.BackSide;
    mat.depthWrite = false;
    mat.blending = THREE.AdditiveBlending;
    const fresnel = Fn(() => {
      const viewDir = cameraPosition.sub(positionWorld).normalize();
      const nDotV = normalWorld.dot(viewDir).saturate();
      return float(1.0).sub(nDotV).pow(2.0);
    });
    const pulse = oscSine(time.mul(2.0)).mul(0.3).add(0.7);
    mat.emissiveNode = color(colorHex).mul(fresnel().mul(pulse.mul(3.0)));
    mat.opacityNode = fresnel().mul(float(0.7));
    return mat;
  }, [colorHex]);

  const geo = useMemo(() => {
    switch (shape) {
      case 'sphere': return <sphereGeometry args={[0.22, 20, 16]} />;
      case 'torus': return <torusGeometry args={[0.15, 0.07, 12, 20]} />;
      case 'octahedron': return <octahedronGeometry args={[0.22, 0]} />;
      case 'tetrahedron': return <tetrahedronGeometry args={[0.24, 0]} />;
      case 'icosahedron': return <icosahedronGeometry args={[0.22, 0]} />;
      case 'torusKnot': return <torusKnotGeometry args={[0.14, 0.05, 64, 8]} />;
      case 'cone': return <coneGeometry args={[0.15, 0.32, 12]} />;
      case 'cylinder': return <cylinderGeometry args={[0.1, 0.1, 0.32, 12]} />;
    }
  }, [shape]);

  return (
    <group>
      <mesh material={mat}>{geo}</mesh>
      <mesh material={haloMat} scale={[2.0, 2.0, 2.0]}>{geo}</mesh>
    </group>
  );
}

export default function ClickToReveal() {
  const [cubeStates, setCubeStates] = useState<CubeState[]>(() =>
    Array.from({ length: CUBE_COUNT }, () => ({ open: 0, animDir: 0, animT: 0 }))
  );
  const [, setActiveIndex] = useState<number>(-1);
  const statesRef = useRef(cubeStates);
  const meshRefs = useRef<(THREE.Mesh | null)[]>(Array(CUBE_COUNT).fill(null));
  const innerGroupRefs = useRef<(THREE.Group | null)[]>(Array(CUBE_COUNT).fill(null));

  const handleClick = (idx: number) => {
    setCubeStates(prev => {
      const next = prev.map((s, i) => {
        if (i === idx) {
          // Toggle open/close
          return { ...s, animDir: s.open > 0.5 ? -1 : 1, animT: s.animT };
        } else if (prev[i].open > 0.5 || prev[i].animDir > 0) {
          // Close previously open cube
          return { ...s, animDir: -1 };
        }
        return s;
      });
      statesRef.current = next;
      return next;
    });
    setActiveIndex(idx);
  };

  const outerMat = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.roughness = 0.3;
    mat.metalness = 0.6;
    const fresnel = Fn(() => {
      const viewDir = cameraPosition.sub(positionWorld).normalize();
      const nDotV = normalWorld.dot(viewDir).saturate();
      return float(1.0).sub(nDotV).pow(3.0);
    });
    mat.colorNode = mix(vec3(0.05, 0.05, 0.2), vec3(0.2, 0.1, 0.4), fresnel());
    mat.emissiveNode = color(0x220066).mul(fresnel().mul(1.5));
    return mat;
  }, []);

  const openMat = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.roughness = 0.2;
    mat.metalness = 0.8;
    const pulse = oscSine(time.mul(3.0)).mul(0.3).add(0.7);
    mat.colorNode = color(0x441188);
    mat.emissiveNode = color(0x8844ff).mul(pulse.mul(2.0));
    return mat;
  }, []);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.033);
    setCubeStates(prev => {
      let changed = false;
      const next = prev.map((s) => {
        if (s.animDir === 0) return s;
        let t = s.animT + s.animDir * dt / ANIM_DURATION;
        t = Math.max(0, Math.min(1, t));
        const open = t;
        const newDir = t <= 0 || t >= 1 ? 0 : s.animDir;
        changed = true;
        return { open, animDir: newDir, animT: t };
      });
      statesRef.current = next;
      if (!changed) return prev;
      return next;
    });

    // Update mesh transforms based on animation
    for (let i = 0; i < CUBE_COUNT; i++) {
      const s = statesRef.current[i];
      const mesh = meshRefs.current[i];
      const innerGroup = innerGroupRefs.current[i];

      if (mesh) {
        // Outer cube: open animation = lift lid halves + scale
        const eased = Math.pow(s.open, 0.5);
        mesh.rotation.x = eased * Math.PI * 0.35;
        mesh.rotation.y = eased * Math.PI * 0.15;
        const sc = 1.0 - eased * 0.3;
        mesh.scale.setScalar(sc);
        mesh.material = s.open > 0.01 ? openMat : outerMat;
      }

      if (innerGroup) {
        const ease = Math.max(0, (s.open - 0.3) / 0.7);
        const scaleVal = ease;
        innerGroup.scale.setScalar(scaleVal);
        innerGroup.rotation.y = ease * Math.PI * 2;
      }
    }
  });

  const gridPositions = useMemo(() => {
    const pos: [number, number, number][] = [];
    const offset = ((GRID_SIZE - 1) * SPACING) / 2;
    for (let row = 0; row < GRID_SIZE; row++) {
      for (let col = 0; col < GRID_SIZE; col++) {
        pos.push([col * SPACING - offset, row * SPACING - offset, 0]);
      }
    }
    return pos;
  }, []);

  return (
    <>
      {/* Background atmosphere */}
      <mesh>
        <sphereGeometry args={[30, 16, 8]} />
        <meshBasicMaterial side={THREE.BackSide} color="#060012" />
      </mesh>

      <color attach="background" args={['#060012']} />

      <fogExp2 attach="fog" color="#020408" density={0.04} />
      <ambientLight intensity={0.1} />
      <hemisphereLight args={['#220044', '#060012', 0.4]} />
      <directionalLight position={[3, 5, 5]} intensity={0.6} />
      <pointLight position={[0, 0, 4]} intensity={25} color="#8844ff" distance={12} />

      {gridPositions.map((pos, i) => (
        <group key={i} position={pos}>
          {/* Outer cube (clickable) */}
          <mesh
            ref={el => { meshRefs.current[i] = el; }}
            material={outerMat}
            onClick={() => handleClick(i)}
          >
            <boxGeometry args={[0.85, 0.85, 0.85]} />
          </mesh>

          {/* Inner reveal object */}
          <group
            ref={el => { innerGroupRefs.current[i] = el; }}
            scale={[0, 0, 0]}
          >
            <InnerShape shape={SHAPES[i]} colorHex={INNER_COLORS[i]} />
          </group>

          {/* Subtle point light that activates when open */}
          {statesRef.current[i]?.open > 0.5 && (
            <pointLight
              position={[0, 0, 0]}
              intensity={statesRef.current[i].open * 8}
              color={new THREE.Color(INNER_COLORS[i])}
              distance={3}
            />
          )}
        </group>
      ))}
    </>
  );
}
