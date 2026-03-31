import { useRef, useMemo, useState, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three/webgpu';
// TSL imports removed — simple property-based materials used for performance

/**
 * Data Flow Pipes
 *
 * Data transformation pipeline visualized as a 3D pipe network with
 * flowing particles. Shows data being filtered, transformed, merged,
 * and split. Each node type has a unique TSL-driven material with
 * fresnel glow halos. Click nodes for details; hover to highlight connections.
 */

// Fresnel TSL helper removed — using simple property-based materials

// ── Node definitions ──
interface PipeNode {
  id: string;
  label: string;
  type: 'source' | 'transform' | 'filter' | 'merge' | 'split' | 'sink';
  position: [number, number, number];
  color: string;
  hex: number;
  desc: string;
}

interface Pipe {
  from: string;
  to: string;
  color: string;
  hex: number;
}

const NODES: PipeNode[] = [
  { id: 'api', label: 'API Input', type: 'source', position: [-6, 2, 0], color: '#44aaff', hex: 0x44aaff, desc: 'REST API requests' },
  { id: 'ws', label: 'WebSocket', type: 'source', position: [-6, -2, 0], color: '#22ccaa', hex: 0x22ccaa, desc: 'Real-time event stream' },
  { id: 'merge', label: 'Merge', type: 'merge', position: [-3, 0, 0], color: '#ffaa22', hex: 0xffaa22, desc: 'Combine input streams' },
  { id: 'validate', label: 'Validate', type: 'filter', position: [0, 0, 0], color: '#ff6644', hex: 0xff6644, desc: 'Schema validation (reject invalid)' },
  { id: 'transform', label: 'Transform', type: 'transform', position: [3, 0, 0], color: '#cc44ff', hex: 0xcc44ff, desc: 'Normalize & enrich data' },
  { id: 'split', label: 'Route', type: 'split', position: [6, 0, 0], color: '#ffcc22', hex: 0xffcc22, desc: 'Route by event type' },
  { id: 'db', label: 'Database', type: 'sink', position: [9, 2, 0], color: '#22cc88', hex: 0x22cc88, desc: 'Persistent storage' },
  { id: 'cache', label: 'Cache', type: 'sink', position: [9, 0, 0], color: '#ff8844', hex: 0xff8844, desc: 'Hot data cache (KV)' },
  { id: 'events', label: 'Event Bus', type: 'sink', position: [9, -2, 0], color: '#4466ff', hex: 0x4466ff, desc: 'Publish to subscribers' },
  { id: 'reject', label: 'Dead Letter', type: 'sink', position: [0, -3, 0], color: '#ff4444', hex: 0xff4444, desc: 'Invalid data quarantine' },
];

const PIPES: Pipe[] = [
  { from: 'api', to: 'merge', color: '#44aaff', hex: 0x44aaff },
  { from: 'ws', to: 'merge', color: '#22ccaa', hex: 0x22ccaa },
  { from: 'merge', to: 'validate', color: '#ffaa22', hex: 0xffaa22 },
  { from: 'validate', to: 'transform', color: '#cc44ff', hex: 0xcc44ff },
  { from: 'validate', to: 'reject', color: '#ff4444', hex: 0xff4444 },
  { from: 'transform', to: 'split', color: '#cc44ff', hex: 0xcc44ff },
  { from: 'split', to: 'db', color: '#22cc88', hex: 0x22cc88 },
  { from: 'split', to: 'cache', color: '#ff8844', hex: 0xff8844 },
  { from: 'split', to: 'events', color: '#4466ff', hex: 0x4466ff },
];

const PARTICLE_COUNT = 80;

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

// Pre-computed initial particle state (module scope avoids impure Math.random() during render)
const INITIAL_PARTICLE_STATE = (() => {
  const pipeIdx = new Int32Array(PARTICLE_COUNT);
  const progress = new Float32Array(PARTICLE_COUNT);
  const speed = new Float32Array(PARTICLE_COUNT);
  const isRejected = new Uint8Array(PARTICLE_COUNT);
  const rejectTimer = new Float32Array(PARTICLE_COUNT);
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    pipeIdx[i] = sourcePipeIndices[Math.floor(Math.random() * sourcePipeIndices.length)];
    progress[i] = Math.random();
    speed[i] = 0.3 + Math.random() * 0.3;
    isRejected[i] = 0;
    rejectTimer[i] = 0;
  }
  return { pipeIdx, progress, speed, isRejected, rejectTimer };
})();

// Shared node materials cache by type
const sharedNodeMaterials = new Map<string, THREE.MeshStandardNodeMaterial>();

