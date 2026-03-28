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
 */

// ── Data ──

const METRICS = ['CPU Usage', 'Memory', 'Requests/s', 'Error Rate'];
const TIME_POINTS = 20;
const METRIC_COLORS = ['#4488ff', '#22cc88', '#ffaa22', '#ff4466'];
const METRIC_COLORS_THREE = METRIC_COLORS.map((c) => new THREE.Color(c));

function generateMetricData(): number[][] {
  const data: number[][] = [];
  // Use a seeded approach for stable data
  const seeds = [0.45, 0.35, 0.55, 0.2];
  for (let m = 0; m < METRICS.length; m++) {
    const series: number[] = [];
    let value = seeds[m];
    for (let t = 0; t < TIME_POINTS; t++) {
      // Deterministic pseudo-random using sin
      const pseudo = Math.sin(m * 137.5 + t * 43.7) * 0.5 + 0.5;
      value += (pseudo - 0.48) * 0.1;
      value = Math.max(0.05, Math.min(1.0, value));
      // Add occasional spikes
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

function buildTerrainGeometry(data: number[][]): { geometry: THREE.BufferGeometry; vertexColors: Float32Array } {
  const segsX = (TIME_POINTS - 1) * SUBDIVS_PER_UNIT_X;
  const segsZ = (METRICS.length - 1) * SUBDIVS_PER_UNIT_Z;

  const geo = new THREE.PlaneGeometry(TERRAIN_WIDTH, TERRAIN_DEPTH, segsX, segsZ);
  geo.rotateX(-Math.PI / 2);

  const posAttr = geo.getAttribute('position');
  const vertexCount = posAttr.count;
  const colors = new Float32Array(vertexCount * 3);

  for (let i = 0; i < vertexCount; i++) {
    const x = posAttr.getX(i);
    const z = posAttr.getZ(i);

    // Map x to time (0 to TIME_POINTS-1)
    const tNorm = (x + TERRAIN_WIDTH / 2) / TERRAIN_WIDTH;
    const tExact = tNorm * (TIME_POINTS - 1);
    const tIdx = Math.min(Math.floor(tExact), TIME_POINTS - 2);
    const tFrac = tExact - tIdx;

    // Map z to metric (0 to METRICS.length-1)
    const mNorm = (z + TERRAIN_DEPTH / 2) / TERRAIN_DEPTH;
    const mExact = mNorm * (METRICS.length - 1);
    const mIdx = Math.min(Math.floor(mExact), METRICS.length - 2);
    const mFrac = mExact - mIdx;

    // Bilinear cosine interpolation of data values
    const v00 = data[mIdx][tIdx];
    const v01 = data[mIdx][tIdx + 1];
    const v10 = data[mIdx + 1][tIdx];
    const v11 = data[mIdx + 1][tIdx + 1];

    const vTop = cosineInterp(v00, v01, tFrac);
    const vBot = cosineInterp(v10, v11, tFrac);
    const value = cosineInterp(vTop, vBot, mFrac);

    const y = value * MAX_HEIGHT;
    posAttr.setY(i, y);

    // Color: blend between metric colors based on z position
    const c1 = METRIC_COLORS_THREE[mIdx];
    const c2 = METRIC_COLORS_THREE[mIdx + 1];
    const blended = new THREE.Color().lerpColors(c1, c2, mFrac);

    // Darken or brighten based on height
    const heightFactor = 0.4 + value * 0.8;
    blended.multiplyScalar(heightFactor);

    colors[i * 3] = blended.r;
    colors[i * 3 + 1] = blended.g;
    colors[i * 3 + 2] = blended.b;
  }

  posAttr.needsUpdate = true;
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  return { geometry: geo, vertexColors: colors };
}

// ── Time cursor plane ──

function TimeCursor() {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const t = clock.getElapsedTime();
    const progress = (t % 10) / 10; // 10-second loop
    const x = progress * TERRAIN_WIDTH - TERRAIN_WIDTH / 2;
    meshRef.current.position.x = x;
  });

  return (
    <mesh ref={meshRef} position={[0, MAX_HEIGHT / 2 + 0.5, 0]}>
      <planeGeometry args={[0.05, MAX_HEIGHT + 2, 1, 1]} />
      <meshBasicMaterial
        color="#ffffff"
        transparent
        opacity={0.3}
        side={THREE.DoubleSide}
      />
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
      <primitive object={new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: '#ffffff', linewidth: 2 }))} ref={lineRef} />
    </group>
  );
}

