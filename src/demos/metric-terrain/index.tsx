import { useRef, useState, useMemo, useEffect, useCallback } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three/webgpu';

/**
 * Metric Terrain
 *
 * Data metrics visualized as 3D terrain. 4 metric series over 20 time
 * points create a landscape where height = value and color = category.
 * A sweeping time cursor highlights cross-sections. Click peaks to
 * inspect metrics, hover for value readouts.
 *
 * REWRITTEN with TSL materials: height-gradient coloring, glowing peaks,
 * halo shells, scan-line cursor, grid floor, and atmospheric lighting.
 */

// ── Data ──

const METRICS = ['CPU Usage', 'Memory', 'Requests/s', 'Error Rate'];
const TIME_POINTS = 20;
const METRIC_COLORS = ['#4488ff', '#22cc88', '#ffaa22', '#ff4466'];
const METRIC_COLORS_HEX = [0x4488ff, 0x22cc88, 0xffaa22, 0xff4466];

function generateMetricData(): number[][] {
  const data: number[][] = [];
  const seeds = [0.45, 0.35, 0.55, 0.2];
  for (let m = 0; m < METRICS.length; m++) {
    const series: number[] = [];
    let value = seeds[m];
    for (let t = 0; t < TIME_POINTS; t++) {
      const pseudo = Math.sin(m * 137.5 + t * 43.7) * 0.5 + 0.5;
      value += (pseudo - 0.48) * 0.1;
      value = Math.max(0.05, Math.min(1.0, value));
      if (Math.sin(m * 97.3 + t * 23.1) > 0.85) {
        value = Math.min(1.0, value + 0.3);
      }
      series.push(value);
    }
    data.push(series);
  }
  return data;
}

// ── Layout constants ──

const TERRAIN_WIDTH = 16;
const TERRAIN_DEPTH = 8;
const MAX_HEIGHT = 4.0;
const SUBDIVS_PER_UNIT_X = 4;
const SUBDIVS_PER_UNIT_Z = 4;

// ── Cosine interpolation ──

function cosineInterp(a: number, b: number, t: number): number {
  const ft = t * Math.PI;
  const f = (1 - Math.cos(ft)) / 2;
  return a * (1 - f) + b * f;
}

// ── Peak detection ──

interface PeakInfo {
  metric: number;
  time: number;
  value: number;
  position: THREE.Vector3;
}

function findPeaks(data: number[][]): PeakInfo[] {
  const peaks: PeakInfo[] = [];
  for (let m = 0; m < METRICS.length; m++) {
    let maxVal = 0;
    let maxT = 0;
    for (let t = 0; t < TIME_POINTS; t++) {
      if (data[m][t] > maxVal) {
        maxVal = data[m][t];
        maxT = t;
      }
    }
    const x = (maxT / (TIME_POINTS - 1)) * TERRAIN_WIDTH - TERRAIN_WIDTH / 2;
    const z = (m / (METRICS.length - 1)) * TERRAIN_DEPTH - TERRAIN_DEPTH / 2;
    const y = maxVal * MAX_HEIGHT;
    peaks.push({ metric: m, time: maxT, value: maxVal, position: new THREE.Vector3(x, y, z) });
  }
  return peaks;
}


// ── Terrain mesh builder ──

