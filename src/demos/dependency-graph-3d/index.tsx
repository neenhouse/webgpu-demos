import { useState, useRef, useMemo, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import { Html } from '@react-three/drei';
import {
  color,
  float,
  time,
  oscSine,
  normalWorld,
  cameraPosition,
  positionWorld,
  positionLocal,
  normalLocal,
  Fn,
  hash,
  mix,
} from 'three/tsl';

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

function makeNodeCoreMaterial(hexColor: number, phase: number) {
  const mat = new THREE.MeshStandardNodeMaterial();

  const pulse = oscSine(time.mul(0.8).add(float(phase))).mul(0.3).add(0.7);

  // Hash noise shimmer on surface
  const shimmer = hash(positionLocal.mul(25.0)).mul(0.15).add(0.85);

  mat.colorNode = color(hexColor).mul(shimmer);

  // Fresnel rim glow
  const fresnel = Fn(() => {
    const viewDir = cameraPosition.sub(positionWorld).normalize();
    const nDotV = normalWorld.dot(viewDir).saturate();
    return float(1.0).sub(nDotV).pow(2.0);
  });

  const coreEmissive = color(hexColor).mul(pulse.mul(2.0));
  const rimEmissive = color(0xffffff).mul(fresnel()).mul(pulse.mul(1.5));
  mat.emissiveNode = coreEmissive.add(rimEmissive);

  // Subtle breathing displacement
  mat.positionNode = positionLocal.add(
    normalLocal.mul(oscSine(time.mul(1.0).add(float(phase))).mul(0.01)),
  );

  mat.roughness = 0.15;
  mat.metalness = 0.3;

  return mat;
}

function makeNodeHaloMaterial(hexColor: number, phase: number, layer: number) {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;
  mat.side = THREE.BackSide;
  mat.depthWrite = false;
  mat.blending = THREE.AdditiveBlending;

  const layerFade = float(1.0).sub(float(layer).mul(0.3));
  const pulse = oscSine(time.mul(0.8).add(float(phase))).mul(0.3).add(0.7);

  const fresnel = Fn(() => {
    const viewDir = cameraPosition.sub(positionWorld).normalize();
    const nDotV = normalWorld.dot(viewDir).saturate();
    return float(1.0).sub(nDotV).pow(float(1.5).add(float(layer).mul(0.5)));
  });

  const glowColor = color(hexColor);
  mat.opacityNode = fresnel().mul(pulse).mul(layerFade).mul(0.5);
  mat.colorNode = glowColor;
  mat.emissiveNode = glowColor.mul(fresnel().mul(pulse).mul(layerFade).mul(3.0));

  mat.roughness = 0.0;
  mat.metalness = 0.0;

  return mat;
}

function makeEdgeMaterial(hexColor: number, _edgeIdx: number) {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;
  mat.depthWrite = false;

  // Flowing brightness pattern along the edge
  const flow = oscSine(
    positionLocal.y.mul(3.0).add(time.mul(2.0)).add(float(_edgeIdx).mul(0.5)),
  )
    .mul(0.5)
    .add(0.5);

  const baseColor = color(hexColor);
  mat.colorNode = baseColor;
  mat.emissiveNode = baseColor.mul(flow.mul(2.5));
  mat.opacityNode = float(0.15);

  mat.roughness = 0.3;
  mat.metalness = 0.1;

  return mat;
}

function makeEdgeMaterialHighlighted(hexColor: number, _edgeIdx: number) {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;
  mat.depthWrite = false;

  const flow = oscSine(
    positionLocal.y.mul(4.0).add(time.mul(3.0)).add(float(_edgeIdx).mul(0.5)),
  )
    .mul(0.5)
    .add(0.5);

  const baseColor = color(hexColor);
  mat.colorNode = baseColor;
  mat.emissiveNode = baseColor.mul(flow.mul(4.0).add(1.0));
  mat.opacityNode = float(0.9);

  mat.roughness = 0.2;
  mat.metalness = 0.2;

  return mat;
}

function makeBackgroundMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.side = THREE.BackSide;

  // Radial dark gradient using positionLocal
  const dist = positionLocal.normalize().y.abs();
  const gradient = mix(color(0x020210), color(0x080830), dist.mul(0.5));

  mat.colorNode = gradient;
  mat.emissiveNode = gradient.mul(0.1);
  mat.roughness = 1.0;
  mat.metalness = 0.0;

  return mat;
}

function makeParticleMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;
  mat.depthWrite = false;
  mat.blending = THREE.AdditiveBlending;

  const drift = oscSine(time.mul(0.5).add(positionLocal.x.mul(10.0)))
    .mul(0.4)
    .add(0.6);
  mat.colorNode = color(0x4466aa);
  mat.emissiveNode = color(0x4466aa).mul(drift.mul(1.5));
  mat.opacityNode = float(0.25).mul(drift);

  mat.roughness = 0.0;
  mat.metalness = 0.0;

  return mat;
}

function makeShockwaveMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;
  mat.depthWrite = false;
  mat.blending = THREE.AdditiveBlending;
  mat.side = THREE.DoubleSide;

  mat.colorNode = color(0xffffff);
  mat.emissiveNode = color(0xffffff).mul(2.0);
  mat.opacityNode = float(0.6);

  mat.roughness = 0.0;
  mat.metalness = 0.0;

  return mat;
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

  // Halo materials: root gets 2 shells, others get 1
  const haloMats = useMemo(() => {
    const mats = [makeNodeHaloMaterial(hexColor, phase, 0)];
    if (isRoot) {
      mats.push(makeNodeHaloMaterial(hexColor, phase, 1));
    }
    return mats;
  }, [hexColor, phase, isRoot]);

  const haloScales = isRoot ? [1.4, 1.7] : [1.3];

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

    // Adjust emissive intensity dynamically
    const intensity = isSelected
      ? 6.0
      : isHovered
        ? 4.0
        : isConnectedToSelected
          ? 2.5
          : 1.0;

    // Update core material emissive multiplier via uniform-like approach
    // We scale the entire halo opacity to reflect selection state
    for (const hMat of haloMats) {
      const opacityMul = isSelected
        ? 1.8
        : isHovered
          ? 1.4
          : isConnectedToSelected
            ? 1.0
            : 0.6;
      // We can't change TSL nodes at runtime, so we use the material's opacity property
      hMat.opacity = opacityMul;
    }

    // Dim non-connected nodes when something is selected
    if (selected !== null && !isSelected && !isConnectedToSelected) {
      coreMat.opacity = 0.4;
      coreMat.transparent = true;
    } else {
      coreMat.opacity = 1.0;
      coreMat.transparent = false;
    }

    void intensity; // intensity is baked into TSL; dynamic dimming via opacity
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

      {/* Halo shells */}
      {haloMats.map((mat, i) => (
        <mesh key={i} material={mat} scale={haloScales[i]} raycast={() => null}>
          <icosahedronGeometry args={[baseRadius, 2]} />
        </mesh>
      ))}

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
  edgeIndex,
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
  const blendedHex = useMemo(() => {
    const fromGroup = NODES[fromIdx].group;
    const toGroup = NODES[toIdx].group;
    const c1 = new THREE.Color(GROUP_COLORS[fromGroup] || '#888888');
    const c2 = new THREE.Color(GROUP_COLORS[toGroup] || '#888888');
    c1.lerp(c2, 0.5);
    return c1.getHex();
  }, [fromIdx, toIdx]);

  const normalMat = useMemo(
    () => makeEdgeMaterial(blendedHex, edgeIndex),
    [blendedHex, edgeIndex],
  );
  const highlightMat = useMemo(
    () => makeEdgeMaterialHighlighted(blendedHex, edgeIndex),
    [blendedHex, edgeIndex],
  );

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
    const targetMat = isHighlighted ? highlightMat : normalMat;
    if (mesh.material !== targetMat) {
      mesh.material = targetMat;
    }
  });

  return (
    <mesh ref={meshRef} material={normalMat} raycast={() => null}>
      <cylinderGeometry args={[0.015, 0.015, 1, 6, 1]} />
    </mesh>
  );
}

