import { useRef, useMemo, useState, useCallback } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three/webgpu';

/**
 * Forge Lifecycle — Interactive 3D visualization of the Forge developer workflow.
 *
 * 5 phases in a pentagon, each with orbiting skill spheres.
 * Central drive loop torus. Click phases/skills to navigate.
 * Particles flow between phases along connection tubes.
 */

// ── Data ──

interface Skill {
  name: string;
  desc: string;
}

interface Phase {
  name: string;
  color: string;
  angle: number;
  skills: Skill[];
}

const PHASES: Phase[] = [
  {
    name: 'CREATE',
    color: '#22cc88',
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
    angle: 2,
    skills: [{ name: 'review', desc: 'Pre-merge quality gate' }],
  },
  {
    name: 'MAINTAIN',
    color: '#cc44ff',
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

// ── Platform Component ──

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
  const phaseColor = useMemo(() => new THREE.Color(phase.color), [phase.color]);

  const floatY = Math.sin(t * 0.8 + index * 1.2) * 0.1;

  return (
    <mesh
      ref={meshRef}
      position={[pos.x, floatY, pos.z]}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onPointerOver={() => {
        if (meshRef.current) {
          document.body.style.cursor = 'pointer';
        }
      }}
      onPointerOut={() => {
        document.body.style.cursor = 'auto';
      }}
    >
      <cylinderGeometry args={[PLATFORM_RADIUS, PLATFORM_RADIUS, PLATFORM_HEIGHT, 6]} />
      <meshStandardMaterial
        color={phaseColor}
        emissive={phaseColor}
        emissiveIntensity={isSelected ? 1.5 : 0.5}
        transparent
        opacity={0.85}
        metalness={0.3}
        roughness={0.4}
      />
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

// ── Skill Sphere ──

function SkillSphere({
  phaseIndex,
  skillIndex,
  skill,
  phaseColor,
  isSelected,
  onSelect,
  time: t,
}: {
  phaseIndex: number;
  skillIndex: number;
  skill: Skill;
  phaseColor: string;
  isSelected: boolean;
  onSelect: () => void;
  time: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const col = useMemo(() => new THREE.Color(phaseColor), [phaseColor]);
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

  return (
    <group position={[x, y, z]}>
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
      >
        <sphereGeometry args={[SKILL_SPHERE_RADIUS, 16, 12]} />
        <meshStandardMaterial
          color={col}
          emissive={col}
          emissiveIntensity={isSelected ? 2.5 : 1.0}
          metalness={0.2}
          roughness={0.3}
        />
      </mesh>
      <pointLight color={col} intensity={0.3} distance={2} />
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

// ── Connection Tubes between adjacent phases ──

function PhaseConnection({
  fromIndex,
  toIndex,
  time: t,
}: {
  fromIndex: number;
  toIndex: number;
  time: number;
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

  const floatYFrom = Math.sin(t * 0.8 + fromIndex * 1.2) * 0.1;
  const floatYTo = Math.sin(t * 0.8 + toIndex * 1.2) * 0.1;
  const avgFloatY = (floatYFrom + floatYTo) / 2;

  return (
    <mesh
      ref={meshRef}
      position={[midpoint.x, midpoint.y + avgFloatY, midpoint.z]}
      quaternion={quat}
    >
      <cylinderGeometry args={[0.03, 0.03, length, 6]} />
      <meshStandardMaterial
        color="#334466"
        emissive="#446688"
        emissiveIntensity={0.6}
        transparent
        opacity={0.4}
      />
    </mesh>
  );
}

// ── Particles flowing along connections ──

const PARTICLES_PER_CONNECTION = 4;
const TOTAL_CONNECTIONS = 5;
const TOTAL_PARTICLES = PARTICLES_PER_CONNECTION * TOTAL_CONNECTIONS;

function FlowParticles({ time: t }: { time: number }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

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
        const progress = ((t * 0.3 + p / PARTICLES_PER_CONNECTION + c * 0.1) % 1);
        const x = from.x + (to.x - from.x) * progress;
        const yBase = floatYFrom + (floatYTo - floatYFrom) * progress;
        const y = yBase + Math.sin(progress * Math.PI) * 0.3;
        const z = from.z + (to.z - from.z) * progress;

        dummy.position.set(x, y, z);
        dummy.scale.setScalar(0.06);
        dummy.updateMatrix();
        mesh.setMatrixAt(idx, dummy.matrix);
        idx++;
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, TOTAL_PARTICLES]}>
      <sphereGeometry args={[1, 8, 6]} />
      <meshStandardMaterial
        color="#88bbff"
        emissive="#88bbff"
        emissiveIntensity={2}
        transparent
        opacity={0.8}
      />
    </instancedMesh>
  );
}

// ── Central Drive Torus ──

function DriveTorus({
  onSelect,
  time: t,
}: {
  onSelect: () => void;
  time: number;
}) {
  const torusRef = useRef<THREE.Mesh>(null);

  // Color cycling
  const torusColor = useMemo(() => new THREE.Color(), []);
  torusColor.setHSL(0.55 + Math.sin(t * 0.3) * 0.1, 0.7, 0.5);

  return (
    <group>
      {/* Torus */}
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
      >
        <torusGeometry args={[1.2, 0.15, 16, 48]} />
        <meshStandardMaterial
          color={torusColor}
          emissive={torusColor}
          emissiveIntensity={1.2}
          metalness={0.5}
          roughness={0.2}
          transparent
          opacity={0.9}
        />
      </mesh>

      {/* 6 drive step spheres orbiting the torus */}
      {DRIVE_STEPS.map((step, i) => {
        const angle = (i / 6) * Math.PI * 2 + t * 0.4;
        const orbitRadius = 1.2;
        const x = Math.cos(angle) * orbitRadius;
        const tiltAngle = Math.PI / 4;
        const y = Math.sin(angle) * orbitRadius * Math.sin(tiltAngle);
        const z = Math.sin(angle) * orbitRadius * Math.cos(tiltAngle);

        return (
          <group key={step} position={[x, y, z]}>
            <mesh>
              <sphereGeometry args={[0.08, 12, 8]} />
              <meshStandardMaterial
                color="#66aaff"
                emissive="#66aaff"
                emissiveIntensity={1.5}
              />
            </mesh>
          </group>
        );
      })}

      <pointLight color="#4488ff" intensity={2} distance={8} />
    </group>
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
        // Deselect if clicking the same phase
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
      <ambientLight intensity={0.1} />
      <directionalLight position={[5, 10, 5]} intensity={0.3} />

      {/* Phase point lights */}
      {PHASES.map((phase, i) => {
        const pos = getPhasePosition(i);
        return (
          <pointLight
            key={phase.name}
            position={[pos.x, 2, pos.z]}
            color={phase.color}
            intensity={1.0}
            distance={8}
          />
        );
      })}

      {/* Camera controller */}
      <CameraController selectedPhase={selectedPhase} />

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
          time={time}
        />
      ))}

      {/* Flow particles */}
      <FlowParticles time={time} />

      {/* Central drive torus */}
      <DriveTorus onSelect={handleReset} time={time} />

      {/* Ground plane for subtle reflection */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]}>
        <circleGeometry args={[12, 64]} />
        <meshStandardMaterial
          color="#0a0a14"
          metalness={0.8}
          roughness={0.3}
          transparent
          opacity={0.5}
        />
      </mesh>
    </>
  );
}
