import { useRef, useMemo, useState, useCallback, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three/webgpu';
// TSL imports removed — simple property-based materials used for performance

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

// (Starfield removed for performance)

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

  // Simple property-based platform material (no shader compilation)
  const platformMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.transparent = true;
    mat.opacity = 0.9;
    mat.color = new THREE.Color(phase.hex);
    mat.emissive = new THREE.Color(phase.hex);
    mat.emissiveIntensity = isSelected ? 1.2 : 0.4;
    mat.roughness = 0.3;
    mat.metalness = 0.4;
    return mat;
  }, [phase.hex, isSelected]);

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

// ── Shared skill sphere material (one per phase, reused) ──

const sharedSkillMaterials = new Map<number, THREE.MeshStandardNodeMaterial>();

function getSharedSkillMaterial(phaseHex: number): THREE.MeshStandardNodeMaterial {
  if (sharedSkillMaterials.has(phaseHex)) return sharedSkillMaterials.get(phaseHex)!;
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.color = new THREE.Color(phaseHex);
  mat.emissive = new THREE.Color(phaseHex);
  mat.emissiveIntensity = 0.6;
  mat.roughness = 0.2;
  mat.metalness = 0.3;
  sharedSkillMaterials.set(phaseHex, mat);
  return mat;
}

// Shared halo material for selected skill
const sharedSkillHaloMaterial = (() => {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;
  mat.opacity = 0.35;
  mat.side = THREE.BackSide;
  mat.depthWrite = false;
  mat.blending = THREE.AdditiveBlending;
  mat.color = new THREE.Color(0xffffff);
  mat.emissive = new THREE.Color(0xffffff);
  mat.emissiveIntensity = 2.0;
  mat.roughness = 0.0;
  mat.metalness = 0.0;
  return mat;
})();

// ── Skill Sphere (shared material, halo only when selected) ──

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

  // Shared material per phase color
  const coreMaterial = useMemo(() => getSharedSkillMaterial(phaseHex), [phaseHex]);



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

      {/* Halo shell only when selected */}
      {isSelected && (
        <mesh material={sharedSkillHaloMaterial} scale={[1.3, 1.3, 1.3]}>
          <sphereGeometry args={[SKILL_SPHERE_RADIUS, 12, 8]} />
        </mesh>
      )}

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

  // Simple transparent emissive conduit material (no shader compilation)
  const conduitMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.transparent = true;
    mat.opacity = 0.5;
    const phaseColors = [0x22cc88, 0x4488ff, 0xffaa22, 0xcc44ff, 0xff4466];
    const blended = new THREE.Color(phaseColors[fromIndex % 5]);
    blended.lerp(new THREE.Color(phaseColors[toIndex % 5]), 0.5);
    mat.color = blended;
    mat.emissive = blended;
    mat.emissiveIntensity = 1.0;
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

const PARTICLES_PER_CONNECTION = 4;
const TOTAL_CONNECTIONS = 5;
const TOTAL_PARTICLES = PARTICLES_PER_CONNECTION * TOTAL_CONNECTIONS;

