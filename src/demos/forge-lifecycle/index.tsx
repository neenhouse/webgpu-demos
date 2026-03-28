import { useRef, useMemo, useState, useCallback, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three/webgpu';
import {
  Fn,
  color,
  float,
  mix,
  smoothstep,
  time,
  positionLocal,
  normalLocal,
  hash,
  oscSine,
  vec3,
} from 'three/tsl';

/**
 * Forge Lifecycle — Interactive 3D visualization of the Forge developer workflow.
 *
 * 5 phases in a pentagon, each with orbiting skill spheres.
 * Central drive loop torus. Click phases/skills to navigate.
 * Particles flow between phases along connection tubes.
 *
 * Enhanced with TSL materials, fresnel glow, halo shells, animated energy conduits,
 * starfield background, and dramatic lighting.
 */

// ── Data ──

interface Skill {
  name: string;
  desc: string;
}

interface Phase {
  name: string;
  color: string;
  hex: number;
  angle: number;
  skills: Skill[];
}

const PHASES: Phase[] = [
  {
    name: 'CREATE',
    color: '#22cc88',
    hex: 0x22cc88,
    angle: 0,
    skills: [
      { name: 'want', desc: 'Natural language dispatcher' },
      { name: 'init', desc: 'Bootstrap project structure' },
      { name: 'vision', desc: 'Define strategic vision' },
      { name: 'plan', desc: 'Document requirements' },
      { name: 'team', desc: 'Establish agent team' },
    ],
  },
  {
    name: 'BUILD',
    color: '#4488ff',
    hex: 0x4488ff,
    angle: 1,
    skills: [
      { name: 'infra', desc: 'Set up hosting & CI' },
      { name: 'test', desc: 'Configure testing' },
      { name: 'spike', desc: 'Research unknowns' },
      { name: 'drive', desc: 'Autopilot orchestrator' },
      { name: 'parallel', desc: 'Fan-out tasks' },
      { name: 'fix-queue', desc: 'Bug triage' },
      { name: 'polish', desc: 'Visual finishing' },
    ],
  },
  {
    name: 'VERIFY',
    color: '#ffaa22',
    hex: 0xffaa22,
    angle: 2,
    skills: [{ name: 'review', desc: 'Pre-merge quality gate' }],
  },
  {
    name: 'MAINTAIN',
    color: '#cc44ff',
    hex: 0xcc44ff,
    angle: 3,
    skills: [
      { name: 'audit', desc: 'Health check' },
      { name: 'portfolio', desc: 'Cross-project view' },
      { name: 'antfood', desc: 'Philosophy check' },
    ],
  },
  {
    name: 'META',
    color: '#ff4466',
    hex: 0xff4466,
    angle: 4,
    skills: [
      { name: 'demo', desc: 'Video generation' },
      { name: 'feedback', desc: 'Framework improvement' },
    ],
  },
];

const PENTAGON_RADIUS = 6;
const PLATFORM_RADIUS = 1.5;
const PLATFORM_HEIGHT = 0.3;
const SKILL_ORBIT_RADIUS = 0.8;
const SKILL_SPHERE_RADIUS = 0.2;
const SKILL_Y = 1.5;

const DRIVE_STEPS = ['Assess', 'Diagnose', 'Recommend', 'Execute', 'Reflect', 'Loop'];

// Compute phase positions on the pentagon
function getPhasePosition(index: number): THREE.Vector3 {
  const angle = (index / 5) * Math.PI * 2 - Math.PI / 2; // start from top
  return new THREE.Vector3(
    Math.cos(angle) * PENTAGON_RADIUS,
    0,
    Math.sin(angle) * PENTAGON_RADIUS,
  );
}

// ── Starfield Background ──

function Starfield() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const STAR_COUNT = 300;

  const material = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.colorNode = color(0xffffff);
    const twinkle = oscSine(time.mul(0.8).add(hash(positionLocal.mul(50.0)).mul(6.28)));
    mat.emissiveNode = vec3(0.7, 0.8, 1.0).mul(twinkle.mul(0.5).add(0.5)).mul(2.0);
    mat.roughness = 0.0;
    mat.metalness = 0.0;
    return mat;
  }, []);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < STAR_COUNT; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 25 + Math.random() * 15;
      dummy.position.set(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.sin(phi) * Math.sin(theta),
        r * Math.cos(phi),
      );
      dummy.scale.setScalar(0.03 + Math.random() * 0.06);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, []);

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, STAR_COUNT]} material={material}>
      <icosahedronGeometry args={[1, 0]} />
    </instancedMesh>
  );
}

