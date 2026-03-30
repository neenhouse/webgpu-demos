import { useState, useRef, useMemo, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import { Html } from '@react-three/drei';
// TSL imports removed — simple property-based materials used for performance

/**
 * Dependency Graph 3D
 *
 * A force-directed 3D graph visualizing package dependencies.
 * Glowing orbs with fresnel rims + animated halo shells for each node,
 * energy-flow edges with TSL animation, shockwave selection effects,
 * ambient floating particles, and atmospheric background.
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

const GROUP_COLORS_HEX: Record<string, number> = {
  root: 0xffffff,
  framework: 0x61dafb,
  rendering: 0x00ff88,
  tooling: 0xff8800,
  data: 0xcc44ff,
};

const GROUP_COLORS: Record<string, string> = {
  root: '#ffffff',
  framework: '#61dafb',
  rendering: '#00ff88',
  tooling: '#ff8800',
  data: '#cc44ff',
};

const NODE_COUNT = NODES.length;

// Build adjacency lookup
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

// ── TSL Material factories ──

function makeNodeCoreMaterial(hexColor: number, _phase: number) {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.color = new THREE.Color(hexColor);
  mat.emissive = new THREE.Color(hexColor);
  mat.emissiveIntensity = 1.0;
  mat.roughness = 0.15;
  mat.metalness = 0.3;
  return mat;
}

// Shared halo material for selected/hovered node
const sharedGraphHaloMaterial = (() => {
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

// Shared edge materials: one normal, one highlighted
const sharedEdgeNormalMaterial = (() => {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;
  mat.opacity = 0.15;
  mat.depthWrite = false;
  mat.color = new THREE.Color(0x6688aa);
  mat.emissive = new THREE.Color(0x6688aa);
  mat.emissiveIntensity = 0.8;
  mat.roughness = 0.3;
  mat.metalness = 0.1;
  return mat;
})();

const sharedEdgeHighlightMaterial = (() => {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;
  mat.opacity = 0.9;
  mat.depthWrite = false;
  mat.color = new THREE.Color(0x88bbff);
  mat.emissive = new THREE.Color(0x88bbff);
  mat.emissiveIntensity = 2.5;
  mat.roughness = 0.2;
  mat.metalness = 0.2;
  return mat;
})();

function makeBackgroundMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.side = THREE.BackSide;
  mat.color = new THREE.Color(0x050520);
  mat.emissive = new THREE.Color(0x030315);
  mat.emissiveIntensity = 0.4;
  mat.roughness = 1.0;
  mat.metalness = 0.0;
  return mat;
}

// (makeParticleMaterial and makeShockwaveMaterial removed for performance)

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
  radiusScale: number,
) {
  _midpoint.set((srcX + tgtX) / 2, (srcY + tgtY) / 2, (srcZ + tgtZ) / 2);
  _direction.set(tgtX - srcX, tgtY - srcY, tgtZ - srcZ);
  const length = _direction.length();
  if (length < 0.001) return;
  _direction.normalize();
  _quat.setFromUnitVectors(_up, _direction);

  mesh.position.copy(_midpoint);
  mesh.quaternion.copy(_quat);
  mesh.scale.set(radiusScale, length, radiusScale);
}

// ── Force simulation helpers ──

function initPositions(): Float32Array {
  const pos = new Float32Array(NODE_COUNT * 3);
  for (let i = 0; i < NODE_COUNT; i++) {
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
  return new Float32Array(NODE_COUNT * 3);
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
  const groupRef = useRef<THREE.Group>(null);
  const isRoot = node.group === 'root';
  const baseRadius = isRoot ? 0.3 : 0.15;
  const groupColor = GROUP_COLORS[node.group] || '#888888';
  const hexColor = GROUP_COLORS_HEX[node.group] || 0x888888;
  const isSelected = selected === node.id;
  const isHovered = hovered === node.id;
  const isConnectedToSelected =
    selected !== null && ADJACENCY.get(selected)?.has(node.id);

  const phase = index * 0.7;

  // Core material: brighter when selected or hovered
  const coreMat = useMemo(() => {
    return makeNodeCoreMaterial(hexColor, phase);
  }, [hexColor, phase]);

  // Halo only on selected/hovered (shared material)

  useFrame(({ clock }) => {
    const group = groupRef.current;
    if (!group) return;

    const x = positions[index * 3];
    const y = positions[index * 3 + 1];
    const z = positions[index * 3 + 2];
    group.position.set(x, y, z);

    // Pulse scale when selected
    if (isSelected) {
      const pulse = 1 + Math.sin(clock.getElapsedTime() * 4) * 0.15;
      group.scale.setScalar(pulse);
    } else {
      group.scale.setScalar(1);
    }

    // Dim non-connected nodes when something is selected
    if (selected !== null && !isSelected && !isConnectedToSelected) {
      // eslint-disable-next-line react-hooks/immutability
      coreMat.opacity = 0.4;
      // eslint-disable-next-line react-hooks/immutability
      coreMat.transparent = true;
    } else {
      // eslint-disable-next-line react-hooks/immutability
      coreMat.opacity = 1.0;
      // eslint-disable-next-line react-hooks/immutability
      coreMat.transparent = false;
    }
  });

  return (
    <group ref={groupRef}>
      {/* Core orb */}
      <mesh
        material={coreMat}
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
        <icosahedronGeometry args={[baseRadius, 3]} />
      </mesh>

      {/* Halo shell only on selected/hovered */}
      {(isSelected || isHovered) && (
        <mesh material={sharedGraphHaloMaterial} scale={1.4} raycast={() => null}>
          <icosahedronGeometry args={[baseRadius, 2]} />
        </mesh>
      )}

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
              boxShadow: `0 0 12px ${groupColor}60`,
            }}
          >
            <div style={{ fontWeight: 'bold', marginBottom: '2px' }}>
              {node.label}
            </div>
            <div style={{ fontSize: '10px', opacity: 0.7 }}>{node.group}</div>
          </div>
        </Html>
      )}
    </group>
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
  void _edgeIndex;
  const meshRef = useRef<THREE.Mesh>(null);
  const fromIdx = NODE_INDEX.get(edge.from)!;
  const toIdx = NODE_INDEX.get(edge.to)!;

  const isHighlighted =
    selected === edge.from ||
    selected === edge.to ||
    hovered === edge.from ||
    hovered === edge.to;

  // Shared edge materials (no per-edge allocation)

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const sx = positions[fromIdx * 3];
    const sy = positions[fromIdx * 3 + 1];
    const sz = positions[fromIdx * 3 + 2];
    const tx = positions[toIdx * 3];
    const ty = positions[toIdx * 3 + 1];
    const tz = positions[toIdx * 3 + 2];

    const radiusScale = isHighlighted ? 2.0 : 1.0;
    positionEdgeCylinder(mesh, sx, sy, sz, tx, ty, tz, radiusScale);

    // Swap material based on highlight state
    const targetMat = isHighlighted ? sharedEdgeHighlightMaterial : sharedEdgeNormalMaterial;
    if (mesh.material !== targetMat) {
      mesh.material = targetMat;
    }
  });

  return (
    <mesh ref={meshRef} material={sharedEdgeNormalMaterial} raycast={() => null}>
      <cylinderGeometry args={[0.015, 0.015, 1, 6, 1]} />
    </mesh>
  );
}

