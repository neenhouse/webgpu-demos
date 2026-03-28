import { useRef, useMemo, useState, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three/webgpu';

/**
 * Decision Forest — Forge drive's decision tree rendered as a 3D branching structure.
 *
 * Tree grows left-to-right. Decision nodes are octahedra, leaf nodes are icosahedra.
 * Click a leaf to highlight the full path from root. Hover to see labels.
 * Particles pulse along edges.
 */

// ── Data ──

interface TreeNode {
  id: string;
  label: string;
  condition?: string;
  recommendation?: string;
  children?: TreeNode[];
  color: string;
}

const DECISION_TREE: TreeNode = {
  id: 'root',
  label: 'Project State',
  color: '#ffffff',
  children: [
    {
      id: 'no-structure',
      label: 'No Structure?',
      condition: 'No package.json',
      color: '#ff6644',
      children: [
        { id: 'init', label: 'init', recommendation: 'Run /forge:init', color: '#22cc88' },
      ],
    },
    {
      id: 'no-git',
      label: 'No Git?',
      condition: 'No .git directory',
      color: '#ff8844',
      children: [
        { id: 'init2', label: 'init', recommendation: 'Run /forge:init', color: '#22cc88' },
      ],
    },
    {
      id: 'no-vision',
      label: 'No Vision?',
      condition: 'Missing docs/vision.md',
      color: '#ffaa44',
      children: [
        { id: 'vision', label: 'vision', recommendation: 'Run /forge:vision', color: '#44ddaa' },
      ],
    },
    {
      id: 'no-prds',
      label: 'No PRDs?',
      condition: 'Vision exists, no docs/prd/',
      color: '#ffcc44',
      children: [
        { id: 'plan', label: 'plan', recommendation: 'Run /forge:plan', color: '#4488ff' },
      ],
    },
    {
      id: 'no-infra',
      label: 'No Infra?',
      condition: 'PRDs exist, no deploy config',
      color: '#ddcc44',
      children: [
        { id: 'infra', label: 'infra', recommendation: 'Run /forge:infra', color: '#4488ff' },
      ],
    },
    {
      id: 'no-tests',
      label: 'No Tests?',
      condition: 'No test framework',
      color: '#aacc44',
      children: [
        { id: 'test', label: 'test', recommendation: 'Run /forge:test', color: '#4488ff' },
      ],
    },
    {
      id: 'open-issues',
      label: 'Open Issues?',
      condition: 'Beads issues exist',
      color: '#88cc44',
      children: [
        {
          id: 'implement',
          label: 'Implement',
          recommendation: 'Build next task',
          color: '#4488ff',
        },
        {
          id: 'parallel',
          label: '3+ tasks?',
          condition: '3+ independent issues',
          color: '#66aaff',
          children: [
            {
              id: 'fan-out',
              label: 'parallel',
              recommendation: 'Run /forge:parallel',
              color: '#4488ff',
            },
          ],
        },
      ],
    },
    {
      id: 'all-complete',
      label: 'All Complete?',
      condition: 'All features COMPLETE',
      color: '#44cc88',
      children: [
        {
          id: 'next-cycle',
          label: 'plan',
          recommendation: 'Plan next iteration',
          color: '#cc44ff',
        },
      ],
    },
  ],
};

// ── Layout ──

interface LayoutNode {
  id: string;
  label: string;
  condition?: string;
  recommendation?: string;
  color: string;
  position: THREE.Vector3;
  isLeaf: boolean;
  parentId?: string;
  depth: number;
  index: number;
}

interface LayoutEdge {
  fromId: string;
  toId: string;
  from: THREE.Vector3;
  to: THREE.Vector3;
  fromColor: string;
  toColor: string;
}

const X_SPACING = 3.5;
const Z_JITTER_SEED = 42;

function seededRandom(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 49297;
  return x - Math.floor(x);
}

function layoutTree(
  node: TreeNode,
  depth: number,
  yMin: number,
  yMax: number,
  parentId: string | undefined,
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  indexRef: { value: number },
): void {
  const isLeaf = !node.children || node.children.length === 0;
  const x = depth * X_SPACING;
  const y = (yMin + yMax) / 2;
  const z = (seededRandom(Z_JITTER_SEED + indexRef.value * 7) - 0.5) * 0.6;

  const position = new THREE.Vector3(x, y, z);
  const idx = indexRef.value;
  indexRef.value++;

  nodes.push({
    id: node.id,
    label: node.label,
    condition: node.condition,
    recommendation: node.recommendation,
    color: node.color,
    position,
    isLeaf,
    parentId,
    depth,
    index: idx,
  });

  if (parentId) {
    const parentNode = nodes.find((n) => n.id === parentId);
    if (parentNode) {
      edges.push({
        fromId: parentId,
        toId: node.id,
        from: parentNode.position,
        to: position,
        fromColor: parentNode.color,
        toColor: node.color,
      });
    }
  }

  if (node.children && node.children.length > 0) {
    const childCount = node.children.length;
    const range = yMax - yMin;
    const childHeight = range / childCount;

    for (let i = 0; i < childCount; i++) {
      const cYMin = yMin + i * childHeight;
      const cYMax = cYMin + childHeight;
      layoutTree(node.children[i], depth + 1, cYMin, cYMax, node.id, nodes, edges, indexRef);
    }
  }
}

function computeLayout() {
  const nodes: LayoutNode[] = [];
  const edges: LayoutEdge[] = [];
  const indexRef = { value: 0 };

  // Count leaves to determine vertical spread
  function countLeaves(node: TreeNode): number {
    if (!node.children || node.children.length === 0) return 1;
    return node.children.reduce((sum, c) => sum + countLeaves(c), 0);
  }
  const leafCount = countLeaves(DECISION_TREE);
  const totalHeight = leafCount * 1.2;

  layoutTree(DECISION_TREE, 0, -totalHeight / 2, totalHeight / 2, undefined, nodes, edges, indexRef);

  // Center the layout
  let maxX = -Infinity;
  let minX = Infinity;
  let maxY = -Infinity;
  let minY = Infinity;
  for (const n of nodes) {
    if (n.position.x > maxX) maxX = n.position.x;
    if (n.position.x < minX) minX = n.position.x;
    if (n.position.y > maxY) maxY = n.position.y;
    if (n.position.y < minY) minY = n.position.y;
  }
  const offset = new THREE.Vector3(-(maxX + minX) / 2, -(maxY + minY) / 2, 0);
  for (const n of nodes) {
    n.position.add(offset);
  }
  for (const e of edges) {
    e.from.add(offset);
    e.to.add(offset);
  }

  return { nodes, edges };
}

// Compute path from root to a given node
function getPathToNode(targetId: string, nodes: LayoutNode[]): string[] {
  const path: string[] = [];
  let current = nodes.find((n) => n.id === targetId);
  while (current) {
    path.unshift(current.id);
    if (!current.parentId) break;
    current = nodes.find((n) => n.id === current!.parentId);
  }
  return path;
}

// ── Node Component ──

function DecisionNode({
  node,
  isOnPath,
  isDimmed,
  hoveredNode,
  onHover,
  onUnhover,
  onClick,
  time: t,
}: {
  node: LayoutNode;
  isOnPath: boolean;
  isDimmed: boolean;
  hoveredNode: string | null;
  onHover: () => void;
  onUnhover: () => void;
  onClick: () => void;
  time: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const col = useMemo(() => new THREE.Color(node.color), [node.color]);
  const isHovered = hoveredNode === node.id;

  // Floating motion
  const floatY = Math.sin(t * 0.7 + node.index * 0.5) * 0.1;

  const emissiveIntensity = isOnPath ? 2.0 : isDimmed ? 0.1 : isHovered ? 1.5 : 0.6;
  const opacity = isDimmed ? 0.3 : 1.0;

  const radius = node.id === 'root' ? 0.5 : node.isLeaf ? 0.25 : 0.3;

  return (
    <group position={[node.position.x, node.position.y + floatY, node.position.z]}>
      <mesh
        ref={meshRef}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          document.body.style.cursor = 'pointer';
          onHover();
        }}
        onPointerOut={() => {
          document.body.style.cursor = 'auto';
          onUnhover();
        }}
      >
        {node.id === 'root' ? (
          <sphereGeometry args={[radius, 24, 16]} />
        ) : node.isLeaf ? (
          <icosahedronGeometry args={[radius, 0]} />
        ) : (
          <octahedronGeometry args={[radius, 0]} />
        )}
        <meshStandardMaterial
          color={col}
          emissive={col}
          emissiveIntensity={emissiveIntensity}
          metalness={0.3}
          roughness={0.3}
          transparent
          opacity={opacity}
        />
      </mesh>
      <pointLight color={col} intensity={isDimmed ? 0.05 : 0.4} distance={2} />

      {/* Hover label */}
      {isHovered && (
        <Html center distanceFactor={12}>
          <div
            style={{
              color: 'white',
              fontSize: '12px',
              background: 'rgba(0,0,0,0.9)',
              padding: '6px 10px',
              borderRadius: '6px',
              whiteSpace: 'nowrap',
              textAlign: 'center',
              border: `1px solid ${node.color}`,
              pointerEvents: 'none',
              maxWidth: '200px',
            }}
          >
            <div style={{ fontWeight: 'bold', marginBottom: '2px' }}>{node.label}</div>
            {node.condition && (
              <div style={{ opacity: 0.7, fontSize: '11px' }}>{node.condition}</div>
            )}
            {node.recommendation && (
              <div style={{ color: '#66ffaa', fontSize: '11px', marginTop: '2px' }}>
                {node.recommendation}
              </div>
            )}
          </div>
        </Html>
      )}
    </group>
  );
}

