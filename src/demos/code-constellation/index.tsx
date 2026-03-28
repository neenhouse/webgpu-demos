import { useState, useRef, useMemo, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import { Html } from '@react-three/drei';
// TSL imports removed — simple property-based materials used for performance

/**
 * Code Constellation
 *
 * Files in a codebase visualized as a star constellation.
 * Each file is a glowing star with halo bloom shells, sized by line count,
 * colored by file type, and clustered by directory. Nebula clouds surround
 * each cluster, animated light streams flow along import connections,
 * and a procedural star field fills the background.
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
  { path: 'src/demos/tsl-torus/index.tsx', name: 'tsl-torus', type: 'tsx', lines: 80, dir: 'demos' },
  { path: 'src/demos/compute-particles/index.tsx', name: 'compute-particles', type: 'tsx', lines: 200, dir: 'demos' },
  { path: 'src/demos/fluid-sim/index.tsx', name: 'fluid-sim', type: 'tsx', lines: 340, dir: 'demos' },
  { path: 'src/demos/neural-net/index.tsx', name: 'neural-net', type: 'tsx', lines: 250, dir: 'demos' },
  { path: 'src/demos/cyber-city/index.tsx', name: 'cyber-city', type: 'tsx', lines: 350, dir: 'demos' },
  { path: 'src/demos/fractal-zoom/index.tsx', name: 'fractal-zoom', type: 'tsx', lines: 200, dir: 'demos' },
  { path: 'src/demos/reaction-diffusion/index.tsx', name: 'reaction-diffusion', type: 'tsx', lines: 220, dir: 'demos' },
  { path: 'src/demos/boids-murmuration/index.tsx', name: 'boids-murmuration', type: 'tsx', lines: 250, dir: 'demos' },
  { path: 'src/pipeline/spec/schema.ts', name: 'schema', type: 'ts', lines: 300, dir: 'pipeline' },
  { path: 'src/pipeline/spec/parser.ts', name: 'parser', type: 'ts', lines: 150, dir: 'pipeline' },
  { path: 'src/pipeline/renderer/SceneFromYaml.tsx', name: 'SceneFromYaml', type: 'tsx', lines: 200, dir: 'pipeline' },
  { path: 'src/pipeline/renderer/ObjectRenderer.tsx', name: 'ObjectRenderer', type: 'tsx', lines: 280, dir: 'pipeline' },
  { path: 'src/pipeline/generators/parametric/terrain.ts', name: 'terrain-gen', type: 'ts', lines: 180, dir: 'pipeline' },
  { path: 'src/pipeline/generators/csg.ts', name: 'csg-gen', type: 'ts', lines: 250, dir: 'pipeline' },
  { path: 'src/pipeline/generators/sdf.ts', name: 'sdf-gen', type: 'ts', lines: 200, dir: 'pipeline' },
  { path: 'src/pipeline/materials/resolver.ts', name: 'mat-resolver', type: 'ts', lines: 200, dir: 'pipeline' },
  { path: 'src/lib/registry.ts', name: 'registry', type: 'ts', lines: 400, dir: 'lib' },
  { path: 'src/App.tsx', name: 'App', type: 'tsx', lines: 60, dir: 'app' },
  { path: 'src/components/Viewer.tsx', name: 'Viewer', type: 'tsx', lines: 200, dir: 'app' },
  { path: 'package.json', name: 'package.json', type: 'json', lines: 40, dir: 'config' },
  { path: 'tsconfig.json', name: 'tsconfig', type: 'json', lines: 25, dir: 'config' },
  { path: 'vite.config.ts', name: 'vite.config', type: 'config', lines: 30, dir: 'config' },
  { path: 'docs/vision.md', name: 'vision', type: 'md', lines: 80, dir: 'docs' },
  { path: 'docs/prd/prd.md', name: 'prd', type: 'md', lines: 200, dir: 'docs' },
  { path: 'docs/spec/scene-pipeline-spec-v1.md', name: 'scene-spec', type: 'md', lines: 500, dir: 'docs' },
];

const IMPORTS: [number, number][] = [
  [17, 18], [18, 16], [0, 16], [1, 16], [2, 16], [3, 16],
  [10, 11], [10, 8], [10, 9], [11, 15], [11, 12], [11, 13], [11, 14],
];

const DIR_POSITIONS: Record<string, [number, number, number]> = {
  demos: [0, 0, 0],
  pipeline: [5, 1, -2],
  app: [-4, 0, 2],
  lib: [-3, -1, -1],
  config: [3, -2, 3],
  docs: [-2, 3, -3],
};

const TYPE_COLORS_STR: Record<string, string> = {
  ts: '#3178c6',
  tsx: '#61dafb',
  css: '#ff69b4',
  json: '#f0db4f',
  md: '#83cd29',
  yaml: '#cb171e',
  config: '#ff8800',
};

const TYPE_COLORS_HEX: Record<string, number> = {
  ts: 0x3178c6,
  tsx: 0x61dafb,
  css: 0xff69b4,
  json: 0xf0db4f,
  md: 0x83cd29,
  yaml: 0xcb171e,
  config: 0xff8800,
};

const DIRECTORIES = Object.keys(DIR_POSITIONS);

const FILES_BY_DIR: Record<string, number[]> = {};
for (const dir of DIRECTORIES) {
  FILES_BY_DIR[dir] = [];
}
FILES.forEach((f, i) => {
  if (FILES_BY_DIR[f.dir]) FILES_BY_DIR[f.dir].push(i);
});

function filePosition(fileIndex: number, dir: string): [number, number, number] {
  const center = DIR_POSITIONS[dir];
  const filesInDir = FILES_BY_DIR[dir];
  const localIndex = filesInDir.indexOf(fileIndex);
  const count = filesInDir.length;
  const radius = Math.sqrt(count) * 0.5;
  const golden = 2.399963;
  const theta = localIndex * golden;
  const phi = Math.acos(1 - (2 * (localIndex + 0.5)) / Math.max(count, 1));
  const r = radius * Math.cbrt((localIndex + 1) / Math.max(count, 1));
  return [
    center[0] + r * Math.sin(phi) * Math.cos(theta),
    center[1] + r * Math.sin(phi) * Math.sin(theta),
    center[2] + r * Math.cos(phi),
  ];
}

const FILE_POSITIONS = FILES.map((f, i) => filePosition(i, f.dir));

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
  return TYPE_COLORS_STR[maxType] || '#888888';
}

// (dominantTypeColorHex and clusterSpread removed — nebulae are gone)

// ── TSL Material factories ──

// Shared star core materials — one per file type
const sharedStarCoreMaterials = new Map<number, THREE.MeshStandardNodeMaterial>();

function getSharedStarCoreMaterial(hexColor: number): THREE.MeshStandardNodeMaterial {
  if (sharedStarCoreMaterials.has(hexColor)) return sharedStarCoreMaterials.get(hexColor)!;

  const mat = new THREE.MeshStandardNodeMaterial();
  mat.color = new THREE.Color(hexColor);
  mat.emissive = new THREE.Color(hexColor);
  mat.emissiveIntensity = 1.5;
  mat.roughness = 0.1;
  mat.metalness = 0.2;

  sharedStarCoreMaterials.set(hexColor, mat);
  return mat;
}

// (Per-star halo materials removed — shared halo used only on selected)

// Shared halo material for selected star
const sharedStarHaloMaterial = (() => {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;
  mat.opacity = 0.4;
  mat.side = THREE.BackSide;
  mat.depthWrite = false;
  mat.blending = THREE.AdditiveBlending;
  mat.color = new THREE.Color(0xffffff);
  mat.emissive = new THREE.Color(0xffffff);
  mat.emissiveIntensity = 3.0;
  mat.roughness = 0.0;
  mat.metalness = 0.0;
  return mat;
})();

function makeConnectionMaterial(hexColor: number, _connIdx: number) {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;
  mat.opacity = 0.12;
  mat.depthWrite = false;
  mat.color = new THREE.Color(hexColor);
  mat.emissive = new THREE.Color(hexColor);
  mat.emissiveIntensity = 0.5;
  mat.roughness = 0.3;
  mat.metalness = 0.1;
  return mat;
}

function makeConnectionMaterialHighlighted(hexColor: number, _connIdx: number) {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;
  mat.opacity = 0.7;
  mat.depthWrite = false;
  mat.color = new THREE.Color(hexColor);
  mat.emissive = new THREE.Color(hexColor);
  mat.emissiveIntensity = 3.0;
  mat.roughness = 0.2;
  mat.metalness = 0.2;
  return mat;
}

// (Nebula, starfield background, and particle travel materials removed for performance)

function makeBackgroundMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.side = THREE.BackSide;
  mat.color = new THREE.Color(0x040418);
  mat.emissive = new THREE.Color(0x020210);
  mat.emissiveIntensity = 0.05;
  mat.roughness = 1.0;
  mat.metalness = 0.0;
  return mat;
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
  const groupRef = useRef<THREE.Group>(null);
  const basePos = FILE_POSITIONS[fileIndex];
  const typeColor = TYPE_COLORS_STR[file.type] || '#888888';
  const hexColor = TYPE_COLORS_HEX[file.type] || 0x888888;
  const starSize = Math.sqrt(file.lines) * 0.006 + 0.04;
  const isSelected = selectedFile === fileIndex;
  const isHovered = hovered === fileIndex;
  const isInSelectedCluster = selectedCluster === file.dir;
  const isInOtherCluster = selectedCluster !== null && selectedCluster !== file.dir;

  const coreMat = useMemo(
    () => getSharedStarCoreMaterial(hexColor),
    [hexColor],
  );

  // Halo only shown on selected star (see JSX)

  // haloScales removed

  useFrame(({ clock }) => {
    const group = groupRef.current;
    if (!group) return;

    const t = clock.getElapsedTime();

    // When zoomed into cluster, files gently orbit cluster center
    if (isInSelectedCluster) {
      const center = DIR_POSITIONS[file.dir];
      const dx = basePos[0] - center[0];
      const dy = basePos[1] - center[1];
      const dz = basePos[2] - center[2];
      const orbitSpeed = 0.15;
      const cosA = Math.cos(t * orbitSpeed);
      const sinA = Math.sin(t * orbitSpeed);
      group.position.set(
        center[0] + dx * cosA - dz * sinA,
        center[1] + dy,
        center[2] + dx * sinA + dz * cosA,
      );
    } else {
      group.position.set(basePos[0], basePos[1], basePos[2]);
    }

    // Dim stars in other clusters when a cluster is selected
    if (isInOtherCluster) {
      coreMat.opacity = 0.2;
      coreMat.transparent = true;
    } else {
      coreMat.opacity = 1.0;
      coreMat.transparent = false;
    }

    // Scale pulse when selected
    if (isSelected) {
      const pulse = 1.0 + Math.sin(t * 3) * 0.1;
      group.scale.setScalar(pulse);
    } else {
      group.scale.setScalar(1.0);
    }
  });

  return (
    <group ref={groupRef} position={basePos}>
      {/* Core star */}
      <mesh
        material={coreMat}
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
        <icosahedronGeometry args={[starSize, 3]} />
      </mesh>

      {/* Halo shell only on selected star */}
      {isSelected && (
        <mesh material={sharedStarHaloMaterial} scale={1.4} raycast={() => null}>
          <icosahedronGeometry args={[starSize, 2]} />
        </mesh>
      )}

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
              boxShadow: `0 0 16px ${typeColor}60`,
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
    </group>
  );
}