// ── Platform Component with TSL materials ──

function PhasePlatform({
  phase,
  index,
  isSelected,
  onSelect,
  time: t,
}: {
  phase: Phase;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
  time: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const pos = useMemo(() => getPhasePosition(index), [index]);

  const floatY = Math.sin(t * 0.8 + index * 1.2) * 0.1;

  // TSL-powered hexagonal platform material
  const platformMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.transparent = true;

    const phaseCol = color(phase.hex);
    const darkCol = color(0x111122);

    // Fresnel rim glow
    const fresnel = Fn(() => {
      const f = normalLocal.dot(vec3(0, 1, 0)).abs().oneMinus().pow(2.0);
      return f;
    })();

    // Animated hash noise flowing energy on surface
    const noisePattern = Fn(() => {
      const p = positionLocal.mul(8.0);
      const t1 = time.mul(0.4);
      const n1 = hash(p.add(vec3(t1, t1.mul(0.7), float(0.0))));
      const n2 = hash(p.mul(2.3).add(vec3(float(3.0), t1.mul(1.1), t1.mul(0.4))));
      return n1.mul(0.6).add(n2.mul(0.4));
    })();

    // Color with noise variation
    mat.colorNode = mix(darkCol, phaseCol, noisePattern.mul(0.6).add(fresnel.mul(0.4)));

    // Pulsing emissive that intensifies when selected
    const selectedMul = float(isSelected ? 2.5 : 1.0);
    const pulse = oscSine(time.mul(1.2).add(float(index).mul(0.8))).mul(0.3).add(0.7);
    mat.emissiveNode = phaseCol.mul(
      fresnel.mul(1.5).add(noisePattern.mul(0.5)).mul(pulse).mul(selectedMul),
    );

    // Slight vertex displacement along normals for organic feel
    mat.positionNode = positionLocal.add(
      normalLocal.mul(
        hash(positionLocal.mul(12.0).add(vec3(time.mul(0.3), float(0.0), float(0.0))))
          .mul(0.03)
          .sub(0.015),
      ),
    );

    mat.opacityNode = float(0.9);
    mat.roughness = 0.3;
    mat.metalness = 0.4;
    return mat;
  }, [phase.hex, index, isSelected]);

  return (
    <mesh
      ref={meshRef}
      position={[pos.x, floatY, pos.z]}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onPointerOver={() => {
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        document.body.style.cursor = 'auto';
      }}
      material={platformMaterial}
    >
      <cylinderGeometry args={[PLATFORM_RADIUS, PLATFORM_RADIUS, PLATFORM_HEIGHT, 6]} />
    </mesh>
  );
}

// ── Phase Label ──

function PhaseLabel({ index, name, time: t }: { index: number; name: string; time: number }) {
  const pos = useMemo(() => getPhasePosition(index), [index]);
  const floatY = Math.sin(t * 0.8 + index * 1.2) * 0.1;

  return (
    <Html position={[pos.x, floatY + 0.8, pos.z]} center distanceFactor={15}>
      <div
        style={{
          color: 'white',
          fontSize: '13px',
          fontWeight: 'bold',
          background: 'rgba(0,0,0,0.7)',
          padding: '3px 8px',
          borderRadius: '4px',
          whiteSpace: 'nowrap',
          letterSpacing: '1px',
        }}
      >
        {name}
      </div>
    </Html>
  );
}

// ── Skill Sphere with bloom halo shells ──

