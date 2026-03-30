/* eslint-disable react-hooks/purity */
import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
  color,
  time,
  positionWorld,
  normalWorld,
  cameraPosition,
  uv,
  Fn,
  float,
  mix,
  smoothstep,
  hash,
  oscSine,
  fract,
  vec3,
} from 'three/tsl';

/**
 * Alien Megastructure — Non-euclidean architecture with rotating frames, energy conduits, and portal
 *
 * Techniques:
 * 1. 3 nested rotating cubes on different axes, emissive purple-cyan wireframe-like
 * 2. 3 floating torus ring platforms at different heights
 * 3. Energy conduits: instanced cylinder beams with scrolling emissive fract(uv.y + time)
 * 4. Portal: central torus with screen-space UV warp on inner face
 * 5. 200 instanced starfield spheres in background
 * 6. Per-shell bloom halos on central structure
 */

const CONDUIT_COUNT = 20;
const STAR_COUNT = 200;
const HALO_COUNT = 3;

function makeFrameMaterial(axis: number) {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.wireframe = true;

  const axisF = float(axis);
  const fFn = Fn(() => {
    const t = time.mul(float(0.3).add(axisF.mul(float(0.15))));
    const n = hash(positionWorld.mul(float(8.0)));
    const purple = vec3(float(0.65), float(0.1), float(1.0));
    const cyan   = vec3(float(0.1), float(0.85), float(1.0));
    const phase = axisF.div(float(3.0));
    const blend = oscSine(t.add(phase)).mul(float(0.5)).add(float(0.5));
    return mix(purple, cyan, blend).add(vec3(n.mul(float(0.1))));
  });

  mat.colorNode = fFn();
  mat.emissiveNode = fFn().mul(float(3.0));
  mat.roughness = 0.0;
  mat.metalness = 1.0;
  return mat;
}

function makeRingMaterial(level: number) {
  const mat = new THREE.MeshStandardNodeMaterial();
  const levelF = float(level);

  const ringFn = Fn(() => {
    const t = time.mul(float(0.5));
    hash(positionWorld.mul(float(5.0)));
    // Flowing energy pattern on ring
    const flow = fract(positionWorld.y.mul(float(3.0)).add(t.mul(float(1.2))));
    const energyLine = smoothstep(float(0.88), float(0.92), flow).add(
      smoothstep(float(0.42), float(0.46), flow)
    );
    const purple = vec3(float(0.6), float(0.1), float(0.9));
    const cyan   = vec3(float(0.1), float(0.8), float(1.0));
    const gold   = vec3(float(1.0), float(0.75), float(0.1));
    const phaseIdx = levelF.div(float(3.0));
    const c1 = mix(purple, cyan, smoothstep(float(0.3), float(0.6), phaseIdx));
    const base = mix(c1, gold, smoothstep(float(0.65), float(0.9), phaseIdx));
    return base.add(vec3(float(1.0), float(1.0), float(1.0)).mul(energyLine.mul(float(0.5))));
  });

  mat.colorNode = ringFn();
  mat.emissiveNode = ringFn().mul(float(2.5));
  mat.roughness = 0.15;
  mat.metalness = 0.8;
  return mat;
}

function makeConduitMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();

  // Scrolling emissive pattern: fract(uv.y + time)
  const condFn = Fn(() => {
    const uvY = uv().y;
    const t = time.mul(float(1.5));
    const scroll = fract(uvY.mul(float(8.0)).add(t));
    const band = smoothstep(float(0.0), float(0.15), scroll).mul(
      smoothstep(float(0.35), float(0.15), scroll)
    );
    const purple = vec3(float(0.7), float(0.1), float(1.0));
    const cyan   = vec3(float(0.1), float(0.9), float(1.0));
    const n = hash(positionWorld.mul(float(20.0)));
    const base = mix(purple, cyan, n);
    return base.mul(band.mul(float(3.5)).add(float(0.1)));
  });

  mat.colorNode = color(0x220033);
  mat.emissiveNode = condFn();
  mat.roughness = 0.2;
  mat.metalness = 0.6;
  return mat;
}

function makePortalMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;
  mat.side = THREE.DoubleSide;

  const portalFn = Fn(() => {
    const uvCoord = uv();
    const t = time;
    // Screen-space UV warp: concentric rings pulsing outward
    const cx = uvCoord.x.sub(float(0.5));
    const cy = uvCoord.y.sub(float(0.5));
    const r = cx.mul(cx).add(cy.mul(cy)).sqrt();
    const warp = r.mul(float(12.0)).sub(t.mul(float(2.0))).sin().mul(float(0.5)).add(float(0.5));
    const radial = float(1.0).sub(r.mul(float(2.0))).saturate();

    const purple = vec3(float(0.55), float(0.0), float(1.0));
    const cyan   = vec3(float(0.0), float(0.75), float(1.0));
    const white  = vec3(float(0.9), float(0.95), float(1.0));

    const c1 = mix(purple, cyan, warp);
    return mix(c1, white, radial.pow(float(3.0))).mul(float(2.5));
  });

  mat.colorNode = color(0x110022);
  mat.emissiveNode = portalFn();
  mat.opacityNode = float(0.9);
  mat.roughness = 0.0;
  mat.metalness = 0.0;
  return mat;
}

function makeStarMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();
  const starFn = Fn(() => {
    const n = hash(positionWorld.mul(float(100.0)));
    const warm = vec3(float(1.0), float(0.9), float(0.7));
    const cool = vec3(float(0.7), float(0.85), float(1.0));
    return mix(warm, cool, n).mul(n.mul(float(1.5)).add(float(0.5)));
  });
  mat.colorNode = color(0xffffff);
  mat.emissiveNode = starFn();
  mat.roughness = 0.0;
  mat.metalness = 0.0;
  return mat;
}

function makeHaloMaterial(layer: number) {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;
  mat.side = THREE.BackSide;
  mat.depthWrite = false;
  mat.blending = THREE.AdditiveBlending;

  const layerF = float(layer);

  const haloFn = Fn(() => {
    const viewDir = cameraPosition.sub(positionWorld).normalize();
    const nDotV = normalWorld.dot(viewDir).saturate();
    const fresnel = float(1.0).sub(nDotV).pow(float(2.0).add(layerF.mul(float(0.4))));
    const pulse = oscSine(time.mul(float(0.5))).mul(float(0.2)).add(float(0.8));
    const fade = float(1.0).sub(layerF.div(float(HALO_COUNT)));
    return fresnel.mul(pulse).mul(fade).mul(float(0.04));
  });

  mat.opacityNode = haloFn();
  mat.colorNode = color(0xaa44ff);
  mat.emissiveNode = vec3(float(0.6), float(0.2), float(1.0)).mul(haloFn().mul(float(15.0)));
  mat.roughness = 0.0;
  mat.metalness = 0.0;
  return mat;
}

function NestedFrames() {
  const ref0 = useRef<THREE.Mesh>(null);
  const ref1 = useRef<THREE.Mesh>(null);
  const ref2 = useRef<THREE.Mesh>(null);
  const frameMats = useMemo(() => [0,1,2].map(i => makeFrameMaterial(i)), []);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    // Each cube rotates on different axis
    if (ref0.current) ref0.current.rotation.set(t * 0.3, t * 0.2, 0);
    if (ref1.current) ref1.current.rotation.set(0, t * 0.35, t * 0.25);
    if (ref2.current) ref2.current.rotation.set(t * 0.2, 0, t * 0.3);
  });

  const sizes = [1.4, 2.0, 2.7];

  return (
    <>
      <mesh ref={ref0} material={frameMats[0]}>
        <boxGeometry args={[sizes[0], sizes[0], sizes[0]]} />
      </mesh>
      <mesh ref={ref1} material={frameMats[1]}>
        <boxGeometry args={[sizes[1], sizes[1], sizes[1]]} />
      </mesh>
      <mesh ref={ref2} material={frameMats[2]}>
        <boxGeometry args={[sizes[2], sizes[2], sizes[2]]} />
      </mesh>
    </>
  );
}