function ImportConnection({
  fromIdx,
  toIdx,
  connIdx,
  hovered,
}: {
  fromIdx: number;
  toIdx: number;
  connIdx: number;
  hovered: number | null;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const isHighlighted = hovered === fromIdx || hovered === toIdx;

  const blendedHex = useMemo(() => {
    const c1 = new THREE.Color(TYPE_COLORS_STR[FILES[fromIdx].type] || '#888888');
    const c2 = new THREE.Color(TYPE_COLORS_STR[FILES[toIdx].type] || '#888888');
    c1.lerp(c2, 0.5);
    return c1.getHex();
  }, [fromIdx, toIdx]);

  const normalMat = useMemo(
    () => makeConnectionMaterial(blendedHex, connIdx),
    [blendedHex, connIdx],
  );
  const highlightMat = useMemo(
    () => makeConnectionMaterialHighlighted(blendedHex, connIdx),
    [blendedHex, connIdx],
  );

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const from = FILE_POSITIONS[fromIdx];
    const to = FILE_POSITIONS[toIdx];

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

    const targetMat = isHighlighted ? highlightMat : normalMat;
    if (mesh.material !== targetMat) {
      mesh.material = targetMat;
    }
  });

  return (
    <mesh ref={meshRef} material={normalMat} raycast={() => null}>
      <cylinderGeometry args={[0.008, 0.008, 1, 4, 1]} />
    </mesh>
  );
}

