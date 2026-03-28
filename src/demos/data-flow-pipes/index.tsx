import { useRef, useMemo, useState, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three/webgpu';

/**
 * Data Flow Pipes
 *
 * Data transformation pipeline visualized as a 3D pipe network with
 * flowing particles. Shows data being filtered, transformed, merged,
 * and split. Click nodes for details; hover to highlight connections.
 */

// ── Node definitions ──
interface PipeNode {
  id: string;
  label: string;
  type: 'source' | 'transform' | 'filter' | 'merge' | 'split' | 'sink';
  position: [number, number, number];
  color: string;
  desc: string;
}

interface Pipe {
  from: string;
  to: string;
  color: string;
}

const NODES: PipeNode[] = [
  { id: 'api', label: 'API Input', type: 'source', position: [-6, 2, 0], color: '#44aaff', desc: 'REST API requests' },
  { id: 'ws', label: 'WebSocket', type: 'source', position: [-6, -2, 0], color: '#22ccaa', desc: 'Real-time event stream' },
  { id: 'merge', label: 'Merge', type: 'merge', position: [-3, 0, 0], color: '#ffaa22', desc: 'Combine input streams' },
  { id: 'validate', label: 'Validate', type: 'filter', position: [0, 0, 0], color: '#ff6644', desc: 'Schema validation (reject invalid)' },
  { id: 'transform', label: 'Transform', type: 'transform', position: [3, 0, 0], color: '#cc44ff', desc: 'Normalize & enrich data' },
  { id: 'split', label: 'Route', type: 'split', position: [6, 0, 0], color: '#ffcc22', desc: 'Route by event type' },
  { id: 'db', label: 'Database', type: 'sink', position: [9, 2, 0], color: '#22cc88', desc: 'Persistent storage' },
  { id: 'cache', label: 'Cache', type: 'sink', position: [9, 0, 0], color: '#ff8844', desc: 'Hot data cache (KV)' },
  { id: 'events', label: 'Event Bus', type: 'sink', position: [9, -2, 0], color: '#4466ff', desc: 'Publish to subscribers' },
  { id: 'reject', label: 'Dead Letter', type: 'sink', position: [0, -3, 0], color: '#ff4444', desc: 'Invalid data quarantine' },
];

const PIPES: Pipe[] = [
  { from: 'api', to: 'merge', color: '#44aaff' },
  { from: 'ws', to: 'merge', color: '#22ccaa' },
  { from: 'merge', to: 'validate', color: '#ffaa22' },
  { from: 'validate', to: 'transform', color: '#cc44ff' },
  { from: 'validate', to: 'reject', color: '#ff4444' },
  { from: 'transform', to: 'split', color: '#cc44ff' },
  { from: 'split', to: 'db', color: '#22cc88' },
  { from: 'split', to: 'cache', color: '#ff8844' },
  { from: 'split', to: 'events', color: '#4466ff' },
];

const PARTICLE_COUNT = 300;

// Build lookup maps
const nodeMap = new Map(NODES.map(n => [n.id, n]));

// Precompute pipe geometry data
const pipeGeoData = PIPES.map(pipe => {
  const fromNode = nodeMap.get(pipe.from)!;
  const toNode = nodeMap.get(pipe.to)!;
  const from = new THREE.Vector3(...fromNode.position);
  const to = new THREE.Vector3(...toNode.position);
  const mid = new THREE.Vector3().lerpVectors(from, to, 0.5);
  const dir = new THREE.Vector3().subVectors(to, from);
  const length = dir.length();
  dir.normalize();
  const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  return { from, to, mid, length, quat, pipe };
});

// Precompute outgoing pipe indices for each node
const outgoingPipes = new Map<string, number[]>();
const incomingPipes = new Map<string, number[]>();
PIPES.forEach((pipe, i) => {
  if (!outgoingPipes.has(pipe.from)) outgoingPipes.set(pipe.from, []);
  outgoingPipes.get(pipe.from)!.push(i);
  if (!incomingPipes.has(pipe.to)) incomingPipes.set(pipe.to, []);
  incomingPipes.get(pipe.to)!.push(i);
});

// Source node IDs for respawning
const sourceNodeIds = NODES.filter(n => n.type === 'source').map(n => n.id);
// Source pipe indices
const sourcePipeIndices = PIPES.map((p, i) => sourceNodeIds.includes(p.from) ? i : -1).filter(i => i >= 0);

// ── Node shape component ──
function NodeGeometry({ type }: { type: string }) {
  switch (type) {
    case 'source': return <coneGeometry args={[0.5, 1.0, 16]} />;
    case 'transform': return <boxGeometry args={[0.9, 0.9, 0.9]} />;
    case 'filter': return <octahedronGeometry args={[0.55]} />;
    case 'merge': return <sphereGeometry args={[0.5, 20, 20]} />;
    case 'split': return <icosahedronGeometry args={[0.5, 0]} />;
    case 'sink': return <cylinderGeometry args={[0.45, 0.45, 0.8, 16]} />;
    default: return <boxGeometry args={[0.6, 0.6, 0.6]} />;
  }
}

// ── Individual node component ──
function PipeNodeMesh({
  node,
  index,
  isSelected,
  isHovered,
  isHighlighted,
  onSelect,
  onHover,
  onUnhover,
}: {
  node: PipeNode;
  index: number;
  isSelected: boolean;
  isHovered: boolean;
  isHighlighted: boolean;
  onSelect: (id: string) => void;
  onHover: (id: string) => void;
  onUnhover: () => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const baseColor = useMemo(() => new THREE.Color(node.color), [node.color]);

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const t = clock.getElapsedTime();
    // Gentle bob
    meshRef.current.position.y = node.position[1] + Math.sin(t + index * 0.9) * 0.1;
    // Cone (source) rotated to point right
    if (node.type === 'source') {
      meshRef.current.rotation.z = -Math.PI / 2;
    }
    // Pulse on selection
    if (isSelected) {
      const scale = 1.0 + Math.sin(t * 3) * 0.1;
      meshRef.current.scale.setScalar(scale);
    } else {
      meshRef.current.scale.setScalar(1.0);
    }
  });

  const emissiveIntensity = isSelected ? 1.5 : isHovered ? 1.0 : isHighlighted ? 0.8 : 0.4;

  return (
    <group position={[node.position[0], node.position[1], node.position[2]]}>
      <mesh
        ref={meshRef}
        onClick={(e: { stopPropagation: () => void }) => { e.stopPropagation(); onSelect(node.id); }}
        onPointerOver={(e: { stopPropagation: () => void }) => { e.stopPropagation(); onHover(node.id); }}
        onPointerOut={() => onUnhover()}
      >
        <NodeGeometry type={node.type} />
        <meshStandardMaterial
          color={baseColor}
          emissive={baseColor}
          emissiveIntensity={emissiveIntensity}
          roughness={0.4}
          metalness={0.3}
        />
      </mesh>
      {/* Point light */}
      <pointLight color={node.color} intensity={isSelected ? 3.0 : 1.0} distance={4} />
      {/* Hover tooltip */}
      {isHovered && !isSelected && (
        <Html position={[0, 1.0, 0]} center distanceFactor={10}>
          <div style={{
            color: 'white', fontSize: '12px',
            background: 'rgba(0,0,0,0.8)', padding: '4px 8px',
            borderRadius: '4px', whiteSpace: 'nowrap', pointerEvents: 'none',
          }}>{node.label} ({node.type})</div>
        </Html>
      )}
      {/* Selection popup */}
      {isSelected && (
        <Html position={[0, 1.5, 0]} center distanceFactor={10}>
          <div style={{
            color: 'white', fontSize: '13px',
            background: 'rgba(0,0,0,0.9)', padding: '10px 14px',
            borderRadius: '6px', whiteSpace: 'nowrap', pointerEvents: 'none',
            border: `1px solid ${node.color}`, maxWidth: '240px',
          }}>
            <div style={{ fontWeight: 'bold', fontSize: '15px', marginBottom: '4px', color: node.color }}>{node.label}</div>
            <div style={{ color: '#999', fontSize: '11px', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '1px' }}>{node.type}</div>
            <div style={{ whiteSpace: 'normal', lineHeight: '1.4' }}>{node.desc}</div>
          </div>
        </Html>
      )}
      {/* Node label below */}
      <Html position={[0, -1.0, 0]} center distanceFactor={10}>
        <div style={{
          color: node.color, fontSize: '10px',
          background: 'rgba(0,0,0,0.6)', padding: '2px 6px',
          borderRadius: '3px', whiteSpace: 'nowrap', pointerEvents: 'none',
          fontFamily: 'monospace',
        }}>{node.label}</div>
      </Html>
    </group>
  );
}

