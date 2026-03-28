import { useRef, useState, useMemo, useCallback } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three/webgpu';

/**
 * State Machine 3D
 *
 * Interactive state machine diagram showing a Forge project's lifecycle
 * states and transitions. Click states to trigger transitions with
 * animated particles flowing along curved arrows.
 */

// ── Data ──

interface State {
  id: string;
  label: string;
  description: string;
  color: string;
  hex: number;
  position: [number, number, number];
}

interface Transition {
  from: string;
  to: string;
  label: string;
  trigger: string;
}

const STATES: State[] = [
  { id: 'empty', label: 'Empty', description: 'No project structure', color: '#666666', hex: 0x666666, position: [-6, 0, 0] },
  { id: 'initialized', label: 'Initialized', description: 'Has package.json, git, .mise.toml', color: '#22cc88', hex: 0x22cc88, position: [-3, 2, 0] },
  { id: 'visioned', label: 'Has Vision', description: 'docs/vision.md defines the why', color: '#44ddaa', hex: 0x44ddaa, position: [0, 3, 0] },
  { id: 'planned', label: 'Planned', description: 'PRDs document what to build', color: '#4488ff', hex: 0x4488ff, position: [3, 2, 0] },
  { id: 'building', label: 'Building', description: 'Active implementation in progress', color: '#ffaa22', hex: 0xffaa22, position: [5, 0, 0] },
  { id: 'reviewing', label: 'In Review', description: 'Pre-merge quality check', color: '#ff8844', hex: 0xff8844, position: [3, -2, 0] },
  { id: 'shipped', label: 'Shipped', description: 'Feature deployed to production', color: '#22cc44', hex: 0x22cc44, position: [0, -3, 0] },
  { id: 'maintaining', label: 'Maintaining', description: 'Monitoring health, iterating', color: '#cc44ff', hex: 0xcc44ff, position: [-3, -2, 0] },
];

const TRANSITIONS: Transition[] = [
  { from: 'empty', to: 'initialized', label: 'init', trigger: '/forge:init' },
  { from: 'initialized', to: 'visioned', label: 'vision', trigger: '/forge:vision' },
  { from: 'visioned', to: 'planned', label: 'plan', trigger: '/forge:plan' },
  { from: 'planned', to: 'building', label: 'build', trigger: '/forge:drive' },
  { from: 'building', to: 'reviewing', label: 'review', trigger: '/forge:review' },
  { from: 'reviewing', to: 'shipped', label: 'merge', trigger: 'git merge' },
  { from: 'reviewing', to: 'building', label: 'revise', trigger: 'Address feedback' },
  { from: 'shipped', to: 'maintaining', label: 'maintain', trigger: '/forge:audit' },
  { from: 'maintaining', to: 'planned', label: 'iterate', trigger: 'New feature cycle' },
  { from: 'building', to: 'building', label: 'reflect', trigger: 'RARV loop' },
];

const stateMap = new Map(STATES.map((s) => [s.id, s]));

// ── Helpers ──

function getTransitionsFrom(stateId: string): Transition[] {
  return TRANSITIONS.filter((t) => t.from === stateId);
}

function getReachableStates(stateId: string): Set<string> {
  const reachable = new Set<string>();
  for (const t of getTransitionsFrom(stateId)) {
    reachable.add(t.to);
  }
  return reachable;
}

function computeBezierControlPoint(
  from: THREE.Vector3,
  to: THREE.Vector3,
  offset: number,
): THREE.Vector3 {
  const mid = new THREE.Vector3().lerpVectors(from, to, 0.5);
  const dir = new THREE.Vector3().subVectors(to, from).normalize();
  const perp = new THREE.Vector3(-dir.y, dir.x, 0);
  return mid.add(perp.multiplyScalar(offset));
}

function sampleBezier(
  p0: THREE.Vector3,
  p1: THREE.Vector3,
  p2: THREE.Vector3,
  count: number,
): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const x = (1 - t) * (1 - t) * p0.x + 2 * (1 - t) * t * p1.x + t * t * p2.x;
    const y = (1 - t) * (1 - t) * p0.y + 2 * (1 - t) * t * p1.y + t * t * p2.y;
    const z = (1 - t) * (1 - t) * p0.z + 2 * (1 - t) * t * p1.z + t * t * p2.z;
    points.push(new THREE.Vector3(x, y, z));
  }
  return points;
}

// ── Simple Material Factories ──

