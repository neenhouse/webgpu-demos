import { useState, useRef, useMemo, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import { Html } from '@react-three/drei';

/**
 * Dependency Graph 3D
 *
 * A force-directed 3D graph visualizing package dependencies.
 * CPU-side physics simulation positions nodes, individual meshes
 * enable per-node click/hover interactivity, and thin cylinders
 * connect dependent packages.
 */

// ── Data ──

interface NodeData {
  id: string;
  label: string;
  group: string;
}

interface EdgeData {
  from: string;
  to: string;
}

const NODES: NodeData[] = [
  { id: 'app', label: 'my-app', group: 'root' },
  { id: 'react', label: 'react', group: 'framework' },
  { id: 'react-dom', label: 'react-dom', group: 'framework' },
  { id: 'three', label: 'three', group: 'rendering' },
  { id: 'r3f', label: '@react-three/fiber', group: 'rendering' },
  { id: 'drei', label: '@react-three/drei', group: 'rendering' },
  { id: 'vite', label: 'vite', group: 'tooling' },
  { id: 'typescript', label: 'typescript', group: 'tooling' },
  { id: 'vitest', label: 'vitest', group: 'tooling' },
  { id: 'eslint', label: 'eslint', group: 'tooling' },
  { id: 'zod', label: 'zod', group: 'data' },
  { id: 'yaml', label: 'yaml', group: 'data' },
  { id: 'scheduler', label: 'scheduler', group: 'framework' },
  { id: 'esbuild', label: 'esbuild', group: 'tooling' },
  { id: 'rollup', label: 'rollup', group: 'tooling' },
  { id: 'postcss', label: 'postcss', group: 'tooling' },
];

const EDGES: EdgeData[] = [
  { from: 'app', to: 'react' },
  { from: 'app', to: 'react-dom' },
  { from: 'app', to: 'three' },
  { from: 'app', to: 'r3f' },
  { from: 'app', to: 'drei' },
  { from: 'app', to: 'vite' },
  { from: 'app', to: 'typescript' },
  { from: 'app', to: 'zod' },
  { from: 'app', to: 'yaml' },
  { from: 'app', to: 'vitest' },
  { from: 'app', to: 'eslint' },
  { from: 'r3f', to: 'react' },
  { from: 'r3f', to: 'three' },
  { from: 'drei', to: 'r3f' },
  { from: 'drei', to: 'three' },
  { from: 'react-dom', to: 'react' },
  { from: 'react-dom', to: 'scheduler' },
  { from: 'vite', to: 'esbuild' },
  { from: 'vite', to: 'rollup' },
  { from: 'vite', to: 'postcss' },
  { from: 'vitest', to: 'vite' },
];

const GROUP_COLORS: Record<string, string> = {
  root: '#ffffff',
  framework: '#61dafb',
  rendering: '#00ff88',
  tooling: '#ff8800',
  data: '#cc44ff',
};

const NODE_COUNT = NODES.length;

// Build adjacency lookup: for each node id, list of connected node ids
const ADJACENCY = new Map<string, Set<string>>();
for (const node of NODES) {
  ADJACENCY.set(node.id, new Set());
}
for (const edge of EDGES) {
  ADJACENCY.get(edge.from)!.add(edge.to);
  ADJACENCY.get(edge.to)!.add(edge.from);
}

// Index lookup
const NODE_INDEX = new Map<string, number>();
NODES.forEach((n, i) => NODE_INDEX.set(n.id, i));

// ── Force simulation helpers ──

function initPositions(): Float32Array {
  const pos = new Float32Array(NODE_COUNT * 3);
  for (let i = 0; i < NODE_COUNT; i++) {
    // Random position in a sphere of radius 3
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = Math.random() * 3;
    pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    pos[i * 3 + 2] = r * Math.cos(phi);
  }
  return pos;
}

function initVelocities(): Float32Array {
  return new Float32Array(NODE_COUNT * 3); // all zero
}

// ── Edge cylinder helpers ──

const _midpoint = new THREE.Vector3();
const _direction = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _quat = new THREE.Quaternion();

function positionEdgeCylinder(
  mesh: THREE.Mesh,
  srcX: number,
  srcY: number,
  srcZ: number,
  tgtX: number,
  tgtY: number,
  tgtZ: number,
) {
  _midpoint.set((srcX + tgtX) / 2, (srcY + tgtY) / 2, (srcZ + tgtZ) / 2);
  _direction.set(tgtX - srcX, tgtY - srcY, tgtZ - srcZ);
  const length = _direction.length();
  if (length < 0.001) return;
  _direction.normalize();
  _quat.setFromUnitVectors(_up, _direction);

  mesh.position.copy(_midpoint);
  mesh.quaternion.copy(_quat);
  mesh.scale.set(1, length, 1);
}

// ── Components ──

function GraphNode({
  node,
  index,
  positions,
  selected,
  hovered,
  onSelect,
  onHover,
  onUnhover,
}: {
  node: NodeData;
  index: number;
  positions: Float32Array;
  selected: string | null;
  hovered: string | null;
  onSelect: (id: string) => void;
  onHover: (id: string) => void;
  onUnhover: () => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const isRoot = node.group === 'root';
  const baseRadius = isRoot ? 0.3 : 0.15;
  const groupColor = GROUP_COLORS[node.group] || '#888888';
  const isSelected = selected === node.id;
  const isHovered = hovered === node.id;
  const isConnectedToSelected =
    selected !== null && ADJACENCY.get(selected)?.has(node.id);

  const colorObj = useMemo(() => new THREE.Color(groupColor), [groupColor]);

  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const x = positions[index * 3];
    const y = positions[index * 3 + 1];
    const z = positions[index * 3 + 2];
    mesh.position.set(x, y, z);

    // Pulse scale when selected
    if (isSelected) {
      const pulse = 1 + Math.sin(clock.getElapsedTime() * 4) * 0.15;
      mesh.scale.setScalar(pulse);
    } else {
      mesh.scale.setScalar(1);
    }
  });

  const emissiveIntensity = isSelected ? 2.0 : isHovered ? 1.5 : isConnectedToSelected ? 1.0 : 0.4;

  return (
    <mesh
      ref={meshRef}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(node.id);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        onHover(node.id);
      }}
      onPointerOut={() => onUnhover()}
    >
      <icosahedronGeometry args={[baseRadius, 1]} />
      <meshStandardMaterial
        color={groupColor}
        emissive={colorObj}
        emissiveIntensity={emissiveIntensity}
        roughness={0.3}
        metalness={0.4}
      />
      {/* Show label on hover or select */}
      {(isSelected || isHovered) && (
        <Html center distanceFactor={10}>
          <div
            style={{
              color: 'white',
              fontSize: '12px',
              background: 'rgba(0,0,0,0.85)',
              padding: '6px 10px',
              borderRadius: '6px',
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              border: `1px solid ${groupColor}`,
              textAlign: 'center',
            }}
          >
            <div style={{ fontWeight: 'bold', marginBottom: '2px' }}>
              {node.label}
            </div>
            <div style={{ fontSize: '10px', opacity: 0.7 }}>{node.group}</div>
          </div>
        </Html>
      )}
    </mesh>
  );
}

