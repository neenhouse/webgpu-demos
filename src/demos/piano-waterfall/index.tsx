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
 * Piano Waterfall — 88-key MIDI waterfall with cascading note blocks
 *
 * Techniques: 88 keys × max 8 simultaneous notes ≈ 700 instanced boxes,
 * CPU generates random pentatonic note events, notes scroll downward, color
 * by pitch (low=red, mid=green, high=blue), velocity -> emissive, bottom
 * row of 88 thin boxes as keyboard.
 *
 * Notes are generated at random intervals on random pentatonic scale degrees.
 * They fall from the top of the viewport toward the keyboard.
 */

const KEY_COUNT = 88;
const MAX_NOTES = 8; // max simultaneous notes per key
const NOTE_SLOTS = KEY_COUNT * MAX_NOTES; // 704 note boxes
const KEY_WIDTH = 0.14;
const KEY_SPACING = 0.145;
const WATERFALL_HEIGHT = 12.0;
const FALL_SPEED = 3.5;

// Pentatonic-style note triggers (simulated)
const PENTATONIC_KEYS = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31, 33];

interface NoteEvent {
  keyIndex: number;
  startTime: number;
  duration: number;
  velocity: number; // 0..1
  active: boolean;
}

const pianoBackingMat = (() => { const m = new THREE.MeshStandardNodeMaterial(); m.color.set(0x0a0a10); m.roughness = 0.5; m.metalness = 0.5; return m; })();
const pianoLineMat = (() => { const m = new THREE.MeshBasicNodeMaterial(); m.color.set(new THREE.Color(0.5, 0.5, 1.0)); return m; })();

