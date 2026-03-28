import { useRef, useState, useMemo, useEffect, useCallback } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three/webgpu';
import {
  color,
  float,
  time,
  oscSine,
  positionLocal,
  normalWorld,
  positionWorld,
  cameraPosition,
  Fn,
  mix,
  smoothstep,
  fract,
} from 'three/tsl';

/**
 * Timeline Helix
 *
 * Project timeline rendered as a DNA-like double helix structure.
 * Events spiral along the helix, colored by type. Click to inspect,
 * hover for tooltips, particles travel up the strands.
 *
 * REWRITTEN with TSL materials: energy tubes, glowing orbs, halo shells,
 * animated flow, fresnel rims, and atmospheric particles.
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

const TYPE_COLORS_HEX: Record<string, number> = {
  feature: 0x4488ff,
  fix: 0xff6644,
  deploy: 0x22cc88,
  milestone: 0xffaa22,
  decision: 0xcc44ff,
  batch: 0xff4488,
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

// ── TSL helper: fresnel ──

const fresnelNode = Fn(() => {
  const viewDir = cameraPosition.sub(positionWorld).normalize();
  const nDotV = normalWorld.dot(viewDir).saturate();
  return float(1.0).sub(nDotV).pow(2.0);
});

// ── Energy Tube Material (for backbone strands) ──

function makeStrandMaterial(baseHex: number, accentHex: number, flowSpeed: number) {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;
  mat.side = THREE.DoubleSide;

  // Scrolling flow pattern along local Y
  const flow = fract(positionLocal.y.mul(3.0).sub(time.mul(flowSpeed)));
  const flowBand = smoothstep(float(0.0), float(0.3), flow).mul(
    smoothstep(float(1.0), float(0.7), flow),
  );

  // Fresnel rim
  const rim = fresnelNode();

  // Base color with shimmer
  const shimmer = oscSine(time.mul(1.5).add(positionLocal.y.mul(2.0))).mul(0.15).add(0.85);
  mat.colorNode = mix(color(baseHex), color(accentHex), rim.mul(0.6)).mul(shimmer);

  // Emissive: flow energy + rim glow
  const flowGlow = color(accentHex).mul(flowBand.mul(2.5));
  const rimGlow = color(0xffffff).mul(rim.mul(1.5));
  mat.emissiveNode = flowGlow.add(rimGlow);

  mat.opacityNode = float(0.6).add(flowBand.mul(0.3)).add(rim.mul(0.1));
  mat.roughness = 0.3;
  mat.metalness = 0.4;

  return mat;
}

// ── Strand backbone component ──

function StrandBackbone({ offset, variant }: { offset: number; variant: 'silver' | 'blue' }) {
  const points = useMemo(() => generateStrandPoints(offset, 120), [offset]);
  const curve = useMemo(() => new THREE.CatmullRomCurve3(points), [points]);
  const tubeGeo = useMemo(() => new THREE.TubeGeometry(curve, 100, 0.06, 8, false), [curve]);

  const material = useMemo(() => {
    if (variant === 'silver') {
      return makeStrandMaterial(0xccccee, 0x6688ff, 0.4);
    }
    return makeStrandMaterial(0x3366cc, 0x44ddff, 0.5);
  }, [variant]);

  return <mesh geometry={tubeGeo} material={material} />;
}

// ── Cross-Rung Energy Bridge ──

function makeRungMaterial(colorHex: number) {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;

  // Flow pattern along the rung length (using local Y since cylinder is Y-oriented)
  const flow = fract(positionLocal.y.mul(5.0).sub(time.mul(1.2)));
  const flowBand = smoothstep(float(0.0), float(0.2), flow).mul(
    smoothstep(float(1.0), float(0.8), flow),
  );

  const rim = fresnelNode();

  mat.colorNode = color(colorHex).mul(float(1.2));
  mat.emissiveNode = color(colorHex).mul(flowBand.mul(3.0).add(rim.mul(2.0)));
  mat.opacityNode = float(0.7).add(flowBand.mul(0.3));
  mat.roughness = 0.2;
  mat.metalness = 0.3;

  return mat;
}

function CrossRung({ index }: { index: number }) {
  const event = EVENTS[index];
  const typeColorHex = TYPE_COLORS_HEX[event.type];

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

  const material = useMemo(() => makeRungMaterial(typeColorHex), [typeColorHex]);

  return (
    <mesh position={midpoint} quaternion={quaternion} material={material}>
      <cylinderGeometry args={[0.025, 0.025, length, 8]} />
    </mesh>
  );
}

// ── Traveling particles ──

const PARTICLE_COUNT = 40;
const GHOST_COPIES = 3;

function TravelingParticles() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const totalHeight = (EVENTS.length - 1) * VERTICAL_SPACING;
  const totalAngle = (EVENTS.length - 1) * ((Math.PI * 2) / EVENTS_PER_TURN);

  const offsets = useMemo(() => {
    return Array.from({ length: PARTICLE_COUNT }, () => Math.random());
  }, []);

  const speeds = useMemo(() => {
    return Array.from({ length: PARTICLE_COUNT }, () => 0.06 + Math.random() * 0.06);
  }, []);

  const strandAssignment = useMemo(() => {
    return Array.from({ length: PARTICLE_COUNT }, () => Math.random() > 0.5 ? Math.PI : 0);
  }, []);

  const particleMat = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.transparent = true;
    mat.blending = THREE.AdditiveBlending;
    mat.depthWrite = false;

    const rim = fresnelNode();
    mat.colorNode = color(0xaaddff);
    mat.emissiveNode = color(0xaaddff).mul(float(3.0)).add(color(0xffffff).mul(rim.mul(2.0)));
    mat.opacityNode = float(0.9);
    mat.roughness = 0.0;
    mat.metalness = 0.0;

    return mat;
  }, []);

  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    const t = clock.getElapsedTime();

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      for (let g = 0; g <= GHOST_COPIES; g++) {
        // Ghost copies trail behind the main particle
        const ghostDelay = g * 0.012;
        const progress = ((t * speeds[i] + offsets[i] - ghostDelay) % 1 + 1) % 1;
        const angle = progress * totalAngle + strandAssignment[i];
        const py = progress * totalHeight;
        const px = Math.cos(angle) * HELIX_RADIUS;
        const pz = Math.sin(angle) * HELIX_RADIUS;

        const scale = g === 0 ? 0.07 : 0.07 * (1 - g * 0.25);
        dummy.position.set(px, py, pz);
        dummy.scale.setScalar(scale);
        dummy.updateMatrix();
        mesh.setMatrixAt(i * (1 + GHOST_COPIES) + g, dummy.matrix);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, PARTICLE_COUNT * (1 + GHOST_COPIES)]} material={particleMat}>
      <sphereGeometry args={[1, 8, 8]} />
    </instancedMesh>
  );
}

// ── Event Sphere with Halo Shells ──

function makeEventCoreMaterial(colorHex: number, phaseOffset: number, isBatch: boolean) {
  const mat = new THREE.MeshStandardNodeMaterial();

  const rim = fresnelNode();
  const pulseSpeed = isBatch ? 4.0 : 2.0;
  const pulse = oscSine(time.mul(pulseSpeed).add(phaseOffset)).mul(0.4).add(0.6);

  mat.colorNode = color(colorHex);
  mat.emissiveNode = color(colorHex).mul(pulse.mul(2.0)).add(color(0xffffff).mul(rim.mul(pulse).mul(1.5)));
  mat.roughness = 0.2;
  mat.metalness = 0.4;

  return mat;
}

function makeHaloMaterial(colorHex: number, phaseOffset: number) {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;
  mat.side = THREE.BackSide;
  mat.depthWrite = false;
  mat.blending = THREE.AdditiveBlending;

  const rim = fresnelNode();
  const pulse = oscSine(time.mul(2.0).add(phaseOffset)).mul(0.3).add(0.7);

  mat.colorNode = color(colorHex);
  mat.emissiveNode = color(colorHex).mul(rim.mul(pulse).mul(3.0));
  mat.opacityNode = rim.mul(pulse).mul(0.5);
  mat.roughness = 0.0;
  mat.metalness = 0.0;

  return mat;
}

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
  const typeColorHex = TYPE_COLORS_HEX[event.type];
  const meshRef = useRef<THREE.Mesh>(null);
  const isMilestone = event.type === 'milestone';
  const isBatch = event.type === 'batch';

  const phaseOffset = index * 0.7;

  const coreMat = useMemo(() => makeEventCoreMaterial(typeColorHex, phaseOffset, isBatch), [typeColorHex, phaseOffset, isBatch]);
  const haloMat = useMemo(() => makeHaloMaterial(typeColorHex, phaseOffset), [typeColorHex, phaseOffset]);
  const haloMat2 = useMemo(() => {
    if (!isMilestone) return null;
    return makeHaloMaterial(typeColorHex, phaseOffset + 1.0);
  }, [isMilestone, typeColorHex, phaseOffset]);

  useFrame(() => {
    if (!meshRef.current) return;
    const targetScale = selected ? 1.3 : hovered ? 1.15 : 1.0;
    const s = meshRef.current.scale.x;
    const newS = s + (targetScale - s) * 0.1;
    meshRef.current.scale.setScalar(newS);
  });

  return (
    <group position={position}>
      {/* Core sphere */}
      <mesh
        ref={meshRef}
        material={coreMat}
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
        <sphereGeometry args={[radius, 20, 20]} />
      </mesh>

      {/* Halo shell 1 - every event */}
      <mesh material={haloMat} scale={[1.4, 1.4, 1.4]}>
        <sphereGeometry args={[radius, 16, 16]} />
      </mesh>

      {/* Halo shell 2 - milestones only (extra large) */}
      {haloMat2 && (
        <mesh material={haloMat2} scale={[1.8, 1.8, 1.8]}>
          <sphereGeometry args={[radius, 16, 16]} />
        </mesh>
      )}

      {/* Orbiting ring for milestones and selected events */}
      {(selected || isMilestone) && (
        <OrbitalRing radius={radius + 0.2} colorHex={typeColorHex} speed={selected ? 3.0 : 1.5} />
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

function makeOrbitalRingMaterial(colorHex: number) {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;
  mat.blending = THREE.AdditiveBlending;
  mat.depthWrite = false;

  const rim = fresnelNode();
  const pulse = oscSine(time.mul(3.0)).mul(0.3).add(0.7);

  mat.colorNode = color(colorHex);
  mat.emissiveNode = color(colorHex).mul(pulse.mul(3.0)).add(color(0xffffff).mul(rim.mul(1.5)));
  mat.opacityNode = float(0.8).mul(pulse);
  mat.roughness = 0.0;
  mat.metalness = 0.0;

  return mat;
}

function OrbitalRing({ radius, colorHex, speed }: { radius: number; colorHex: number; speed: number }) {
  const ringRef = useRef<THREE.Mesh>(null);

  const material = useMemo(() => makeOrbitalRingMaterial(colorHex), [colorHex]);

  useFrame(({ clock }) => {
    if (!ringRef.current) return;
    ringRef.current.rotation.x = clock.getElapsedTime() * speed;
    ringRef.current.rotation.z = clock.getElapsedTime() * speed * 0.65;
  });

  return (
    <mesh ref={ringRef} material={material}>
      <torusGeometry args={[radius, 0.025, 8, 32]} />
    </mesh>
  );
}

// ── Ambient floating particles ──

const AMBIENT_PARTICLE_COUNT = 60;

function AmbientParticles() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const totalHeight = (EVENTS.length - 1) * VERTICAL_SPACING;

  const particleData = useMemo(() => {
    return Array.from({ length: AMBIENT_PARTICLE_COUNT }, () => ({
      angle: Math.random() * Math.PI * 2,
      radius: HELIX_RADIUS * (0.5 + Math.random() * 1.5),
      y: Math.random() * totalHeight,
      speed: 0.1 + Math.random() * 0.3,
      drift: 0.02 + Math.random() * 0.05,
      phase: Math.random() * Math.PI * 2,
    }));
  }, [totalHeight]);

  const material = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.transparent = true;
    mat.blending = THREE.AdditiveBlending;
    mat.depthWrite = false;

    mat.colorNode = color(0x445588);
    mat.emissiveNode = color(0x334477).mul(float(2.0));
    mat.opacityNode = float(0.3);
    mat.roughness = 0.0;
    mat.metalness = 0.0;

    return mat;
  }, []);

  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    const t = clock.getElapsedTime();

    for (let i = 0; i < AMBIENT_PARTICLE_COUNT; i++) {
      const p = particleData[i];
      const a = p.angle + t * p.drift;
      const px = Math.cos(a) * p.radius;
      const pz = Math.sin(a) * p.radius;
      const py = p.y + Math.sin(t * p.speed + p.phase) * 0.5;

      dummy.position.set(px, py, pz);
      dummy.scale.setScalar(0.025 + Math.sin(t * 0.8 + p.phase) * 0.01);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, AMBIENT_PARTICLE_COUNT]} material={material}>
      <sphereGeometry args={[1, 6, 6]} />
    </instancedMesh>
  );
}