function SkillSphere({
  phaseIndex,
  skillIndex,
  skill,
  phaseColor,
  phaseHex,
  isSelected,
  onSelect,
  time: t,
}: {
  phaseIndex: number;
  skillIndex: number;
  skill: Skill;
  phaseColor: string;
  phaseHex: number;
  isSelected: boolean;
  onSelect: () => void;
  time: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const phasePos = useMemo(() => getPhasePosition(phaseIndex), [phaseIndex]);
  const totalSkills = PHASES[phaseIndex].skills.length;

  // Orbit angle
  const speed = 0.3 + phaseIndex * 0.08;
  const baseAngle = (skillIndex / totalSkills) * Math.PI * 2;
  const angle = baseAngle + t * speed;

  const x = phasePos.x + Math.cos(angle) * SKILL_ORBIT_RADIUS;
  const floatY = Math.sin(t * 0.8 + phaseIndex * 1.2) * 0.1;
  const y = SKILL_Y + floatY + Math.sin(t * 1.2 + skillIndex) * 0.05;
  const z = phasePos.z + Math.sin(angle) * SKILL_ORBIT_RADIUS;

  // TSL core material with fresnel glow
  const coreMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    const phaseCol = color(phaseHex);

    // Fresnel rim glow
    const fresnel = Fn(() => {
      const f = positionLocal.normalize().dot(normalLocal).abs().oneMinus().pow(2.0);
      return f;
    })();

    mat.colorNode = mix(color(0x111122), phaseCol, fresnel.mul(0.6).add(0.4));

    // Pulsing emissive with phase offsets per skill
    const selectedMul = float(isSelected ? 3.0 : 1.2);
    const phaseOffset = float(phaseIndex * 1.3 + skillIndex * 0.7);
    const pulse = oscSine(time.mul(1.5).add(phaseOffset)).mul(0.4).add(0.6);
    mat.emissiveNode = phaseCol.mul(fresnel.mul(1.8).add(0.4).mul(pulse).mul(selectedMul));

    mat.roughness = 0.2;
    mat.metalness = 0.3;
    return mat;
  }, [phaseHex, phaseIndex, skillIndex, isSelected]);

  // Halo shell materials (BackSide, AdditiveBlending)
  const haloMat1 = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.transparent = true;
    mat.side = THREE.BackSide;
    mat.depthWrite = false;
    mat.blending = THREE.AdditiveBlending;

    const phaseCol = color(phaseHex);
    const fresnel = Fn(() => {
      const f = positionLocal.normalize().dot(normalLocal).abs().oneMinus().pow(1.8);
      return f;
    })();

    const phaseOffset = float(phaseIndex * 1.3 + skillIndex * 0.7);
    const pulse = oscSine(time.mul(1.5).add(phaseOffset)).mul(0.3).add(0.7);
    mat.opacityNode = fresnel.mul(pulse).mul(0.35);
    mat.colorNode = phaseCol;
    mat.emissiveNode = phaseCol.mul(fresnel.mul(pulse).mul(2.0));
    mat.roughness = 0.0;
    mat.metalness = 0.0;
    return mat;
  }, [phaseHex, phaseIndex, skillIndex]);

  const haloMat2 = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.transparent = true;
    mat.side = THREE.BackSide;
    mat.depthWrite = false;
    mat.blending = THREE.AdditiveBlending;

    const phaseCol = color(phaseHex);
    const fresnel = Fn(() => {
      const f = positionLocal.normalize().dot(normalLocal).abs().oneMinus().pow(2.5);
      return f;
    })();

    const phaseOffset = float(phaseIndex * 1.3 + skillIndex * 0.7 + 1.0);
    const pulse = oscSine(time.mul(1.2).add(phaseOffset)).mul(0.3).add(0.7);
    mat.opacityNode = fresnel.mul(pulse).mul(0.2);
    mat.colorNode = phaseCol;
    mat.emissiveNode = phaseCol.mul(fresnel.mul(pulse).mul(1.5));
    mat.roughness = 0.0;
    mat.metalness = 0.0;
    return mat;
  }, [phaseHex, phaseIndex, skillIndex]);

  return (
    <group position={[x, y, z]}>
      {/* Core sphere */}
      <mesh
        ref={meshRef}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
        onPointerOver={() => {
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          document.body.style.cursor = 'auto';
        }}
        material={coreMaterial}
      >
        <sphereGeometry args={[SKILL_SPHERE_RADIUS, 16, 12]} />
      </mesh>

      {/* Halo shell 1 at 1.3x */}
      <mesh material={haloMat1} scale={[1.3, 1.3, 1.3]}>
        <sphereGeometry args={[SKILL_SPHERE_RADIUS, 12, 8]} />
      </mesh>

      {/* Halo shell 2 at 1.6x */}
      <mesh material={haloMat2} scale={[1.6, 1.6, 1.6]}>
        <sphereGeometry args={[SKILL_SPHERE_RADIUS, 12, 8]} />
      </mesh>

      <pointLight color={phaseColor} intensity={0.5} distance={2.5} />
      {isSelected && (
        <Html center distanceFactor={10}>
          <div
            style={{
              color: 'white',
              fontSize: '12px',
              background: 'rgba(0,0,0,0.85)',
              padding: '6px 10px',
              borderRadius: '6px',
              whiteSpace: 'nowrap',
              textAlign: 'center',
              border: `1px solid ${phaseColor}`,
              pointerEvents: 'none',
            }}
          >
            <div style={{ fontWeight: 'bold', marginBottom: '2px' }}>{skill.name}</div>
            <div style={{ opacity: 0.8, fontSize: '11px' }}>{skill.desc}</div>
          </div>
        </Html>
      )}
    </group>
  );
}

