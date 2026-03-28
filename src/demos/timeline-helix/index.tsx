import { useRef, useState, useMemo, useEffect, useCallback } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three/webgpu';

/**
 * Timeline Helix
 *
 * Project timeline rendered as a DNA-like double helix structure.
 * Events spiral along the helix, colored by type. Click to inspect,
 * hover for tooltips, particles travel up the strands.
 */

// ── Data ──

interface TimelineEvent {
  date: string;
  label: string;
  type: 'feature' | 'fix' | 'deploy' | 'milestone' | 'decision' | 'batch';
  description: string;
}

const EVENTS: TimelineEvent[] = [
  { date: 'Mar 20', label: 'Project Init', type: 'milestone', description: 'Vite + React + Three.js scaffold' },
  { date: 'Mar 20', label: 'WebGPU Renderer', type: 'feature', description: 'WebGPURenderer integration with R3F' },
  { date: 'Mar 20', label: 'First 5 Demos', type: 'batch', description: 'TSL torus, particles, terrain, crystals, aurora' },
  { date: 'Mar 21', label: 'Gallery UI', type: 'feature', description: 'Responsive grid with accent-colored cards' },
  { date: 'Mar 21', label: 'WebGPU Detection', type: 'feature', description: 'Auto-fallback to WebGL with notice' },
  { date: 'Mar 21', label: 'CI/CD Setup', type: 'deploy', description: 'GitHub Actions -> Cloudflare Pages' },
  { date: 'Mar 22', label: 'Batch 1: 10 Demos', type: 'batch', description: 'Dissolve, hologram, kaleidoscope, bloom orbs...' },
  { date: 'Mar 23', label: 'Compute Shaders', type: 'feature', description: 'First GPU compute demos (particles, fluid)' },
  { date: 'Mar 23', label: 'Pipeline Phase 1', type: 'milestone', description: 'Scene spec, Zod schema, YAML parser' },
  { date: 'Mar 24', label: 'Pipeline Phase 2', type: 'feature', description: 'Generators, materials, prefabs, instancing' },
  { date: 'Mar 24', label: 'Scene Spec v1.0', type: 'decision', description: 'Extractable engine-agnostic YAML spec published' },
  { date: 'Mar 25', label: 'Pipeline Phase 3', type: 'feature', description: 'LOD, optimizer, 14 material presets' },
  { date: 'Mar 25', label: '8 Scene Demos', type: 'batch', description: 'Junkyard, alien garden, medieval forge...' },
  { date: 'Mar 26', label: 'Batch 2: 10 Demos', type: 'batch', description: 'Compute-heavy: galaxies, fractals, fluid, planets' },
  { date: 'Mar 27', label: 'Batch 3: 10 Elite', type: 'batch', description: 'Multi-technique combos: jellyfish, storm, tunnel...' },
  { date: 'Mar 27', label: '5 Backport Upgrades', type: 'fix', description: 'Enhanced flame-orb, skeletal-wave, volumetric-cloud...' },
  { date: 'Mar 28', label: 'Batch 4: Emergent', type: 'batch', description: 'Boids, reaction-diffusion, cellular life, erosion...' },
  { date: 'Mar 28', label: 'Batch 5: Data Viz', type: 'milestone', description: 'First interactive demos, structured data rendering' },
];

const TYPE_COLORS: Record<string, string> = {
  feature: '#4488ff',
  fix: '#ff6644',
  deploy: '#22cc88',
  milestone: '#ffaa22',
  decision: '#cc44ff',
  batch: '#ff4488',
};

const TYPE_LABELS: Record<string, string> = {
  feature: 'Feature',
  fix: 'Fix',
  deploy: 'Deploy',
  milestone: 'Milestone',
  decision: 'Decision',
  batch: 'Batch',
};

// ── Layout ──

const HELIX_RADIUS = 2.5;
const EVENTS_PER_TURN = 6;
const VERTICAL_SPACING = 0.8;

function getEventPosition(i: number): THREE.Vector3 {
  const angle = i * ((Math.PI * 2) / EVENTS_PER_TURN);
  const y = i * VERTICAL_SPACING;
  const x = Math.cos(angle) * HELIX_RADIUS;
  const z = Math.sin(angle) * HELIX_RADIUS;
  return new THREE.Vector3(x, y, z);
}

