import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
  time,
  positionLocal,
  positionWorld,
  normalWorld,
  cameraPosition,
  uv,
  Fn,
  float,
  vec3,
  mix,
  smoothstep,
  sin,
  cos,
  hash,
} from 'three/tsl';

/**
 * Sonic Bloom — Procedural flowers that bloom to simulated harmonic overtone series
 *
 * Techniques: 5 flowers at different positions, each with 8-12 instanced petal
 * planes radially arranged, CPU simulates harmonic series, each flower responds
 * to different harmonic, petal open angle driven by amplitude, gradient petal
 * material, 100 pollen particles floating up, bloom halos per flower center.
 *
 * Harmonics 1-5 are simulated as sine waves at fundamental × N.
 * Flower 1 = fundamental, Flower 2 = 2nd harmonic (octave), etc.
 */

const FLOWERS = 5;
const MAX_PETALS = 12;
const POLLEN_COUNT = 100;

// Flower configurations
const FLOWER_CONFIGS = [
  { pos: new THREE.Vector3(0, 0, 0),      petals: 12, harmonic: 1, scale: 1.2 },
  { pos: new THREE.Vector3(-3, 0.5, -1),  petals: 10, harmonic: 2, scale: 1.0 },
  { pos: new THREE.Vector3(3, 0.3, -1),   petals: 8,  harmonic: 3, scale: 0.9 },
  { pos: new THREE.Vector3(-1.5, 0, -3),  petals: 10, harmonic: 4, scale: 0.85 },
  { pos: new THREE.Vector3(1.5, 0.2, -2), petals: 12, harmonic: 5, scale: 0.8 },
];

const TOTAL_PETALS = FLOWER_CONFIGS.reduce((sum, f) => sum + f.petals, 0);

// Harmonic amplitudes computed each frame
const HARMONIC_AMPS: number[] = [0, 0, 0, 0, 0];
const FUNDAMENTAL_HZ = 2.0; // simulated "note" at 2Hz