function ShockwaveRing({
  position,
  active,
}: {
  position: THREE.Vector3;
  active: boolean;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const startTimeRef = useRef(0);
  const isActiveRef = useRef(false);

  const mat = useMemo(() => makeShockwaveMaterial(), []);

  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    if (active && !isActiveRef.current) {
      // Trigger new shockwave
      isActiveRef.current = true;
      startTimeRef.current = clock.getElapsedTime();
    }
    if (!active) {
      isActiveRef.current = false;
      mesh.visible = false;
      return;
    }

    const elapsed = clock.getElapsedTime() - startTimeRef.current;
    const duration = 0.8;

    if (elapsed > duration) {
      mesh.visible = false;
      return;
    }

    const progress = elapsed / duration;
    const scale = 0.1 + progress * 3.0;
    mesh.visible = true;
    mesh.position.copy(position);
    mesh.scale.set(scale, scale, scale);
    mat.opacity = (1.0 - progress) * 0.6;
  });

  return (
    <mesh ref={meshRef} material={mat} visible={false} raycast={() => null}>
      <torusGeometry args={[0.5, 0.03, 8, 32]} />
    </mesh>
  );
}

function AmbientParticles() {
  const particleMat = useMemo(() => makeParticleMaterial(), []);
  const particleData = useMemo(() => {
    const data: { pos: [number, number, number]; speed: number }[] = [];
    for (let i = 0; i < 35; i++) {
      data.push({
        pos: [
          (Math.random() - 0.5) * 16,
          (Math.random() - 0.5) * 16,
          (Math.random() - 0.5) * 16,
        ],
        speed: 0.1 + Math.random() * 0.3,
      });
    }
    return data;
  }, []);

  const meshRefs = useRef<(THREE.Mesh | null)[]>([]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    for (let i = 0; i < particleData.length; i++) {
      const mesh = meshRefs.current[i];
      if (!mesh) continue;
      const p = particleData[i];
      mesh.position.set(
        p.pos[0] + Math.sin(t * p.speed + i) * 0.5,
        p.pos[1] + Math.cos(t * p.speed * 0.7 + i * 2) * 0.5,
        p.pos[2] + Math.sin(t * p.speed * 0.5 + i * 3) * 0.5,
      );
    }
  });

  return (
    <>
      {particleData.map((p, i) => (
        <mesh
          key={i}
          ref={(el) => {
            meshRefs.current[i] = el;
          }}
          position={p.pos}
          material={particleMat}
          raycast={() => null}
        >
          <icosahedronGeometry args={[0.02, 0]} />
        </mesh>
      ))}
    </>
  );
}

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

  // Shockwave state
  const shockwavePos = useRef(new THREE.Vector3(0, 0, 0));
  const [shockwaveActive, setShockwaveActive] = useState(false);

  // Background material
  const bgMat = useMemo(() => makeBackgroundMaterial(), []);

  const handleSelect = useCallback(
    (id: string) => {
      if (selected === id) {
        setSelected(null);
        setShockwaveActive(false);
        cameraTarget.current.set(0, 3, 8);
        cameraLookAt.current.set(0, 0, 0);
      } else {
        setSelected(id);
        const idx = NODE_INDEX.get(id)!;
        const pos = positionsRef.current;
        const nx = pos[idx * 3];
        const ny = pos[idx * 3 + 1];
        const nz = pos[idx * 3 + 2];
        // Trigger shockwave
        shockwavePos.current.set(nx, ny, nz);
        setShockwaveActive(false);
        // Force re-trigger by toggling
        requestAnimationFrame(() => setShockwaveActive(true));
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
    setShockwaveActive(false);
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

  return (
    <>
      <ambientLight intensity={0.08} />
      <directionalLight position={[5, 8, 5]} intensity={0.3} />

      {/* Dark atmospheric background sphere */}
      <mesh material={bgMat} raycast={() => null}>
        <sphereGeometry args={[40, 32, 32]} />
      </mesh>

      {/* Ambient floating particles */}
      <AmbientParticles />

      {/* Background plane for click-to-deselect */}
      <mesh
        position={[0, 0, -15]}
        onClick={handleMiss}
        visible={false}
      >
        <planeGeometry args={[100, 100]} />
      </mesh>

      {/* Shockwave ring */}
      <ShockwaveRing position={shockwavePos.current} active={shockwaveActive} />

      <group ref={groupRef}>
        {/* Cluster lights */}
        <GroupClusterLights positions={positionsRef.current} />

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