// ── Connection Tubes with animated energy flow ──

function PhaseConnection({
  fromIndex,
  toIndex,
}: {
  fromIndex: number;
  toIndex: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);

  const { midpoint, length, quat } = useMemo(() => {
    const from = getPhasePosition(fromIndex);
    const to = getPhasePosition(toIndex);
    const mid = new THREE.Vector3().lerpVectors(from, to, 0.5);
    const dir = new THREE.Vector3().subVectors(to, from);
    const len = dir.length();
    dir.normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    return { midpoint: mid, length: len, quat: q };
  }, [fromIndex, toIndex]);

  // TSL material with scrolling energy pattern
  const conduitMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.transparent = true;

    const edgeIdx = float(fromIndex);
    const phaseColors = [0x22cc88, 0x4488ff, 0xffaa22, 0xcc44ff, 0xff4466];
    const col1 = color(phaseColors[fromIndex % 5]);
    const col2 = color(phaseColors[toIndex % 5]);

    // Scrolling energy pattern along Y (tube length)
    const scrollPattern = Fn(() => {
      const scroll = positionLocal.y.mul(3.0).add(time.mul(1.5).add(edgeIdx));
      // Create a pulsing brightness wave
      const wave = scroll.sin().mul(0.5).add(0.5);
      const detail = positionLocal.y.mul(12.0).add(time.mul(3.0)).sin().mul(0.3).add(0.7);
      return wave.mul(detail);
    })();

    mat.colorNode = mix(col1, col2, positionLocal.y.add(0.5));
    mat.emissiveNode = mix(col1, col2, positionLocal.y.add(0.5))
      .mul(scrollPattern.mul(2.5).add(0.5));
    mat.opacityNode = scrollPattern.mul(0.5).add(0.3);
    mat.roughness = 0.1;
    mat.metalness = 0.6;
    return mat;
  }, [fromIndex, toIndex]);

  return (
    <mesh
      ref={meshRef}
      position={[midpoint.x, midpoint.y, midpoint.z]}
      quaternion={quat}
      material={conduitMaterial}
    >
      <cylinderGeometry args={[0.04, 0.04, length, 8]} />
    </mesh>
  );
}

// ── Particles flowing along connections ──

const PARTICLES_PER_CONNECTION = 8;
const TOTAL_CONNECTIONS = 5;
const TOTAL_PARTICLES = PARTICLES_PER_CONNECTION * TOTAL_CONNECTIONS;