function getEventRadius(type: string): number {
  if (type === 'milestone') return 0.35;
  if (type === 'batch') return 0.3;
  return 0.2;
}

// Generate helix backbone points (smooth curve)
function generateStrandPoints(strandOffset: number, count: number): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  const totalAngle = (EVENTS.length - 1) * ((Math.PI * 2) / EVENTS_PER_TURN);
  const totalHeight = (EVENTS.length - 1) * VERTICAL_SPACING;

  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const angle = t * totalAngle + strandOffset;
    const y = t * totalHeight;
    const x = Math.cos(angle) * HELIX_RADIUS;
    const z = Math.sin(angle) * HELIX_RADIUS;
    points.push(new THREE.Vector3(x, y, z));
  }
  return points;
}

// ── Strand backbone component ──

function StrandBackbone({ offset, colorHex, opacity }: { offset: number; colorHex: string; opacity: number }) {
  const points = useMemo(() => generateStrandPoints(offset, 120), [offset]);
  const curve = useMemo(() => new THREE.CatmullRomCurve3(points), [points]);
  const tubeGeo = useMemo(() => new THREE.TubeGeometry(curve, 100, 0.04, 6, false), [curve]);

  return (
    <mesh geometry={tubeGeo}>
      <meshStandardMaterial
        color={colorHex}
        transparent
        opacity={opacity}
        emissive={colorHex}
        emissiveIntensity={0.3}
        roughness={0.4}
        metalness={0.3}
      />
    </mesh>
  );
}

// ── Cross-Rung component ──

function CrossRung({ index }: { index: number }) {
  const event = EVENTS[index];
  const typeColor = TYPE_COLORS[event.type];

  // Get positions on the two strands at this event's height
  const angle = index * ((Math.PI * 2) / EVENTS_PER_TURN);
  const y = index * VERTICAL_SPACING;

  const p1 = useMemo(() => {
    const a = angle;
    return new THREE.Vector3(Math.cos(a) * HELIX_RADIUS, y, Math.sin(a) * HELIX_RADIUS);
  }, [angle, y]);

  const p2 = useMemo(() => {
    const a = angle + Math.PI;
    return new THREE.Vector3(Math.cos(a) * HELIX_RADIUS, y, Math.sin(a) * HELIX_RADIUS);
  }, [angle, y]);

  const midpoint = useMemo(() => new THREE.Vector3().lerpVectors(p1, p2, 0.5), [p1, p2]);
  const length = useMemo(() => p1.distanceTo(p2), [p1, p2]);
  const direction = useMemo(() => new THREE.Vector3().subVectors(p2, p1).normalize(), [p1, p2]);
  const quaternion = useMemo(() => {
    const q = new THREE.Quaternion();
    q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
    return q;
  }, [direction]);

  return (
    <mesh position={midpoint} quaternion={quaternion}>
      <cylinderGeometry args={[0.02, 0.02, length, 6]} />
      <meshStandardMaterial
        color={typeColor}
        emissive={typeColor}
        emissiveIntensity={0.5}
        transparent
        opacity={0.6}
        roughness={0.3}
        metalness={0.2}
      />
    </mesh>
  );
}

// ── Traveling particles ──

const PARTICLE_COUNT = 20;

function TravelingParticles() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const totalHeight = (EVENTS.length - 1) * VERTICAL_SPACING;
  const totalAngle = (EVENTS.length - 1) * ((Math.PI * 2) / EVENTS_PER_TURN);

  const offsets = useMemo(() => {
    return Array.from({ length: PARTICLE_COUNT }, () => Math.random());
  }, []);

  const strandAssignment = useMemo(() => {
    return Array.from({ length: PARTICLE_COUNT }, () => Math.random() > 0.5 ? Math.PI : 0);
  }, []);

  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    const t = clock.getElapsedTime();

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const progress = ((t * 0.08 + offsets[i]) % 1);
      const angle = progress * totalAngle + strandAssignment[i];
      const y = progress * totalHeight;
      const x = Math.cos(angle) * HELIX_RADIUS;
      const z = Math.sin(angle) * HELIX_RADIUS;

      dummy.position.set(x, y, z);
      dummy.scale.setScalar(0.06);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, PARTICLE_COUNT]}>
      <sphereGeometry args={[1, 6, 6]} />
      <meshStandardMaterial
        color="#ffffff"
        emissive="#aaddff"
        emissiveIntensity={2.0}
        transparent
        opacity={0.8}
      />
    </instancedMesh>
  );
}