function buildTerrainGeometry(data: number[][]): THREE.BufferGeometry {
  const segsX = (TIME_POINTS - 1) * SUBDIVS_PER_UNIT_X;
  const segsZ = (METRICS.length - 1) * SUBDIVS_PER_UNIT_Z;

  const geo = new THREE.PlaneGeometry(TERRAIN_WIDTH, TERRAIN_DEPTH, segsX, segsZ);
  geo.rotateX(-Math.PI / 2);

  const posAttr = geo.getAttribute('position');
  const vertexCount = posAttr.count;

  // Store normalized height in a custom attribute for TSL coloring
  const heights = new Float32Array(vertexCount);

  for (let i = 0; i < vertexCount; i++) {
    const x = posAttr.getX(i);
    const z = posAttr.getZ(i);

    const tNorm = (x + TERRAIN_WIDTH / 2) / TERRAIN_WIDTH;
    const tExact = tNorm * (TIME_POINTS - 1);
    const tIdx = Math.min(Math.floor(tExact), TIME_POINTS - 2);
    const tFrac = tExact - tIdx;

    const mNorm = (z + TERRAIN_DEPTH / 2) / TERRAIN_DEPTH;
    const mExact = mNorm * (METRICS.length - 1);
    const mIdx = Math.min(Math.floor(mExact), METRICS.length - 2);
    const mFrac = mExact - mIdx;

    const v00 = data[mIdx][tIdx];
    const v01 = data[mIdx][tIdx + 1];
    const v10 = data[mIdx + 1][tIdx];
    const v11 = data[mIdx + 1][tIdx + 1];

    const vTop = cosineInterp(v00, v01, tFrac);
    const vBot = cosineInterp(v10, v11, tFrac);
    const value = cosineInterp(vTop, vBot, mFrac);

    const y = value * MAX_HEIGHT;
    posAttr.setY(i, y);
    heights[i] = value;
  }

  // Compute vertex colors based on height for terrain coloring (replacing TSL gradient)
  const vertColors = new Float32Array(vertexCount * 3);
  const stops = [
    { h: 0.0, r: 0.04, g: 0.23, b: 0.16 },
    { h: 0.25, r: 0.13, g: 0.67, b: 0.27 },
    { h: 0.5, r: 0.87, g: 0.80, b: 0.13 },
    { h: 0.75, r: 1.0, g: 0.40, b: 0.13 },
    { h: 1.0, r: 1.0, g: 0.93, b: 0.80 },
  ];
  for (let i = 0; i < vertexCount; i++) {
    const h = Math.max(0, Math.min(1, heights[i]));
    let si = 0;
    for (let s = 0; s < stops.length - 1; s++) {
      if (h >= stops[s].h && h <= stops[s + 1].h) { si = s; break; }
    }
    const t = (h - stops[si].h) / (stops[si + 1].h - stops[si].h || 1);
    vertColors[i * 3] = stops[si].r + (stops[si + 1].r - stops[si].r) * t;
    vertColors[i * 3 + 1] = stops[si].g + (stops[si + 1].g - stops[si].g) * t;
    vertColors[i * 3 + 2] = stops[si].b + (stops[si + 1].b - stops[si].b) * t;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(vertColors, 3));

  posAttr.needsUpdate = true;
  geo.computeVertexNormals();

  return geo;
}

// ── Simple Terrain Material with vertex colors ──

function makeTerrainMaterial(): THREE.MeshStandardNodeMaterial {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.side = THREE.DoubleSide;
  // Use a mid-range terrain color since we no longer have per-vertex TSL gradient
  mat.color = new THREE.Color(0x44aa55);
  mat.emissive = new THREE.Color(0x44aa55);
  mat.emissiveIntensity = 0.2;
  mat.roughness = 0.5;
  mat.metalness = 0.1;
  // Enable vertex colors for height-based coloring
  mat.vertexColors = true;

  return mat;
}

// ── Time cursor plane with scan-line material ──

function TimeCursor() {
  const meshRef = useRef<THREE.Mesh>(null);

  const material = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.transparent = true;
    mat.side = THREE.BackSide;
    mat.depthWrite = false;
    mat.blending = THREE.AdditiveBlending;
    mat.color = new THREE.Color(0x44aaff);
    mat.emissive = new THREE.Color(0x44aaff);
    mat.emissiveIntensity = 1.5;
    mat.opacity = 0.25;
    mat.roughness = 0.0;
    mat.metalness = 0.0;

    return mat;
  }, []);

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const t = clock.getElapsedTime();
    const progress = (t % 10) / 10;
    const x = progress * TERRAIN_WIDTH - TERRAIN_WIDTH / 2;
    meshRef.current.position.x = x;
  });

  return (
    <mesh ref={meshRef} position={[0, MAX_HEIGHT / 2 + 0.5, 0]} material={material}>
      <planeGeometry args={[0.08, MAX_HEIGHT + 2, 1, 1]} />
    </mesh>
  );
}