function FlowParticles({ time: t }: { time: number }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  // TSL additive glow material for particles
  const particleMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.transparent = true;
    mat.blending = THREE.AdditiveBlending;
    mat.depthWrite = false;

    const pulse = oscSine(time.mul(2.0).add(hash(positionLocal.mul(10.0)).mul(6.28)));
    mat.colorNode = color(0x88ccff);
    mat.emissiveNode = vec3(0.5, 0.8, 1.0).mul(pulse.mul(0.5).add(1.5));
    mat.opacityNode = pulse.mul(0.3).add(0.6);
    mat.roughness = 0.0;
    mat.metalness = 0.0;
    return mat;
  }, []);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    let idx = 0;
    for (let c = 0; c < TOTAL_CONNECTIONS; c++) {
      const fromIndex = c;
      const toIndex = (c + 1) % 5;
      const from = getPhasePosition(fromIndex);
      const to = getPhasePosition(toIndex);
      const floatYFrom = Math.sin(t * 0.8 + fromIndex * 1.2) * 0.1;
      const floatYTo = Math.sin(t * 0.8 + toIndex * 1.2) * 0.1;

      for (let p = 0; p < PARTICLES_PER_CONNECTION; p++) {
        // Speed variation per particle
        const speedVar = 0.25 + (p % 3) * 0.08;
        const progress = ((t * speedVar + p / PARTICLES_PER_CONNECTION + c * 0.1) % 1);
        const x = from.x + (to.x - from.x) * progress;
        const yBase = floatYFrom + (floatYTo - floatYFrom) * progress;
        const y = yBase + Math.sin(progress * Math.PI) * 0.4;
        const z = from.z + (to.z - from.z) * progress;

        dummy.position.set(x, y, z);
        // Vary size based on position along path (larger in middle)
        const sizeFactor = 0.04 + Math.sin(progress * Math.PI) * 0.04;
        dummy.scale.setScalar(sizeFactor);
        dummy.updateMatrix();
        mesh.setMatrixAt(idx, dummy.matrix);
        idx++;
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, TOTAL_PARTICLES]}
      material={particleMaterial}
    >
      <sphereGeometry args={[1, 8, 6]} />
    </instancedMesh>
  );
}

// ── Central Drive Torus with TSL halo rings and ghost trails ──