// ── Event Sphere ──

function EventSphere({
  index,
  selected,
  hovered,
  onSelect,
  onHover,
  onUnhover,
}: {
  index: number;
  selected: boolean;
  hovered: boolean;
  onSelect: () => void;
  onHover: () => void;
  onUnhover: () => void;
}) {
  const event = EVENTS[index];
  const position = useMemo(() => getEventPosition(index), [index]);
  const radius = getEventRadius(event.type);
  const typeColor = TYPE_COLORS[event.type];
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const t = clock.getElapsedTime();
    // Pulsing emissive
    const pulse = Math.sin(t * 2 + index * 0.7) * 0.3 + 0.7;
    const mat = meshRef.current.material as THREE.MeshStandardMaterial;
    const intensity = selected ? 2.0 : hovered ? 1.5 : pulse;
    mat.emissiveIntensity = intensity;

    // Selected: slightly larger scale
    const targetScale = selected ? 1.3 : hovered ? 1.15 : 1.0;
    const s = meshRef.current.scale.x;
    const newS = s + (targetScale - s) * 0.1;
    meshRef.current.scale.setScalar(newS);
  });

  return (
    <group position={position}>
      <mesh
        ref={meshRef}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHover();
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          onUnhover();
          document.body.style.cursor = 'auto';
        }}
      >
        <sphereGeometry args={[radius, 16, 16]} />
        <meshStandardMaterial
          color={typeColor}
          emissive={typeColor}
          emissiveIntensity={0.7}
          roughness={0.3}
          metalness={0.4}
        />
      </mesh>

      {/* Orbiting ring for selected */}
      {selected && (
        <OrbitalRing radius={radius + 0.15} color={typeColor} />
      )}

      {/* Hover tooltip */}
      {hovered && !selected && (
        <Html center distanceFactor={10}>
          <div
            style={{
              color: 'white',
              fontSize: '12px',
              background: 'rgba(0,0,0,0.85)',
              padding: '4px 8px',
              borderRadius: '4px',
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              borderLeft: `3px solid ${typeColor}`,
            }}
          >
            <strong>{event.date}</strong> - {event.label}
          </div>
        </Html>
      )}

      {/* Selected detail panel */}
      {selected && (
        <Html center distanceFactor={8}>
          <div
            style={{
              color: 'white',
              fontSize: '13px',
              background: 'rgba(0,0,0,0.92)',
              padding: '10px 14px',
              borderRadius: '6px',
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              borderLeft: `4px solid ${typeColor}`,
              minWidth: '200px',
            }}
          >
            <div style={{ fontSize: '10px', color: typeColor, textTransform: 'uppercase', fontWeight: 'bold', letterSpacing: '0.5px', marginBottom: '4px' }}>
              {TYPE_LABELS[event.type]} - {event.date}
            </div>
            <div style={{ fontSize: '15px', fontWeight: 'bold', marginBottom: '4px' }}>
              {event.label}
            </div>
            <div style={{ fontSize: '12px', color: '#aaa' }}>
              {event.description}
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}

// ── Orbital Ring ──

function OrbitalRing({ radius, color: ringColor }: { radius: number; color: string }) {
  const ringRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (!ringRef.current) return;
    ringRef.current.rotation.x = clock.getElapsedTime() * 2;
    ringRef.current.rotation.z = clock.getElapsedTime() * 1.3;
  });

  return (
    <mesh ref={ringRef}>
      <torusGeometry args={[radius, 0.02, 8, 32]} />
      <meshStandardMaterial
        color={ringColor}
        emissive={ringColor}
        emissiveIntensity={2.0}
        transparent
        opacity={0.8}
      />
    </mesh>
  );
}

// ── Camera controller ──

