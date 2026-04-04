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
 * Drum Machine Cubes — 4x4 instrument grid with rhythmic beat triggers
 *
 * Techniques: 4x4 grid (16 instruments) × 4 stacked cubes = 64 instanced
 * boxes, CPU 16-step sequencer at 128 BPM, scale-Y pulse + emissive burst
 * on trigger, per-group drum type color palette.
 *
 * Sequencer patterns:
 * - Kick (col 0): beats 0,4,8,12
 * - Snare (col 1): beats 4,12
 * - HiHat (col 2): every 2 steps
 * - Perc (col 3): beats 2,6,10,14
 *
 * Each row has a slightly different timing offset creating polyrhythm feel.
 */

const drumFloorMat = (() => { const m = new THREE.MeshStandardNodeMaterial(); m.color.set(0x050510); m.roughness = 0.05; m.metalness = 0.95; return m; })();

const GRID_W = 4;
const GRID_H = 4;
const INSTRUMENTS = GRID_W * GRID_H; // 16
const STACKS = 4;
const TOTAL_CUBES = INSTRUMENTS * STACKS; // 64

const BPM = 128;
const STEPS = 16;
const STEP_DURATION = 60 / BPM / 4; // 16th note duration

// Drum patterns per column (16 steps each)
const PATTERNS = [
  // Kick
  [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
  // Snare
  [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
  // HiHat
  [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
  // Perc
  [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0],
];

// Color palette per drum type (column)
const DRUM_COLORS = [
  new THREE.Color(1.0, 0.1, 0.05), // Kick: red
  new THREE.Color(0.0, 0.9, 0.9),  // Snare: cyan
  new THREE.Color(1.0, 0.9, 0.1),  // HiHat: yellow
  new THREE.Color(1.0, 0.1, 0.9),  // Perc: magenta
];

const SPACING = 1.8;
const CUBE_SIZE = 0.35;
const STACK_H = 0.3;

export default function DrumMachineCubes() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  // Per-instrument state: trigger time, current scale pulse
  const triggerTimes = useRef<number[]>(new Array(INSTRUMENTS).fill(-999));
  const basePositions = useMemo(() => {
    const pos: THREE.Vector3[] = [];
    for (let col = 0; col < GRID_W; col++) {
      for (let row = 0; row < GRID_H; row++) {
        const x = (col - GRID_W / 2 + 0.5) * SPACING;
        const z = (row - GRID_H / 2 + 0.5) * SPACING;
        pos.push(new THREE.Vector3(x, 0, z));
      }
    }
    return pos;
  }, []);

  // TSL material: position-based emissive color
  const material = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();

    // Color from stored instance color (encoded as hash of X position)
    const colorFn = Fn(() => {
      const px = positionWorld.x;
      // Map X to column 0-3
      const h = hash(px.add(float(10.0)).floor());
      // 4 columns: red, cyan, yellow, magenta
      const red = vec3(1.0, 0.15, 0.1);
      const cyan = vec3(0.0, 0.9, 1.0);
      const yellow = vec3(1.0, 0.85, 0.1);
      const magenta = vec3(1.0, 0.1, 0.85);

      const c1 = mix(red, cyan, smoothstep(float(0.0), float(0.33), h));
      const c2 = mix(c1, yellow, smoothstep(float(0.33), float(0.66), h));
      return mix(c2, magenta, smoothstep(float(0.66), float(1.0), h));
    });
    mat.colorNode = colorFn();
    mat.emissiveNode = colorFn().mul(float(1.5));

    mat.roughness = 0.2;
    mat.metalness = 0.8;

    return mat;
  }, []);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    // Initialize all cubes
    let idx = 0;
    for (let inst = 0; inst < INSTRUMENTS; inst++) {
      const bp = basePositions[inst];
      for (let s = 0; s < STACKS; s++) {
        dummy.position.set(bp.x, s * STACK_H + STACK_H * 0.5, bp.z);
        dummy.scale.setScalar(CUBE_SIZE);
        dummy.updateMatrix();
        mesh.setMatrixAt(idx, dummy.matrix);
        idx++;
      }
    }
    mesh.instanceMatrix.needsUpdate = true;

    // Initialize instance color buffer
    if (!mesh.instanceColor) {
      mesh.instanceColor = new THREE.InstancedBufferAttribute(
        new Float32Array(TOTAL_CUBES * 3), 3
      );
    }
  }, [dummy, basePositions]);

  useFrame(() => {
    const t = performance.now() * 0.001;
    const mesh = meshRef.current;
    if (!mesh) return;

    const currentStep = Math.floor(t / STEP_DURATION) % STEPS;

    // Check triggers for each instrument
    let idx = 0;
    for (let col = 0; col < GRID_W; col++) {
      const pattern = PATTERNS[col];
      for (let row = 0; row < GRID_H; row++) {
        const inst = col * GRID_H + row;
        const bp = basePositions[inst];

        // Row offset creates polyrhythm
        const rowStepOffset = (row * 2) % STEPS;
        const offsetStep = (currentStep + rowStepOffset) % STEPS;
        const triggered = pattern[offsetStep] === 1;

        // Check if this step just triggered (only once per step)
        const lastTriggerStep = Math.floor(triggerTimes.current[inst] / STEP_DURATION);
        const currentStepIndex = Math.floor(t / STEP_DURATION);
        if (triggered && lastTriggerStep !== currentStepIndex) {
          triggerTimes.current[inst] = t;
        }

        const timeSinceTrigger = t - triggerTimes.current[inst];
        const pulseDecay = Math.exp(-timeSinceTrigger * 6.0);

        // Update each stack cube
        for (let s = 0; s < STACKS; s++) {
          const stackFactor = (s + 1) / STACKS;
          const scaleY = CUBE_SIZE * (1.0 + pulseDecay * stackFactor * 2.5);
          const scaleXZ = CUBE_SIZE * (1.0 + pulseDecay * 0.2);
          const yOff = s * STACK_H * (1.0 + pulseDecay * 0.3);

          dummy.position.set(bp.x, yOff + STACK_H * 0.5, bp.z);
          dummy.scale.set(scaleXZ, scaleY, scaleXZ);
          dummy.updateMatrix();
          mesh.setMatrixAt(idx, dummy.matrix);
          idx++;
        }
      }
    }

    mesh.instanceMatrix.needsUpdate = true;
  });

  // Emissive color per-instrument on trigger (use instanceColor)
  useFrame(() => {
    const t = performance.now() * 0.001;
    const mesh = meshRef.current;
    if (!mesh || !mesh.instanceColor) return;

    let idx = 0;
    for (let col = 0; col < GRID_W; col++) {
      const baseCol = DRUM_COLORS[col];
      for (let row = 0; row < GRID_H; row++) {
        const inst = col * GRID_H + row;
        const timeSinceTrigger = t - triggerTimes.current[inst];
        const pulse = Math.exp(-timeSinceTrigger * 5.0);

        for (let s = 0; s < STACKS; s++) {
          const r = baseCol.r * (0.5 + pulse * 2.0);
          const g = baseCol.g * (0.5 + pulse * 2.0);
          const b = baseCol.b * (0.5 + pulse * 2.0);
          mesh.instanceColor.setXYZ(idx, r, g, b);
          idx++;
        }
      }
    }
    mesh.instanceColor.needsUpdate = true;
  });

  return (
    <>
      {/* Background atmosphere */}
      <mesh>
        <sphereGeometry args={[30, 16, 16]} />
        <meshBasicMaterial side={THREE.BackSide} color="#020408" />
      </mesh>

      <color attach="background" args={['#030308']} />

      <fogExp2 attach="fog" args={["#040208", 0.04]} />
      <ambientLight intensity={0.1} />
      <hemisphereLight args={['#334466', '#111122', 0.3]} />
      <directionalLight position={[5, 10, 5]} intensity={0.5} color="#ffffff" />
      <pointLight position={[0, 5, 0]} intensity={8} color="#ff8800" distance={20} />
      <pointLight position={[-4, 3, -4]} intensity={4} color="#ff00ff" distance={12} />
      <pointLight position={[4, 3, 4]} intensity={4} color="#00ffff" distance={12} />

      <instancedMesh
        ref={meshRef}
        args={[undefined, undefined, TOTAL_CUBES]}
        material={material}
        frustumCulled={false}
      >
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>

      {/* Dark stage floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]} material={drumFloorMat}>
        <planeGeometry args={[20, 20]} />
      </mesh>
    </>
  );
}