// ── Edge Component ──

function TreeEdge({
  edge,
  isOnPath,
  isDimmed,
  time: t,
}: {
  edge: LayoutEdge;
  isOnPath: boolean;
  isDimmed: boolean;
  time: number;
}) {
  const { midpoint, length, quat } = useMemo(() => {
    const mid = new THREE.Vector3().lerpVectors(edge.from, edge.to, 0.5);
    const dir = new THREE.Vector3().subVectors(edge.to, edge.from);
    const len = dir.length();
    dir.normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    return { midpoint: mid, length: len, quat: q };
  }, [edge.from, edge.to]);

  const fromCol = useMemo(() => new THREE.Color(edge.fromColor), [edge.fromColor]);
  const toCol = useMemo(() => new THREE.Color(edge.toColor), [edge.toColor]);
  const avgColor = useMemo(() => new THREE.Color().lerpColors(fromCol, toCol, 0.5), [fromCol, toCol]);

  const emissiveIntensity = isOnPath ? 2.0 : isDimmed ? 0.05 : 0.3;
  const opacity = isOnPath ? 0.9 : isDimmed ? 0.1 : 0.35;
  const thickness = isOnPath ? 0.03 : 0.015;

  // Account for floating motion on both ends
  const fromFloatY = Math.sin(t * 0.7) * 0.1;
  const toFloatY = Math.sin(t * 0.7) * 0.1;
  const avgFloat = (fromFloatY + toFloatY) / 2;

  return (
    <mesh
      position={[midpoint.x, midpoint.y + avgFloat, midpoint.z]}
      quaternion={quat}
    >
      <cylinderGeometry args={[thickness, thickness, length, 6]} />
      <meshStandardMaterial
        color={avgColor}
        emissive={avgColor}
        emissiveIntensity={emissiveIntensity}
        transparent
        opacity={opacity}
        metalness={0.2}
        roughness={0.4}
      />
    </mesh>
  );
}

