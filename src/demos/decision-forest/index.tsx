import { useRef, useMemo, useState, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three/webgpu';
// TSL imports removed — simple property-based materials used for performance

/**
 * Decision Forest — Forge drive's decision tree rendered as a 3D branching structure.
 *
 * Tree grows left-to-right. Decision nodes are octahedra, leaf nodes are icosahedra.
 * Click a leaf to highlight the full path from root. Hover to see labels.
 * Particles pulse along edges.
 *
 * Enhanced with TSL materials, fresnel glow, halo shells, animated energy edges,
 * ambient particles, and dramatic lighting.
 */

// ── Data ──

interface TreeNode {
  id: string;
  label: string;
  condition?: string;
  recommendation?: string;
  children?: TreeNode[];
  color: string;
  hex: number;
}

const DECISION_TREE: TreeNode = {
  id: 'root',
  label: 'Project State',
  color: '#ffffff',
  hex: 0xffffff,
  children: [
    {
      id: 'no-structure',
      label: 'No Structure?',
      condition: 'No package.json',
      color: '#ff6644',
      hex: 0xff6644,
      children: [
        { id: 'init', label: 'init', recommendation: 'Run /forge:init', color: '#22cc88', hex: 0x22cc88 },
      ],
    },
    {
      id: 'no-git',
      label: 'No Git?',
      condition: 'No .git directory',
      color: '#ff8844',
      hex: 0xff8844,
      children: [
        { id: 'init2', label: 'init', recommendation: 'Run /forge:init', color: '#22cc88', hex: 0x22cc88 },
      ],
    },
    {
      id: 'no-vision',
      label: 'No Vision?',
      condition: 'Missing docs/vision.md',
      color: '#ffaa44',
      hex: 0xffaa44,
      children: [
        { id: 'vision', label: 'vision', recommendation: 'Run /forge:vision', color: '#44ddaa', hex: 0x44ddaa },
      ],
    },
    {
      id: 'no-prds',
      label: 'No PRDs?',
      condition: 'Vision exists, no docs/prd/',
      color: '#ffcc44',
      hex: 0xffcc44,
      children: [
        { id: 'plan', label: 'plan', recommendation: 'Run /forge:plan', color: '#4488ff', hex: 0x4488ff },
      ],
    },
    {
      id: 'no-infra',
      label: 'No Infra?',
      condition: 'PRDs exist, no deploy config',
      color: '#ddcc44',
      hex: 0xddcc44,
      children: [
        { id: 'infra', label: 'infra', recommendation: 'Run /forge:infra', color: '#4488ff', hex: 0x4488ff },
      ],
    },
    {
      id: 'no-tests',
      label: 'No Tests?',
      condition: 'No test framework',
      color: '#aacc44',
      hex: 0xaacc44,
      children: [
        { id: 'test', label: 'test', recommendation: 'Run /forge:test', color: '#4488ff', hex: 0x4488ff },
      ],
    },
    {
      id: 'open-issues',
      label: 'Open Issues?',
      condition: 'Beads issues exist',
      color: '#88cc44',
      hex: 0x88cc44,
      children: [
        {
          id: 'implement',
          label: 'Implement',
          recommendation: 'Build next task',
          color: '#4488ff',
          hex: 0x4488ff,
        },
        {
          id: 'parallel',
          label: '3+ tasks?',
          condition: '3+ independent issues',
          color: '#66aaff',
          hex: 0x66aaff,
          children: [
            {
              id: 'fan-out',
              label: 'parallel',
              recommendation: 'Run /forge:parallel',
              color: '#4488ff',
              hex: 0x4488ff,
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
      hex: 0x44cc88,
      children: [
        {
          id: 'next-cycle',
          label: 'plan',
          recommendation: 'Plan next iteration',
          color: '#cc44ff',
          hex: 0xcc44ff,
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
  hex: number;
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
  fromHex: number;
  toHex: number;
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
    hex: node.hex,
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
        fromHex: parentNode.hex,
        toHex: node.hex,
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


// ── Shared halo material for selected/hovered nodes ──
const sharedDecisionHaloMaterial = (() => {
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

// ── Node Component with TSL materials ──

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
  const isHovered = hoveredNode === node.id;
  const isRoot = node.id === 'root';

  // Floating motion
  const floatY = Math.sin(t * 0.7 + node.index * 0.5) * 0.1;

  const radius = isRoot ? 0.5 : node.isLeaf ? 0.25 : 0.3;

  // Simple property-based core material — only data deps (hex color), no boolean state
  const coreMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.transparent = true;
    mat.color = new THREE.Color(node.hex);
    mat.emissive = new THREE.Color(node.hex);
    mat.emissiveIntensity = isRoot ? 1.2 : 0.5;
    mat.opacity = 1.0;
    mat.roughness = 0.2;
    mat.metalness = 0.4;
    return mat;
  }, [node.hex, isRoot]);

  // Mutate material properties based on boolean state — avoids GPU shader recompilation
  useFrame(() => {
    const mat = coreMaterial;
    if (!mat) return;
    /* eslint-disable react-hooks/immutability */
    if (!isRoot) {
      const brightness = isOnPath ? 1.5 : isHovered ? 1.0 : 0.5;
      const dimFactor = isDimmed ? 0.15 : 1.0;
      mat.emissiveIntensity = brightness * dimFactor;
      mat.opacity = isDimmed ? 0.2 : 1.0;
    }
    /* eslint-enable react-hooks/immutability */
  });



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
        material={coreMaterial}
      >
        {isRoot ? (
          <sphereGeometry args={[radius, 24, 16]} />
        ) : node.isLeaf ? (
          <icosahedronGeometry args={[radius, 0]} />
        ) : (
          <octahedronGeometry args={[radius, 0]} />
        )}
      </mesh>

      {/* Halo shell only on hovered/selected */}
      {(isHovered || isOnPath) && (
        <mesh material={sharedDecisionHaloMaterial} scale={[1.4, 1.4, 1.4]}>
          {isRoot ? (
            <sphereGeometry args={[radius, 16, 12]} />
          ) : node.isLeaf ? (
            <icosahedronGeometry args={[radius, 1]} />
          ) : (
            <octahedronGeometry args={[radius, 0]} />
          )}
        </mesh>
      )}

      <pointLight color={node.color} intensity={isDimmed ? 0.05 : 0.6} distance={2.5} />

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

// ── Edge Component with TSL animated energy flow ──

function TreeEdge({
  edge,
  edgeIndex: _edgeIndex,
  isOnPath,
  isDimmed,
}: {
  edge: LayoutEdge;
  edgeIndex: number;
  isOnPath: boolean;
  isDimmed: boolean;
}) {
  const meshRef = useRef<THREE.Mesh>(null);

  const { midpoint, length, quat } = useMemo(() => {
    const mid = new THREE.Vector3().lerpVectors(edge.from, edge.to, 0.5);
    const dir = new THREE.Vector3().subVectors(edge.to, edge.from);
    const len = dir.length();
    dir.normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    return { midpoint: mid, length: len, quat: q };
  }, [edge.from, edge.to]);

  // Simple transparent edge material — only data deps (hex colors), no boolean state
  const edgeMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.transparent = true;

    const avgColor = new THREE.Color(edge.fromHex).lerp(new THREE.Color(edge.toHex), 0.5);
    mat.color = avgColor;
    mat.emissive = avgColor.clone();
    mat.emissiveIntensity = 0.5;
    mat.opacity = 0.3;
    mat.roughness = 0.2;
    mat.metalness = 0.4;

    return mat;
  }, [edge.fromHex, edge.toHex]);

  // Mutate material properties and mesh scale based on boolean state — avoids GPU shader recompilation
  useFrame(() => {
    const mat = edgeMaterial;
    const mesh = meshRef.current;
    if (!mat || !mesh) return;
    /* eslint-disable react-hooks/immutability */
    const dimFactor = isDimmed ? 0.08 : 1.0;
    const pathBoost = isOnPath ? 2.0 : 0.5;
    mat.emissiveIntensity = pathBoost * dimFactor;
    mat.opacity = isDimmed ? 0.08 : isOnPath ? 0.7 : 0.3;
    // Drive thickness via mesh scale (X/Z axes) instead of recreating geometry
    const thicknessScale = isOnPath ? 2.0 : 1.0;
    mesh.scale.set(thicknessScale, 1.0, thicknessScale);
    /* eslint-enable react-hooks/immutability */
  });

  return (
    <mesh
      ref={meshRef}
      position={[midpoint.x, midpoint.y, midpoint.z]}
      quaternion={quat}
      material={edgeMaterial}
    >
      <cylinderGeometry args={[0.015, 0.015, length, 8]} />
    </mesh>
  );
}

// ── Edge Particles with glow ──

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
  const particlesPerEdge = 1;
  const totalParticles = edges.length * particlesPerEdge;

  // Simple additive particle material (no shader compilation)
  const coreMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.transparent = true;
    mat.opacity = 0.8;
    mat.blending = THREE.AdditiveBlending;
    mat.depthWrite = false;
    mat.color = new THREE.Color(0xffffff);
    mat.emissive = new THREE.Color(0xffeedd);
    mat.emissiveIntensity = 1.5;
    mat.roughness = 0.0;
    mat.metalness = 0.0;
    return mat;
  }, []);



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
      const speed = isOnPath ? 0.8 : 0.25;

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
        const scale = isOnPath ? 0.07 : 0.04;
        dummy.scale.setScalar(scale);
        dummy.updateMatrix();
        mesh.setMatrixAt(idx, dummy.matrix);


        idx++;
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, totalParticles]} material={coreMaterial} frustumCulled={false}>
      <sphereGeometry args={[1, 8, 6]} />
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

// ── Background gradient sphere ──

function BackgroundSphere() {
  const material = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.side = THREE.BackSide;
    mat.color = new THREE.Color(0x050814);
    mat.emissive = new THREE.Color(0x030510);
    mat.emissiveIntensity = 0.5;
    mat.roughness = 1.0;
    mat.metalness = 0.0;
    return mat;
  }, []);

  return (
    <mesh material={material}>
      <sphereGeometry args={[20, 24, 16]} />
    </mesh>
  );
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
        setSelectedPath([]);
      } else if (node.isLeaf) {
        const path = getPathToNode(nodeId, nodes);
        if (selectedPath.length > 0 && selectedPath[selectedPath.length - 1] === nodeId) {
          setSelectedPath([]);
        } else {
          setSelectedPath(path);
        }
      } else {
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
      {/* Lighting - more dramatic */}
      <ambientLight intensity={0.1} />
      <hemisphereLight args={['#334433', '#112211', 0.3]} />
      <directionalLight position={[8, 6, 4]} intensity={0.2} />

      {/* Colored accent lighting at key positions */}
      <pointLight position={[-6, 3, 2]} color="#ff6644" intensity={1.5} distance={12} />
      <pointLight position={[6, -3, 2]} color="#4488ff" intensity={1.5} distance={12} />
      <pointLight position={[0, 0, 4]} color="#22cc88" intensity={1.0} distance={10} />
      <pointLight position={[0, 5, -2]} color="#cc44ff" intensity={1.0} distance={10} />
      <pointLight position={[0, -5, -2]} color="#ffaa44" intensity={1.0} distance={10} />

      {/* Background gradient */}
      <BackgroundSphere />



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
        {edges.map((edge, edgeIdx) => {
          const isOnPath =
            hasSelection &&
            selectedPath.includes(edge.fromId) &&
            selectedPath.includes(edge.toId);
          const isDimmed = hasSelection && !isOnPath;

          return (
            <TreeEdge
              key={`${edge.fromId}-${edge.toId}`}
              edge={edge}
              edgeIndex={edgeIdx}
              isOnPath={isOnPath}
              isDimmed={isDimmed}
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

      {/* Instructions overlay (top-left) */}
      <Html fullscreen>
        <div style={{
          position: 'absolute', top: '16px', left: '16px',
          color: 'rgba(255,255,255,0.7)', fontSize: '11px',
          background: 'rgba(0,0,0,0.5)', padding: '10px 14px',
          borderRadius: '6px', lineHeight: '1.6',
          maxWidth: '240px', pointerEvents: 'none',
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: '4px', color: '#88bbff', fontSize: '12px' }}>Decision Forest</div>
          <div>Forge drive's decision tree — what to recommend based on project state</div>
          <div style={{ marginTop: '4px' }}>Hover nodes to see conditions</div>
          <div>Click a leaf to highlight the decision path</div>
          <div>Click root to reset</div>
          <div style={{ marginTop: '4px', fontSize: '10px', opacity: 0.6 }}>
            Use the legend to understand node types
          </div>
        </div>
      </Html>

      {/* Node types legend sidebar (right) */}
      <Html fullscreen>
        <div style={{
          position: 'absolute', top: '16px', right: '16px',
          color: 'white', fontSize: '11px',
          background: 'rgba(5,10,25,0.75)', padding: '10px 12px',
          borderRadius: '6px', maxWidth: '180px',
          pointerEvents: 'none', backdropFilter: 'blur(4px)',
          border: '1px solid rgba(100,150,255,0.15)',
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: '6px', color: '#88bbff', fontSize: '11px' }}>Node Types</div>
          <div style={{ padding: '2px 6px', marginBottom: '2px', fontSize: '10px' }}>
            <span style={{ color: '#ffffff' }}>&#9679;</span> Root — Starting point
          </div>
          <div style={{ padding: '2px 6px', marginBottom: '2px', fontSize: '10px' }}>
            <span style={{ color: '#ffaa44' }}>&#9670;</span> Decision — Checks a condition
          </div>
          <div style={{ padding: '2px 6px', marginBottom: '2px', fontSize: '10px' }}>
            <span style={{ color: '#22cc88' }}>&#11044;</span> Recommendation — Action to take
          </div>
          {selectedPath.length > 0 && (
            <div style={{ marginTop: '8px', borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: '8px' }}>
              <div style={{ fontWeight: 'bold', marginBottom: '4px', color: '#88bbff', fontSize: '10px' }}>Decision Path</div>
              {selectedPath.map((nodeId, i) => {
                const node = nodes.find(n => n.id === nodeId);
                if (!node) return null;
                return (
                  <div key={nodeId}
                    onClick={() => handleNodeClick(nodeId)}
                    style={{
                      padding: '2px 6px', marginBottom: '1px', borderRadius: '3px',
                      cursor: 'pointer', pointerEvents: 'auto',
                      color: node.color,
                      fontSize: '10px', transition: 'background 0.2s',
                    }}
                    onMouseEnter={(e) => { (e.target as HTMLElement).style.background = 'rgba(255,255,255,0.08)'; }}
                    onMouseLeave={(e) => { (e.target as HTMLElement).style.background = 'transparent'; }}
                  >
                    {i > 0 && <span style={{ opacity: 0.3, marginRight: '4px' }}>&#8594;</span>}
                    {node.label}
                    {node.recommendation && <span style={{ opacity: 0.5 }}> — {node.recommendation}</span>}
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