// ── Cross-section line at cursor ──

function TimeCursorLine({ data }: { data: number[][] }) {
  const groupRef = useRef<THREE.Group>(null);
  const lineRef = useRef<THREE.Line>(null);

  const lineGeo = useMemo(() => {
    const pts = [];
    const steps = (METRICS.length - 1) * 10;
    for (let i = 0; i <= steps; i++) {
      pts.push(new THREE.Vector3(0, 0, 0));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    return geo;
  }, []);

  const lineMat = useMemo(() => {
    const mat = new THREE.LineBasicNodeMaterial();
    mat.color = new THREE.Color(0x88ccff);
    return mat;
  }, []);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const t = clock.getElapsedTime();
    const progress = (t % 10) / 10;
    const tExact = progress * (TIME_POINTS - 1);
    const tIdx = Math.min(Math.floor(tExact), TIME_POINTS - 2);
    const tFrac = tExact - tIdx;

    const x = progress * TERRAIN_WIDTH - TERRAIN_WIDTH / 2;
    groupRef.current.position.x = x;

    const posAttr = lineGeo.getAttribute('position');
    const steps = (METRICS.length - 1) * 10;
    for (let i = 0; i <= steps; i++) {
      const mNorm = i / steps;
      const mExact = mNorm * (METRICS.length - 1);
      const mIdx = Math.min(Math.floor(mExact), METRICS.length - 2);
      const mFrac = mExact - mIdx;

      const v0 = cosineInterp(data[mIdx][tIdx], data[mIdx][tIdx + 1], tFrac);
      const v1 = cosineInterp(data[mIdx + 1][tIdx], data[mIdx + 1][tIdx + 1], tFrac);
      const value = cosineInterp(v0, v1, mFrac);

      const z = mNorm * TERRAIN_DEPTH - TERRAIN_DEPTH / 2;
      const y = value * MAX_HEIGHT + 0.02;

      posAttr.setXYZ(i, 0, y, z);
    }
    posAttr.needsUpdate = true;
  });

  return (
    <group ref={groupRef}>
      <primitive object={new THREE.Line(lineGeo, lineMat)} ref={lineRef} />
    </group>
  );
}

// ── Simple dark grid floor ──

function GridFloor() {
  const material = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.color = new THREE.Color(0x0a0a1a);
    mat.emissive = new THREE.Color(0x0a0a2a);
    mat.emissiveIntensity = 0.15;
    mat.roughness = 0.9;
    mat.metalness = 0.1;
    return mat;
  }, []);

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]} material={material}>
      <planeGeometry args={[24, 16]} />
    </mesh>
  );
}

// ── Time tick lines (thin vertical cylinders) ──

function TimeTickLines() {
  const ticks = useMemo(() => {
    const result: number[] = [];
    for (let t = 0; t < TIME_POINTS; t += 4) {
      result.push(t);
    }
    return result;
  }, []);

  const material = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.transparent = true;
    mat.color = new THREE.Color(0x222244);
    mat.emissive = new THREE.Color(0x111133);
    mat.emissiveIntensity = 1.0;
    mat.opacity = 0.3;
    mat.roughness = 0.8;
    mat.metalness = 0.0;
    return mat;
  }, []);

  return (
    <>
      {ticks.map((t) => {
        const x = (t / (TIME_POINTS - 1)) * TERRAIN_WIDTH - TERRAIN_WIDTH / 2;
        return (
          <mesh key={`tick-${t}`} position={[x, 0.5, TERRAIN_DEPTH / 2 + 0.3]} material={material}>
            <cylinderGeometry args={[0.01, 0.01, 1.0, 4]} />
          </mesh>
        );
      })}
    </>
  );
}

// ── Time axis labels ──