// ── Edge Particles ──

function EdgeParticles({
  edges,
  selectedPath,
  nodes,
  time: t,
}: {
  edges: LayoutEdge[];
  selectedPath: string[];
  nodes: LayoutNode[];
  time: number;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const particlesPerEdge = 2;
  const totalParticles = edges.length * particlesPerEdge;

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    let idx = 0;
    for (let e = 0; e < edges.length; e++) {
      const edge = edges[e];
      const isOnPath =
        selectedPath.length > 0 &&
        selectedPath.includes(edge.fromId) &&
        selectedPath.includes(edge.toId);
      const speed = isOnPath ? 0.6 : 0.25;

      // Get floating offsets for from/to nodes
      const fromNode = nodes.find((n) => n.id === edge.fromId);
      const toNode = nodes.find((n) => n.id === edge.toId);
      const fromFloatY = fromNode ? Math.sin(t * 0.7 + fromNode.index * 0.5) * 0.1 : 0;
      const toFloatY = toNode ? Math.sin(t * 0.7 + toNode.index * 0.5) * 0.1 : 0;

      for (let p = 0; p < particlesPerEdge; p++) {
        const progress = ((t * speed + p / particlesPerEdge + e * 0.13) % 1);
        const x = edge.from.x + (edge.to.x - edge.from.x) * progress;
        const baseY = edge.from.y + (edge.to.y - edge.from.y) * progress;
        const floatY = fromFloatY + (toFloatY - fromFloatY) * progress;
        const z = edge.from.z + (edge.to.z - edge.from.z) * progress;

        dummy.position.set(x, baseY + floatY, z);
        const scale = isOnPath ? 0.06 : 0.035;
        dummy.scale.setScalar(scale);
        dummy.updateMatrix();
        mesh.setMatrixAt(idx, dummy.matrix);
        idx++;
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, totalParticles]}>
      <sphereGeometry args={[1, 8, 6]} />
      <meshStandardMaterial
        color="#ffffff"
        emissive="#ffffff"
        emissiveIntensity={2}
        transparent
        opacity={0.7}
      />
    </instancedMesh>
  );
}

