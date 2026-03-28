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
  position: [number, number, number];
}

interface Transition {
  from: string;
  to: string;
  label: string;
  trigger: string;
}

const STATES: State[] = [
  { id: 'empty', label: 'Empty', description: 'No project structure', color: '#666666', position: [-6, 0, 0] },
  { id: 'initialized', label: 'Initialized', description: 'Has package.json, git, .mise.toml', color: '#22cc88', position: [-3, 2, 0] },
  { id: 'visioned', label: 'Has Vision', description: 'docs/vision.md defines the why', color: '#44ddaa', position: [0, 3, 0] },
  { id: 'planned', label: 'Planned', description: 'PRDs document what to build', color: '#4488ff', position: [3, 2, 0] },
  { id: 'building', label: 'Building', description: 'Active implementation in progress', color: '#ffaa22', position: [5, 0, 0] },
  { id: 'reviewing', label: 'In Review', description: 'Pre-merge quality check', color: '#ff8844', position: [3, -2, 0] },
  { id: 'shipped', label: 'Shipped', description: 'Feature deployed to production', color: '#22cc44', position: [0, -3, 0] },
  { id: 'maintaining', label: 'Maintaining', description: 'Monitoring health, iterating', color: '#cc44ff', position: [-3, -2, 0] },
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

/** Compute a quadratic bezier control point offset perpendicular to the line between two positions */
function computeBezierControlPoint(
  from: THREE.Vector3,
  to: THREE.Vector3,
  offset: number,
): THREE.Vector3 {
  const mid = new THREE.Vector3().lerpVectors(from, to, 0.5);
  const dir = new THREE.Vector3().subVectors(to, from).normalize();
  // Perpendicular in XY plane
  const perp = new THREE.Vector3(-dir.y, dir.x, 0);
  return mid.add(perp.multiplyScalar(offset));
}

/** Sample points along a quadratic bezier */
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

// ── Transition Arrow Component ──

interface ArrowData {
  transition: Transition;
  points: THREE.Vector3[];
  midPoint: THREE.Vector3;
  color: THREE.Color;
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

  // Build segment meshes from points
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

  // Arrow head direction
  const arrowHead = useMemo(() => {
    const pts = arrow.points;
    const tip = pts[pts.length - 1].clone();
    const prev = pts[pts.length - 2];
    const dir = new THREE.Vector3().subVectors(tip, prev).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const quat = new THREE.Quaternion().setFromUnitVectors(up, dir);
    // Pull tip back slightly to not overlap the target platform
    tip.add(dir.clone().multiplyScalar(-0.3));
    return { position: tip, quaternion: quat };
  }, [arrow.points]);

  const opacity = arrow.isReachable ? (hovered || isActive ? 1.0 : 0.6) : 0.15;
  const emissiveIntensity = hovered || isActive ? 2.0 : arrow.isReachable ? 0.5 : 0.1;

  return (
    <group ref={groupRef}>
      {/* Arrow body segments */}
      {segments.map((seg, i) => (
        <mesh
          key={i}
          position={seg.pos}
          quaternion={seg.quat}
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
          <cylinderGeometry args={[0.04, 0.04, seg.length, 4]} />
          <meshStandardMaterial
            color={arrow.color}
            emissive={arrow.color}
            emissiveIntensity={emissiveIntensity}
            transparent
            opacity={opacity}
          />
        </mesh>
      ))}

      {/* Arrow head cone */}
      <mesh position={arrowHead.position} quaternion={arrowHead.quaternion}>
        <coneGeometry args={[0.15, 0.4, 6]} />
        <meshStandardMaterial
          color={arrow.color}
          emissive={arrow.color}
          emissiveIntensity={emissiveIntensity}
          transparent
          opacity={opacity}
        />
      </mesh>

      {/* Hover label */}
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
              border: `1px solid ${arrow.color.getStyle()}`,
            }}
          >
            <strong>{arrow.transition.label}</strong>: {arrow.transition.trigger}
          </div>
        </Html>
      )}
    </group>
  );
}