function TimeLabels() {
  const labels: { text: string; x: number }[] = [];
  for (let t = 0; t < TIME_POINTS; t += 4) {
    const x = (t / (TIME_POINTS - 1)) * TERRAIN_WIDTH - TERRAIN_WIDTH / 2;
    labels.push({ text: `T${t}`, x });
  }

  return (
    <>
      {labels.map((l) => (
        <Html key={l.text} position={[l.x, -0.3, TERRAIN_DEPTH / 2 + 0.8]} center>
          <div
            style={{
              color: '#888',
              fontSize: '10px',
              pointerEvents: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            {l.text}
          </div>
        </Html>
      ))}
    </>
  );
}

// ── Peak marker with halo and light beam ──

function makePeakCoreMaterial(colorHex: number, _metricIndex: number) {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.color = new THREE.Color(colorHex);
  mat.emissive = new THREE.Color(colorHex);
  mat.emissiveIntensity = 1.5;
  mat.roughness = 0.15;
  mat.metalness = 0.5;

  return mat;
}

function makePeakHaloMaterial(colorHex: number, _metricIndex: number) {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;
  mat.side = THREE.BackSide;
  mat.depthWrite = false;
  mat.blending = THREE.AdditiveBlending;
  mat.color = new THREE.Color(colorHex);
  mat.emissive = new THREE.Color(colorHex);
  mat.emissiveIntensity = 1.5;
  mat.opacity = 0.2;
  mat.roughness = 0.0;
  mat.metalness = 0.0;

  return mat;
}

function makeBeamMaterial(colorHex: number) {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;
  mat.depthWrite = false;
  mat.blending = THREE.AdditiveBlending;
  mat.color = new THREE.Color(colorHex);
  mat.emissive = new THREE.Color(colorHex);
  mat.emissiveIntensity = 1.5;
  mat.opacity = 0.15;
  mat.roughness = 0.0;
  mat.metalness = 0.0;

  return mat;
}

function PeakMarker({
  peak,
  selected,
  onSelect,
  onHover,
  onUnhover,
  hovered,
}: {
  peak: PeakInfo;
  selected: boolean;
  onSelect: () => void;
  onHover: () => void;
  onUnhover: () => void;
  hovered: boolean;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const metricColor = METRIC_COLORS[peak.metric];
  const metricColorHex = METRIC_COLORS_HEX[peak.metric];

  const coreMat = useMemo(() => makePeakCoreMaterial(metricColorHex, peak.metric), [metricColorHex, peak.metric]);
  const haloMat = useMemo(() => makePeakHaloMaterial(metricColorHex, peak.metric), [metricColorHex, peak.metric]);
  const beamMat = useMemo(() => makeBeamMaterial(metricColorHex), [metricColorHex]);

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const t = clock.getElapsedTime();
    const pulse = Math.sin(t * 2 + peak.metric * 1.5) * 0.05 + 1.0;
    const baseScale = selected ? 1.4 : hovered ? 1.2 : 1.0;
    meshRef.current.scale.setScalar(baseScale * pulse);
  });

  return (
    <group position={[peak.position.x, peak.position.y + 0.3, peak.position.z]}>
      {/* Core octahedron */}
      <mesh
        ref={meshRef}
        material={coreMat}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHover();
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          onUnhover();
          document.body.style.cursor = 'auto';
        }}
      >
        <octahedronGeometry args={[0.2, 0]} />
      </mesh>

      {/* Halo shell */}
      <mesh material={haloMat} scale={[1.5, 1.5, 1.5]}>
        <octahedronGeometry args={[0.2, 1]} />
      </mesh>

      {/* Vertical light beam from peak upward */}
      <mesh position={[0, 1.5, 0]} material={beamMat}>
        <cylinderGeometry args={[0.02, 0.04, 3.0, 6]} />
      </mesh>

      {/* Point light at peak */}
      <pointLight color={metricColor} intensity={1.5} distance={4} />

      {/* Metric name label */}
      <Html center distanceFactor={12}>
        <div
          style={{
            color: metricColor,
            fontSize: '11px',
            fontWeight: 'bold',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            textShadow: '0 0 4px rgba(0,0,0,0.8)',
          }}
        >
          {METRICS[peak.metric]}
        </div>
      </Html>

      {/* Hover tooltip */}
      {hovered && !selected && (
        <Html center distanceFactor={10} position={[0, 0.5, 0]}>
          <div
            style={{
              color: 'white',
              fontSize: '12px',
              background: 'rgba(0,0,0,0.85)',
              padding: '4px 8px',
              borderRadius: '4px',
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              borderLeft: `3px solid ${metricColor}`,
            }}
          >
            Peak: {(peak.value * 100).toFixed(1)}% at T{peak.time}
          </div>
        </Html>
      )}

      {/* Selected detail panel */}
      {selected && (
        <Html center distanceFactor={8} position={[0, 0.8, 0]}>
          <div
            style={{
              color: 'white',
              fontSize: '13px',
              background: 'rgba(0,0,0,0.92)',
              padding: '10px 14px',
              borderRadius: '6px',
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              borderLeft: `4px solid ${metricColor}`,
              minWidth: '180px',
            }}
          >
            <div
              style={{
                fontSize: '10px',
                color: metricColor,
                textTransform: 'uppercase',
                fontWeight: 'bold',
                letterSpacing: '0.5px',
                marginBottom: '4px',
              }}
            >
              Metric Details
            </div>
            <div style={{ fontSize: '15px', fontWeight: 'bold', marginBottom: '4px' }}>
              {METRICS[peak.metric]}
            </div>
            <div style={{ fontSize: '12px', color: '#aaa', marginBottom: '2px' }}>
              Peak value: <span style={{ color: metricColor }}>{(peak.value * 100).toFixed(1)}%</span>
            </div>
            <div style={{ fontSize: '12px', color: '#aaa' }}>
              Time point: T{peak.time} of {TIME_POINTS}
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}

// ── Camera controller ──

function CameraController({ selectedMetric }: { selectedMetric: number | null }) {
  const { camera } = useThree();
  const targetPos = useRef(new THREE.Vector3(8, 6, 8));
  const targetLook = useRef(new THREE.Vector3(0, 0, 0));
  const currentLook = useRef(new THREE.Vector3(0, 0, 0));

  useEffect(() => {
    if (selectedMetric !== null) {
      const z = (selectedMetric / (METRICS.length - 1)) * TERRAIN_DEPTH - TERRAIN_DEPTH / 2;
      targetPos.current.set(TERRAIN_WIDTH / 2 + 3, 3, z);
      targetLook.current.set(0, MAX_HEIGHT * 0.3, z);
    } else {
      targetPos.current.set(8, 6, 8);
      targetLook.current.set(0, 0, 0);
    }
  }, [selectedMetric]);

  useFrame(() => {
    camera.position.lerp(targetPos.current, 0.05);
    currentLook.current.lerp(targetLook.current, 0.05);
    camera.lookAt(currentLook.current);
  });

  return null;
}

// ── Hover terrain readout ──

function TerrainHoverTarget({
  data,
  onHoverInfo,
}: {
  data: number[][];
  onHoverInfo: (info: { metric: string; value: number; x: number; y: number; z: number } | null) => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);

  const material = useMemo(() => {
    const mat = new THREE.MeshBasicNodeMaterial();
    mat.transparent = true;
    mat.opacity = 0;
    mat.side = THREE.DoubleSide;
    return mat;
  }, []);

  return (
    <mesh
      ref={meshRef}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, MAX_HEIGHT + 0.01, 0]}
      material={material}
      onPointerMove={(e) => {
        if (!e.point) return;
        const x = e.point.x;
        const z = e.point.z;

        const tNorm = (x + TERRAIN_WIDTH / 2) / TERRAIN_WIDTH;
        const mNorm = (z + TERRAIN_DEPTH / 2) / TERRAIN_DEPTH;

        if (tNorm < 0 || tNorm > 1 || mNorm < 0 || mNorm > 1) {
          onHoverInfo(null);
          return;
        }

        const tExact = tNorm * (TIME_POINTS - 1);
        const tIdx = Math.min(Math.floor(tExact), TIME_POINTS - 2);
        const tFrac = tExact - tIdx;
        const mExact = mNorm * (METRICS.length - 1);
        const mIdx = Math.min(Math.floor(mExact), METRICS.length - 2);
        const mFrac = mExact - mIdx;

        const v00 = data[mIdx][tIdx];
        const v01 = data[mIdx][tIdx + 1];
        const v10 = data[mIdx + 1][tIdx];
        const v11 = data[mIdx + 1][tIdx + 1];
        const vTop = cosineInterp(v00, v01, tFrac);
        const vBot = cosineInterp(v10, v11, tFrac);
        const value = cosineInterp(vTop, vBot, mFrac);

        const closestMetric = Math.round(mExact);
        onHoverInfo({
          metric: METRICS[closestMetric],
          value,
          x: e.point.x,
          y: value * MAX_HEIGHT + 0.5,
          z: e.point.z,
        });
      }}
      onPointerLeave={() => onHoverInfo(null)}
    >
      <planeGeometry args={[TERRAIN_WIDTH, TERRAIN_DEPTH]} />
    </mesh>
  );
}