function GraphEdge({
  edge,
  edgeIndex: _edgeIndex,
  positions,
  selected,
  hovered,
}: {
  edge: EdgeData;
  edgeIndex: number;
  positions: Float32Array;
  selected: string | null;
  hovered: string | null;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const fromIdx = NODE_INDEX.get(edge.from)!;
  const toIdx = NODE_INDEX.get(edge.to)!;

  const isHighlighted =
    selected === edge.from ||
    selected === edge.to ||
    hovered === edge.from ||
    hovered === edge.to;

  // Blend source and target colors
  const blendedColor = useMemo(() => {
    const fromGroup = NODES[fromIdx].group;
    const toGroup = NODES[toIdx].group;
    const c1 = new THREE.Color(GROUP_COLORS[fromGroup] || '#888888');
    const c2 = new THREE.Color(GROUP_COLORS[toGroup] || '#888888');
    return c1.lerp(c2, 0.5);
  }, [fromIdx, toIdx]);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const sx = positions[fromIdx * 3];
    const sy = positions[fromIdx * 3 + 1];
    const sz = positions[fromIdx * 3 + 2];
    const tx = positions[toIdx * 3];
    const ty = positions[toIdx * 3 + 1];
    const tz = positions[toIdx * 3 + 2];

    positionEdgeCylinder(mesh, sx, sy, sz, tx, ty, tz);
  });

  return (
    <mesh ref={meshRef} raycast={() => null}>
      <cylinderGeometry args={[0.015, 0.015, 1, 4, 1]} />
      <meshStandardMaterial
        color={blendedColor}
        emissive={blendedColor}
        emissiveIntensity={isHighlighted ? 1.5 : 0.2}
        transparent
        opacity={isHighlighted ? 0.9 : 0.25}
        roughness={0.5}
        metalness={0.2}
      />
    </mesh>
  );
}

// ── Main component ──