// ── Grid floor ──

function GridFloor() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
      <planeGeometry args={[24, 16]} />
      <meshStandardMaterial
        color="#111122"
        roughness={0.9}
        metalness={0.1}
      />
    </mesh>
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

// ── Peak marker ──

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

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const t = clock.getElapsedTime();
    // Gentle pulse
    const pulse = Math.sin(t * 2 + peak.metric * 1.5) * 0.05 + 1.0;
    const baseScale = selected ? 1.4 : hovered ? 1.2 : 1.0;
    meshRef.current.scale.setScalar(baseScale * pulse);

    const mat = meshRef.current.material as THREE.MeshStandardMaterial;
    mat.emissiveIntensity = selected ? 2.5 : hovered ? 1.8 : 1.0;
  });

  return (
    <group position={[peak.position.x, peak.position.y + 0.3, peak.position.z]}>
      <mesh
        ref={meshRef}
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
        <meshStandardMaterial
          color={metricColor}
          emissive={metricColor}
          emissiveIntensity={1.0}
          roughness={0.2}
          metalness={0.5}
        />
      </mesh>

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
      // Side view of the metric's ridge
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

  return (
    <mesh
      ref={meshRef}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, MAX_HEIGHT + 0.01, 0]}
      onPointerMove={(e) => {
        if (!e.point) return;
        const x = e.point.x;
        const z = e.point.z;

        // Map to data indices
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
      <meshBasicMaterial transparent opacity={0} side={THREE.DoubleSide} />
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
  const terrainResult = useMemo(() => buildTerrainGeometry(data), [data]);

  const handleBackgroundClick = useCallback(() => {
    setSelectedMetric(null);
  }, []);

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.2} />
      <directionalLight position={[5, 10, 5]} intensity={1.0} castShadow />
      <directionalLight position={[-3, 8, -4]} intensity={0.4} />

      {/* Camera controller */}
      <CameraController selectedMetric={selectedMetric} />

      {/* Background click target */}
      <mesh position={[0, -5, 0]} rotation={[-Math.PI / 2, 0, 0]} onClick={handleBackgroundClick}>
        <planeGeometry args={[60, 60]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>

      {/* Grid floor */}
      <GridFloor />

      {/* Terrain mesh */}
      <mesh geometry={terrainResult.geometry} onClick={handleBackgroundClick}>
        <meshStandardMaterial
          vertexColors
          roughness={0.6}
          metalness={0.2}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Terrain hover target (invisible plane above terrain) */}
      <TerrainHoverTarget data={data} onHoverInfo={setHoverInfo} />

      {/* Time cursor */}
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

      {/* Peak markers */}
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

      {/* Legend */}
      <Html position={[TERRAIN_WIDTH / 2 + 2, MAX_HEIGHT + 1, 0]} center>
        <div
          style={{
            color: 'white',
            fontSize: '11px',
            background: 'rgba(0,0,0,0.8)',
            padding: '8px 12px',
            borderRadius: '6px',
            pointerEvents: 'none',
          }}
        >
          <div style={{ fontWeight: 'bold', marginBottom: '6px', fontSize: '12px' }}>Metrics</div>
          {METRICS.map((name, i) => (
            <div
              key={name}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                marginBottom: '2px',
              }}
            >
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: METRIC_COLORS[i],
                }}
              />
              <span>{name}</span>
            </div>
          ))}
        </div>
      </Html>
    </>
  );
}