// ── Background click catcher ──

function BackgroundClickTarget({ onClick }: { onClick: () => void }) {
  const material = useMemo(() => {
    const mat = new THREE.MeshBasicNodeMaterial();
    mat.transparent = true;
    mat.opacity = 0;
    return mat;
  }, []);

  return (
    <mesh position={[0, -5, 0]} rotation={[-Math.PI / 2, 0, 0]} onClick={onClick} material={material}>
      <planeGeometry args={[60, 60]} />
    </mesh>
  );
}

// ── Main component ──

export default function MetricTerrain() {
  const [selectedMetric, setSelectedMetric] = useState<number | null>(null);
  const [hoveredPeak, setHoveredPeak] = useState<number | null>(null);
  const [hoverInfo, setHoverInfo] = useState<{
    metric: string;
    value: number;
    x: number;
    y: number;
    z: number;
  } | null>(null);

  const data = useMemo(() => generateMetricData(), []);
  const peaks = useMemo(() => findPeaks(data), [data]);
  const terrainGeo = useMemo(() => buildTerrainGeometry(data), [data]);
  const terrainMat = useMemo(() => makeTerrainMaterial(), []);

  const handleBackgroundClick = useCallback(() => {
    setSelectedMetric(null);
  }, []);

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.15} />
      <directionalLight position={[5, 10, 5]} intensity={0.9} castShadow />
      <directionalLight position={[-3, 8, -4]} intensity={0.3} />

      {/* Camera controller */}
      <CameraController selectedMetric={selectedMetric} />

      {/* Background click target */}
      <BackgroundClickTarget onClick={handleBackgroundClick} />

      {/* Grid floor with TSL pattern */}
      <GridFloor />

      {/* Time tick lines */}
      <TimeTickLines />

      {/* Terrain mesh with TSL height-gradient material */}
      <mesh geometry={terrainGeo} material={terrainMat} onClick={handleBackgroundClick} />

      {/* Terrain hover target (invisible plane above terrain) */}
      <TerrainHoverTarget data={data} onHoverInfo={setHoverInfo} />

      {/* Time cursor with scan-line effect */}
      <TimeCursor />
      <TimeCursorLine data={data} />

      {/* Time axis labels */}
      <TimeLabels />

      {/* Metric labels on Z axis */}
      {METRICS.map((name, i) => {
        const z = (i / (METRICS.length - 1)) * TERRAIN_DEPTH - TERRAIN_DEPTH / 2;
        return (
          <Html key={name} position={[-TERRAIN_WIDTH / 2 - 1, 0.5, z]} center>
            <div
              style={{
                color: METRIC_COLORS[i],
                fontSize: '11px',
                fontWeight: 'bold',
                pointerEvents: 'none',
                whiteSpace: 'nowrap',
                textShadow: '0 0 4px rgba(0,0,0,0.8)',
              }}
            >
              {name}
            </div>
          </Html>
        );
      })}

      {/* Peak markers with halos and beams */}
      {peaks.map((peak, i) => (
        <PeakMarker
          key={`peak-${i}`}
          peak={peak}
          selected={selectedMetric === peak.metric}
          hovered={hoveredPeak === i}
          onSelect={() => setSelectedMetric(selectedMetric === peak.metric ? null : peak.metric)}
          onHover={() => setHoveredPeak(i)}
          onUnhover={() => setHoveredPeak(null)}
        />
      ))}

      {/* Hover readout */}
      {hoverInfo && (
        <Html position={[hoverInfo.x, hoverInfo.y, hoverInfo.z]} center>
          <div
            style={{
              color: 'white',
              fontSize: '11px',
              background: 'rgba(0,0,0,0.8)',
              padding: '3px 6px',
              borderRadius: '3px',
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
            }}
          >
            {hoverInfo.metric}: {(hoverInfo.value * 100).toFixed(1)}%
          </div>
        </Html>
      )}

      {/* Instructions overlay (top-left) */}
      <Html fullscreen>
        <div style={{
          position: 'absolute', top: '16px', left: '16px',
          color: 'rgba(255,255,255,0.7)', fontSize: '11px',
          background: 'rgba(0,0,0,0.5)', padding: '10px 14px',
          borderRadius: '6px', lineHeight: '1.6',
          maxWidth: '220px', pointerEvents: 'none',
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: '4px', color: '#88bbff', fontSize: '12px' }}>Metric Terrain</div>
          <div>Performance metrics visualized as 3D terrain — height represents value, color represents intensity</div>
          <div style={{ marginTop: '4px', fontSize: '10px', opacity: 0.6 }}>
            Click a peak marker to zoom to that metric
          </div>
          <div style={{ fontSize: '10px', opacity: 0.6 }}>
            Hover terrain for values
          </div>
          <div style={{ fontSize: '10px', opacity: 0.6 }}>
            Watch the time cursor sweep across
          </div>
        </div>
      </Html>

      {/* Metric legend sidebar (right) */}
      <Html fullscreen>
        <div style={{
          position: 'absolute', top: '16px', right: '16px',
          color: 'white', fontSize: '11px',
          background: 'rgba(5,10,25,0.75)', padding: '10px 12px',
          borderRadius: '6px', maxWidth: '160px',
          pointerEvents: 'none', backdropFilter: 'blur(4px)',
          border: '1px solid rgba(100,150,255,0.15)',
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: '6px', color: '#88bbff', fontSize: '11px' }}>Metrics</div>
          {METRICS.map((name, i) => (
            <div key={name}
              onClick={() => setSelectedMetric(selectedMetric === i ? null : i)}
              style={{
                padding: '3px 6px', marginBottom: '1px', borderRadius: '3px',
                cursor: 'pointer', pointerEvents: 'auto',
                display: 'flex', alignItems: 'center', gap: '6px',
                color: selectedMetric === i ? '#fff' : METRIC_COLORS[i],
                background: selectedMetric === i ? 'rgba(255,255,255,0.12)' : 'transparent',
                fontSize: '10px', transition: 'background 0.2s',
              }}
              onMouseEnter={(e) => { (e.target as HTMLElement).style.background = 'rgba(255,255,255,0.08)'; }}
              onMouseLeave={(e) => { (e.target as HTMLElement).style.background = selectedMetric === i ? 'rgba(255,255,255,0.12)' : 'transparent'; }}
            >
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: METRIC_COLORS[i], flexShrink: 0 }} />
              {name}
            </div>
          ))}
          <div style={{ marginTop: '8px', borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: '6px', fontSize: '9px', color: 'rgba(255,255,255,0.4)' }}>
            Time cursor sweeps every 10 seconds
          </div>
        </div>
      </Html>
    </>
  );
}