// ── Slow rotation wrapper ──

function RotatingGroup({ children, time: t }: { children: React.ReactNode; time: number }) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.rotation.y = t * 0.02;
    }
  });

  return <group ref={groupRef}>{children}</group>;
}

// ── Main Component ──

export default function DecisionForest() {
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string[]>([]);
  const [time, setTime] = useState(0);

  // Layout the tree (already centered)
  const { nodes, edges } = useMemo(() => computeLayout(), []);

  useFrame((_, delta) => {
    setTime((prev) => prev + delta);
  });

  const handleNodeClick = useCallback(
    (nodeId: string) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;

      if (nodeId === 'root') {
        // Reset
        setSelectedPath([]);
      } else if (node.isLeaf) {
        // Highlight path from root to this leaf
        const path = getPathToNode(nodeId, nodes);
        if (selectedPath.length > 0 && selectedPath[selectedPath.length - 1] === nodeId) {
          // Clicking same leaf deselects
          setSelectedPath([]);
        } else {
          setSelectedPath(path);
        }
      } else {
        // Clicking a decision node highlights path to it
        const path = getPathToNode(nodeId, nodes);
        if (selectedPath.length > 0 && selectedPath[selectedPath.length - 1] === nodeId) {
          setSelectedPath([]);
        } else {
          setSelectedPath(path);
        }
      }
    },
    [nodes, selectedPath],
  );

  const hasSelection = selectedPath.length > 0;

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.15} />
      <directionalLight position={[8, 6, 4]} intensity={0.3} />

      {/* Background click to reset */}
      <mesh
        position={[0, 0, -5]}
        onClick={(e) => {
          e.stopPropagation();
          setSelectedPath([]);
        }}
      >
        <planeGeometry args={[50, 50]} />
        <meshBasicMaterial visible={false} />
      </mesh>

      <RotatingGroup time={time}>
        {/* Edges */}
        {edges.map((edge) => {
          const isOnPath =
            hasSelection &&
            selectedPath.includes(edge.fromId) &&
            selectedPath.includes(edge.toId);
          const isDimmed = hasSelection && !isOnPath;

          return (
            <TreeEdge
              key={`${edge.fromId}-${edge.toId}`}
              edge={edge}
              isOnPath={isOnPath}
              isDimmed={isDimmed}
              time={time}
            />
          );
        })}

        {/* Nodes */}
        {nodes.map((node) => {
          const isOnPath = hasSelection && selectedPath.includes(node.id);
          const isDimmed = hasSelection && !isOnPath;

          return (
            <DecisionNode
              key={node.id}
              node={node}
              isOnPath={isOnPath}
              isDimmed={isDimmed}
              hoveredNode={hoveredNode}
              onHover={() => setHoveredNode(node.id)}
              onUnhover={() => setHoveredNode(null)}
              onClick={() => handleNodeClick(node.id)}
              time={time}
            />
          );
        })}

        {/* Edge particles */}
        <EdgeParticles edges={edges} selectedPath={selectedPath} nodes={nodes} time={time} />
      </RotatingGroup>
    </>
  );
}
