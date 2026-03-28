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
  Fn,
  hash,
  mix,
} from 'three/tsl';

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

function dominantTypeColorHex(dir: string): number {
  const indices = FILES_BY_DIR[dir];
  if (!indices || indices.length === 0) return 0x888888;
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
  return TYPE_COLORS_HEX[maxType] || 0x888888;
}

// Compute cluster spread for nebula sizing
function clusterSpread(dir: string): number {
  const indices = FILES_BY_DIR[dir];
  if (!indices || indices.length < 2) return 1.0;
  const center = DIR_POSITIONS[dir];
  let maxDist = 0;
  for (const idx of indices) {
    const pos = FILE_POSITIONS[idx];
    const dx = pos[0] - center[0];
    const dy = pos[1] - center[1];
    const dz = pos[2] - center[2];
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist > maxDist) maxDist = dist;
  }
  return maxDist;
}

// ── TSL Material factories ──

function makeStarCoreMaterial(hexColor: number, fileIndex: number) {
  const mat = new THREE.MeshStandardNodeMaterial();

  // Per-star twinkle using hash of index for variation
  const phase = float(fileIndex).mul(1.7);
  const twinkle = oscSine(time.mul(hash(float(fileIndex)).mul(3.0).add(1.0)).add(phase))
    .mul(0.4)
    .add(0.6);

  // Hash noise for surface detail
  const surfaceNoise = hash(positionLocal.mul(30.0)).mul(0.1).add(0.9);

  // Saturated color
  mat.colorNode = color(hexColor).mul(surfaceNoise);

  // Fresnel rim for star edge glow
  const fresnel = Fn(() => {
    const viewDir = cameraPosition.sub(positionWorld).normalize();
    const nDotV = normalWorld.dot(viewDir).saturate();
    return float(1.0).sub(nDotV).pow(2.0);
  });

  // Bright emissive core + white fresnel rim
  const coreEmissive = color(hexColor).mul(twinkle.mul(3.0));
  const rimEmissive = color(0xffffff).mul(fresnel()).mul(twinkle.mul(2.0));
  mat.emissiveNode = coreEmissive.add(rimEmissive);

  mat.roughness = 0.1;
  mat.metalness = 0.2;

  return mat;
}

function makeStarHaloMaterial(hexColor: number, fileIndex: number, layer: number) {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;
  mat.side = THREE.BackSide;
  mat.depthWrite = false;
  mat.blending = THREE.AdditiveBlending;

  const layerFade = float(1.0).sub(float(layer).mul(0.3));
  const phase = float(fileIndex).mul(1.7);
  const twinkle = oscSine(time.mul(hash(float(fileIndex)).mul(3.0).add(1.0)).add(phase))
    .mul(0.3)
    .add(0.7);

  const fresnel = Fn(() => {
    const viewDir = cameraPosition.sub(positionWorld).normalize();
    const nDotV = normalWorld.dot(viewDir).saturate();
    return float(1.0).sub(nDotV).pow(float(1.5).add(float(layer).mul(0.5)));
  });

  const glowColor = color(hexColor);
  mat.opacityNode = fresnel().mul(twinkle).mul(layerFade).mul(0.5);
  mat.colorNode = glowColor;
  mat.emissiveNode = glowColor.mul(fresnel().mul(twinkle).mul(layerFade).mul(3.5));

  mat.roughness = 0.0;
  mat.metalness = 0.0;

  return mat;
}

function makeConnectionMaterial(hexColor: number, connIdx: number) {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;
  mat.depthWrite = false;

  const flow = oscSine(
    positionLocal.y.mul(4.0).add(time.mul(2.5)).add(float(connIdx).mul(0.7)),
  )
    .mul(0.5)
    .add(0.5);

  const baseColor = color(hexColor);
  mat.colorNode = baseColor;
  mat.emissiveNode = baseColor.mul(flow.mul(2.0));
  mat.opacityNode = float(0.12);

  mat.roughness = 0.3;
  mat.metalness = 0.1;

  return mat;
}

function makeConnectionMaterialHighlighted(hexColor: number, connIdx: number) {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;
  mat.depthWrite = false;

  const flow = oscSine(
    positionLocal.y.mul(5.0).add(time.mul(3.5)).add(float(connIdx).mul(0.7)),
  )
    .mul(0.5)
    .add(0.5);

  const baseColor = color(hexColor);
  mat.colorNode = baseColor;
  mat.emissiveNode = baseColor.mul(flow.mul(5.0).add(1.5));
  mat.opacityNode = float(0.7).add(flow.mul(0.25));

  mat.roughness = 0.2;
  mat.metalness = 0.2;

  return mat;
}

function makeNebulaMaterial(hexColor: number) {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;
  mat.side = THREE.BackSide;
  mat.depthWrite = false;
  mat.blending = THREE.AdditiveBlending;

  const drift = oscSine(time.mul(0.2).add(positionLocal.x.mul(2.0)))
    .mul(0.3)
    .add(0.7);

  const nebulaColor = color(hexColor);
  mat.colorNode = nebulaColor;
  mat.emissiveNode = nebulaColor.mul(drift.mul(0.5));
  mat.opacityNode = float(0.04).mul(drift);

  mat.roughness = 1.0;
  mat.metalness = 0.0;

  return mat;
}

function makeBackgroundMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.side = THREE.BackSide;

  // Procedural star field using hash noise — tiny bright dots scattered
  const starField = hash(positionLocal.mul(80.0));
  // Only show very bright values as stars
  const starMask = starField.step(0.985).mul(starField);

  // Dark blue gradient (not pure black)
  const vertGrad = positionLocal.normalize().y.mul(0.5).add(0.5);
  const bgColor = mix(color(0x020210), color(0x060625), vertGrad);

  mat.colorNode = bgColor.add(color(0xffffff).mul(starMask.mul(0.3)));
  mat.emissiveNode = bgColor.mul(0.05).add(color(0xffffff).mul(starMask.mul(0.5)));

  mat.roughness = 1.0;
  mat.metalness = 0.0;

  return mat;
}

function makeParticleTravelMaterial(hexColor: number) {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;
  mat.depthWrite = false;
  mat.blending = THREE.AdditiveBlending;

  const glow = oscSine(time.mul(4.0)).mul(0.3).add(0.7);
  mat.colorNode = color(hexColor);
  mat.emissiveNode = color(hexColor).mul(glow.mul(3.0));
  mat.opacityNode = float(0.8).mul(glow);

  mat.roughness = 0.0;
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
    () => makeStarCoreMaterial(hexColor, fileIndex),
    [hexColor, fileIndex],
  );

  // 1-2 halo shells based on star size (bigger files get 2)
  const haloCount = file.lines > 200 ? 2 : 1;
  const haloMats = useMemo(() => {
    const mats = [makeStarHaloMaterial(hexColor, fileIndex, 0)];
    if (haloCount > 1) {
      mats.push(makeStarHaloMaterial(hexColor, fileIndex, 1));
    }
    return mats;
  }, [hexColor, fileIndex, haloCount]);

  const haloScales = haloCount > 1 ? [1.4, 1.7] : [1.3];

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
      for (const h of haloMats) {
        h.opacity = 0.1;
      }
    } else if (isInSelectedCluster) {
      // Brighten stars in selected cluster
      coreMat.opacity = 1.0;
      coreMat.transparent = false;
      for (const h of haloMats) {
        h.opacity = 1.2;
      }
    } else {
      coreMat.opacity = 1.0;
      coreMat.transparent = false;
      for (const h of haloMats) {
        h.opacity = 0.7;
      }
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

      {/* Halo shells */}
      {haloMats.map((mat, i) => (
        <mesh key={i} material={mat} scale={haloScales[i]} raycast={() => null}>
          <icosahedronGeometry args={[starSize, 2]} />
        </mesh>
      ))}

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
  const particleRefs = useRef<(THREE.Mesh | null)[]>([]);
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

  const particleMat = useMemo(
    () => makeParticleTravelMaterial(blendedHex),
    [blendedHex],
  );

  // 2-3 traveling particles per connection
  const particleCount = 2 + (connIdx % 2);
  const particleOffsets = useMemo(
    () => Array.from({ length: particleCount }, (_, i) => i / particleCount),
    [particleCount],
  );

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

    const targetMat = isHighlighted ? highlightMat : normalMat;
    if (mesh.material !== targetMat) {
      mesh.material = targetMat;
    }

    // Animate traveling particles
    const t = clock.getElapsedTime();
    const speed = isHighlighted ? 0.8 : 0.4;
    for (let i = 0; i < particleCount; i++) {
      const p = particleRefs.current[i];
      if (!p) continue;
      const progress = ((t * speed + particleOffsets[i]) % 1.0);
      p.position.set(
        from[0] + dx * progress,
        from[1] + dy * progress,
        from[2] + dz * progress,
      );
      p.visible = isHighlighted || Math.random() > 0.3; // only consistently visible when highlighted
    }
  });

  return (
    <>
      <mesh ref={meshRef} material={normalMat} raycast={() => null}>
        <cylinderGeometry args={[0.008, 0.008, 1, 4, 1]} />
      </mesh>
      {/* Traveling particles */}
      {particleOffsets.map((_, i) => (
        <mesh
          key={`particle-${connIdx}-${i}`}
          ref={(el) => {
            particleRefs.current[i] = el;
          }}
          material={particleMat}
          raycast={() => null}
          visible={false}
        >
          <icosahedronGeometry args={[0.015, 0]} />
        </mesh>
      ))}
    </>
  );
}

function ClusterNebula({ dir }: { dir: string }) {
  const center = DIR_POSITIONS[dir];
  const spread = clusterSpread(dir);
  const nebulaRadius = Math.max(spread * 1.5, 1.2);
  const hexColor = dominantTypeColorHex(dir);

  const mat = useMemo(() => makeNebulaMaterial(hexColor), [hexColor]);

  return (
    <mesh
      position={center}
      material={mat}
      raycast={() => null}
    >
      <sphereGeometry args={[nebulaRadius, 16, 16]} />
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
        {/* Cluster nebulae */}
        {DIRECTORIES.map((dir) => (
          <ClusterNebula key={`nebula-${dir}`} dir={dir} />
        ))}

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
    </>
  );
}