// (ShockwaveRing and AmbientParticles removed for performance)

function GroupClusterLights({ positions }: { positions: Float32Array }) {
  // Compute average position per group for cluster lights
  const groupCenters = useMemo(() => {
    const groups: Record<string, { x: number; y: number; z: number; count: number }> = {};
    NODES.forEach((node, i) => {
      if (!groups[node.group]) {
        groups[node.group] = { x: 0, y: 0, z: 0, count: 0 };
      }
      groups[node.group].x += positions[i * 3];
      groups[node.group].y += positions[i * 3 + 1];
      groups[node.group].z += positions[i * 3 + 2];
      groups[node.group].count += 1;
    });
    return Object.entries(groups).map(([group, data]) => ({
      group,
      pos: [data.x / data.count, data.y / data.count, data.z / data.count] as [
        number,
        number,
        number,
      ],
      color: GROUP_COLORS_HEX[group] || 0x888888,
    }));
  }, [positions]);

  return (
    <>
      {groupCenters.map(({ group, pos, color: c }) => (
        <pointLight
          key={`cluster-light-${group}`}
          position={pos}
          intensity={0.6}
          color={c}
          distance={10}
        />
      ))}
    </>
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

  // Background material
  const bgMat = useMemo(() => makeBackgroundMaterial(), []);

  const handleSelect = useCallback(
    (id: string) => {
      if (selected === id) {
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

    const iterations = frameCount.current < 120 ? 3 : 1;

    for (let iter = 0; iter < iterations; iter++) {
      // Repulsion: all pairs — slightly stronger for more spread
      for (let i = 0; i < NODE_COUNT; i++) {
        for (let j = i + 1; j < NODE_COUNT; j++) {
          const dx = pos[i * 3] - pos[j * 3];
          const dy = pos[i * 3 + 1] - pos[j * 3 + 1];
          const dz = pos[i * 3 + 2] - pos[j * 3 + 2];
          const distSq = dx * dx + dy * dy + dz * dz + 0.01;
          const dist = Math.sqrt(distSq);
          const force = Math.min(2.5, 2.0 / distSq);
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

      // Attraction: spring
      const restLength = 2.0;
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

      // Centering force
      for (let i = 0; i < NODE_COUNT; i++) {
        vel[i * 3] -= pos[i * 3] * 0.005;
        vel[i * 3 + 1] -= pos[i * 3 + 1] * 0.005;
        vel[i * 3 + 2] -= pos[i * 3 + 2] * 0.005;
      }

      // Subtle oscillation after convergence to prevent fully static layout
      if (frameCount.current > 200) {
        const t = frameCount.current * 0.01;
        for (let i = 0; i < NODE_COUNT; i++) {
          vel[i * 3] += Math.sin(t + i * 2.3) * 0.002;
          vel[i * 3 + 1] += Math.cos(t + i * 1.7) * 0.002;
          vel[i * 3 + 2] += Math.sin(t * 0.7 + i * 3.1) * 0.002;
        }
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

    // Slow rotation
    if (groupRef.current) {
      groupRef.current.rotation.y += 0.01 * (1 / 60);
    }

    // Smooth camera transition
    camera.position.lerp(cameraTarget.current, 0.05);
    camera.lookAt(cameraLookAt.current);
  });

  // eslint-disable-next-line react-hooks/refs
  const nodePositions = positionsRef.current;

  return (
    <>
      <ambientLight intensity={0.08} />
      <directionalLight position={[5, 8, 5]} intensity={0.3} />

      {/* Dark atmospheric background sphere */}
      <mesh material={bgMat} raycast={() => null}>
        <sphereGeometry args={[40, 32, 32]} />
      </mesh>

      {/* Background plane for click-to-deselect */}
      <mesh
        position={[0, 0, -15]}
        onClick={handleMiss}
        visible={false}
      >
        <planeGeometry args={[100, 100]} />
      </mesh>

      <group ref={groupRef}>
        {/* Cluster lights */}
        <GroupClusterLights positions={nodePositions} />

        {/* Edges */}
        {/* eslint-disable-next-line react-hooks/refs */}
        {EDGES.map((edge, i) => (
          <GraphEdge
            key={`edge-${i}`}
            edge={edge}
            edgeIndex={i}
            positions={nodePositions}
            selected={selected}
            hovered={hovered}
          />
        ))}

        {/* Nodes */}
        {/* eslint-disable-next-line react-hooks/refs */}
        {NODES.map((node, i) => (
          <GraphNode
            key={node.id}
            node={node}
            index={i}
            positions={nodePositions}
            selected={selected}
            hovered={hovered}
            onSelect={handleSelect}
            onHover={handleHover}
            onUnhover={handleUnhover}
          />
        ))}
      </group>

      {/* Instructions overlay (top-left) */}
      <Html fullscreen>
        <div style={{
          position: 'absolute', top: '16px', left: '16px',
          color: 'rgba(255,255,255,0.7)', fontSize: '11px',
          background: 'rgba(0,0,0,0.5)', padding: '10px 14px',
          borderRadius: '6px', lineHeight: '1.6',
          maxWidth: '190px', pointerEvents: 'none',
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: '4px', color: '#88bbff', fontSize: '12px' }}>Dependency Graph</div>
          <div>Package dependencies as a force-directed 3D graph</div>
          <div style={{ marginTop: '6px' }}>Click a node to select</div>
          <div>Hover to see connections</div>
          <div style={{ marginTop: '4px', fontSize: '10px', opacity: 0.6 }}>
            Click empty space to reset
          </div>
        </div>
      </Html>

      {/* Package list sidebar (right) */}
      <Html fullscreen>
        <div style={{
          position: 'absolute', top: '16px', right: '16px',
          color: 'white', fontSize: '11px',
          background: 'rgba(5,10,25,0.75)', padding: '10px 12px',
          borderRadius: '6px', maxWidth: '150px',
          pointerEvents: 'none', backdropFilter: 'blur(4px)',
          border: '1px solid rgba(100,150,255,0.15)',
          maxHeight: '80vh', overflowY: 'auto',
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: '6px', color: '#88bbff', fontSize: '11px' }}>Packages</div>
          {(['root', 'framework', 'rendering', 'tooling', 'data'] as const).map(group => {
            const groupNodes = NODES.filter(n => n.group === group);
            if (groupNodes.length === 0) return null;
            return (
              <div key={group}>
                <div style={{
                  fontWeight: 'bold', fontSize: '9px', marginTop: '6px', marginBottom: '2px',
                  color: GROUP_COLORS[group], textTransform: 'uppercase', letterSpacing: '0.5px',
                }}>{group}</div>
                {groupNodes.map(node => (
                  <div key={node.id}
                    onClick={() => handleSelect(node.id)}
                    style={{
                      padding: '2px 6px', marginBottom: '1px', borderRadius: '3px',
                      cursor: 'pointer', pointerEvents: 'auto',
                      color: selected === node.id ? '#fff' : GROUP_COLORS[node.group],
                      background: selected === node.id ? 'rgba(255,255,255,0.12)' : 'transparent',
                      fontSize: '10px', transition: 'background 0.2s',
                    }}
                    onMouseEnter={(e) => { (e.target as HTMLElement).style.background = 'rgba(255,255,255,0.08)'; }}
                    onMouseLeave={(e) => { (e.target as HTMLElement).style.background = selected === node.id ? 'rgba(255,255,255,0.12)' : 'transparent'; }}
                  >
                    {node.label}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </Html>
    </>
  );
}