// ── Simple property-based material for each node type (no shader compilation) ──
function makeNodeMaterial(_nodeType: string, hex: number, nodeId: string): THREE.MeshStandardNodeMaterial {
  const cacheKey = `${_nodeType}-${nodeId === 'reject' ? 'reject' : 'normal'}`;
  if (sharedNodeMaterials.has(cacheKey)) return sharedNodeMaterials.get(cacheKey)!;
  const mat = new THREE.MeshStandardNodeMaterial();

  if (nodeId === 'reject') {
    mat.color = new THREE.Color(0xff2222);
    mat.emissive = new THREE.Color(0xff2222);
    mat.emissiveIntensity = 1.5;
  } else {
    mat.color = new THREE.Color(hex);
    mat.emissive = new THREE.Color(hex);
    mat.emissiveIntensity = 0.8;
  }

  mat.roughness = 0.2;
  mat.metalness = 0.4;
  sharedNodeMaterials.set(cacheKey, mat);
  return mat;
}

// Shared halo material for selected/hovered nodes only
const sharedPipeNodeHaloMaterial = (() => {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;
  mat.opacity = 0.35;
  mat.side = THREE.BackSide;
  mat.depthWrite = false;
  mat.blending = THREE.AdditiveBlending;
  mat.color = new THREE.Color(0xffffff);
  mat.emissive = new THREE.Color(0xffffff);
  mat.emissiveIntensity = 2.5;
  mat.roughness = 0.0;
  mat.metalness = 0.0;
  return mat;
})();

// ── Simple transparent pipe material (no shader compilation) ──
function makePipeMaterial(hex: number): THREE.MeshStandardNodeMaterial {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;
  mat.opacity = 0.4;
  mat.color = new THREE.Color(hex);
  mat.emissive = new THREE.Color(hex);
  mat.emissiveIntensity = 0.5;
  mat.roughness = 0.3;
  mat.metalness = 0.1;
  return mat;
}

// (Pipe halo material removed for performance)

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

// (HaloGeometry removed — using shared halo material with NodeGeometry at larger scale)

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

  const nodeMat = useMemo(() => makeNodeMaterial(node.type, node.hex, node.id), [node.type, node.hex, node.id]);

  // Suppress unused variable warnings
  void isHighlighted;

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

  return (
    <group position={[node.position[0], node.position[1], node.position[2]]}>
      {/* Core mesh */}
      <mesh
        ref={meshRef}
        onClick={(e: { stopPropagation: () => void }) => { e.stopPropagation(); onSelect(node.id); }}
        onPointerOver={(e: { stopPropagation: () => void }) => { e.stopPropagation(); onHover(node.id); }}
        onPointerOut={() => onUnhover()}
        material={nodeMat}
      >
        <NodeGeometry type={node.type} />
      </mesh>
      {/* Halo shell only on selected/hovered */}
      {(isSelected || isHovered) && (
        <mesh material={sharedPipeNodeHaloMaterial} scale={1.5}>
          <NodeGeometry type={node.type} />
        </mesh>
      )}
      {/* Point light */}
      <pointLight color={node.color} intensity={isSelected ? 5.0 : isHovered ? 2.5 : 1.5} distance={5} />
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
  const geo = pipeGeoData[pipeIndex];

  const pipeMat = useMemo(() => makePipeMaterial(geo.pipe.hex), [geo.pipe.hex]);

  // Suppress unused variable warning
  void isHighlighted;

  return (
    <mesh
      position={[geo.mid.x, geo.mid.y, geo.mid.z]}
      quaternion={[geo.quat.x, geo.quat.y, geo.quat.z, geo.quat.w]}
      material={pipeMat}
    >
      <cylinderGeometry args={[0.1, 0.1, geo.length - 0.8, 12]} />
    </mesh>
  );
}