function makePlatformMaterial(hexColor: number, mode: 'active' | 'reachable' | 'dim') {
  const mat = new THREE.MeshStandardNodeMaterial();

  if (mode === 'active') {
    mat.color = new THREE.Color(hexColor);
    mat.emissive = new THREE.Color(hexColor);
    mat.emissiveIntensity = 1.5;
  } else if (mode === 'reachable') {
    mat.color = new THREE.Color(hexColor).multiplyScalar(0.5);
    mat.emissive = new THREE.Color(hexColor);
    mat.emissiveIntensity = 0.5;
  } else {
    mat.color = new THREE.Color(hexColor).multiplyScalar(0.1);
    mat.emissive = new THREE.Color(hexColor);
    mat.emissiveIntensity = 0.1;
    mat.transparent = true;
    mat.opacity = 0.6;
  }

  mat.roughness = 0.3;
  mat.metalness = 0.5;

  return mat;
}

function makeHaloShellMaterial(hexColor: number, layer: number) {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;
  mat.side = THREE.BackSide;
  mat.depthWrite = false;
  mat.blending = THREE.AdditiveBlending;

  const layerFade = 1.0 - layer * 0.35;
  mat.color = new THREE.Color(hexColor);
  mat.emissive = new THREE.Color(hexColor);
  mat.emissiveIntensity = 1.5 * layerFade;
  mat.opacity = 0.25 * layerFade;
  mat.roughness = 0.0;
  mat.metalness = 0.0;

  return mat;
}

function makeArrowMaterial(hexColor: number, isReachable: boolean) {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;

  if (isReachable) {
    mat.color = new THREE.Color(hexColor).multiplyScalar(0.5);
    mat.emissive = new THREE.Color(hexColor);
    mat.emissiveIntensity = 0.8;
    mat.opacity = 0.7;
  } else {
    mat.color = new THREE.Color(hexColor).multiplyScalar(0.05);
    mat.emissive = new THREE.Color(hexColor);
    mat.emissiveIntensity = 0.05;
    mat.opacity = 0.08;
  }

  mat.roughness = 0.4;
  mat.metalness = 0.2;

  return mat;
}

function makeOrbitalRingMaterial(hexColor: number) {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.color = new THREE.Color(hexColor);
  mat.emissive = new THREE.Color(hexColor);
  mat.emissiveIntensity = 2.0;
  mat.transparent = true;
  mat.opacity = 0.9;
  mat.roughness = 0.0;
  mat.metalness = 0.5;

  return mat;
}

function makeOrbitalHaloMaterial(hexColor: number) {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;
  mat.side = THREE.BackSide;
  mat.depthWrite = false;
  mat.blending = THREE.AdditiveBlending;
  mat.color = new THREE.Color(hexColor);
  mat.emissive = new THREE.Color(hexColor);
  mat.emissiveIntensity = 1.5;
  mat.opacity = 0.25;
  mat.roughness = 0.0;
  mat.metalness = 0.0;

  return mat;
}

function makeShockwaveMaterial(hexColor: number) {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;
  mat.side = THREE.DoubleSide;
  mat.depthWrite = false;
  mat.blending = THREE.AdditiveBlending;
  mat.color = new THREE.Color(hexColor);
  mat.emissive = new THREE.Color(hexColor);
  mat.emissiveIntensity = 4.0;
  mat.roughness = 0.0;
  mat.metalness = 0.0;

  return mat;
}

function makeParticleMaterial(hexColor: number) {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;
  mat.depthWrite = false;
  mat.blending = THREE.AdditiveBlending;
  mat.color = new THREE.Color(hexColor);
  mat.emissive = new THREE.Color(hexColor);
  mat.emissiveIntensity = 3.0;
  mat.roughness = 0.0;
  mat.metalness = 0.0;

  return mat;
}

function makeGridFloorMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.color = new THREE.Color(0x020208);
  mat.emissive = new THREE.Color(0x0a0f1e);
  mat.emissiveIntensity = 0.2;
  mat.roughness = 0.8;
  mat.metalness = 0.2;

  return mat;
}

// ── Transition Arrow Component ──

interface ArrowData {
  transition: Transition;
  points: THREE.Vector3[];
  midPoint: THREE.Vector3;
  colorHex: number;
  isReachable: boolean;
}

