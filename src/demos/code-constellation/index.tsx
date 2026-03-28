import { useState, useRef, useMemo, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import { Html } from '@react-three/drei';

/**
 * Code Constellation
 *
 * Files in a codebase visualized as a star constellation.
 * Each file is a glowing point sized by importance (line count),
 * colored by file type, and clustered by directory. Import
 * connections are shown as faint pulsing lines.
 */

// ── Data ──

interface FileNode {
  path: string;
  name: string;
  type: 'ts' | 'tsx' | 'css' | 'json' | 'md' | 'yaml' | 'config';
  lines: number;
  dir: string;
}

const FILES: FileNode[] = [
  // src/demos (largest cluster)
  { path: 'src/demos/tsl-torus/index.tsx', name: 'tsl-torus', type: 'tsx', lines: 80, dir: 'demos' },
  { path: 'src/demos/compute-particles/index.tsx', name: 'compute-particles', type: 'tsx', lines: 200, dir: 'demos' },
  { path: 'src/demos/fluid-sim/index.tsx', name: 'fluid-sim', type: 'tsx', lines: 340, dir: 'demos' },
  { path: 'src/demos/neural-net/index.tsx', name: 'neural-net', type: 'tsx', lines: 250, dir: 'demos' },
  { path: 'src/demos/cyber-city/index.tsx', name: 'cyber-city', type: 'tsx', lines: 350, dir: 'demos' },
  { path: 'src/demos/fractal-zoom/index.tsx', name: 'fractal-zoom', type: 'tsx', lines: 200, dir: 'demos' },
  { path: 'src/demos/reaction-diffusion/index.tsx', name: 'reaction-diffusion', type: 'tsx', lines: 220, dir: 'demos' },
  { path: 'src/demos/boids-murmuration/index.tsx', name: 'boids-murmuration', type: 'tsx', lines: 250, dir: 'demos' },
  // src/pipeline
  { path: 'src/pipeline/spec/schema.ts', name: 'schema', type: 'ts', lines: 300, dir: 'pipeline' },
  { path: 'src/pipeline/spec/parser.ts', name: 'parser', type: 'ts', lines: 150, dir: 'pipeline' },
  { path: 'src/pipeline/renderer/SceneFromYaml.tsx', name: 'SceneFromYaml', type: 'tsx', lines: 200, dir: 'pipeline' },
  { path: 'src/pipeline/renderer/ObjectRenderer.tsx', name: 'ObjectRenderer', type: 'tsx', lines: 280, dir: 'pipeline' },
  { path: 'src/pipeline/generators/parametric/terrain.ts', name: 'terrain-gen', type: 'ts', lines: 180, dir: 'pipeline' },
  { path: 'src/pipeline/generators/csg.ts', name: 'csg-gen', type: 'ts', lines: 250, dir: 'pipeline' },
  { path: 'src/pipeline/generators/sdf.ts', name: 'sdf-gen', type: 'ts', lines: 200, dir: 'pipeline' },
  { path: 'src/pipeline/materials/resolver.ts', name: 'mat-resolver', type: 'ts', lines: 200, dir: 'pipeline' },
  // src/lib + src/components
  { path: 'src/lib/registry.ts', name: 'registry', type: 'ts', lines: 400, dir: 'lib' },
  { path: 'src/App.tsx', name: 'App', type: 'tsx', lines: 60, dir: 'app' },
  { path: 'src/components/Viewer.tsx', name: 'Viewer', type: 'tsx', lines: 200, dir: 'app' },
  // config
  { path: 'package.json', name: 'package.json', type: 'json', lines: 40, dir: 'config' },
  { path: 'tsconfig.json', name: 'tsconfig', type: 'json', lines: 25, dir: 'config' },
  { path: 'vite.config.ts', name: 'vite.config', type: 'config', lines: 30, dir: 'config' },
  // docs
  { path: 'docs/vision.md', name: 'vision', type: 'md', lines: 80, dir: 'docs' },
  { path: 'docs/prd/prd.md', name: 'prd', type: 'md', lines: 200, dir: 'docs' },
  { path: 'docs/spec/scene-pipeline-spec-v1.md', name: 'scene-spec', type: 'md', lines: 500, dir: 'docs' },
];

// Import connections (representative)
const IMPORTS: [number, number][] = [
  [17, 18], // App -> Viewer
  [18, 16], // Viewer -> registry
  [0, 16],  // tsl-torus -> registry (registered)
  [1, 16],  // compute-particles -> registry
  [2, 16],  // fluid-sim -> registry
  [3, 16],  // neural-net -> registry
  [10, 11], // SceneFromYaml -> ObjectRenderer
  [10, 8],  // SceneFromYaml -> schema
  [10, 9],  // SceneFromYaml -> parser
  [11, 15], // ObjectRenderer -> mat-resolver
  [11, 12], // ObjectRenderer -> terrain-gen
  [11, 13], // ObjectRenderer -> csg-gen
  [11, 14], // ObjectRenderer -> sdf-gen
];

const DIR_POSITIONS: Record<string, [number, number, number]> = {
  demos: [0, 0, 0],
  pipeline: [5, 1, -2],
  app: [-4, 0, 2],
  lib: [-3, -1, -1],
  config: [3, -2, 3],
  docs: [-2, 3, -3],
};

const TYPE_COLORS: Record<string, string> = {
  ts: '#3178c6',
  tsx: '#61dafb',
  css: '#ff69b4',
  json: '#f0db4f',
  md: '#83cd29',
  yaml: '#cb171e',
  config: '#ff8800',
};

// Unique directories
const DIRECTORIES = Object.keys(DIR_POSITIONS);

// Files grouped by directory
const FILES_BY_DIR: Record<string, number[]> = {};
for (const dir of DIRECTORIES) {
  FILES_BY_DIR[dir] = [];
}
FILES.forEach((f, i) => {
  if (FILES_BY_DIR[f.dir]) FILES_BY_DIR[f.dir].push(i);
});

// Deterministic scatter within cluster
function filePosition(fileIndex: number, dir: string): [number, number, number] {
  const center = DIR_POSITIONS[dir];
  const filesInDir = FILES_BY_DIR[dir];
  const localIndex = filesInDir.indexOf(fileIndex);
  const count = filesInDir.length;
  const radius = Math.sqrt(count) * 0.5;

  // Deterministic spread using golden angle
  const golden = 2.399963; // golden angle in radians
  const theta = localIndex * golden;
  const phi = Math.acos(1 - (2 * (localIndex + 0.5)) / Math.max(count, 1));
  const r = radius * Math.cbrt((localIndex + 1) / Math.max(count, 1));

  return [
    center[0] + r * Math.sin(phi) * Math.cos(theta),
    center[1] + r * Math.sin(phi) * Math.sin(theta),
    center[2] + r * Math.cos(phi),
  ];
}

// Precompute all file positions
const FILE_POSITIONS = FILES.map((f, i) => filePosition(i, f.dir));

// Dominant type per directory (for cluster label color)
function dominantTypeColor(dir: string): string {
  const indices = FILES_BY_DIR[dir];
  if (!indices || indices.length === 0) return '#888888';
  const counts: Record<string, number> = {};
  for (const idx of indices) {
    const t = FILES[idx].type;
    counts[t] = (counts[t] || 0) + 1;
  }
  let maxType = 'ts';
  let maxCount = 0;
  for (const [t, c] of Object.entries(counts)) {
    if (c > maxCount) {
      maxCount = c;
      maxType = t;
    }
  }
  return TYPE_COLORS[maxType] || '#888888';
}

// ── Components ──

function StarNode({
  file,
  fileIndex,
  selectedFile,
  selectedCluster,
  hovered,
  onSelectFile,
  onHoverFile,
  onUnhover,
}: {
  file: FileNode;
  fileIndex: number;
  selectedFile: number | null;
  selectedCluster: string | null;
  hovered: number | null;
  onSelectFile: (idx: number) => void;
  onHoverFile: (idx: number) => void;
  onUnhover: () => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const basePos = FILE_POSITIONS[fileIndex];
  const typeColor = TYPE_COLORS[file.type] || '#888888';
  const starSize = Math.sqrt(file.lines) * 0.005 + 0.03;
  const isSelected = selectedFile === fileIndex;
  const isHovered = hovered === fileIndex;
  const isInSelectedCluster = selectedCluster === file.dir;
  const colorObj = useMemo(() => new THREE.Color(typeColor), [typeColor]);

  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const t = clock.getElapsedTime();

    // Twinkle: subtle emissive oscillation per file
    const twinkle = 0.5 + 0.5 * Math.sin(t * 2 + fileIndex * 1.7);
    const mat = mesh.material as THREE.MeshStandardMaterial;
    if (mat.emissiveIntensity !== undefined) {
      const baseIntensity = isSelected ? 3.0 : isHovered ? 2.5 : 0.8;
      mat.emissiveIntensity = baseIntensity + twinkle * 0.4;
    }

    // When zoomed into cluster, files gently orbit cluster center
    if (isInSelectedCluster) {
      const center = DIR_POSITIONS[file.dir];
      const dx = basePos[0] - center[0];
      const dy = basePos[1] - center[1];
      const dz = basePos[2] - center[2];
      const orbitSpeed = 0.15;
      const cosA = Math.cos(t * orbitSpeed);
      const sinA = Math.sin(t * orbitSpeed);
      // Rotate around Y axis of cluster center
      mesh.position.set(
        center[0] + dx * cosA - dz * sinA,
        center[1] + dy,
        center[2] + dx * sinA + dz * cosA,
      );
    } else {
      mesh.position.set(basePos[0], basePos[1], basePos[2]);
    }
  });

  return (
    <mesh
      ref={meshRef}
      position={basePos}
      onClick={(e) => {
        e.stopPropagation();
        onSelectFile(fileIndex);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        onHoverFile(fileIndex);
      }}
      onPointerOut={() => onUnhover()}
    >
      <icosahedronGeometry args={[starSize, 1]} />
      <meshStandardMaterial
        color={typeColor}
        emissive={colorObj}
        emissiveIntensity={0.8}
        roughness={0.2}
        metalness={0.1}
      />
      {/* Popup on select */}
      {isSelected && (
        <Html center distanceFactor={8}>
          <div
            style={{
              color: 'white',
              fontSize: '11px',
              background: 'rgba(0,0,0,0.9)',
              padding: '8px 12px',
              borderRadius: '6px',
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              border: `1px solid ${typeColor}`,
              maxWidth: '220px',
            }}
          >
            <div style={{ fontWeight: 'bold', marginBottom: '4px', color: typeColor }}>
              {file.name}
            </div>
            <div style={{ fontSize: '10px', opacity: 0.8, marginBottom: '2px' }}>
              {file.path}
            </div>
            <div style={{ fontSize: '10px', opacity: 0.6 }}>
              {file.type.toUpperCase()} | {file.lines} lines
            </div>
          </div>
        </Html>
      )}
      {/* Tooltip on hover (when not selected) */}
      {isHovered && !isSelected && (
        <Html center distanceFactor={10}>
          <div
            style={{
              color: 'white',
              fontSize: '11px',
              background: 'rgba(0,0,0,0.8)',
              padding: '4px 8px',
              borderRadius: '4px',
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
            }}
          >
            {file.name}
          </div>
        </Html>
      )}
    </mesh>
  );
}