// (ClusterNebula removed for performance)

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
    <>
      {/* Faint glow light behind label */}
      <pointLight
        position={[center[0], center[1] + 1.2, center[2]]}
        intensity={0.15}
        color={labelColor}
        distance={3}
      />
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
            boxShadow: `0 0 10px ${labelColor}30`,
          }}
        >
          {dir}
          <span style={{ fontSize: '10px', opacity: 0.5, marginLeft: '6px' }}>
            ({fileCount})
          </span>
        </div>
      </Html>
    </>
  );
}

// ── Main component ──

export default function CodeConstellation() {
  const [selectedFile, setSelectedFile] = useState<number | null>(null);
  const [selectedCluster, setSelectedCluster] = useState<string | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const groupRef = useRef<THREE.Group>(null);

  const cameraTarget = useRef(new THREE.Vector3(0, 5, 15));
  const cameraLookTarget = useRef(new THREE.Vector3(0, 0, 0));

  // Background material
  const bgMat = useMemo(() => makeBackgroundMaterial(), []);

  const handleSelectFile = useCallback(
    (idx: number) => {
      const file = FILES[idx];
      if (selectedFile === idx) {
        setSelectedFile(null);
        if (selectedCluster) {
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

  useFrame(({ camera }) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += 0.01 * (1 / 60);
    }
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
      {/* Space background sphere with procedural star field */}
      <mesh material={bgMat} raycast={() => null}>
        <sphereGeometry args={[60, 32, 32]} />
      </mesh>

      <ambientLight intensity={0.04} />

      {/* Cluster point lights */}
      {clusterLights.map(({ dir, pos, color: c }) => (
        <pointLight
          key={`light-${dir}`}
          position={[pos[0], pos[1], pos[2]]}
          intensity={0.4}
          color={c}
          distance={8}
        />
      ))}

      {/* Background plane for click-to-deselect */}
      <mesh position={[0, 0, -25]} onClick={handleMiss} visible={false}>
        <planeGeometry args={[200, 200]} />
      </mesh>

      <group ref={groupRef}>
        {/* Import connections */}
        {IMPORTS.map(([from, to], i) => (
          <ImportConnection
            key={`import-${i}`}
            fromIdx={from}
            toIdx={to}
            connIdx={i}
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

      {/* Instructions overlay (top-left) */}
      <Html fullscreen>
        <div style={{
          position: 'absolute', top: '16px', left: '16px',
          color: 'rgba(255,255,255,0.7)', fontSize: '11px',
          background: 'rgba(0,0,0,0.5)', padding: '10px 14px',
          borderRadius: '6px', lineHeight: '1.6',
          maxWidth: '210px', pointerEvents: 'none',
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: '4px', color: '#61dafb', fontSize: '12px' }}>Code Constellation</div>
          <div>This project&apos;s files visualized as stars &mdash; clustered by directory, colored by type</div>
          <div style={{ marginTop: '6px' }}>Click a star for file details</div>
          <div>Click a cluster label to zoom in</div>
          <div style={{ marginTop: '4px', fontSize: '10px', opacity: 0.6 }}>
            Click empty space for overview
          </div>
        </div>
      </Html>

      {/* Legend sidebar (right) */}
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
          <div style={{ fontWeight: 'bold', marginBottom: '6px', color: '#61dafb', fontSize: '11px' }}>File Types</div>
          {([
            { type: 'TS', color: '#3178c6' },
            { type: 'TSX', color: '#61dafb' },
            { type: 'JSON', color: '#f0db4f' },
            { type: 'MD', color: '#83cd29' },
            { type: 'Config', color: '#ff8800' },
          ] as const).map(entry => (
            <div key={entry.type} style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '2px 0', fontSize: '10px',
            }}>
              <span style={{
                display: 'inline-block', width: '8px', height: '8px',
                borderRadius: '50%', background: entry.color, flexShrink: 0,
              }} />
              <span style={{ color: entry.color }}>{entry.type}</span>
            </div>
          ))}

          <div style={{ marginTop: '10px', borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: '8px' }}>
            <div style={{ fontWeight: 'bold', marginBottom: '4px', color: '#61dafb', fontSize: '10px' }}>Clusters</div>
            {DIRECTORIES.map(dir => (
              <div key={dir}
                onClick={() => handleSelectCluster(dir)}
                style={{
                  padding: '2px 6px', marginBottom: '1px', borderRadius: '3px',
                  cursor: 'pointer', pointerEvents: 'auto',
                  color: selectedCluster === dir ? '#fff' : dominantTypeColor(dir),
                  background: selectedCluster === dir ? 'rgba(255,255,255,0.12)' : 'transparent',
                  fontSize: '10px', transition: 'background 0.2s',
                }}
                onMouseEnter={(e) => { (e.target as HTMLElement).style.background = 'rgba(255,255,255,0.08)'; }}
                onMouseLeave={(e) => { (e.target as HTMLElement).style.background = selectedCluster === dir ? 'rgba(255,255,255,0.12)' : 'transparent'; }}
              >
                {dir}
              </div>
            ))}
          </div>
        </div>
      </Html>
    </>
  );
}