export default function DependencyGraph3D() {
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const groupRef = useRef<THREE.Group>(null);
  const frameCount = useRef(0);

  // Persistent physics state via refs
  const positionsRef = useRef<Float32Array>(initPositions());
  const velocitiesRef = useRef<Float32Array>(initVelocities());

  // Camera target for smooth transitions
  const cameraTarget = useRef(new THREE.Vector3(0, 3, 8));
  const cameraLookAt = useRef(new THREE.Vector3(0, 0, 0));

  const handleSelect = useCallback(
    (id: string) => {
      if (selected === id) {
        // Deselect on second click
        setSelected(null);
        cameraTarget.current.set(0, 3, 8);
        cameraLookAt.current.set(0, 0, 0);
      } else {
        setSelected(id);
        const idx = NODE_INDEX.get(id)!;
        const pos = positionsRef.current;
        const nx = pos[idx * 3];
        const ny = pos[idx * 3 + 1];
        const nz = pos[idx * 3 + 2];
        // Position camera 3 units back from node
        const dir = new THREE.Vector3(nx, ny, nz).normalize();
        cameraTarget.current.set(
          nx + dir.x * 3,
          ny + dir.y * 1.5 + 1,
          nz + dir.z * 3 + 2,
        );
        cameraLookAt.current.set(nx, ny, nz);
      }
    },
    [selected],
  );

  const handleHover = useCallback((id: string) => {
    setHovered(id);
  }, []);

  const handleUnhover = useCallback(() => {
    setHovered(null);
  }, []);

  const handleMiss = useCallback(() => {
    setSelected(null);
    cameraTarget.current.set(0, 3, 8);
    cameraLookAt.current.set(0, 0, 0);
  }, []);

  // Force simulation in useFrame
  useFrame(({ camera }) => {
    frameCount.current += 1;
    const pos = positionsRef.current;
    const vel = velocitiesRef.current;

    // More iterations early on, fewer after convergence
    const iterations = frameCount.current < 120 ? 3 : 1;

    for (let iter = 0; iter < iterations; iter++) {
      // Repulsion: all pairs
      for (let i = 0; i < NODE_COUNT; i++) {
        for (let j = i + 1; j < NODE_COUNT; j++) {
          const dx = pos[i * 3] - pos[j * 3];
          const dy = pos[i * 3 + 1] - pos[j * 3 + 1];
          const dz = pos[i * 3 + 2] - pos[j * 3 + 2];
          const distSq = dx * dx + dy * dy + dz * dz + 0.01;
          const dist = Math.sqrt(distSq);
          const force = Math.min(2.0, 1.5 / distSq); // coulomb, capped
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          const fz = (dz / dist) * force;

          vel[i * 3] += fx;
          vel[i * 3 + 1] += fy;
          vel[i * 3 + 2] += fz;
          vel[j * 3] -= fx;
          vel[j * 3 + 1] -= fy;
          vel[j * 3 + 2] -= fz;
        }
      }

      // Attraction: connected nodes (spring)
      const restLength = 1.8;
      const springK = 0.05;
      for (const edge of EDGES) {
        const i = NODE_INDEX.get(edge.from)!;
        const j = NODE_INDEX.get(edge.to)!;
        const dx = pos[j * 3] - pos[i * 3];
        const dy = pos[j * 3 + 1] - pos[i * 3 + 1];
        const dz = pos[j * 3 + 2] - pos[i * 3 + 2];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz + 0.01);
        const displacement = dist - restLength;
        const force = springK * displacement;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        const fz = (dz / dist) * force;

        vel[i * 3] += fx;
        vel[i * 3 + 1] += fy;
        vel[i * 3 + 2] += fz;
        vel[j * 3] -= fx;
        vel[j * 3 + 1] -= fy;
        vel[j * 3 + 2] -= fz;
      }

      // Centering force: gentle pull toward origin
      for (let i = 0; i < NODE_COUNT; i++) {
        vel[i * 3] -= pos[i * 3] * 0.005;
        vel[i * 3 + 1] -= pos[i * 3 + 1] * 0.005;
        vel[i * 3 + 2] -= pos[i * 3 + 2] * 0.005;
      }

      // Apply velocity with damping
      for (let i = 0; i < NODE_COUNT; i++) {
        vel[i * 3] *= 0.95;
        vel[i * 3 + 1] *= 0.95;
        vel[i * 3 + 2] *= 0.95;

        pos[i * 3] += vel[i * 3] * 0.1;
        pos[i * 3 + 1] += vel[i * 3 + 1] * 0.1;
        pos[i * 3 + 2] += vel[i * 3 + 2] * 0.1;
      }
    }

    // Slow rotation of entire graph
    if (groupRef.current) {
      groupRef.current.rotation.y += 0.01 * (1 / 60);
    }

    // Smooth camera transition
    camera.position.lerp(cameraTarget.current, 0.05);
    const currentLookAt = new THREE.Vector3();
    camera.getWorldDirection(currentLookAt);
    camera.lookAt(cameraLookAt.current);
  });

  return (
    <>
      <ambientLight intensity={0.15} />
      <directionalLight position={[5, 8, 5]} intensity={0.4} />
      <pointLight position={[0, 0, 0]} intensity={0.5} color={0xffffff} distance={15} />

      {/* Background plane for click-to-deselect */}
      <mesh
        position={[0, 0, -15]}
        onClick={handleMiss}
        visible={false}
      >
        <planeGeometry args={[100, 100]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>

      <group ref={groupRef}>
        {/* Edges */}
        {EDGES.map((edge, i) => (
          <GraphEdge
            key={`edge-${i}`}
            edge={edge}
            edgeIndex={i}
            positions={positionsRef.current}
            selected={selected}
            hovered={hovered}
          />
        ))}

        {/* Nodes */}
        {NODES.map((node, i) => (
          <GraphNode
            key={node.id}
            node={node}
            index={i}
            positions={positionsRef.current}
            selected={selected}
            hovered={hovered}
            onSelect={handleSelect}
            onHover={handleHover}
            onUnhover={handleUnhover}
          />
        ))}
      </group>
    </>
  );
}