function TransitionArrow({
  arrow,
  onTrigger,
  activeTransition,
}: {
  arrow: ArrowData;
  onTrigger: (t: Transition) => void;
  activeTransition: Transition | null;
}) {
  const [hovered, setHovered] = useState(false);
  const groupRef = useRef<THREE.Group>(null);
  const isActive = activeTransition && activeTransition.from === arrow.transition.from && activeTransition.to === arrow.transition.to;

  const segments = useMemo(() => {
    const segs: { pos: THREE.Vector3; quat: THREE.Quaternion; length: number }[] = [];
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < arrow.points.length - 1; i++) {
      const a = arrow.points[i];
      const b = arrow.points[i + 1];
      const mid = new THREE.Vector3().lerpVectors(a, b, 0.5);
      const dir = new THREE.Vector3().subVectors(b, a);
      const len = dir.length();
      dir.normalize();
      const quat = new THREE.Quaternion().setFromUnitVectors(up, dir);
      segs.push({ pos: mid, quat, length: len });
    }
    return segs;
  }, [arrow.points]);

  const arrowHead = useMemo(() => {
    const pts = arrow.points;
    const tip = pts[pts.length - 1].clone();
    const prev = pts[pts.length - 2];
    const dir = new THREE.Vector3().subVectors(tip, prev).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const quat = new THREE.Quaternion().setFromUnitVectors(up, dir);
    tip.add(dir.clone().multiplyScalar(-0.3));
    return { position: tip, quaternion: quat };
  }, [arrow.points]);

  const arrowMat = useMemo(() => makeArrowMaterial(arrow.colorHex, arrow.isReachable), [arrow.colorHex, arrow.isReachable]);

  const hoveredMat = useMemo(() => {
    if (!arrow.isReachable) return null;
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.transparent = true;
    mat.color = new THREE.Color(arrow.colorHex);
    mat.emissive = new THREE.Color(arrow.colorHex);
    mat.emissiveIntensity = 2.0;
    mat.opacity = 1.0;
    mat.roughness = 0.2;
    mat.metalness = 0.3;
    return mat;
  }, [arrow.colorHex, arrow.isReachable]);

  const activeMat = (hovered || isActive) && hoveredMat ? hoveredMat : arrowMat;
  const arrowColor = useMemo(() => new THREE.Color(arrow.colorHex), [arrow.colorHex]);

  return (
    <group ref={groupRef}>
      {segments.map((seg, i) => (
        <mesh
          key={i}
          position={seg.pos}
          quaternion={seg.quat}
          material={activeMat}
          onClick={(e) => {
            e.stopPropagation();
            if (arrow.isReachable) onTrigger(arrow.transition);
          }}
          onPointerOver={(e) => {
            e.stopPropagation();
            setHovered(true);
          }}
          onPointerOut={() => setHovered(false)}
        >
          <cylinderGeometry args={[0.05, 0.05, seg.length, 6]} />
        </mesh>
      ))}

      <mesh position={arrowHead.position} quaternion={arrowHead.quaternion} material={activeMat}>
        <coneGeometry args={[0.18, 0.45, 6]} />
      </mesh>

      {hovered && (
        <Html position={arrow.midPoint} center distanceFactor={10}>
          <div
            style={{
              color: 'white',
              fontSize: '11px',
              background: 'rgba(0,0,0,0.85)',
              padding: '4px 8px',
              borderRadius: '4px',
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              border: `1px solid ${arrowColor.getStyle()}`,
            }}
          >
            <strong>{arrow.transition.label}</strong>: {arrow.transition.trigger}
          </div>
        </Html>
      )}
    </group>
  );
}

// ── Self-Loop Arrow ──

function SelfLoopArrow({
  state,
  transition,
  isReachable,
  onTrigger,
  activeTransition,
}: {
  state: State;
  transition: Transition;
  isReachable: boolean;
  onTrigger: (t: Transition) => void;
  activeTransition: Transition | null;
}) {
  const [hovered, setHovered] = useState(false);
  const isActive = activeTransition && activeTransition.from === transition.from && activeTransition.to === transition.to;
  const loopColor = useMemo(() => new THREE.Color(state.color), [state.color]);

  const loopCenter = new THREE.Vector3(
    state.position[0] + 1.5,
    state.position[1] + 1.5,
    state.position[2],
  );

  const loopMat = useMemo(() => makeArrowMaterial(state.hex, isReachable), [state.hex, isReachable]);

  const brightMat = useMemo(() => {
    if (!isReachable) return null;
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.transparent = true;
    mat.color = new THREE.Color(state.hex);
    mat.emissive = new THREE.Color(state.hex);
    mat.emissiveIntensity = 3.0;
    mat.opacity = 1.0;
    mat.roughness = 0.2;
    mat.metalness = 0.3;
    return mat;
  }, [state.hex, isReachable]);

  const activeMat = (hovered || isActive) && brightMat ? brightMat : loopMat;

  return (
    <group>
      <mesh
        position={loopCenter}
        rotation={[Math.PI / 2, 0, 0]}
        material={activeMat}
        onClick={(e) => {
          e.stopPropagation();
          if (isReachable) onTrigger(transition);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
        }}
        onPointerOut={() => setHovered(false)}
      >
        <torusGeometry args={[0.6, 0.05, 8, 24, Math.PI * 1.6]} />
      </mesh>

      <mesh position={[state.position[0] + 0.95, state.position[1] + 1.2, state.position[2]]} material={activeMat}>
        <coneGeometry args={[0.14, 0.35, 6]} />
      </mesh>

      {hovered && (
        <Html position={loopCenter} center distanceFactor={10}>
          <div
            style={{
              color: 'white',
              fontSize: '11px',
              background: 'rgba(0,0,0,0.85)',
              padding: '4px 8px',
              borderRadius: '4px',
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              border: `1px solid ${loopColor.getStyle()}`,
            }}
          >
            <strong>{transition.label}</strong>: {transition.trigger}
          </div>
        </Html>
      )}
    </group>
  );
}