// ── Pipe tube between nodes ──
function PipeTube({
  pipeIndex,
  isHighlighted,
}: {
  pipeIndex: number;
  isHighlighted: boolean;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const geo = pipeGeoData[pipeIndex];
  const pipeColor = useMemo(() => new THREE.Color(geo.pipe.color), [geo.pipe.color]);

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const t = clock.getElapsedTime();
    const mat = meshRef.current.material as THREE.MeshStandardMaterial;
    // Subtle pulse
    const pulse = Math.sin(t * 1.5 + pipeIndex * 0.7) * 0.5 + 0.5;
    mat.opacity = isHighlighted ? 0.5 + pulse * 0.2 : 0.25 + pulse * 0.1;
    mat.emissiveIntensity = isHighlighted ? 0.5 : 0.15;
  });

  return (
    <mesh
      ref={meshRef}
      position={[geo.mid.x, geo.mid.y, geo.mid.z]}
      quaternion={[geo.quat.x, geo.quat.y, geo.quat.z, geo.quat.w]}
    >
      <cylinderGeometry args={[0.08, 0.08, geo.length - 0.8, 8]} />
      <meshStandardMaterial
        color={pipeColor}
        emissive={pipeColor}
        emissiveIntensity={0.15}
        transparent
        opacity={0.3}
        roughness={0.5}
      />
    </mesh>
  );
}