// ── Self-Loop Arrow (building -> building) ──

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
  const loopColor = new THREE.Color(state.color);

  const loopCenter = new THREE.Vector3(
    state.position[0] + 1.5,
    state.position[1] + 1.5,
    state.position[2],
  );

  const opacity = isReachable ? (hovered || isActive ? 1.0 : 0.6) : 0.15;
  const emissiveIntensity = hovered || isActive ? 2.0 : isReachable ? 0.5 : 0.1;

  return (
    <group>
      <mesh
        position={loopCenter}
        rotation={[Math.PI / 2, 0, 0]}
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
        <torusGeometry args={[0.6, 0.04, 8, 24, Math.PI * 1.6]} />
        <meshStandardMaterial
          color={loopColor}
          emissive={loopColor}
          emissiveIntensity={emissiveIntensity}
          transparent
          opacity={opacity}
        />
      </mesh>

      {/* Arrow head for self-loop */}
      <mesh position={[state.position[0] + 0.95, state.position[1] + 1.2, state.position[2]]}>
        <coneGeometry args={[0.12, 0.3, 6]} />
        <meshStandardMaterial
          color={loopColor}
          emissive={loopColor}
          emissiveIntensity={emissiveIntensity}
          transparent
          opacity={opacity}
        />
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
  time,
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
  const ringRef = useRef<THREE.Mesh>(null);
  const col = useMemo(() => new THREE.Color(state.color), [state.color]);

  // Floating offset
  const floatY = Math.sin(time + index * 1.3) * 0.08;
  // Active pulse
  const pulse = isActive ? 1.0 + Math.sin(time * 2.5) * 0.06 : 1.0;

  const emissiveIntensity = isActive ? 1.5 : isReachable ? 0.5 : 0.08;

  return (
    <group position={[state.position[0], state.position[1] + floatY, state.position[2]]}>
      {/* Hexagonal platform */}
      <mesh
        ref={meshRef}
        scale={[pulse, pulse, pulse]}
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
        <meshStandardMaterial
          color={col}
          emissive={col}
          emissiveIntensity={emissiveIntensity}
          metalness={0.3}
          roughness={0.5}
        />
      </mesh>

      {/* Orbiting ring for active state */}
      {isActive && (
        <mesh
          ref={ringRef}
          rotation={[Math.PI / 2, 0, time * 1.5]}
          position={[0, 0, 0]}
        >
          <torusGeometry args={[1.3, 0.04, 8, 32]} />
          <meshStandardMaterial
            color={col}
            emissive={col}
            emissiveIntensity={3.0}
            transparent
            opacity={0.8}
          />
        </mesh>
      )}

      {/* Label */}
      <Html position={[0, 0.6, 0]} center distanceFactor={10}>
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

// ── Transition Particles ──

interface TransitionParticle {
  startTime: number;
  duration: number;
  points: THREE.Vector3[];
}

function TransitionParticles({ particles, time }: { particles: TransitionParticle[]; time: number }) {
  return (
    <>
      {particles.map((p, pi) => {
        const elapsed = time - p.startTime;
        if (elapsed < 0 || elapsed > p.duration) return null;
        const count = 12;
        return Array.from({ length: count }, (_, i) => {
          const baseT = elapsed / p.duration;
          const particleT = baseT - (i / count) * 0.3;
          if (particleT < 0 || particleT > 1) return null;
          // Sample bezier
          const pts = p.points;
          const x = (1 - particleT) * (1 - particleT) * pts[0].x + 2 * (1 - particleT) * particleT * pts[1].x + particleT * particleT * pts[2].x;
          const y = (1 - particleT) * (1 - particleT) * pts[0].y + 2 * (1 - particleT) * particleT * pts[1].y + particleT * particleT * pts[2].y;
          const z = (1 - particleT) * (1 - particleT) * pts[0].z + 2 * (1 - particleT) * particleT * pts[1].z + particleT * particleT * pts[2].z;
          const alpha = 1.0 - (i / count) * 0.6;
          return (
            <mesh key={`${pi}-${i}`} position={[x, y, z]}>
              <sphereGeometry args={[0.06, 6, 6]} />
              <meshStandardMaterial
                color="#ffffff"
                emissive="#ffffff"
                emissiveIntensity={3.0}
                transparent
                opacity={alpha}
              />
            </mesh>
          );
        });
      })}
    </>
  );
}

// ── Ambient Flow Particles along arrows ──

function AmbientFlowParticles({ arrows, time }: { arrows: ArrowData[]; time: number }) {
  const particles = useMemo(() => {
    const result: { arrowIdx: number; offset: number }[] = [];
    arrows.forEach((_, ai) => {
      for (let j = 0; j < 3; j++) {
        result.push({ arrowIdx: ai, offset: j / 3 });
      }
    });
    return result;
  }, [arrows]);

  return (
    <>
      {particles.map((p, i) => {
        const arrow = arrows[p.arrowIdx];
        if (!arrow.isReachable) return null;
        const pts = arrow.points;
        const t = ((time * 0.3 + p.offset) % 1.0);
        const x = (1 - t) * (1 - t) * pts[0].x + 2 * (1 - t) * t * pts[1].x + t * t * pts[2].x;
        const y = (1 - t) * (1 - t) * pts[0].y + 2 * (1 - t) * t * pts[1].y + t * t * pts[2].y;
        const z = (1 - t) * (1 - t) * pts[0].z + 2 * (1 - t) * t * pts[1].z + t * t * pts[2].z;
        return (
          <mesh key={i} position={[x, y, z]}>
            <sphereGeometry args={[0.03, 4, 4]} />
            <meshStandardMaterial
              color={arrow.color}
              emissive={arrow.color}
              emissiveIntensity={1.5}
              transparent
              opacity={0.6}
            />
          </mesh>
        );
      })}
    </>
  );
}

// ── Main Component ──

export default function StateMachine3D() {
  const [activeState, setActiveState] = useState('empty');
  const [hoveredState, setHoveredState] = useState<string | null>(null);
  const [activeTransition, setActiveTransition] = useState<Transition | null>(null);
  const [transitionParticles, setTransitionParticles] = useState<TransitionParticle[]>([]);
  const timeRef = useRef(0);
  const targetPos = useRef(new THREE.Vector3(0, 2, 14));
  const targetLook = useRef(new THREE.Vector3(0, 0, 0));
  const { camera } = useThree();

  const reachableStates = useMemo(() => getReachableStates(activeState), [activeState]);

  // Build arrow data for non-self-loop transitions
  const arrows: ArrowData[] = useMemo(() => {
    return TRANSITIONS.filter((t) => t.from !== t.to).map((t) => {
      const fromState = stateMap.get(t.from)!;
      const toState = stateMap.get(t.to)!;
      const from = new THREE.Vector3(...fromState.position);
      const to = new THREE.Vector3(...toState.position);

      // Check if there's a reverse transition to determine offset direction
      const hasReverse = TRANSITIONS.some((r) => r.from === t.to && r.to === t.from);
      const offsetAmount = hasReverse ? 0.8 : 0.5;

      const control = computeBezierControlPoint(from, to, offsetAmount);
      const points = sampleBezier(from, control, to, 12);
      const midPoint = sampleBezier(from, control, to, 2)[1];
      const col = new THREE.Color(fromState.color).lerp(new THREE.Color(toState.color), 0.5);

      return {
        transition: t,
        points,
        midPoint,
        color: col,
        isReachable: t.from === activeState,
      };
    });
  }, [activeState]);

  // Self-loop transition
  const selfLoop = useMemo(
    () => TRANSITIONS.find((t) => t.from === t.to),
    [],
  );

  const triggerTransition = useCallback(
    (t: Transition) => {
      if (t.from !== activeState) return;
      if (activeTransition) return; // Already transitioning

      setActiveTransition(t);

      const fromState = stateMap.get(t.from)!;
      const toState = stateMap.get(t.to)!;
      const from = new THREE.Vector3(...fromState.position);
      const to = new THREE.Vector3(...toState.position);

      let bezierPoints: THREE.Vector3[];
      if (t.from === t.to) {
        // Self-loop: create a loop path
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

      setTransitionParticles((prev) => [
        ...prev,
        {
          startTime: timeRef.current,
          duration: 1.0,
          points: bezierPoints,
        },
      ]);

      // After 1 second, update active state
      setTimeout(() => {
        setActiveState(t.to);
        setActiveTransition(null);

        // Move camera to focus on new state
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
      // Find a transition from activeState to this state
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
    const currentLook = new THREE.Vector3();
    camera.getWorldDirection(currentLook);
    camera.lookAt(
      camera.position.x + (targetLook.current.x - camera.position.x) * 0.03,
      camera.position.y + (targetLook.current.y - camera.position.y) * 0.03 - 0.5,
      0,
    );

    // Cleanup old particles
    setTransitionParticles((prev) =>
      prev.filter((p) => timeRef.current - p.startTime < p.duration + 0.5),
    );
  });

  const activeStateData = stateMap.get(activeState)!;

  return (
    <>
      <ambientLight intensity={0.1} />
      <pointLight
        position={[activeStateData.position[0], activeStateData.position[1] + 2, 3]}
        intensity={2.0}
        color={activeStateData.color}
        distance={15}
      />
      <directionalLight position={[5, 8, 5]} intensity={0.3} />

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

      {/* Self-loop arrow for building -> building */}
      {selfLoop && (
        <SelfLoopArrow
          state={stateMap.get(selfLoop.from)!}
          transition={selfLoop}
          isReachable={selfLoop.from === activeState}
          onTrigger={triggerTransition}
          activeTransition={activeTransition}
        />
      )}

      {/* Transition particles (when a transition fires) */}
      <TransitionParticles particles={transitionParticles} time={timeRef.current} />

      {/* Ambient flow particles along reachable arrows */}
      <AmbientFlowParticles arrows={arrows} time={timeRef.current} />

      {/* Background plane */}
      <mesh position={[0, 0, -2]} rotation={[0, 0, 0]}>
        <planeGeometry args={[30, 20]} />
        <meshBasicMaterial color="#080810" />
      </mesh>
    </>
  );
}