// ── State Platform Component ──

function StatePlatform({
  state,
  isActive,
  isReachable,
  isHovered,
  onHover,
  onClick,
  time: _time,
  index,
}: {
  state: State;
  isActive: boolean;
  isReachable: boolean;
  isHovered: boolean;
  onHover: (id: string | null) => void;
  onClick: (id: string) => void;
  time: number;
  index: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const ring1Ref = useRef<THREE.Mesh>(null);
  const ring2Ref = useRef<THREE.Mesh>(null);
  const groupRef = useRef<THREE.Group>(null);

  // Determine visual mode
  const mode = isActive ? 'active' : isReachable ? 'reachable' : 'dim';

  const platformMat = useMemo(() => makePlatformMaterial(state.hex, mode), [state.hex, mode]);

  // Halo shells for active and reachable
  const haloMats = useMemo(() => {
    if (mode === 'dim') return [];
    if (mode === 'active') return [makeHaloShellMaterial(state.hex, 0), makeHaloShellMaterial(state.hex, 1)];
    return [makeHaloShellMaterial(state.hex, 0)];
  }, [state.hex, mode]);

  // Orbital ring material for active state
  const orbitalRingMat = useMemo(() => isActive ? makeOrbitalRingMaterial(state.hex) : null, [state.hex, isActive]);
  const orbitalHaloMat = useMemo(() => isActive ? makeOrbitalHaloMaterial(state.hex) : null, [state.hex, isActive]);

  useFrame((_, delta) => {
    if (groupRef.current) {
      // Gentle float
      groupRef.current.position.y = state.position[1] + Math.sin(groupRef.current.userData.t + index * 1.3) * 0.08;
      groupRef.current.userData.t = (groupRef.current.userData.t || 0) + delta;
    }
    // Pulse scale for active
    if (meshRef.current && isActive) {
      const t = groupRef.current?.userData.t || 0;
      const s = 1.0 + Math.sin(t * 2.5) * 0.06;
      meshRef.current.scale.setScalar(s);
    }
    // Orbit the rings
    if (ring1Ref.current) {
      ring1Ref.current.rotation.z += delta * 1.5;
      ring1Ref.current.rotation.x = Math.PI / 2 + Math.sin((groupRef.current?.userData.t || 0) * 0.7) * 0.2;
    }
    if (ring2Ref.current) {
      ring2Ref.current.rotation.z -= delta * 1.0;
      ring2Ref.current.rotation.x = Math.PI / 3 + Math.cos((groupRef.current?.userData.t || 0) * 0.5) * 0.3;
    }
  });

  const haloScales: [number, number, number][] = [[1.4, 1.4, 1.4], [1.8, 1.8, 1.8]];

  return (
    <group ref={groupRef} position={[state.position[0], state.position[1], state.position[2]]}>
      {/* Hexagonal platform */}
      <mesh
        ref={meshRef}
        material={platformMat}
        onClick={(e) => {
          e.stopPropagation();
          onClick(state.id);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHover(state.id);
        }}
        onPointerOut={() => onHover(null)}
      >
        <cylinderGeometry args={[1, 1, 0.3, 6]} />
      </mesh>

      {/* Halo shells */}
      {haloMats.map((mat, i) => (
        <mesh key={i} material={mat} scale={haloScales[i]}>
          <cylinderGeometry args={[1, 1, 0.3, 6]} />
        </mesh>
      ))}

      {/* Orbiting energy ring for active state */}
      {isActive && orbitalRingMat && (
        <mesh ref={ring1Ref} rotation={[Math.PI / 2, 0, 0]} material={orbitalRingMat}>
          <torusGeometry args={[1.35, 0.06, 8, 32]} />
        </mesh>
      )}
      {isActive && orbitalHaloMat && (
        <mesh ref={ring2Ref} rotation={[Math.PI / 3, 0, 0]} material={orbitalHaloMat}>
          <torusGeometry args={[1.35, 0.15, 8, 32]} />
        </mesh>
      )}

      {/* Point light at each state */}
      <pointLight
        color={state.color}
        intensity={isActive ? 3.0 : isReachable ? 1.0 : 0.15}
        distance={isActive ? 8 : 4}
      />

      {/* Label */}
      <Html position={[0, 0.7, 0]} center distanceFactor={10}>
        <div
          style={{
            color: 'white',
            fontSize: '12px',
            background: isActive
              ? `rgba(${parseInt(state.color.slice(1, 3), 16)},${parseInt(state.color.slice(3, 5), 16)},${parseInt(state.color.slice(5, 7), 16)},0.9)`
              : 'rgba(0,0,0,0.8)',
            padding: '4px 10px',
            borderRadius: '4px',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            fontWeight: isActive ? 'bold' : 'normal',
            border: isActive ? '1px solid rgba(255,255,255,0.5)' : '1px solid rgba(255,255,255,0.15)',
          }}
        >
          {state.label}
        </div>
      </Html>

      {/* Description on hover */}
      {isHovered && !isActive && (
        <Html position={[0, -0.6, 0]} center distanceFactor={10}>
          <div
            style={{
              color: '#ccc',
              fontSize: '10px',
              background: 'rgba(0,0,0,0.85)',
              padding: '3px 8px',
              borderRadius: '3px',
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
            }}
          >
            {state.description}
          </div>
        </Html>
      )}
    </group>
  );
}

// ── Shockwave Ring ──

interface ShockwaveData {
  position: [number, number, number];
  startTime: number;
  colorHex: number;
}

function ShockwaveRings({ shockwaves, time: currentTime }: { shockwaves: ShockwaveData[]; time: number }) {
  return (
    <>
      {shockwaves.map((sw, i) => {
        const elapsed = currentTime - sw.startTime;
        const duration = 0.8;
        if (elapsed < 0 || elapsed > duration) return null;
        const progress = elapsed / duration;
        const scale = 1.0 + progress * 3.0;
        const opacity = 1.0 - progress;

        const mat = useMemo(() => makeShockwaveMaterial(sw.colorHex), [sw.colorHex]);

        return (
          <mesh
            key={i}
            position={sw.position}
            rotation={[Math.PI / 2, 0, 0]}
            scale={[scale, scale, scale]}
          >
            <torusGeometry args={[1.0, 0.04, 6, 24]} />
            <primitive object={(() => { const m = mat.clone(); m.opacity = opacity; return m; })()} attach="material" />
          </mesh>
        );
      })}
    </>
  );
}

// ── Transition Particles ──

interface TransitionParticle {
  startTime: number;
  duration: number;
  points: THREE.Vector3[];
  colorHex: number;
}

function TransitionParticles({ particles, time: currentTime }: { particles: TransitionParticle[]; time: number }) {
  return (
    <>
      {particles.map((p, pi) => {
        const elapsed = currentTime - p.startTime;
        if (elapsed < 0 || elapsed > p.duration) return null;
        const count = 24;
        return Array.from({ length: count }, (_, i) => {
          const baseT = elapsed / p.duration;
          const particleT = baseT - (i / count) * 0.35;
          if (particleT < 0 || particleT > 1) return null;
          const pts = p.points;
          const x = (1 - particleT) * (1 - particleT) * pts[0].x + 2 * (1 - particleT) * particleT * pts[1].x + particleT * particleT * pts[2].x;
          const y = (1 - particleT) * (1 - particleT) * pts[0].y + 2 * (1 - particleT) * particleT * pts[1].y + particleT * particleT * pts[2].y;
          const z = (1 - particleT) * (1 - particleT) * pts[0].z + 2 * (1 - particleT) * particleT * pts[1].z + particleT * particleT * pts[2].z;
          const size = 0.07 * (1.0 - (i / count) * 0.4);
          // eslint-disable-next-line react-hooks/rules-of-hooks
          const mat = useMemo(() => makeParticleMaterial(p.colorHex), [p.colorHex]);
          return (
            <mesh key={`${pi}-${i}`} position={[x, y, z]} material={mat} scale={[size * 14, size * 14, size * 14]}>
              <sphereGeometry args={[0.06, 6, 6]} />
            </mesh>
          );
        });
      })}
    </>
  );
}

// ── Ambient Flow Particles along arrows ──

function AmbientFlowParticles({ arrows, time: currentTime }: { arrows: ArrowData[]; time: number }) {
  const particleDefs = useMemo(() => {
    const result: { arrowIdx: number; offset: number }[] = [];
    arrows.forEach((_, ai) => {
      for (let j = 0; j < 4; j++) {
        result.push({ arrowIdx: ai, offset: j / 4 });
      }
    });
    return result;
  }, [arrows]);

  // Create materials for each arrow's color
  const flowMats = useMemo(() => {
    return arrows.map((arrow) => {
      const mat = new THREE.MeshStandardNodeMaterial();
      mat.transparent = true;
      mat.depthWrite = false;
      mat.blending = THREE.AdditiveBlending;
      mat.color = new THREE.Color(arrow.colorHex);
      mat.emissive = new THREE.Color(arrow.colorHex);
      mat.emissiveIntensity = 2.5;
      mat.roughness = 0.0;
      mat.metalness = 0.0;
      return mat;
    });
  }, [arrows]);

  return (
    <>
      {particleDefs.map((p, i) => {
        const arrow = arrows[p.arrowIdx];
        if (!arrow.isReachable) return null;
        const pts = arrow.points;
        const t = ((currentTime * 0.4 + p.offset) % 1.0);
        const x = (1 - t) * (1 - t) * pts[0].x + 2 * (1 - t) * t * pts[1].x + t * t * pts[2].x;
        const y = (1 - t) * (1 - t) * pts[0].y + 2 * (1 - t) * t * pts[1].y + t * t * pts[2].y;
        const z = (1 - t) * (1 - t) * pts[0].z + 2 * (1 - t) * t * pts[1].z + t * t * pts[2].z;
        return (
          <mesh key={i} position={[x, y, z]} material={flowMats[p.arrowIdx]}>
            <sphereGeometry args={[0.04, 6, 6]} />
          </mesh>
        );
      })}
    </>
  );
}

// ── Grid Floor with state-color-tinted zones ──

function GridFloor({ states, activeState }: { states: State[]; activeState: string }) {
  const gridMat = useMemo(() => makeGridFloorMaterial(), []);

  return (
    <group>
      {/* Main grid floor */}
      <mesh position={[0, -1.5, -0.5]} rotation={[-Math.PI / 2, 0, 0]} material={gridMat}>
        <planeGeometry args={[24, 18]} />
      </mesh>

      {/* Tinted zones beneath each platform */}
      {states.map((state) => {
        const isActiveState = state.id === activeState;
        // eslint-disable-next-line react-hooks/rules-of-hooks
        const zoneMat = useMemo(() => {
          const mat = new THREE.MeshStandardNodeMaterial();
          mat.transparent = true;
          mat.depthWrite = false;
          mat.blending = THREE.AdditiveBlending;
          const intensity = isActiveState ? 0.15 : 0.03;
          mat.color = new THREE.Color(state.hex).multiplyScalar(intensity);
          mat.emissive = new THREE.Color(state.hex).multiplyScalar(intensity * 0.5);
          mat.emissiveIntensity = 1.0;
          mat.roughness = 0.9;
          mat.metalness = 0.0;
          return mat;
        }, [state.hex, isActiveState]);

        return (
          <mesh
            key={state.id}
            position={[state.position[0], -1.49, -0.5]}
            rotation={[-Math.PI / 2, 0, 0]}
            material={zoneMat}
          >
            <circleGeometry args={[2.0, 6]} />
          </mesh>
        );
      })}
    </group>
  );
}

// ── Main Component ──

export default function StateMachine3D() {
  const [activeState, setActiveState] = useState('empty');
  const [hoveredState, setHoveredState] = useState<string | null>(null);
  const [activeTransition, setActiveTransition] = useState<Transition | null>(null);
  const [transitionParticles, setTransitionParticles] = useState<TransitionParticle[]>([]);
  const [shockwaves, setShockwaves] = useState<ShockwaveData[]>([]);
  const timeRef = useRef(0);
  const targetPos = useRef(new THREE.Vector3(0, 2, 14));
  const targetLook = useRef(new THREE.Vector3(0, 0, 0));
  const { camera } = useThree();

  const reachableStates = useMemo(() => getReachableStates(activeState), [activeState]);

  const arrows: ArrowData[] = useMemo(() => {
    return TRANSITIONS.filter((t) => t.from !== t.to).map((t) => {
      const fromState = stateMap.get(t.from)!;
      const toState = stateMap.get(t.to)!;
      const from = new THREE.Vector3(...fromState.position);
      const to = new THREE.Vector3(...toState.position);

      const hasReverse = TRANSITIONS.some((r) => r.from === t.to && r.to === t.from);
      const offsetAmount = hasReverse ? 0.8 : 0.5;

      const control = computeBezierControlPoint(from, to, offsetAmount);
      const points = sampleBezier(from, control, to, 12);
      const midPoint = sampleBezier(from, control, to, 2)[1];
      const colFrom = new THREE.Color(fromState.color);
      const colTo = new THREE.Color(toState.color);
      colFrom.lerp(colTo, 0.5);
      const colorHex = parseInt(colFrom.getHexString(), 16);

      return {
        transition: t,
        points,
        midPoint,
        colorHex,
        isReachable: t.from === activeState,
      };
    });
  }, [activeState]);

  const selfLoop = useMemo(
    () => TRANSITIONS.find((t) => t.from === t.to),
    [],
  );

  const triggerTransition = useCallback(
    (t: Transition) => {
      if (t.from !== activeState) return;
      if (activeTransition) return;

      setActiveTransition(t);

      const fromState = stateMap.get(t.from)!;
      const toState = stateMap.get(t.to)!;
      const from = new THREE.Vector3(...fromState.position);
      const to = new THREE.Vector3(...toState.position);

      let bezierPoints: THREE.Vector3[];
      if (t.from === t.to) {
        const loopUp = new THREE.Vector3(from.x + 1.5, from.y + 1.5, from.z);
        bezierPoints = [from, loopUp, from];
      } else {
        const hasReverse = TRANSITIONS.some((r) => r.from === t.to && r.to === t.from);
        const control = computeBezierControlPoint(from, to, hasReverse ? 0.8 : 0.5);
        bezierPoints = [from, control, to];
      }

      // Camera: position to see both states
      const mid = new THREE.Vector3().lerpVectors(from, to, 0.5);
      targetPos.current.set(mid.x, mid.y + 3, 10);
      targetLook.current.copy(mid);

      // Source shockwave
      setShockwaves((prev) => [
        ...prev,
        {
          position: [...fromState.position] as [number, number, number],
          startTime: timeRef.current,
          colorHex: fromState.hex,
        },
      ]);

      // Particles
      const colFrom = new THREE.Color(fromState.color);
      const colTo = new THREE.Color(toState.color);
      colFrom.lerp(colTo, 0.5);
      const particleColorHex = parseInt(colFrom.getHexString(), 16);

      setTransitionParticles((prev) => [
        ...prev,
        {
          startTime: timeRef.current,
          duration: 1.0,
          points: bezierPoints,
          colorHex: particleColorHex,
        },
      ]);

      // After 1 second, update active state
      setTimeout(() => {
        setActiveState(t.to);
        setActiveTransition(null);

        const newState = stateMap.get(t.to)!;
        targetPos.current.set(newState.position[0], newState.position[1] + 3, 12);
        targetLook.current.set(newState.position[0], newState.position[1], 0);
      }, 1000);
    },
    [activeState, activeTransition],
  );

  const handleStateClick = useCallback(
    (stateId: string) => {
      if (stateId === activeState) return;
      const t = TRANSITIONS.find((tr) => tr.from === activeState && tr.to === stateId);
      if (t) {
        triggerTransition(t);
      }
    },
    [activeState, triggerTransition],
  );

  useFrame((_, delta) => {
    timeRef.current += delta;

    // Smooth camera movement
    camera.position.lerp(targetPos.current, 0.03);
    camera.lookAt(
      camera.position.x + (targetLook.current.x - camera.position.x) * 0.03,
      camera.position.y + (targetLook.current.y - camera.position.y) * 0.03 - 0.5,
      0,
    );

    // Cleanup old particles and shockwaves
    setTransitionParticles((prev) =>
      prev.filter((p) => timeRef.current - p.startTime < p.duration + 0.5),
    );
    setShockwaves((prev) =>
      prev.filter((sw) => timeRef.current - sw.startTime < 1.0),
    );
  });

  const activeStateData = stateMap.get(activeState)!;

  // Simple dark background material
  const bgMat = useMemo(() => {
    const mat = new THREE.MeshBasicNodeMaterial();
    mat.side = THREE.BackSide;
    mat.color = new THREE.Color(0x010003);
    return mat;
  }, []);

  return (
    <>
      <ambientLight intensity={0.08} />
      <pointLight
        position={[activeStateData.position[0], activeStateData.position[1] + 2, 3]}
        intensity={3.0}
        color={activeStateData.color}
        distance={15}
      />
      <directionalLight position={[5, 8, 5]} intensity={0.2} />

      {/* Dark gradient background sphere */}
      <mesh material={bgMat}>
        <sphereGeometry args={[25, 16, 16]} />
      </mesh>

      {/* Grid floor with tinted zones */}
      <GridFloor states={STATES} activeState={activeState} />

      {/* State platforms */}
      {STATES.map((state, i) => (
        <StatePlatform
          key={state.id}
          state={state}
          isActive={state.id === activeState}
          isReachable={reachableStates.has(state.id)}
          isHovered={hoveredState === state.id}
          onHover={setHoveredState}
          onClick={handleStateClick}
          time={timeRef.current}
          index={i}
        />
      ))}

      {/* Transition arrows */}
      {arrows.map((arrow, i) => (
        <TransitionArrow
          key={`${arrow.transition.from}-${arrow.transition.to}-${i}`}
          arrow={arrow}
          onTrigger={triggerTransition}
          activeTransition={activeTransition}
        />
      ))}

      {/* Self-loop arrow */}
      {selfLoop && (
        <SelfLoopArrow
          state={stateMap.get(selfLoop.from)!}
          transition={selfLoop}
          isReachable={selfLoop.from === activeState}
          onTrigger={triggerTransition}
          activeTransition={activeTransition}
        />
      )}

      {/* Shockwave rings on transition */}
      <ShockwaveRings shockwaves={shockwaves} time={timeRef.current} />

      {/* Transition particles */}
      <TransitionParticles particles={transitionParticles} time={timeRef.current} />

      {/* Ambient flow particles */}
      <AmbientFlowParticles arrows={arrows} time={timeRef.current} />

      {/* Instructions overlay (top-left) */}
      <Html fullscreen>
        <div style={{
          position: 'absolute', top: '16px', left: '16px',
          color: 'rgba(255,255,255,0.7)', fontSize: '11px',
          background: 'rgba(0,0,0,0.5)', padding: '10px 14px',
          borderRadius: '6px', lineHeight: '1.6',
          maxWidth: '220px', pointerEvents: 'none',
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: '4px', color: '#88bbff', fontSize: '12px' }}>State Machine</div>
          <div>A Forge project's lifecycle states — click valid transitions to advance</div>
          <div style={{ marginTop: '4px', fontSize: '10px', opacity: 0.6 }}>
            Click a reachable state to transition
          </div>
          <div style={{ fontSize: '10px', opacity: 0.6 }}>
            Hover states for descriptions
          </div>
          <div style={{ fontSize: '10px', opacity: 0.6 }}>
            Green = active, dim = unreachable
          </div>
        </div>
      </Html>

      {/* State list sidebar (right) */}
      <Html fullscreen>
        <div style={{
          position: 'absolute', top: '16px', right: '16px',
          color: 'white', fontSize: '11px',
          background: 'rgba(5,10,25,0.75)', padding: '10px 12px',
          borderRadius: '6px', maxWidth: '170px',
          pointerEvents: 'none', backdropFilter: 'blur(4px)',
          border: '1px solid rgba(100,150,255,0.15)',
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: '6px', color: '#88bbff', fontSize: '11px' }}>Project States</div>
          {STATES.map(s => (
            <div key={s.id}
              onClick={() => handleStateClick(s.id)}
              style={{
                padding: '2px 6px', marginBottom: '1px', borderRadius: '3px',
                cursor: 'pointer', pointerEvents: 'auto',
                display: 'flex', alignItems: 'center', gap: '6px',
                color: s.id === activeState ? '#fff' : s.color,
                background: s.id === activeState ? 'rgba(255,255,255,0.12)' : 'transparent',
                fontSize: '10px', transition: 'background 0.2s',
              }}
              onMouseEnter={(e) => { (e.target as HTMLElement).style.background = 'rgba(255,255,255,0.08)'; }}
              onMouseLeave={(e) => { (e.target as HTMLElement).style.background = s.id === activeState ? 'rgba(255,255,255,0.12)' : 'transparent'; }}
            >
              <span style={{ fontSize: '8px' }}>{s.id === activeState ? '\u25B6' : '\u25CB'}</span>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
              {s.label}
            </div>
          ))}
          <div style={{ marginTop: '8px', borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: '6px' }}>
            <div style={{ fontWeight: 'bold', fontSize: '10px', color: activeStateData.color }}>
              Current: {activeStateData.label}
            </div>
            <div style={{ marginTop: '4px', fontSize: '10px', color: 'rgba(255,255,255,0.5)' }}>
              Available transitions:
            </div>
            {getTransitionsFrom(activeState).map(t => {
              const target = stateMap.get(t.to)!;
              return (
                <div key={`${t.from}-${t.to}`}
                  onClick={() => handleStateClick(t.to)}
                  style={{
                    padding: '1px 6px', fontSize: '9px',
                    color: target.color, cursor: 'pointer', pointerEvents: 'auto',
                  }}
                >
                  → {target.label} ({t.label})
                </div>
              );
            })}
          </div>
        </div>
      </Html>
    </>
  );
}