// ── Particle system ──
function FlowParticles({ selectedNode: _selectedNode }: { selectedNode: string | null }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  // Particle state: each particle is on a specific pipe with a progress
  const particleState = useMemo(() => {
    const pipeIdx = new Int32Array(PARTICLE_COUNT);
    const progress = new Float32Array(PARTICLE_COUNT);
    const speed = new Float32Array(PARTICLE_COUNT);
    const isRejected = new Uint8Array(PARTICLE_COUNT); // flash red for rejected
    const rejectTimer = new Float32Array(PARTICLE_COUNT);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      // Start on a random source pipe
      pipeIdx[i] = sourcePipeIndices[Math.floor(Math.random() * sourcePipeIndices.length)];
      progress[i] = Math.random();
      speed[i] = 0.3 + Math.random() * 0.3;
      isRejected[i] = 0;
      rejectTimer[i] = 0;
    }
    return { pipeIdx, progress, speed, isRejected, rejectTimer };
  }, []);

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const tmpColor = useMemo(() => new THREE.Color(), []);
  const tmpFrom = useMemo(() => new THREE.Vector3(), []);
  const tmpTo = useMemo(() => new THREE.Vector3(), []);

  // Advance particle to next pipe when it reaches end of current pipe
  const advanceParticle = useCallback((i: number) => {
    const currentPipe = PIPES[particleState.pipeIdx[i]];
    const destNodeId = currentPipe.to;
    const destNode = nodeMap.get(destNodeId)!;

    // Handle node types
    switch (destNode.type) {
      case 'sink': {
        // Respawn at a source
        particleState.pipeIdx[i] = sourcePipeIndices[Math.floor(Math.random() * sourcePipeIndices.length)];
        particleState.progress[i] = 0;
        particleState.speed[i] = 0.3 + Math.random() * 0.3;
        particleState.isRejected[i] = 0;
        return;
      }
      case 'filter': {
        // 80% pass, 20% reject
        const outPipes = outgoingPipes.get(destNodeId) || [];
        if (Math.random() < 0.2) {
          // Reject: find pipe to 'reject' node
          const rejectPipe = outPipes.find(pi => PIPES[pi].to === 'reject');
          if (rejectPipe !== undefined) {
            particleState.pipeIdx[i] = rejectPipe;
            particleState.isRejected[i] = 1;
            particleState.rejectTimer[i] = 0.5; // flash for 0.5s
          } else {
            // Fallback: just pick first output
            particleState.pipeIdx[i] = outPipes[0];
          }
        } else {
          // Pass: find non-reject pipe
          const passPipe = outPipes.find(pi => PIPES[pi].to !== 'reject');
          if (passPipe !== undefined) {
            particleState.pipeIdx[i] = passPipe;
          } else {
            particleState.pipeIdx[i] = outPipes[0];
          }
          particleState.isRejected[i] = 0;
        }
        particleState.progress[i] = 0;
        return;
      }
      case 'split': {
        // Random output pipe
        const outPipes = outgoingPipes.get(destNodeId) || [];
        particleState.pipeIdx[i] = outPipes[Math.floor(Math.random() * outPipes.length)];
        particleState.progress[i] = 0;
        particleState.isRejected[i] = 0;
        return;
      }
      default: {
        // merge, transform, source: continue to first output pipe
        const outPipes = outgoingPipes.get(destNodeId) || [];
        if (outPipes.length > 0) {
          particleState.pipeIdx[i] = outPipes[Math.floor(Math.random() * outPipes.length)];
          particleState.progress[i] = 0;
          particleState.isRejected[i] = 0;
        } else {
          // Dead end, respawn
          particleState.pipeIdx[i] = sourcePipeIndices[Math.floor(Math.random() * sourcePipeIndices.length)];
          particleState.progress[i] = 0;
          particleState.isRejected[i] = 0;
        }
        return;
      }
    }
  }, [particleState]);

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particleState.progress[i] += particleState.speed[i] * delta;
      particleState.rejectTimer[i] = Math.max(0, particleState.rejectTimer[i] - delta);

      // Advance to next pipe if done
      if (particleState.progress[i] >= 1.0) {
        advanceParticle(i);
      }

      const geo = pipeGeoData[particleState.pipeIdx[i]];
      if (!geo) continue;

      const p = particleState.progress[i];
      tmpFrom.copy(geo.from);
      tmpTo.copy(geo.to);

      // Interpolate position along pipe
      const x = tmpFrom.x + (tmpTo.x - tmpFrom.x) * p;
      const y = tmpFrom.y + (tmpTo.y - tmpFrom.y) * p;
      const z = tmpFrom.z + (tmpTo.z - tmpFrom.z) * p;

      // Add slight wobble
      const wobbleY = Math.sin(p * Math.PI * 6 + i * 0.7) * 0.06;
      const wobbleZ = Math.cos(p * Math.PI * 4 + i * 1.1) * 0.06;

      dummy.position.set(x, y + wobbleY, z + wobbleZ);
      dummy.scale.setScalar(0.04);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      // Color: pipe color, or red flash if rejected
      if (particleState.isRejected[i] && particleState.rejectTimer[i] > 0) {
        const flash = Math.sin(particleState.rejectTimer[i] * 20) * 0.5 + 0.5;
        tmpColor.setRGB(1, flash * 0.3, flash * 0.2);
      } else {
        tmpColor.set(geo.pipe.color);
      }
      mesh.setColorAt(i, tmpColor);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, PARTICLE_COUNT]} frustumCulled={false}>
      <sphereGeometry args={[1, 6, 6]} />
      <meshStandardMaterial
        emissive="#ffffff"
        emissiveIntensity={2.0}
        transparent
        opacity={0.9}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </instancedMesh>
  );
}