function DriveTorus({
  onSelect,
  time: t,
}: {
  onSelect: () => void;
  time: number;
}) {
  const torusRef = useRef<THREE.Mesh>(null);

  // TSL material with multi-color cycling through phase colors
  const torusMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.transparent = true;

    // Cycle through phase colors using time
    const phase = time.mul(0.2);
    const c1 = color(0x22cc88);
    const c2 = color(0x4488ff);
    const c3 = color(0xffaa22);
    const c4 = color(0xcc44ff);
    const c5 = color(0xff4466);

    const blend = Fn(() => {
      const t1 = smoothstep(0.0, 0.2, phase.fract());
      const t2 = smoothstep(0.2, 0.4, phase.fract());
      const t3 = smoothstep(0.4, 0.6, phase.fract());
      const t4 = smoothstep(0.6, 0.8, phase.fract());
      const col = mix(c1, c2, t1);
      const col2 = mix(col, c3, t2);
      const col3 = mix(col2, c4, t3);
      return mix(col3, c5, t4);
    })();

    // Fresnel for rim glow
    const fresnel = Fn(() => {
      const f = positionLocal.normalize().dot(normalLocal).abs().oneMinus().pow(2.0);
      return f;
    })();

    mat.colorNode = blend;
    mat.emissiveNode = blend.mul(fresnel.mul(2.0).add(1.0)).mul(1.5);
    mat.opacityNode = float(0.92);
    mat.roughness = 0.15;
    mat.metalness = 0.6;
    return mat;
  }, []);

  // Halo ring materials
  const haloMat1 = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.transparent = true;
    mat.side = THREE.BackSide;
    mat.depthWrite = false;
    mat.blending = THREE.AdditiveBlending;

    const pulse = oscSine(time.mul(0.6)).mul(0.3).add(0.7);
    const fresnel = Fn(() => {
      const f = positionLocal.normalize().dot(normalLocal).abs().oneMinus().pow(1.5);
      return f;
    })();

    mat.opacityNode = fresnel.mul(pulse).mul(0.3);
    mat.colorNode = color(0x4488ff);
    mat.emissiveNode = color(0x4488ff).mul(fresnel.mul(pulse).mul(2.5));
    mat.roughness = 0.0;
    mat.metalness = 0.0;
    return mat;
  }, []);

  const haloMat2 = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.transparent = true;
    mat.side = THREE.BackSide;
    mat.depthWrite = false;
    mat.blending = THREE.AdditiveBlending;

    const pulse = oscSine(time.mul(0.4).add(1.0)).mul(0.3).add(0.7);
    const fresnel = Fn(() => {
      const f = positionLocal.normalize().dot(normalLocal).abs().oneMinus().pow(2.0);
      return f;
    })();

    mat.opacityNode = fresnel.mul(pulse).mul(0.2);
    mat.colorNode = color(0x22cc88);
    mat.emissiveNode = color(0x22cc88).mul(fresnel.mul(pulse).mul(2.0));
    mat.roughness = 0.0;
    mat.metalness = 0.0;
    return mat;
  }, []);

  const haloMat3 = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.transparent = true;
    mat.side = THREE.BackSide;
    mat.depthWrite = false;
    mat.blending = THREE.AdditiveBlending;

    const pulse = oscSine(time.mul(0.3).add(2.0)).mul(0.3).add(0.7);
    const fresnel = Fn(() => {
      const f = positionLocal.normalize().dot(normalLocal).abs().oneMinus().pow(2.5);
      return f;
    })();

    mat.opacityNode = fresnel.mul(pulse).mul(0.15);
    mat.colorNode = color(0xcc44ff);
    mat.emissiveNode = color(0xcc44ff).mul(fresnel.mul(pulse).mul(1.5));
    mat.roughness = 0.0;
    mat.metalness = 0.0;
    return mat;
  }, []);

  // Drive step sphere material
  const driveSphMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    const fresnel = Fn(() => {
      const f = positionLocal.normalize().dot(normalLocal).abs().oneMinus().pow(2.0);
      return f;
    })();
    mat.colorNode = color(0x66aaff);
    mat.emissiveNode = color(0x66aaff).mul(fresnel.mul(2.0).add(1.5));
    mat.roughness = 0.1;
    mat.metalness = 0.3;
    return mat;
  }, []);

  // Ghost trail material (additive, translucent)
  const ghostMat1 = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.transparent = true;
    mat.blending = THREE.AdditiveBlending;
    mat.depthWrite = false;
    mat.colorNode = color(0x4466aa);
    mat.emissiveNode = color(0x4466aa).mul(0.8);
    mat.opacityNode = float(0.3);
    mat.roughness = 0.0;
    mat.metalness = 0.0;
    return mat;
  }, []);

  const ghostMat2 = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.transparent = true;
    mat.blending = THREE.AdditiveBlending;
    mat.depthWrite = false;
    mat.colorNode = color(0x334488);
    mat.emissiveNode = color(0x334488).mul(0.5);
    mat.opacityNode = float(0.15);
    mat.roughness = 0.0;
    mat.metalness = 0.0;
    return mat;
  }, []);

  return (
    <group>
      {/* Main Torus */}
      <mesh
        ref={torusRef}
        rotation={[Math.PI / 4, t * 0.2, 0]}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
        onPointerOver={() => {
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          document.body.style.cursor = 'auto';
        }}
        material={torusMaterial}
      >
        <torusGeometry args={[1.2, 0.15, 16, 48]} />
      </mesh>

      {/* Halo ring 1 */}
      <mesh rotation={[Math.PI / 4, t * 0.2, 0]} material={haloMat1} scale={[1.15, 1.15, 1.15]}>
        <torusGeometry args={[1.2, 0.25, 12, 36]} />
      </mesh>

      {/* Halo ring 2 */}
      <mesh rotation={[Math.PI / 4, t * 0.2, 0]} material={haloMat2} scale={[1.3, 1.3, 1.3]}>
        <torusGeometry args={[1.2, 0.3, 12, 36]} />
      </mesh>

      {/* Halo ring 3 */}
      <mesh rotation={[Math.PI / 4, t * 0.2, 0]} material={haloMat3} scale={[1.5, 1.5, 1.5]}>
        <torusGeometry args={[1.2, 0.35, 12, 36]} />
      </mesh>

      {/* 6 drive step spheres orbiting the torus with ghost trails */}
      {DRIVE_STEPS.map((step, i) => {
        const currentAngle = (i / 6) * Math.PI * 2 + t * 0.4;
        const orbitRadius = 1.2;
        const tiltAngle = Math.PI / 4;

        // Current position
        const cx = Math.cos(currentAngle) * orbitRadius;
        const cy = Math.sin(currentAngle) * orbitRadius * Math.sin(tiltAngle);
        const cz = Math.sin(currentAngle) * orbitRadius * Math.cos(tiltAngle);

        // Ghost 1 (slightly behind)
        const g1Angle = currentAngle - 0.25;
        const g1x = Math.cos(g1Angle) * orbitRadius;
        const g1y = Math.sin(g1Angle) * orbitRadius * Math.sin(tiltAngle);
        const g1z = Math.sin(g1Angle) * orbitRadius * Math.cos(tiltAngle);

        // Ghost 2 (further behind)
        const g2Angle = currentAngle - 0.5;
        const g2x = Math.cos(g2Angle) * orbitRadius;
        const g2y = Math.sin(g2Angle) * orbitRadius * Math.sin(tiltAngle);
        const g2z = Math.sin(g2Angle) * orbitRadius * Math.cos(tiltAngle);

        return (
          <group key={step}>
            {/* Ghost 2 */}
            <mesh position={[g2x, g2y, g2z]} material={ghostMat2}>
              <sphereGeometry args={[0.06, 8, 6]} />
            </mesh>
            {/* Ghost 1 */}
            <mesh position={[g1x, g1y, g1z]} material={ghostMat1}>
              <sphereGeometry args={[0.07, 8, 6]} />
            </mesh>
            {/* Current */}
            <mesh position={[cx, cy, cz]} material={driveSphMaterial}>
              <sphereGeometry args={[0.08, 12, 8]} />
            </mesh>
          </group>
        );
      })}

      <pointLight color="#4488ff" intensity={4} distance={10} />
      <pointLight color="#22cc88" intensity={2} distance={8} position={[0, 1, 0]} />
    </group>
  );
}