// ── Milestone point lights ──

function MilestoneLights() {
  const milestoneIndices = EVENTS.reduce<number[]>((acc, ev, i) => {
    if (ev.type === 'milestone') acc.push(i);
    return acc;
  }, []);

  return (
    <>
      {milestoneIndices.map((idx) => {
        const pos = getEventPosition(idx);
        return (
          <pointLight
            key={`ml-${idx}`}
            position={[pos.x, pos.y, pos.z]}
            intensity={2.0}
            color={TYPE_COLORS[EVENTS[idx].type]}
            distance={6}
          />
        );
      })}
    </>
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

// ── Background click catcher ──

function BackgroundClickTarget({ onClick, totalHeight }: { onClick: () => void; totalHeight: number }) {
  const material = useMemo(() => {
    const mat = new THREE.MeshBasicNodeMaterial();
    mat.transparent = true;
    mat.opacity = 0;
    return mat;
  }, []);

  return (
    <mesh position={[0, totalHeight / 2, -10]} onClick={onClick} material={material}>
      <planeGeometry args={[50, 50]} />
    </mesh>
  );
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
      <ambientLight intensity={0.08} />
      <directionalLight position={[5, totalHeight + 5, 5]} intensity={0.6} />
      <directionalLight position={[-3, totalHeight / 2, -5]} intensity={0.2} />

      {/* Subtle fog for depth */}
      <fog attach="fog" args={['#050510', 5, 35]} />

      {/* Background click target */}
      <BackgroundClickTarget onClick={handleBackgroundClick} totalHeight={totalHeight} />

      {/* Camera controller */}
      <CameraController selectedEvent={selectedEvent} />

      {/* Helix group */}
      <group ref={groupRef}>
        {/* Helix backbone strands - energy tubes */}
        <StrandBackbone offset={0} variant="silver" />
        <StrandBackbone offset={Math.PI} variant="blue" />

        {/* Cross rungs - energy bridges */}
        {EVENTS.map((_, i) => (
          <CrossRung key={`rung-${i}`} index={i} />
        ))}

        {/* Event spheres with halos */}
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

        {/* Traveling particles with afterimage trails */}
        <TravelingParticles />

        {/* Ambient floating particles */}
        <AmbientParticles />

        {/* Point lights at milestones */}
        <MilestoneLights />

        {/* Colored ambient lights along the helix */}
        <pointLight position={[0, 0, 0]} intensity={1.5} color="#ffaa22" distance={8} />
        <pointLight position={[0, totalHeight * 0.33, 0]} intensity={1.5} color="#4488ff" distance={8} />
        <pointLight position={[0, totalHeight * 0.66, 0]} intensity={1.5} color="#cc44ff" distance={8} />
        <pointLight position={[0, totalHeight, 0]} intensity={1.5} color="#ff4488" distance={8} />
      </group>

      {/* Instructions overlay (top-left) */}
      <Html fullscreen>
        <div style={{
          position: 'absolute', top: '16px', left: '16px',
          color: 'rgba(255,255,255,0.7)', fontSize: '11px',
          background: 'rgba(0,0,0,0.5)', padding: '10px 14px',
          borderRadius: '6px', lineHeight: '1.6',
          maxWidth: '220px', pointerEvents: 'none',
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: '4px', color: '#88bbff', fontSize: '12px' }}>Project Timeline</div>
          <div>Development history as a DNA double helix — events spiral upward through time</div>
          <div style={{ marginTop: '4px', fontSize: '10px', opacity: 0.6 }}>
            Click an event for details
          </div>
          <div style={{ fontSize: '10px', opacity: 0.6 }}>
            Hover for quick preview
          </div>
          <div style={{ fontSize: '10px', opacity: 0.6 }}>
            Click empty space for overview
          </div>
        </div>
      </Html>

      {/* Event timeline sidebar (right) */}
      <Html fullscreen>
        <div style={{
          position: 'absolute', top: '16px', right: '16px',
          color: 'white', fontSize: '11px',
          background: 'rgba(5,10,25,0.75)', padding: '10px 12px',
          borderRadius: '6px', maxWidth: '180px', maxHeight: 'calc(100vh - 48px)',
          overflowY: 'auto', pointerEvents: 'none', backdropFilter: 'blur(4px)',
          border: '1px solid rgba(100,150,255,0.15)',
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: '6px', color: '#88bbff', fontSize: '11px' }}>Timeline</div>
          {EVENTS.map((ev, i) => (
            <div key={i}
              onClick={() => setSelectedEvent(selectedEvent === i ? null : i)}
              style={{
                padding: '2px 6px', marginBottom: '1px', borderRadius: '3px',
                cursor: 'pointer', pointerEvents: 'auto',
                display: 'flex', alignItems: 'center', gap: '5px',
                background: selectedEvent === i ? 'rgba(255,255,255,0.12)' : 'transparent',
                fontSize: '9px', transition: 'background 0.2s',
              }}
              onMouseEnter={(e) => { (e.target as HTMLElement).style.background = 'rgba(255,255,255,0.08)'; }}
              onMouseLeave={(e) => { (e.target as HTMLElement).style.background = selectedEvent === i ? 'rgba(255,255,255,0.12)' : 'transparent'; }}
            >
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: TYPE_COLORS[ev.type], flexShrink: 0 }} />
              <span style={{ color: 'rgba(255,255,255,0.4)', flexShrink: 0 }}>{ev.date}</span>
              <span style={{ color: selectedEvent === i ? '#fff' : 'rgba(255,255,255,0.7)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ev.label}</span>
            </div>
          ))}
          <div style={{ marginTop: '8px', borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: '6px' }}>
            {Object.entries(TYPE_COLORS).map(([type, col]) => (
              <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '1px', fontSize: '9px' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: col, flexShrink: 0 }} />
                <span style={{ textTransform: 'capitalize', color: 'rgba(255,255,255,0.5)' }}>{type}</span>
              </div>
            ))}
          </div>
        </div>
      </Html>
    </>
  );
}