function TorusPlatforms() {
  const ringMats = useMemo(() => [0,1,2].map(i => makeRingMaterial(i)), []);
  const ref0 = useRef<THREE.Mesh>(null);
  const ref1 = useRef<THREE.Mesh>(null);
  const ref2 = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (ref0.current) ref0.current.rotation.y = t * 0.15;
    if (ref1.current) ref1.current.rotation.y = -t * 0.22;
    if (ref2.current) ref2.current.rotation.y = t * 0.18;
  });

  const heights = [-2.2, 2.8, -4.5];
  const radii = [3.5, 2.8, 4.2];

  return (
    <>
      <mesh ref={ref0} material={ringMats[0]} position={[0, heights[0], 0]}>
        <torusGeometry args={[radii[0], 0.18, 8, 48]} />
      </mesh>
      <mesh ref={ref1} material={ringMats[1]} position={[0, heights[1], 0]}>
        <torusGeometry args={[radii[1], 0.18, 8, 48]} />
      </mesh>
      <mesh ref={ref2} material={ringMats[2]} position={[0, heights[2], 0]}>
        <torusGeometry args={[radii[2], 0.18, 8, 48]} />
      </mesh>
    </>
  );
}

function EnergyConduits() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const conduitMat = useMemo(() => makeConduitMaterial(), []);

  const conduitData = useMemo(() => {
    // Connect conduits between platforms at varied positions
    return Array.from({ length: CONDUIT_COUNT }, (_, i) => {
      const theta = (i / CONDUIT_COUNT) * Math.PI * 2;
      const r = 2.0 + Math.sin(i * 2.3) * 1.0;
      const x1 = r * Math.cos(theta);
      const z1 = r * Math.sin(theta);
      const y1 = -2.2 + Math.random() * 7.0;
      const length = 1.0 + Math.random() * 3.0;
      return { x: x1, y: y1, z: z1, length, theta };
    });
  }, []);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < CONDUIT_COUNT; i++) {
      const d = conduitData[i];
      dummy.position.set(d.x, d.y, d.z);
      dummy.rotation.set(Math.random() * 0.4, d.theta, Math.random() * 0.4);
      dummy.scale.set(0.04, d.length, 0.04);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [conduitData]);

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, CONDUIT_COUNT]} material={conduitMat} frustumCulled={false}>
      <cylinderGeometry args={[1, 1, 1, 6]} />
    </instancedMesh>
  );
}

function Portal() {
  const ref = useRef<THREE.Mesh>(null);
  const portalMat = useMemo(() => makePortalMaterial(), []);

  useFrame(() => {
    if (ref.current) ref.current.rotation.y += 0.003;
  });

  return (
    <mesh ref={ref} material={portalMat} position={[0, 0, 0]}>
      <torusGeometry args={[1.8, 0.4, 12, 64]} />
    </mesh>
  );
}

function Starfield() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const starMat = useMemo(() => makeStarMaterial(), []);

  const matrices = useMemo(() => {
    const dummy = new THREE.Object3D();
    return Array.from({ length: STAR_COUNT }, () => {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 30 + Math.random() * 20;
      dummy.position.set(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.sin(phi) * Math.sin(theta),
        r * Math.cos(phi),
      );
      dummy.scale.setScalar(0.015 + Math.random() * 0.035);
      dummy.updateMatrix();
      return dummy.matrix.clone();
    });
  }, []);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    for (let i = 0; i < matrices.length; i++) mesh.setMatrixAt(i, matrices[i]);
    mesh.instanceMatrix.needsUpdate = true;
  }, [matrices]);

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, STAR_COUNT]} material={starMat} frustumCulled={false}>
      <sphereGeometry args={[1, 4, 4]} />
    </instancedMesh>
  );
}

function HaloShells() {
  const haloMats = useMemo(() => Array.from({ length: HALO_COUNT }, (_, i) => makeHaloMaterial(i)), []);

  return (
    <>
      {haloMats.map((mat, i) => (
        <mesh key={i} material={mat}>
          <sphereGeometry args={[1.8 + i * 0.4, 16, 12]} />
        </mesh>
      ))}
    </>
  );
}

const skyMat = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, colorNode: color(0x020007) });

export default function AlienMegastructure() {
  return (
    <>
      <ambientLight intensity={0.06} color="#110022" />
      <pointLight position={[0, 0, 0]} intensity={4.0} color="#aa44ff" distance={20} />
      <pointLight position={[4, -2, 3]} intensity={3.0} color="#00aaff" distance={15} />
      <pointLight position={[-4, 2, -3]} intensity={2.5} color="#ff22cc" distance={15} />

      {/* Deep space background */}
      <mesh material={skyMat}>
        <sphereGeometry args={[80, 16, 10]} />
      </mesh>

      <Starfield />
      <Portal />
      <NestedFrames />
      <TorusPlatforms />
      <EnergyConduits />
      <HaloShells />
    </>
  );
}