// ── Particle system ──
function FlowParticles({ selectedNode: _selectedNode }: { selectedNode: string | null }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  // Simple additive particle material (no shader compilation)
  const particleMat = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.transparent = true;
    mat.opacity = 0.9;
    mat.depthWrite = false;
    mat.blending = THREE.AdditiveBlending;
    mat.color = new THREE.Color(0xffffff);
    mat.emissive = new THREE.Color(0xffffff);
    mat.emissiveIntensity = 3.0;
    mat.roughness = 0.0;
    mat.metalness = 0.0;
    return mat;
  }, []);

  // Particle state: each particle is on a specific pipe with a progress
  const particleState = useMemo(() => {
    // Copy pre-computed arrays to avoid Math.random() during render
    return {
      pipeIdx: new Int32Array(INITIAL_PARTICLE_STATE.pipeIdx),
      progress: new Float32Array(INITIAL_PARTICLE_STATE.progress),
      speed: new Float32Array(INITIAL_PARTICLE_STATE.speed),
      isRejected: new Uint8Array(INITIAL_PARTICLE_STATE.isRejected),
      rejectTimer: new Float32Array(INITIAL_PARTICLE_STATE.rejectTimer),
    };
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

    switch (destNode.type) {
      case 'sink': {
        // eslint-disable-next-line react-hooks/immutability
        particleState.pipeIdx[i] = sourcePipeIndices[Math.floor(Math.random() * sourcePipeIndices.length)];
        particleState.progress[i] = 0;
        particleState.speed[i] = 0.3 + Math.random() * 0.3;
        particleState.isRejected[i] = 0;
        return;
      }
      case 'filter': {
        const outPipes = outgoingPipes.get(destNodeId) || [];
        if (Math.random() < 0.2) {
          const rejectPipe = outPipes.find(pi => PIPES[pi].to === 'reject');
          if (rejectPipe !== undefined) {
            particleState.pipeIdx[i] = rejectPipe;
            particleState.isRejected[i] = 1;
            particleState.rejectTimer[i] = 0.5;
          } else {
            particleState.pipeIdx[i] = outPipes[0];
          }
        } else {
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
        const outPipes = outgoingPipes.get(destNodeId) || [];
        particleState.pipeIdx[i] = outPipes[Math.floor(Math.random() * outPipes.length)];
        particleState.progress[i] = 0;
        particleState.isRejected[i] = 0;
        return;
      }
      default: {
        const outPipes = outgoingPipes.get(destNodeId) || [];
        if (outPipes.length > 0) {
          particleState.pipeIdx[i] = outPipes[Math.floor(Math.random() * outPipes.length)];
          particleState.progress[i] = 0;
          particleState.isRejected[i] = 0;
        } else {
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
      // eslint-disable-next-line react-hooks/immutability
      particleState.progress[i] += particleState.speed[i] * delta;
      particleState.rejectTimer[i] = Math.max(0, particleState.rejectTimer[i] - delta);

      if (particleState.progress[i] >= 1.0) {
        advanceParticle(i);
      }

      const geo = pipeGeoData[particleState.pipeIdx[i]];
      if (!geo) continue;

      const p = particleState.progress[i];
      tmpFrom.copy(geo.from);
      tmpTo.copy(geo.to);

      const x = tmpFrom.x + (tmpTo.x - tmpFrom.x) * p;
      const y = tmpFrom.y + (tmpTo.y - tmpFrom.y) * p;
      const z = tmpFrom.z + (tmpTo.z - tmpFrom.z) * p;

      const wobbleY = Math.sin(p * Math.PI * 6 + i * 0.7) * 0.06;
      const wobbleZ = Math.cos(p * Math.PI * 4 + i * 1.1) * 0.06;

      dummy.position.set(x, y + wobbleY, z + wobbleZ);
      dummy.scale.setScalar(0.06);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      // Color: pipe color, or bright red flash if rejected
      if (particleState.isRejected[i] && particleState.rejectTimer[i] > 0) {
        const flash = Math.sin(particleState.rejectTimer[i] * 20) * 0.5 + 0.5;
        tmpColor.setRGB(1.5, flash * 0.3, flash * 0.2);
      } else {
        tmpColor.set(geo.pipe.color);
        // Boost brightness for glow effect
        tmpColor.multiplyScalar(1.5);
      }
      mesh.setColorAt(i, tmpColor);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, PARTICLE_COUNT]} frustumCulled={false} material={particleMat}>
      <sphereGeometry args={[1, 8, 8]} />
    </instancedMesh>
  );
}

// ── Grid floor ──
function GridFloor() {
  const mat = useMemo(() => {
    const m = new THREE.MeshStandardNodeMaterial();
    m.transparent = true;
    m.opacity = 0.4;
    m.color = new THREE.Color(0x0e1520);
    m.emissive = new THREE.Color(0x1a2535);
    m.emissiveIntensity = 0.2;
    m.roughness = 0.8;
    m.metalness = 0.1;
    return m;
  }, []);

  return (
    <mesh position={[2, -5, 0]} rotation={[-Math.PI / 2, 0, 0]} material={mat}>
      <planeGeometry args={[30, 18]} />
    </mesh>
  );
}

// ── Background sphere ──
function BackgroundSphere() {
  const mat = useMemo(() => {
    const m = new THREE.MeshStandardNodeMaterial();
    m.side = THREE.BackSide;
    m.color = new THREE.Color(0x060910);
    m.emissive = new THREE.Color(0x040608);
    m.emissiveIntensity = 0.5;
    m.roughness = 1.0;
    m.metalness = 0.0;
    return m;
  }, []);

  return (
    <mesh material={mat}>
      <sphereGeometry args={[45, 32, 32]} />
    </mesh>
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

  // Background click catcher material
  const bgClickMat = useMemo(() => {
    const m = new THREE.MeshStandardNodeMaterial();
    m.color = new THREE.Color(0x0a0a12);
    m.roughness = 1.0;
    m.metalness = 0.0;
    return m;
  }, []);

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.1} />
      <hemisphereLight args={['#334466', '#111122', 0.3]} />
      <directionalLight position={[0, 8, 5]} intensity={0.3} />

      {/* Camera controller */}
      <CameraController selectedNode={selectedNode} />

      {/* Background gradient sphere */}
      <BackgroundSphere />

      {/* Subtle fog */}
      <fog attach="fog" args={['#050810', 15, 50]} />

      {/* Background click catcher */}
      <mesh position={[2, 0, -5]} onClick={handleBackgroundClick} material={bgClickMat}>
        <planeGeometry args={[60, 30]} />
      </mesh>

      {/* Grid floor */}
      <GridFloor />

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

      {/* Instructions overlay (top-left) */}
      <Html fullscreen>
        <div style={{
          position: 'absolute', top: '16px', left: '16px',
          color: 'rgba(255,255,255,0.7)', fontSize: '11px',
          background: 'rgba(0,0,0,0.5)', padding: '10px 14px',
          borderRadius: '6px', lineHeight: '1.6',
          maxWidth: '240px', pointerEvents: 'none',
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: '4px', color: '#88bbff', fontSize: '12px' }}>Data Flow Pipes</div>
          <div>Data transformation pipeline — packets flow through filter, merge, split, and sink nodes</div>
          <div style={{ marginTop: '4px' }}>Click a node to inspect</div>
          <div>Hover to highlight connections</div>
          <div>Watch packets route through the network</div>
          <div style={{ marginTop: '4px', fontSize: '10px', opacity: 0.6 }}>
            Use the node list to navigate
          </div>
        </div>
      </Html>

      {/* Pipeline nodes sidebar (right) */}
      <Html fullscreen>
        <div style={{
          position: 'absolute', top: '16px', right: '16px',
          color: 'white', fontSize: '11px',
          background: 'rgba(5,10,25,0.75)', padding: '10px 12px',
          borderRadius: '6px', maxWidth: '170px',
          pointerEvents: 'none', backdropFilter: 'blur(4px)',
          border: '1px solid rgba(100,150,255,0.15)',
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: '6px', color: '#88bbff', fontSize: '11px' }}>Pipeline Nodes</div>
          {NODES.map(node => (
            <div key={node.id}
              onClick={() => handleSelect(node.id)}
              style={{
                padding: '2px 6px', marginBottom: '1px', borderRadius: '3px',
                cursor: 'pointer', pointerEvents: 'auto',
                color: selectedNode === node.id ? '#fff' : node.color,
                background: selectedNode === node.id ? 'rgba(255,255,255,0.12)' : 'transparent',
                fontSize: '10px', transition: 'background 0.2s',
              }}
              onMouseEnter={(e) => { (e.target as HTMLElement).style.background = 'rgba(255,255,255,0.08)'; }}
              onMouseLeave={(e) => { (e.target as HTMLElement).style.background = selectedNode === node.id ? 'rgba(255,255,255,0.12)' : 'transparent'; }}
            >
              <span style={{ opacity: 0.5, fontSize: '9px', marginRight: '4px' }}>{node.type}</span>
              {node.label}
            </div>
          ))}
          <div style={{ marginTop: '8px', borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: '8px' }}>
            <div style={{ fontWeight: 'bold', marginBottom: '4px', color: '#88bbff', fontSize: '10px' }}>Routing Rules</div>
            <div style={{ padding: '2px 6px', fontSize: '10px', color: 'rgba(255,255,255,0.6)' }}>
              Filter: 80% pass, 20% reject
            </div>
            <div style={{ padding: '2px 6px', fontSize: '10px', color: 'rgba(255,255,255,0.6)' }}>
              Split: random destination
            </div>
            <div style={{ padding: '2px 6px', fontSize: '10px', color: 'rgba(255,255,255,0.6)' }}>
              Sink: respawn at source
            </div>
          </div>
        </div>
      </Html>
    </>
  );
}