function ImportConnection({
  fromIdx,
  toIdx,
  hovered,
}: {
  fromIdx: number;
  toIdx: number;
  hovered: number | null;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const isHighlighted = hovered === fromIdx || hovered === toIdx;

  const blendedColor = useMemo(() => {
    const c1 = new THREE.Color(TYPE_COLORS[FILES[fromIdx].type] || '#888888');
    const c2 = new THREE.Color(TYPE_COLORS[FILES[toIdx].type] || '#888888');
    return c1.lerp(c2, 0.5);
  }, [fromIdx, toIdx]);

  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const from = FILE_POSITIONS[fromIdx];
    const to = FILE_POSITIONS[toIdx];

    // Position and orient the cylinder
    const mx = (from[0] + to[0]) / 2;
    const my = (from[1] + to[1]) / 2;
    const mz = (from[2] + to[2]) / 2;
    mesh.position.set(mx, my, mz);

    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const dz = to[2] - from[2];
    const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (length < 0.001) return;

    const dir = new THREE.Vector3(dx, dy, dz).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const quat = new THREE.Quaternion().setFromUnitVectors(up, dir);
    mesh.quaternion.copy(quat);
    mesh.scale.set(1, length, 1);

    // Pulse emissive for traveling light effect
    const mat = mesh.material as THREE.MeshStandardMaterial;
    if (isHighlighted) {
      const pulse = 0.5 + 0.5 * Math.sin(clock.getElapsedTime() * 4 + fromIdx);
      mat.emissiveIntensity = 0.8 + pulse * 1.2;
      mat.opacity = 0.6 + pulse * 0.3;
    } else {
      mat.emissiveIntensity = 0.15;
      mat.opacity = 0.12;
    }
  });

  return (
    <mesh ref={meshRef} raycast={() => null}>
      <cylinderGeometry args={[0.008, 0.008, 1, 4, 1]} />
      <meshStandardMaterial
        color={blendedColor}
        emissive={blendedColor}
        emissiveIntensity={0.15}
        transparent
        opacity={0.12}
        roughness={0.5}
        metalness={0.1}
      />
    </mesh>
  );
}

