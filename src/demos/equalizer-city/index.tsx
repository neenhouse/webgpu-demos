import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
  positionWorld,
  Fn,
  float,
  vec3,
  mix,
  smoothstep,
  hash,
} from 'three/tsl';

/**
 * Equalizer City — Cityscape of 200 instanced buildings animated by frequency bands
 *
 * Techniques: 200 instanced boxes, CPU frequency simulation with each building
 * assigned to a frequency band by X position, 4-stop neon palette via hash,
 * Y-flip reflections, BackSide sky dome, window lights via hash.
 *
 * Buildings in the left columns respond to bass frequencies, right columns to
 * treble. Heights pulse with frequency amplitudes creating an equalizer effect
 * across the skyline.
 */

const BUILDING_COUNT = 200;
const GRID_W = 20;
const GRID_D = 10;
const SPACING_X = 0.9;
const SPACING_Z = 1.1;
const FREQ_BANDS = 20; // number of frequency bands (one per column)

export default function EqualizerCity() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const reflMeshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  // Per-building random properties
  const buildingProps = useMemo(() => {
    const props: { baseH: number; bandIndex: number; rowDepth: number; xPos: number; zPos: number }[] = [];
    for (let col = 0; col < GRID_W; col++) {
      for (let row = 0; row < GRID_D; row++) {
        const x = (col - GRID_W / 2 + 0.5) * SPACING_X;
        const z = (row - GRID_D / 2 + 0.5) * SPACING_Z;
        props.push({
          baseH: 0.3 + Math.random() * 0.5,
          bandIndex: col % FREQ_BANDS,
          rowDepth: row / GRID_D,
          xPos: x,
          zPos: z,
        });
      }
    }
    return props;
  }, []);

  // Building material: 4-stop neon color from hash + height gradient
  const buildingMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();

    const colorFn = Fn(() => {
      const px = positionWorld.x;
      const py = positionWorld.y;
      const pz = positionWorld.z;

      // Hash for neon color palette per building
      const h = hash(px.add(pz.mul(float(13.7))).floor());

      const neonBlue = vec3(0.05, 0.3, 1.0);
      const neonPink = vec3(1.0, 0.05, 0.6);
      const neonCyan = vec3(0.0, 0.9, 1.0);
      const neonYellow = vec3(1.0, 0.8, 0.1);

      const c1 = mix(neonBlue, neonPink, smoothstep(float(0.0), float(0.33), h));
      const c2 = mix(c1, neonCyan, smoothstep(float(0.33), float(0.66), h));
      const buildingColor = mix(c2, neonYellow, smoothstep(float(0.66), float(1.0), h));

      // Slightly lighter at top
      const topBright = smoothstep(float(0.0), float(5.0), py).mul(float(0.5)).add(float(1.0));
      return buildingColor.mul(topBright);
    });
    mat.colorNode = colorFn();

    // Window light emissive via hash
    const emissiveFn = Fn(() => {
      const px = positionWorld.x;
      const py = positionWorld.y;
      const pz = positionWorld.z;

      // Window grid pattern
      const winX = hash(px.floor().add(pz.mul(float(7.3))).floor());
      const winY = hash(py.mul(float(3.0)).floor().add(px.mul(float(5.1))).add(pz.mul(float(9.7))));
      const isLit = smoothstep(float(0.65), float(0.7), winX.mul(winY));

      const h = hash(px.add(pz.mul(float(13.7))).floor());
      const windowColor = mix(
        vec3(1.0, 0.9, 0.6),
        vec3(0.4, 0.8, 1.0),
        h
      );

      return windowColor.mul(isLit).mul(float(1.5));
    });
    mat.emissiveNode = emissiveFn();

    mat.roughness = 0.4;
    mat.metalness = 0.6;

    return mat;
  }, []);

  // Initialize matrices
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    for (let i = 0; i < BUILDING_COUNT; i++) {
      const bp = buildingProps[i];
      dummy.position.set(bp.xPos, 0.5, bp.zPos);
      dummy.scale.set(0.7 + Math.random() * 0.2, 1.0, 0.7 + Math.random() * 0.2);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [dummy, buildingProps]);

  // Frequency simulation
  const freqAmps = useRef(new Float32Array(FREQ_BANDS));

  useFrame(() => {
    const t = performance.now() * 0.001;
    const mesh = meshRef.current;
    const reflMesh = reflMeshRef.current;
    if (!mesh) return;

    // Simulate frequency bands: bass on left, treble on right
    // Bass bands pulse at low frequency, treble faster
    for (let b = 0; b < FREQ_BANDS; b++) {
      const bandNorm = b / FREQ_BANDS; // 0=bass, 1=treble
      const freqHz = 0.5 + bandNorm * 8.0; // 0.5Hz to 8.5Hz pulse rate
      const phase = b * 0.4;
      // Sharp exponential pulse for bass, smoother for treble
      const sharpness = 4.0 + bandNorm * 6.0;
      freqAmps.current[b] = Math.pow(Math.max(0, Math.sin(t * Math.PI * 2 * freqHz + phase)), sharpness);
    }

    for (let i = 0; i < BUILDING_COUNT; i++) {
      const bp = buildingProps[i];
      const amp = freqAmps.current[bp.bandIndex];
      // Back rows are shorter
      const depthScale = 1.0 - bp.rowDepth * 0.3;
      const h = bp.baseH + amp * 4.0 * depthScale;

      dummy.position.set(bp.xPos, h * 0.5, bp.zPos);
      dummy.scale.set(
        0.6 + bp.bandIndex * 0.01,
        h,
        0.65 + bp.rowDepth * 0.05
      );
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      if (reflMesh) {
        // Reflection: flip Y below ground
        dummy.position.set(bp.xPos, -h * 0.5 - 0.05, bp.zPos);
        dummy.scale.set(
          0.6 + bp.bandIndex * 0.01,
          h * 0.8,
          0.65 + bp.rowDepth * 0.05
        );
        dummy.updateMatrix();
        reflMesh.setMatrixAt(i, dummy.matrix);
      }
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (reflMesh) reflMesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      <color attach="background" args={['#000510']} />
      <fog attach="fog" args={['#000510', 15, 35]} />
      <ambientLight intensity={0.05} />
      <directionalLight position={[0, 15, 5]} intensity={0.3} color="#6688ff" />
      <pointLight position={[0, 8, 0]} intensity={10} color="#ff0066" distance={25} />
      <pointLight position={[-8, 4, 0]} intensity={5} color="#0088ff" distance={18} />
      <pointLight position={[8, 4, 0]} intensity={5} color="#00ffaa" distance={18} />
      <pointLight position={[0, 2, -6]} intensity={6} color="#ff8800" distance={15} />

      {/* Main buildings */}
      <instancedMesh
        ref={meshRef}
        args={[undefined, undefined, BUILDING_COUNT]}
        material={buildingMaterial}
        castShadow
      >
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>

      {/* Reflections */}
      <instancedMesh
        ref={reflMeshRef}
        args={[undefined, undefined, BUILDING_COUNT]}
        material={buildingMaterial}
      >
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>

      {/* Ground / water reflection */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <planeGeometry args={[40, 30]} />
        <meshStandardNodeMaterial
          color={new THREE.Color(0x000818)}
          roughness={0.02}
          metalness={0.98}
        />
      </mesh>

      {/* Sky dome (BackSide) */}
      <mesh>
        <sphereGeometry args={[40, 32, 16]} />
        <meshBasicNodeMaterial
          color={new THREE.Color(0x000518)}
          side={THREE.BackSide}
        />
      </mesh>
    </>
  );
}