// ── Camera controller ──
function CameraController({ selectedNode }: { selectedNode: string | null }) {
  const targetPos = useRef(new THREE.Vector3(2, 2, 16));
  const targetLookAt = useRef(new THREE.Vector3(2, 0, 0));

  useFrame(({ camera }) => {
    if (selectedNode) {
      const node = nodeMap.get(selectedNode);
      if (node) {
        targetPos.current.set(node.position[0], node.position[1] + 1.5, 6);
        targetLookAt.current.set(node.position[0], node.position[1], 0);
      }
    } else {
      targetPos.current.set(2, 2, 16);
      targetLookAt.current.set(2, 0, 0);
    }

    camera.position.lerp(targetPos.current, 0.05);
    camera.lookAt(targetLookAt.current);
  });

  return null;
}

// ── Main component ──
export default function DataFlowPipes() {
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  const handleSelect = useCallback((id: string) => {
    setSelectedNode(prev => prev === id ? null : id);
  }, []);

  const handleBackgroundClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  // Determine which pipes to highlight (connected to hovered node)
  const highlightedPipes = useMemo(() => {
    if (!hoveredNode) return new Set<number>();
    const set = new Set<number>();
    PIPES.forEach((pipe, i) => {
      if (pipe.from === hoveredNode || pipe.to === hoveredNode) set.add(i);
    });
    return set;
  }, [hoveredNode]);

  // Nodes connected to hovered node (for highlight)
  const highlightedNodes = useMemo(() => {
    if (!hoveredNode) return new Set<string>();
    const set = new Set<string>();
    PIPES.forEach(pipe => {
      if (pipe.from === hoveredNode) set.add(pipe.to);
      if (pipe.to === hoveredNode) set.add(pipe.from);
    });
    return set;
  }, [hoveredNode]);

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.1} />
      <directionalLight position={[0, 8, 5]} intensity={0.4} />

      {/* Camera controller */}
      <CameraController selectedNode={selectedNode} />

      {/* Background click catcher */}
      <mesh position={[2, 0, -5]} onClick={handleBackgroundClick}>
        <planeGeometry args={[60, 30]} />
        <meshBasicMaterial color="#0a0a12" />
      </mesh>

      {/* Pipes */}
      {PIPES.map((_, i) => (
        <PipeTube
          key={`pipe-${i}`}
          pipeIndex={i}
          isHighlighted={highlightedPipes.has(i)}
        />
      ))}

      {/* Nodes */}
      {NODES.map((node, i) => (
        <PipeNodeMesh
          key={node.id}
          node={node}
          index={i}
          isSelected={selectedNode === node.id}
          isHovered={hoveredNode === node.id}
          isHighlighted={highlightedNodes.has(node.id)}
          onSelect={handleSelect}
          onHover={setHoveredNode}
          onUnhover={() => setHoveredNode(null)}
        />
      ))}

      {/* Flow particles */}
      <FlowParticles selectedNode={selectedNode} />
    </>
  );
}