function ClusterLabel({
  dir,
  onSelectCluster,
}: {
  dir: string;
  onSelectCluster: (dir: string) => void;
}) {
  const center = DIR_POSITIONS[dir];
  const labelColor = dominantTypeColor(dir);
  const fileCount = FILES_BY_DIR[dir]?.length || 0;

  return (
    <Html
      position={[center[0], center[1] + 1.2, center[2]]}
      center
      distanceFactor={12}
    >
      <div
        onClick={(e) => {
          e.stopPropagation();
          onSelectCluster(dir);
        }}
        style={{
          color: labelColor,
          fontSize: '13px',
          fontWeight: 'bold',
          background: 'rgba(0,0,0,0.6)',
          padding: '4px 10px',
          borderRadius: '8px',
          whiteSpace: 'nowrap',
          cursor: 'pointer',
          border: `1px solid ${labelColor}40`,
          userSelect: 'none',
        }}
      >
        {dir}
        <span style={{ fontSize: '10px', opacity: 0.5, marginLeft: '6px' }}>
          ({fileCount})
        </span>
      </div>
    </Html>
  );
}

// ── Main component ──

export default function CodeConstellation() {
  const [selectedFile, setSelectedFile] = useState<number | null>(null);
  const [selectedCluster, setSelectedCluster] = useState<string | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const groupRef = useRef<THREE.Group>(null);

  // Camera target for smooth transitions
  const cameraTarget = useRef(new THREE.Vector3(0, 5, 15));
  const cameraLookTarget = useRef(new THREE.Vector3(0, 0, 0));

  const handleSelectFile = useCallback(
    (idx: number) => {
      const file = FILES[idx];
      if (selectedFile === idx) {
        // Deselect
        setSelectedFile(null);
        if (selectedCluster) {
          // Return to cluster view
          const center = DIR_POSITIONS[selectedCluster];
          cameraTarget.current.set(center[0] + 2, center[1] + 2, center[2] + 4);
          cameraLookTarget.current.set(center[0], center[1], center[2]);
        } else {
          cameraTarget.current.set(0, 5, 15);
          cameraLookTarget.current.set(0, 0, 0);
        }
      } else {
        setSelectedFile(idx);
        setSelectedCluster(file.dir);
        const pos = FILE_POSITIONS[idx];
        cameraTarget.current.set(pos[0] + 1, pos[1] + 0.5, pos[2] + 2);
        cameraLookTarget.current.set(pos[0], pos[1], pos[2]);
      }
    },
    [selectedFile, selectedCluster],
  );

  const handleSelectCluster = useCallback(
    (dir: string) => {
      if (selectedCluster === dir) {
        // Deselect cluster
        setSelectedCluster(null);
        setSelectedFile(null);
        cameraTarget.current.set(0, 5, 15);
        cameraLookTarget.current.set(0, 0, 0);
      } else {
        setSelectedCluster(dir);
        setSelectedFile(null);
        const center = DIR_POSITIONS[dir];
        cameraTarget.current.set(center[0] + 2, center[1] + 2, center[2] + 4);
        cameraLookTarget.current.set(center[0], center[1], center[2]);
      }
    },
    [selectedCluster],
  );

  const handleHover = useCallback((idx: number) => {
    setHovered(idx);
  }, []);

  const handleUnhover = useCallback(() => {
    setHovered(null);
  }, []);

  const handleMiss = useCallback(() => {
    setSelectedFile(null);
    setSelectedCluster(null);
    cameraTarget.current.set(0, 5, 15);
    cameraLookTarget.current.set(0, 0, 0);
  }, []);

  // Scene animation
  useFrame(({ camera }) => {
    // Slow rotation of entire scene
    if (groupRef.current) {
      groupRef.current.rotation.y += 0.01 * (1 / 60);
    }

    // Smooth camera
    camera.position.lerp(cameraTarget.current, 0.04);
    camera.lookAt(cameraLookTarget.current);
  });

  // Cluster point lights
  const clusterLights = useMemo(
    () =>
      DIRECTORIES.map((dir) => ({
        dir,
        pos: DIR_POSITIONS[dir],
        color: dominantTypeColor(dir),
      })),
    [],
  );

  return (
    <>
      {/* Very dark space-like background */}
      <color attach="background" args={['#020208']} />
      <ambientLight intensity={0.05} />

      {/* Cluster point lights */}
      {clusterLights.map(({ dir, pos, color }) => (
        <pointLight
          key={`light-${dir}`}
          position={[pos[0], pos[1], pos[2]]}
          intensity={0.3}
          color={color}
          distance={8}
        />
      ))}

      {/* Background plane for click-to-deselect */}
      <mesh position={[0, 0, -25]} onClick={handleMiss} visible={false}>
        <planeGeometry args={[200, 200]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>

      <group ref={groupRef}>
        {/* Import connections */}
        {IMPORTS.map(([from, to], i) => (
          <ImportConnection
            key={`import-${i}`}
            fromIdx={from}
            toIdx={to}
            hovered={hovered}
          />
        ))}

        {/* Star nodes */}
        {FILES.map((file, i) => (
          <StarNode
            key={`file-${i}`}
            file={file}
            fileIndex={i}
            selectedFile={selectedFile}
            selectedCluster={selectedCluster}
            hovered={hovered}
            onSelectFile={handleSelectFile}
            onHoverFile={handleHover}
            onUnhover={handleUnhover}
          />
        ))}

        {/* Cluster labels */}
        {DIRECTORIES.map((dir) => (
          <ClusterLabel
            key={`label-${dir}`}
            dir={dir}
            onSelectCluster={handleSelectCluster}
          />
        ))}
      </group>
    </>
  );
}