// ── Ground Grid ──

function GroundGrid() {
  const gridMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.transparent = true;
    mat.side = THREE.DoubleSide;

    // Subtle grid pattern using fract
    const gridPattern = Fn(() => {
      const scale = float(2.0);
      const px = positionLocal.x.mul(scale);
      const py = positionLocal.y.mul(scale);
      // Create grid lines using fract
      const fx = px.fract().sub(0.5).abs().mul(2.0);
      const fy = py.fract().sub(0.5).abs().mul(2.0);
      const lineX = smoothstep(0.92, 0.98, fx);
      const lineY = smoothstep(0.92, 0.98, fy);
      return lineX.add(lineY).clamp(0.0, 1.0);
    })();

    mat.colorNode = color(0x223344);
    mat.emissiveNode = color(0x334466).mul(gridPattern.mul(0.5));
    mat.opacityNode = gridPattern.mul(0.15).add(float(0.03));
    mat.roughness = 0.8;
    mat.metalness = 0.3;
    return mat;
  }, []);

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]} material={gridMaterial}>
      <planeGeometry args={[30, 30, 1, 1]} />
    </mesh>
  );
}

// ── Camera Controller ──

function CameraController({
  selectedPhase,
}: {
  selectedPhase: number | null;
}) {
  const targetPos = useRef(new THREE.Vector3(0, 8, 12));
  const targetLookAt = useRef(new THREE.Vector3(0, 0, 0));
  const currentLookAt = useRef(new THREE.Vector3(0, 0, 0));
  const { camera } = useThree();

  // Update targets when selection changes
  useMemo(() => {
    if (selectedPhase !== null) {
      const phasePos = getPhasePosition(selectedPhase);
      // Position camera 4 above and 4 behind the platform
      const dir = new THREE.Vector3().copy(phasePos).normalize();
      targetPos.current.set(
        phasePos.x + dir.x * 4,
        4,
        phasePos.z + dir.z * 4,
      );
      targetLookAt.current.copy(phasePos);
    } else {
      targetPos.current.set(0, 8, 12);
      targetLookAt.current.set(0, 0, 0);
    }
  }, [selectedPhase]);

  useFrame(() => {
    camera.position.lerp(targetPos.current, 0.04);
    currentLookAt.current.lerp(targetLookAt.current, 0.04);
    camera.lookAt(currentLookAt.current);
  });

  return null;
}