function CameraController({ selectedEvent }: { selectedEvent: number | null }) {
  const { camera } = useThree();
  const targetPos = useRef(new THREE.Vector3());
  const targetLook = useRef(new THREE.Vector3());
  const currentLook = useRef(new THREE.Vector3());

  const totalHeight = (EVENTS.length - 1) * VERTICAL_SPACING;

  useEffect(() => {
    currentLook.current.set(0, totalHeight / 2, 0);
  }, [totalHeight]);

  useEffect(() => {
    if (selectedEvent !== null) {
      const eventPos = getEventPosition(selectedEvent);
      // Position camera close to the event, offset outward from center
      const dir = new THREE.Vector3(eventPos.x, 0, eventPos.z).normalize();
      targetPos.current.set(
        eventPos.x + dir.x * 3,
        eventPos.y + 0.5,
        eventPos.z + dir.z * 3,
      );
      targetLook.current.copy(eventPos);
    } else {
      targetPos.current.set(8, totalHeight / 2, 8);
      targetLook.current.set(0, totalHeight / 2, 0);
    }
  }, [selectedEvent, totalHeight]);

  useFrame(() => {
    camera.position.lerp(targetPos.current, 0.05);
    currentLook.current.lerp(targetLook.current, 0.05);
    camera.lookAt(currentLook.current);
  });

  return null;
}

// ── Main component ──

export default function TimelineHelix() {
  const [selectedEvent, setSelectedEvent] = useState<number | null>(null);
  const [hoveredEvent, setHoveredEvent] = useState<number | null>(null);
  const groupRef = useRef<THREE.Group>(null);

  const handleBackgroundClick = useCallback(() => {
    setSelectedEvent(null);
  }, []);

  // Slow rotation of the helix (stop when event selected)
  useFrame((_, delta) => {
    if (groupRef.current && selectedEvent === null) {
      groupRef.current.rotation.y += delta * 0.05;
    }
  });

  const totalHeight = (EVENTS.length - 1) * VERTICAL_SPACING;

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.1} />
      <directionalLight position={[5, totalHeight + 5, 5]} intensity={0.8} />
      <directionalLight position={[-3, totalHeight / 2, -5]} intensity={0.3} />

      {/* Background click target */}
      <mesh
        position={[0, totalHeight / 2, -10]}
        onClick={handleBackgroundClick}
      >
        <planeGeometry args={[50, 50]} />
        <meshBasicMaterial color="#000000" transparent opacity={0} />
      </mesh>

      {/* Camera controller */}
      <CameraController selectedEvent={selectedEvent} />

      {/* Helix group */}
      <group ref={groupRef}>
        {/* Helix backbone strands */}
        <StrandBackbone offset={0} colorHex="#ccccdd" opacity={0.4} />
        <StrandBackbone offset={Math.PI} colorHex="#6688cc" opacity={0.4} />

        {/* Cross rungs */}
        {EVENTS.map((_, i) => (
          <CrossRung key={`rung-${i}`} index={i} />
        ))}

        {/* Event spheres */}
        {EVENTS.map((_, i) => (
          <EventSphere
            key={`event-${i}`}
            index={i}
            selected={selectedEvent === i}
            hovered={hoveredEvent === i}
            onSelect={() => setSelectedEvent(selectedEvent === i ? null : i)}
            onHover={() => setHoveredEvent(i)}
            onUnhover={() => setHoveredEvent(null)}
          />
        ))}

        {/* Traveling particles */}
        <TravelingParticles />

        {/* Point lights along the helix for color ambience */}
        <pointLight position={[0, 0, 0]} intensity={1.5} color="#ffaa22" distance={8} />
        <pointLight position={[0, totalHeight * 0.33, 0]} intensity={1.5} color="#4488ff" distance={8} />
        <pointLight position={[0, totalHeight * 0.66, 0]} intensity={1.5} color="#cc44ff" distance={8} />
        <pointLight position={[0, totalHeight, 0]} intensity={1.5} color="#ff4488" distance={8} />
      </group>

      {/* Legend */}
      <Html position={[-6, totalHeight / 2 + 4, 0]} center>
        <div
          style={{
            color: 'white',
            fontSize: '11px',
            background: 'rgba(0,0,0,0.8)',
            padding: '8px 12px',
            borderRadius: '6px',
            pointerEvents: 'none',
          }}
        >
          <div style={{ fontWeight: 'bold', marginBottom: '6px', fontSize: '12px' }}>Event Types</div>
          {Object.entries(TYPE_COLORS).map(([type, col]) => (
            <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: col }} />
              <span style={{ textTransform: 'capitalize' }}>{type}</span>
            </div>
          ))}
        </div>
      </Html>
    </>
  );
}