export default function SonicBloom() {
  const petalMeshRef = useRef<THREE.InstancedMesh>(null);
  const pollenMeshRef = useRef<THREE.InstancedMesh>(null);
  const haloRefs = useRef<(THREE.Mesh | null)[]>([]);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  // Pollen particle positions (CPU-driven)
  const pollenData = useMemo(() => {
    return Array.from({ length: POLLEN_COUNT }, (_, i) => {
      const flowerIdx = i % FLOWERS;
      const cfg = FLOWER_CONFIGS[flowerIdx];
      return {
        flowerIdx,
        angle: Math.random() * Math.PI * 2,
        radius: 0.3 + Math.random() * 0.8,
        yOffset: Math.random() * 2.0,
        speed: 0.3 + Math.random() * 0.5,
        driftAngle: Math.random() * Math.PI * 2,
        baseX: cfg.pos.x,
        baseZ: cfg.pos.z,
      };
    });
  }, []);

  // Petal material: gradient from center (yellow) to tip (pink/purple)
  const petalMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.transparent = true;
    mat.side = THREE.DoubleSide;

    const colorFn = Fn(() => {
      const uvCoord = uv();
      // UV.y = 0 at base of petal, 1 at tip
      const py = uvCoord.y;

      // Gradient: warm yellow at base -> pink -> purple tip
      const base = vec3(1.0, 0.9, 0.2);
      const mid = vec3(1.0, 0.3, 0.6);
      const tip = vec3(0.6, 0.1, 0.9);

      const t1 = smoothstep(float(0.0), float(0.4), py);
      const t2 = smoothstep(float(0.4), float(1.0), py);

      const c1 = mix(base, mid, t1);
      return mix(c1, tip, t2);
    });
    mat.colorNode = colorFn();

    // Emissive glow at tips
    const emissiveFn = Fn(() => {
      const uvCoord = uv();
      const tipGlow = smoothstep(float(0.6), float(1.0), uvCoord.y);
      const shimmer = sin(time.mul(3.0).add(positionLocal.x.mul(5.0))).mul(float(0.3)).add(float(0.7));
      return vec3(1.0, 0.4, 0.9).mul(tipGlow).mul(shimmer).mul(float(1.5));
    });
    mat.emissiveNode = emissiveFn();

    // Petal alpha: wider at base, tapers to tip
    mat.alphaTest = 0.05;
    const opacityFn = Fn(() => {
      const uvCoord = uv();
      const cx = uvCoord.x.sub(float(0.5)).abs();
      const petalShape = smoothstep(float(0.5), float(0.0), cx.div(float(0.5).sub(uvCoord.y.mul(float(0.4))).max(float(0.05))));
      return petalShape.mul(float(0.88));
    });
    mat.opacityNode = opacityFn();

    mat.roughness = 0.4;
    mat.metalness = 0.0;

    return mat;
  }, []);

  // Pollen material
  const pollenMaterial = useMemo(() => {
    const mat = new THREE.MeshBasicNodeMaterial();
    mat.transparent = true;

    const pollenFn = Fn(() => {
      const h = hash(positionWorld.xz.floor().add(float(7.3)));
      const alpha = float(0.6).add(h.mul(float(0.4)));
      return vec3(1.0, 0.95, 0.4).mul(alpha);
    });
    mat.colorNode = pollenFn();

    return mat;
  }, []);

  // Halo material
  const haloMaterial = useMemo(() => {
    const mat = new THREE.MeshBasicNodeMaterial();
    mat.transparent = true;
    mat.blending = THREE.AdditiveBlending;
    mat.depthWrite = false;
    mat.side = THREE.BackSide;

    const haloFn = Fn(() => {
      const uvCoord = uv();
      const dist = uvCoord.sub(float(0.5)).length().mul(float(2.0));
      const glow = smoothstep(float(1.0), float(0.0), dist).mul(float(0.4));
      return vec3(1.0, 0.8, 0.3).mul(glow);
    });
    mat.colorNode = haloFn();
    return mat;
  }, []);

  useFrame((state) => {
    const t = performance.now() * 0.001;
    const petalMesh = petalMeshRef.current;
    const pollenMesh = pollenMeshRef.current;
    if (!petalMesh) return;

    // Compute harmonic amplitudes
    for (let h = 0; h < FLOWERS; h++) {
      const harmN = h + 1;
      const freq = FUNDAMENTAL_HZ * harmN;
      // Higher harmonics are softer
      const baseAmp = 1.0 / harmN;
      HARMONIC_AMPS[h] = baseAmp * Math.pow(Math.max(0, Math.sin(t * Math.PI * 2 * freq * 0.3)), 2);
    }

    // Update petal instances
    let petalIdx = 0;
    for (let fi = 0; fi < FLOWERS; fi++) {
      const cfg = FLOWER_CONFIGS[fi];
      const amp = HARMONIC_AMPS[fi];
      // Petal open angle: 0=closed, PI/2=fully open
      const openAngle = amp * Math.PI * 0.45 + 0.05;

      for (let pi = 0; pi < cfg.petals; pi++) {
        const radialAngle = (pi / cfg.petals) * Math.PI * 2;
        // Slight wobble per petal
        const wobble = Math.sin(t * 2.0 + pi * 0.5) * 0.05;

        // Petal rotates outward from stem
        const petalLength = 0.8 * cfg.scale;

        dummy.position.set(cfg.pos.x, cfg.pos.y, cfg.pos.z);
        dummy.rotation.set(0, radialAngle + wobble, 0);
        dummy.updateMatrix();

        // Pivot around flower center — place petal tip outward
        const tiltMatrix = new THREE.Matrix4().makeRotationX(-(openAngle));
        const translateMatrix = new THREE.Matrix4().makeTranslation(0, petalLength * 0.5, 0);
        const scaleMatrix = new THREE.Matrix4().makeScale(petalLength * 0.35, petalLength, 0.01);

        dummy.matrix.multiply(tiltMatrix).multiply(translateMatrix).multiply(scaleMatrix);

        petalMesh.setMatrixAt(petalIdx, dummy.matrix);
        petalIdx++;
      }
    }

    petalMesh.instanceMatrix.needsUpdate = true;

    // Update pollen
    if (pollenMesh) {
      for (let p = 0; p < POLLEN_COUNT; p++) {
        const pd = pollenData[p];
        const fi = pd.flowerIdx;
        const amp = HARMONIC_AMPS[fi];
        const cfg = FLOWER_CONFIGS[fi];

        // Pollen floats up and drifts
        const yRise = ((t * pd.speed + pd.yOffset) % 3.0);
        const x = cfg.pos.x + Math.cos(pd.angle + t * 0.3) * (pd.radius * (0.3 + amp * 0.7));
        const y = cfg.pos.y + yRise * 0.8;
        const z = cfg.pos.z + Math.sin(pd.angle + t * 0.3) * (pd.radius * (0.3 + amp * 0.7));

        const pollenSize = 0.025 + amp * 0.015;
        dummy.position.set(x, y, z);
        dummy.scale.setScalar(pollenSize);
        dummy.updateMatrix();
        pollenMesh.setMatrixAt(p, dummy.matrix);
      }
      pollenMesh.instanceMatrix.needsUpdate = true;
    }

    // Update halos
    for (let fi = 0; fi < FLOWERS; fi++) {
      const halo = haloRefs.current[fi];
      if (halo) {
        const amp = HARMONIC_AMPS[fi];
        const haloScale = 0.4 + amp * 1.2;
        halo.scale.setScalar(haloScale * FLOWER_CONFIGS[fi].scale);
        // Face camera
        halo.lookAt(state.camera.position);
      }
    }
  });

  return (
    <>
      <color attach="background" args={['#050210']} />
      <ambientLight intensity={0.2} />
      <directionalLight position={[4, 8, 3]} intensity={0.8} color="#ffe8cc" />
      <pointLight position={[0, 3, 1]} intensity={5} color="#ff88cc" distance={12} />
      <pointLight position={[-3, 2, -2]} intensity={3} color="#8844ff" distance={10} />
      <pointLight position={[3, 2, -2]} intensity={3} color="#ffaa22" distance={10} />

      {/* Petals */}
      <instancedMesh
        ref={petalMeshRef}
        args={[undefined, undefined, TOTAL_PETALS]}
        material={petalMaterial}
      >
        <planeGeometry args={[1, 1, 4, 8]} />
      </instancedMesh>

      {/* Pollen particles */}
      <instancedMesh
        ref={pollenMeshRef}
        args={[undefined, undefined, POLLEN_COUNT]}
        material={pollenMaterial}
      >
        <sphereGeometry args={[1, 6, 6]} />
      </instancedMesh>

      {/* Flower centers (stamens) */}
      {FLOWER_CONFIGS.map((cfg, fi) => (
        <group key={fi} position={cfg.pos.toArray()}>
          {/* Stem */}
          <mesh position={[0, -0.6, 0]}>
            <cylinderGeometry args={[0.03, 0.04, 1.2, 8]} />
            <meshStandardNodeMaterial
              color={new THREE.Color(0.15, 0.5, 0.15)}
              roughness={0.8}
            />
          </mesh>
          {/* Center sphere */}
          <mesh>
            <sphereGeometry args={[0.12 * cfg.scale, 12, 12]} />
            <meshStandardNodeMaterial
              color={new THREE.Color(1.0, 0.85, 0.1)}
              roughness={0.3}
              metalness={0.2}
              emissive={new THREE.Color(0.8, 0.5, 0.0)}
              emissiveIntensity={1.0}
            />
          </mesh>
          {/* Bloom halo */}
          <mesh
            ref={(el) => { haloRefs.current[fi] = el; }}
            position={[0, 0, 0]}
          >
            <planeGeometry args={[1, 1]} />
            <primitive object={haloMaterial} attach="material" />
          </mesh>
        </group>
      ))}

      {/* Ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.2, 0]}>
        <planeGeometry args={[20, 20]} />
        <meshStandardNodeMaterial
          color={new THREE.Color(0.05, 0.12, 0.04)}
          roughness={0.9}
          metalness={0.0}
        />
      </mesh>
    </>
  );
}