// ── Main Component ──

export default function ForgeLifecycle() {
  const [selectedPhase, setSelectedPhase] = useState<number | null>(null);
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null);
  const [time, setTime] = useState(0);

  useFrame((_, delta) => {
    setTime((prev) => prev + delta);
  });

  const handlePhaseSelect = useCallback(
    (index: number) => {
      if (selectedPhase === index) {
        setSelectedPhase(null);
        setSelectedSkill(null);
      } else {
        setSelectedPhase(index);
        setSelectedSkill(null);
      }
    },
    [selectedPhase],
  );

  const handleSkillSelect = useCallback(
    (skillKey: string) => {
      setSelectedSkill(selectedSkill === skillKey ? null : skillKey);
    },
    [selectedSkill],
  );

  const handleReset = useCallback(() => {
    setSelectedPhase(null);
    setSelectedSkill(null);
  }, []);

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.08} />
      <directionalLight position={[5, 10, 5]} intensity={0.25} />

      {/* Phase point lights — brighter, higher */}
      {PHASES.map((phase, i) => {
        const pos = getPhasePosition(i);
        return (
          <group key={phase.name}>
            <pointLight
              position={[pos.x, 2.5, pos.z]}
              color={phase.color}
              intensity={2.0}
              distance={10}
            />
            <pointLight
              position={[pos.x * 0.5, 0.5, pos.z * 0.5]}
              color={phase.color}
              intensity={0.8}
              distance={6}
            />
          </group>
        );
      })}

      {/* Extra accent lights */}
      <pointLight position={[0, 5, 0]} color="#ffffff" intensity={1.0} distance={15} />
      <pointLight position={[0, -2, 0]} color="#223366" intensity={1.5} distance={10} />

      {/* Camera controller */}
      <CameraController selectedPhase={selectedPhase} />

      {/* Starfield background */}
      <Starfield />

      {/* Background click catcher */}
      <mesh
        position={[0, -1, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        onClick={(e) => {
          e.stopPropagation();
          handleReset();
        }}
      >
        <planeGeometry args={[50, 50]} />
        <meshBasicMaterial visible={false} />
      </mesh>

      {/* Phase platforms */}
      {PHASES.map((phase, i) => (
        <PhasePlatform
          key={phase.name}
          phase={phase}
          index={i}
          isSelected={selectedPhase === i}
          onSelect={() => handlePhaseSelect(i)}
          time={time}
        />
      ))}

      {/* Phase labels */}
      {PHASES.map((phase, i) => (
        <PhaseLabel key={`label-${phase.name}`} index={i} name={phase.name} time={time} />
      ))}

      {/* Skills */}
      {PHASES.map((phase, phaseIdx) =>
        phase.skills.map((skill, skillIdx) => {
          const skillKey = `${phase.name}-${skill.name}`;
          return (
            <SkillSphere
              key={skillKey}
              phaseIndex={phaseIdx}
              skillIndex={skillIdx}
              skill={skill}
              phaseColor={phase.color}
              phaseHex={phase.hex}
              isSelected={selectedSkill === skillKey}
              onSelect={() => handleSkillSelect(skillKey)}
              time={time}
            />
          );
        }),
      )}

      {/* Connections between adjacent phases */}
      {PHASES.map((_, i) => (
        <PhaseConnection
          key={`conn-${i}`}
          fromIndex={i}
          toIndex={(i + 1) % 5}
        />
      ))}

      {/* Flow particles */}
      <FlowParticles time={time} />

      {/* Central drive torus */}
      <DriveTorus onSelect={handleReset} time={time} />

      {/* Ground grid */}
      <GroundGrid />
    </>
  );
}