function FlowParticles({ time: t }: { time: number }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  // Simple additive particle material (no shader compilation)
  const particleMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.transparent = true;
    mat.opacity = 0.7;
    mat.blending = THREE.AdditiveBlending;
    mat.depthWrite = false;
    mat.color = new THREE.Color(0x88ccff);
    mat.emissive = new THREE.Color(0x88ccff);
    mat.emissiveIntensity = 1.5;
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
      frustumCulled={false}
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

  // Simple torus material — color updated in useFrame for cycling
  const torusMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.transparent = true;
    mat.opacity = 0.92;
    mat.color = new THREE.Color(0x22cc88);
    mat.emissive = new THREE.Color(0x22cc88);
    mat.emissiveIntensity = 1.5;
    mat.roughness = 0.15;
    mat.metalness = 0.6;
    return mat;
  }, []);



  // Simple drive step sphere material (no shader compilation)
  const driveSphMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.color = new THREE.Color(0x66aaff);
    mat.emissive = new THREE.Color(0x66aaff);
    mat.emissiveIntensity = 1.5;
    mat.roughness = 0.1;
    mat.metalness = 0.3;
    return mat;
  }, []);

  // Cycle torus color through phase colors over time
  const phaseHexColors = useMemo(() => [0x22cc88, 0x4488ff, 0xffaa22, 0xcc44ff, 0xff4466], []);
  const scratchColorA = useMemo(() => new THREE.Color(), []);
  const scratchColorB = useMemo(() => new THREE.Color(), []);
  useFrame(({ clock }) => {
    const elapsed = clock.getElapsedTime();
    const idx = Math.floor((elapsed * 0.2) % phaseHexColors.length);
    const nextIdx = (idx + 1) % phaseHexColors.length;
    const frac = (elapsed * 0.2) % 1;
    scratchColorA.set(phaseHexColors[idx]);
    scratchColorB.set(phaseHexColors[nextIdx]);
    scratchColorA.lerp(scratchColorB, frac);
    torusMaterial.color.copy(scratchColorA);
    torusMaterial.emissive.copy(scratchColorA);
  });

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



      {/* 6 drive step spheres orbiting the torus with ghost trails */}
      {DRIVE_STEPS.map((step, i) => {
        const currentAngle = (i / 6) * Math.PI * 2 + t * 0.4;
        const orbitRadius = 1.2;
        const tiltAngle = Math.PI / 4;

        // Current position
        const cx = Math.cos(currentAngle) * orbitRadius;
        const cy = Math.sin(currentAngle) * orbitRadius * Math.sin(tiltAngle);
        const cz = Math.sin(currentAngle) * orbitRadius * Math.cos(tiltAngle);

        return (
          <group key={step}>
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
    mat.opacity = 0.15;
    mat.side = THREE.DoubleSide;
    mat.color = new THREE.Color(0x223344);
    mat.emissive = new THREE.Color(0x334466);
    mat.emissiveIntensity = 0.3;
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
  useEffect(() => {
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

      {/* Starfield removed for performance */}

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

      {/* Instructions overlay (top-left) */}
      <Html fullscreen>
        <div style={{
          position: 'absolute', top: '16px', left: '16px',
          color: 'rgba(255,255,255,0.7)', fontSize: '11px',
          background: 'rgba(0,0,0,0.5)', padding: '10px 14px',
          borderRadius: '6px', lineHeight: '1.6',
          maxWidth: '220px', pointerEvents: 'none',
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: '4px', color: '#88bbff', fontSize: '12px' }}>Forge Lifecycle</div>
          <div>Developer workflow visualized as 5 phases in a pentagon</div>
          <div style={{ marginTop: '4px' }}>Click a phase to zoom in</div>
          <div>Click a skill sphere for details</div>
          <div>Click center torus to reset view</div>
          <div style={{ marginTop: '4px', fontSize: '10px', opacity: 0.6 }}>
            Use the phase list to navigate
          </div>
        </div>
      </Html>

      {/* Phase list sidebar (right) */}
      <Html fullscreen>
        <div style={{
          position: 'absolute', top: '16px', right: '16px',
          color: 'white', fontSize: '11px',
          background: 'rgba(5,10,25,0.75)', padding: '10px 12px',
          borderRadius: '6px', maxWidth: '170px',
          pointerEvents: 'none', backdropFilter: 'blur(4px)',
          border: '1px solid rgba(100,150,255,0.15)',
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: '6px', color: '#88bbff', fontSize: '11px' }}>Phases</div>
          {PHASES.map((phase, i) => (
            <div key={phase.name}
              onClick={() => handlePhaseSelect(i)}
              style={{
                padding: '2px 6px', marginBottom: '1px', borderRadius: '3px',
                cursor: 'pointer', pointerEvents: 'auto',
                color: selectedPhase === i ? '#fff' : phase.color,
                background: selectedPhase === i ? 'rgba(255,255,255,0.12)' : 'transparent',
                fontSize: '10px', transition: 'background 0.2s',
              }}
              onMouseEnter={(e) => { (e.target as HTMLElement).style.background = 'rgba(255,255,255,0.08)'; }}
              onMouseLeave={(e) => { (e.target as HTMLElement).style.background = selectedPhase === i ? 'rgba(255,255,255,0.12)' : 'transparent'; }}
            >
              {phase.name}
            </div>
          ))}
          {selectedPhase !== null && (
            <div style={{ marginTop: '8px', borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: '8px' }}>
              <div style={{ fontWeight: 'bold', marginBottom: '4px', color: PHASES[selectedPhase].color, fontSize: '10px' }}>
                {PHASES[selectedPhase].name} Skills
              </div>
              {PHASES[selectedPhase].skills.map((skill) => {
                const skillKey = `${PHASES[selectedPhase].name}-${skill.name}`;
                return (
                  <div key={skill.name}
                    onClick={() => handleSkillSelect(skillKey)}
                    style={{
                      padding: '2px 6px', marginBottom: '1px', borderRadius: '3px',
                      cursor: 'pointer', pointerEvents: 'auto',
                      color: selectedSkill === skillKey ? '#fff' : 'rgba(255,255,255,0.6)',
                      background: selectedSkill === skillKey ? 'rgba(255,255,255,0.12)' : 'transparent',
                      fontSize: '10px', transition: 'background 0.2s',
                    }}
                    onMouseEnter={(e) => { (e.target as HTMLElement).style.background = 'rgba(255,255,255,0.08)'; }}
                    onMouseLeave={(e) => { (e.target as HTMLElement).style.background = selectedSkill === skillKey ? 'rgba(255,255,255,0.12)' : 'transparent'; }}
                  >
                    {skill.name} <span style={{ opacity: 0.5 }}>— {skill.desc}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Html>
    </>
  );
}