export default function PianoWaterfall() {
  const noteMeshRef = useRef<THREE.InstancedMesh>(null);
  const keyMeshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  // Active note pool
  const notePool = useRef<NoteEvent[]>([]);
  const nextNoteTime = useRef(0);

  // Initialize note pool
  useEffect(() => {
    notePool.current = Array.from({ length: NOTE_SLOTS }, (_, i) => ({
      keyIndex: i % KEY_COUNT,
      startTime: -999,
      duration: 0.3 + Math.random() * 1.2,
      velocity: 0.5 + Math.random() * 0.5,
      active: false,
    }));
  }, []);

  // Initialize keyboard instance matrices
  useEffect(() => {
    const mesh = keyMeshRef.current;
    if (!mesh) return;
    for (let k = 0; k < KEY_COUNT; k++) {
      const x = (k - KEY_COUNT / 2 + 0.5) * KEY_SPACING;
      dummy.position.set(x, -6.5, 0);
      dummy.scale.set(KEY_WIDTH, 0.12, 0.4);
      dummy.updateMatrix();
      mesh.setMatrixAt(k, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [dummy]);

  // Note material: pitch-based color (low=red, mid=green, high=blue)
  const noteMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();

    const colorFn = Fn(() => {
      const px = positionWorld.x;
      // Map X position to pitch (0=leftmost key, 1=rightmost)
      const pitchNorm = px.add(float(KEY_COUNT * KEY_SPACING * 0.5)).div(float(KEY_COUNT * KEY_SPACING)).saturate();

      const red = vec3(1.0, 0.1, 0.05);
      const green = vec3(0.1, 0.9, 0.2);
      const blue = vec3(0.1, 0.4, 1.0);

      const c1 = mix(red, green, smoothstep(float(0.0), float(0.5), pitchNorm));
      return mix(c1, blue, smoothstep(float(0.5), float(1.0), pitchNorm));
    });
    mat.colorNode = colorFn();

    // Emissive based on velocity (stored via hash of Y — simulated)
    const emissiveFn = Fn(() => {
      const px = positionWorld.x;
      const py = positionWorld.y;
      const pitchNorm = px.add(float(KEY_COUNT * KEY_SPACING * 0.5)).div(float(KEY_COUNT * KEY_SPACING)).saturate();

      const red = vec3(1.0, 0.1, 0.05);
      const green = vec3(0.1, 0.9, 0.2);
      const blue = vec3(0.1, 0.4, 1.0);

      const c1 = mix(red, green, smoothstep(float(0.0), float(0.5), pitchNorm));
      const noteColor = mix(c1, blue, smoothstep(float(0.5), float(1.0), pitchNorm));

      // Velocity glow from hash of position
      const vel = hash(px.floor().add(py.mul(float(0.1)).floor().mul(float(17.3))));
      return noteColor.mul(vel.mul(float(1.8)).add(float(0.2)));
    });
    mat.emissiveNode = emissiveFn();

    mat.roughness = 0.2;
    mat.metalness = 0.3;
    mat.transparent = true;
    mat.opacity = 0.9;

    return mat;
  }, []);

  // Keyboard material
  const keyMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();

    const keyColorFn = Fn(() => {
      const px = positionWorld.x;
      // Black keys: every 2nd key in groups of 5/7
      const keyNum = px.add(float(KEY_COUNT * KEY_SPACING * 0.5)).div(float(KEY_SPACING)).floor();
      const mod12 = keyNum.mod(float(12.0));
      // Black key positions in octave: 1, 3, 6, 8, 10
      const h = hash(mod12);
      const isBlack = smoothstep(float(0.6), float(0.7), h);
      return mix(vec3(0.95, 0.95, 0.95), vec3(0.05, 0.05, 0.05), isBlack);
    });
    mat.colorNode = keyColorFn();
    mat.roughness = 0.3;
    mat.metalness = 0.1;

    return mat;
  }, []);

  useFrame(() => {
    const t = performance.now() * 0.001;
    const noteMesh = noteMeshRef.current;
    if (!noteMesh) return;

    // Spawn new notes at intervals
    if (t > nextNoteTime.current) {
      nextNoteTime.current = t + 0.05 + Math.random() * 0.15;

      // Find inactive slot
      const slot = notePool.current.findIndex(n => !n.active);
      if (slot !== -1) {
        // Pick random pentatonic key
        const pentatonicDeg = PENTATONIC_KEYS[Math.floor(Math.random() * PENTATONIC_KEYS.length)];
        const octave = Math.floor(Math.random() * 5);
        const keyIndex = Math.min(KEY_COUNT - 1, pentatonicDeg + octave * 12 + 10);

        notePool.current[slot] = {
          keyIndex,
          startTime: t,
          duration: 0.4 + Math.random() * 1.5,
          velocity: 0.5 + Math.random() * 0.5,
          active: true,
        };
      }
    }

    // Update each note box
    for (let i = 0; i < NOTE_SLOTS; i++) {
      const note = notePool.current[i];
      const x = (note.keyIndex - KEY_COUNT / 2 + 0.5) * KEY_SPACING;

      if (!note.active || t - note.startTime > note.duration + WATERFALL_HEIGHT / FALL_SPEED) {
        // Park off-screen
        dummy.position.set(0, -999, -5);
        dummy.scale.setScalar(0.001);
        note.active = false;
      } else {
        const elapsed = t - note.startTime;
        const y = WATERFALL_HEIGHT - elapsed * FALL_SPEED;

        // Note height proportional to duration (simulated)
        const noteHeight = note.duration * 0.8;
        dummy.position.set(x, y - noteHeight * 0.5, 0.1);
        dummy.scale.set(KEY_WIDTH * 0.85, noteHeight, 0.15);
      }

      dummy.updateMatrix();
      noteMesh.setMatrixAt(i, dummy.matrix);
    }

    noteMesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      <color attach="background" args={['#02020a']} />
      <ambientLight intensity={0.08} />
      <directionalLight position={[0, 8, 5]} intensity={0.5} color="#8899ff" />
      <pointLight position={[0, 0, 3]} intensity={8} color="#4488ff" distance={20} />
      <pointLight position={[-8, 2, 2]} intensity={4} color="#ff2288" distance={12} />
      <pointLight position={[8, 2, 2]} intensity={4} color="#00ffaa" distance={12} />

      {/* Falling notes waterfall */}
      <instancedMesh
        ref={noteMeshRef}
        args={[undefined, undefined, NOTE_SLOTS]}
        material={noteMaterial}
        frustumCulled={false}
      >
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>

      {/* Keyboard row */}
      <instancedMesh
        ref={keyMeshRef}
        args={[undefined, undefined, KEY_COUNT]}
        material={keyMaterial}
        frustumCulled={false}
      >
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>

      {/* Keyboard backing plate */}
      <mesh position={[0, -6.5, -0.05]} material={pianoBackingMat}>
        <boxGeometry args={[KEY_COUNT * KEY_SPACING + 0.3, 0.18, 0.5]} />
      </mesh>

      {/* Separator line at keyboard */}
      <mesh position={[0, -6.3, 0.2]} material={pianoLineMat}>
        <boxGeometry args={[KEY_COUNT * KEY_SPACING + 0.3, 0.02, 0.05]} />
      </mesh>
    </>
  );
}
