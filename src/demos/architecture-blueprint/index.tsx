import { useRef, useState, useMemo, useCallback, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three/webgpu';
import {
  mix,
  screenUV,
  vec3,
} from 'three/tsl';

/**
 * Architecture Blueprint
 *
 * System architecture diagram rendered as 3D floating platforms with
 * animated data flow particles. Click services to zoom in and see
 * details; hover to highlight connections.
 */

// ── Data ──

interface Service {
  id: string;
  label: string;
  type: 'frontend' | 'backend' | 'database' | 'cache' | 'cdn' | 'queue' | 'external';
  position: [number, number, number];
  color: string;
  hex: number;
  desc: string;
  tech: string;
}

interface DataFlow {
  from: string;
  to: string;
  label: string;
  protocol: string;
  color: string;
  hex: number;
}

// Tiered layout: Client → Edge → Services → Data (all z=0 for clean diagram)
const SERVICES: Service[] = [
  // Tier 1: Client
  { id: 'browser', label: 'Browser', type: 'frontend', position: [-4, 5, 0], color: '#61dafb', hex: 0x61dafb, desc: 'React SPA', tech: 'React + Vite' },
  // Tier 2: Edge
  { id: 'cdn', label: 'CDN', type: 'cdn', position: [-1, 3, 0], color: '#f38020', hex: 0xf38020, desc: 'Edge caching', tech: 'Cloudflare Pages' },
  { id: 'gateway', label: 'API Gateway', type: 'backend', position: [2, 3, 0], color: '#22cc88', hex: 0x22cc88, desc: 'Request routing', tech: 'Workers' },
  // Tier 3: Services
  { id: 'auth', label: 'Auth Service', type: 'backend', position: [-2, 1, 0], color: '#ff6644', hex: 0xff6644, desc: 'JWT + sessions', tech: 'Workers' },
  { id: 'api', label: 'API Server', type: 'backend', position: [1, 1, 0], color: '#4488ff', hex: 0x4488ff, desc: 'Business logic', tech: 'Workers' },
  { id: 'ai', label: 'AI Service', type: 'external', position: [4, 1, 0], color: '#cc44ff', hex: 0xcc44ff, desc: 'LLM inference', tech: 'Claude API' },
  { id: 'queue', label: 'Task Queue', type: 'queue', position: [6.5, 1, 0], color: '#ff4488', hex: 0xff4488, desc: 'Async jobs', tech: 'Queues' },
  // Tier 4: Data
  { id: 'db', label: 'Database', type: 'database', position: [-1, -1, 0], color: '#ffaa22', hex: 0xffaa22, desc: 'Relational data', tech: 'D1 (SQLite)' },
  { id: 'kv', label: 'KV Store', type: 'cache', position: [2, -1, 0], color: '#ff8844', hex: 0xff8844, desc: 'Session + config', tech: 'KV' },
  { id: 'storage', label: 'Object Store', type: 'database', position: [5, -1, 0], color: '#44cc88', hex: 0x44cc88, desc: 'Files + media', tech: 'R2' },
];

// Customer request trace path
const TRACE_PATH = ['browser', 'cdn', 'gateway', 'auth', 'api', 'db', 'api', 'ai', 'api', 'queue'];

const FLOWS: DataFlow[] = [
  { from: 'browser', to: 'cdn', label: 'Static assets', protocol: 'HTTPS', color: '#61dafb', hex: 0x61dafb },
  { from: 'browser', to: 'gateway', label: 'API calls', protocol: 'HTTPS', color: '#22cc88', hex: 0x22cc88 },
  { from: 'gateway', to: 'auth', label: 'Auth check', protocol: 'RPC', color: '#ff6644', hex: 0xff6644 },
  { from: 'gateway', to: 'api', label: 'Requests', protocol: 'RPC', color: '#4488ff', hex: 0x4488ff },
  { from: 'api', to: 'ai', label: 'Prompts', protocol: 'HTTPS', color: '#cc44ff', hex: 0xcc44ff },
  { from: 'api', to: 'db', label: 'Queries', protocol: 'SQL', color: '#ffaa22', hex: 0xffaa22 },
  { from: 'api', to: 'kv', label: 'Get/Set', protocol: 'KV API', color: '#ff8844', hex: 0xff8844 },
  { from: 'api', to: 'storage', label: 'Upload/Download', protocol: 'S3 API', color: '#44cc88', hex: 0x44cc88 },
  { from: 'api', to: 'queue', label: 'Enqueue', protocol: 'Queue API', color: '#ff4488', hex: 0xff4488 },
  { from: 'auth', to: 'kv', label: 'Sessions', protocol: 'KV API', color: '#ff6644', hex: 0xff6644 },
];

const serviceMap = new Map(SERVICES.map((s) => [s.id, s]));

// ── Helpers ──

function getConnectedFlows(serviceId: string): DataFlow[] {
  return FLOWS.filter((f) => f.from === serviceId || f.to === serviceId);
}

function getTypeColor(type: Service['type']): string {
  switch (type) {
    case 'frontend': return '#61dafb';
    case 'backend': return '#22cc88';
    case 'database': return '#ffaa22';
    case 'cache': return '#ff8844';
    case 'cdn': return '#f38020';
    case 'queue': return '#ff4488';
    case 'external': return '#cc44ff';
  }
}

// ── Simple Material Factories ──

/** Simple service material: just color + emissive, no TSL */
function makeSimpleServiceMaterial(hexColor: number) {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.color = new THREE.Color(hexColor);
  mat.emissive = new THREE.Color(hexColor);
  mat.emissiveIntensity = 0.6;
  mat.roughness = 0.3;
  mat.metalness = 0.5;
  return mat;
}

/** Simple halo shell for any service node */
function makeServiceHaloMaterial(hexColor: number) {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;
  mat.side = THREE.BackSide;
  mat.depthWrite = false;
  mat.blending = THREE.AdditiveBlending;
  mat.color = new THREE.Color(hexColor);
  mat.emissive = new THREE.Color(hexColor);
  mat.emissiveIntensity = 1.2;
  mat.opacity = 0.15;
  mat.roughness = 0.0;
  mat.metalness = 0.0;
  return mat;
}

function makeServiceMaterial(_type: Service['type'], hexColor: number) {
  return makeSimpleServiceMaterial(hexColor);
}

/** Simple connection tube material */
function makeConnectionMaterial(hexColor: number, isHighlighted: boolean) {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;

  if (isHighlighted) {
    mat.color = new THREE.Color(hexColor).multiplyScalar(0.3);
    mat.emissive = new THREE.Color(hexColor);
    mat.emissiveIntensity = 1.0;
    mat.opacity = 0.6;
  } else {
    mat.color = new THREE.Color(hexColor).multiplyScalar(0.08);
    mat.emissive = new THREE.Color(hexColor);
    mat.emissiveIntensity = 0.15;
    mat.opacity = 0.15;
  }

  mat.roughness = 0.3;
  mat.metalness = 0.2;

  return mat;
}

/** Simple dark blueprint grid floor material */
function makeBlueprintGridMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.color = new THREE.Color(0x010206);
  mat.emissive = new THREE.Color(0x030814);
  mat.emissiveIntensity = 0.3;
  mat.roughness = 0.8;
  mat.metalness = 0.3;

  return mat;
}

// ── Service Shape Component ──

function ServiceShape({ type }: { type: Service['type'] }) {
  switch (type) {
    case 'frontend':
      return <boxGeometry args={[1.6, 0.4, 1.0]} />;
    case 'backend':
      return <boxGeometry args={[0.9, 0.7, 0.9]} />;
    case 'database':
      return <cylinderGeometry args={[0.5, 0.5, 0.7, 16]} />;
    case 'cache':
      return <octahedronGeometry args={[0.45]} />;
    case 'cdn':
      return <cylinderGeometry args={[0.6, 0.6, 0.15, 16]} />;
    case 'queue':
      return <torusGeometry args={[0.35, 0.14, 8, 24]} />;
    case 'external':
      return <icosahedronGeometry args={[0.5]} />;
  }
}

// ── Service Node Component ──

function ServiceNode({
  service,
  isSelected,
  isHovered,
  isHighlighted,
  isDimmed,
  onSelect,
  onHover,
  index,
}: {
  service: Service;
  isSelected: boolean;
  isHovered: boolean;
  isHighlighted: boolean;
  isDimmed: boolean;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  index: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const groupRef = useRef<THREE.Group>(null);

  const serviceMat = useMemo(() => makeServiceMaterial(service.type, service.hex), [service.type, service.hex]);

  // Dim material overlay for non-connected services when something is selected
  const dimMat = useMemo(() => {
    if (!isDimmed) return null;
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.transparent = true;
    mat.color = new THREE.Color(service.hex).multiplyScalar(0.05);
    mat.emissive = new THREE.Color(service.hex);
    mat.emissiveIntensity = 0.05;
    mat.opacity = 0.4;
    mat.roughness = 0.8;
    mat.metalness = 0.2;
    return mat;
  }, [service.hex, isDimmed]);

  const haloMat = useMemo(() => makeServiceHaloMaterial(service.hex), [service.hex]);

  const typeColor = useMemo(() => getTypeColor(service.type), [service.type]);

  useFrame((_, delta) => {
    if (groupRef.current) {
      const t = (groupRef.current.userData.t || 0) + delta;
      groupRef.current.userData.t = t;
      groupRef.current.position.y = service.position[1] + Math.sin(t * 0.8 + index * 1.7) * 0.1;
    }
    if (meshRef.current && isSelected) {
      const t = groupRef.current?.userData.t || 0;
      const s = 1.0 + Math.sin(t * 3) * 0.05;
      meshRef.current.scale.setScalar(s);
    } else if (meshRef.current) {
      meshRef.current.scale.setScalar(1.0);
    }
  });

  const activeMat = isDimmed && dimMat ? dimMat : serviceMat;

  return (
    <group ref={groupRef} position={[service.position[0], service.position[1], service.position[2]]}>
      <mesh
        ref={meshRef}
        material={activeMat}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(service.id);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHover(service.id);
        }}
        onPointerOut={() => onHover(null)}
      >
        <ServiceShape type={service.type} />
      </mesh>

      {/* Platform base */}
      <mesh position={[0, -0.45, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.7, 24]} />
        <meshStandardNodeMaterial
          transparent
          opacity={isDimmed ? 0.05 : 0.15}
          color={new THREE.Color(service.hex).multiplyScalar(0.3)}
          emissive={new THREE.Color(service.hex)}
          emissiveIntensity={isDimmed ? 0.05 : 0.3}
        />
      </mesh>

      {/* Halo shell */}
      {!isDimmed && (
        <mesh material={haloMat} scale={[1.25, 1.25, 1.25]}>
          <ServiceShape type={service.type} />
        </mesh>
      )}

      {/* Service label */}
      <Html position={[0, 0.9, 0]} center>
        <div
          style={{
            color: 'white',
            fontSize: '11px',
            background: isDimmed ? 'rgba(0,0,0,0.4)' : 'rgba(5,10,25,0.9)',
            padding: '4px 10px',
            borderRadius: '4px',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            borderLeft: `3px solid ${typeColor}`,
            fontWeight: isSelected ? 'bold' : 'normal',
            opacity: isDimmed ? 0.25 : 1,
            transform: 'translateY(-100%)',
            boxShadow: isSelected ? `0 0 12px ${typeColor}40` : 'none',
            transition: 'opacity 0.3s, box-shadow 0.3s',
          }}
        >
          <div style={{ fontSize: '10px', fontWeight: 'bold', letterSpacing: '0.3px' }}>{service.label}</div>
          <div style={{ fontSize: '8px', opacity: 0.5, marginTop: '1px' }}>{service.tech}</div>
        </div>
      </Html>

      {/* Point light at service */}
      <pointLight
        color={service.color}
        intensity={isSelected ? 2.5 : isHovered ? 1.5 : isHighlighted ? 0.8 : isDimmed ? 0.05 : 0.4}
        distance={isSelected ? 7 : 5}
      />
    </group>
  );
}

// ── Connection Pipe Component ──

function ConnectionPipe({
  flow,
  isHighlighted,
}: {
  flow: DataFlow;
  isHighlighted: boolean;
}) {
  const fromService = serviceMap.get(flow.from)!;
  const toService = serviceMap.get(flow.to)!;
  const from = new THREE.Vector3(...fromService.position);
  const to = new THREE.Vector3(...toService.position);

  const mid = new THREE.Vector3().lerpVectors(from, to, 0.5);
  const dir = new THREE.Vector3().subVectors(to, from);
  const length = dir.length();
  dir.normalize();

  const up = new THREE.Vector3(0, 1, 0);
  const quat = new THREE.Quaternion().setFromUnitVectors(up, dir);
  const radius = isHighlighted ? 0.07 : 0.035;

  const pipeMat = useMemo(
    () => makeConnectionMaterial(flow.hex, isHighlighted),
    [flow.hex, isHighlighted],
  );

  // Glow pipe (larger, more transparent) when highlighted
  const glowMat = useMemo(() => {
    if (!isHighlighted) return null;
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.transparent = true;
    mat.depthWrite = false;
    mat.blending = THREE.AdditiveBlending;
    mat.color = new THREE.Color(flow.hex);
    mat.emissive = new THREE.Color(flow.hex);
    mat.emissiveIntensity = 1.5;
    mat.opacity = 0.15;
    return mat;
  }, [flow.hex, isHighlighted]);

  return (
    <group>
      <mesh position={mid} quaternion={quat} material={pipeMat}>
        <cylinderGeometry args={[radius, radius, length, 6]} />
      </mesh>
      {isHighlighted && glowMat && (
        <mesh position={mid} quaternion={quat} material={glowMat}>
          <cylinderGeometry args={[radius * 3, radius * 3, length, 8]} />
        </mesh>
      )}
    </group>
  );
}

// ── Flow Particles (instanced for performance) ──

const PARTICLES_PER_FLOW = 12;
const TOTAL_PARTICLES = FLOWS.length * PARTICLES_PER_FLOW;

function FlowParticles({
  hoveredService,
  selectedService,
}: {
  hoveredService: string | null;
  selectedService: string | null;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const colorsRef = useRef<Float32Array | null>(null);

  const flowData = useMemo(() => {
    return FLOWS.map((flow) => {
      const fromService = serviceMap.get(flow.from)!;
      const toService = serviceMap.get(flow.to)!;
      return {
        from: new THREE.Vector3(...fromService.position),
        to: new THREE.Vector3(...toService.position),
        color: new THREE.Color(flow.color),
        flow,
      };
    });
  }, []);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const colors = new Float32Array(TOTAL_PARTICLES * 3);
    for (let fi = 0; fi < flowData.length; fi++) {
      const c = flowData[fi].color;
      for (let pi = 0; pi < PARTICLES_PER_FLOW; pi++) {
        const idx = (fi * PARTICLES_PER_FLOW + pi) * 3;
        colors[idx] = c.r;
        colors[idx + 1] = c.g;
        colors[idx + 2] = c.b;
      }
    }
    colorsRef.current = colors;
    mesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
  }, [flowData]);

  // Simple particle material: additive glow
  const particleMat = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.transparent = true;
    mat.depthWrite = false;
    mat.blending = THREE.AdditiveBlending;
    mat.color = new THREE.Color(0xffffff);
    mat.emissive = new THREE.Color(0xffffff);
    mat.emissiveIntensity = 2.5;
    mat.roughness = 0.0;
    mat.metalness = 0.0;

    return mat;
  }, []);

  const active = hoveredService ?? selectedService;

  useFrame((state) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const currentTime = state.clock.elapsedTime;
    const dummy = new THREE.Object3D();

    for (let fi = 0; fi < flowData.length; fi++) {
      const { from, to, flow } = flowData[fi];
      const isHighlighted = active !== null &&
        (flow.from === active || flow.to === active);
      const scale = isHighlighted ? 0.08 : 0.05;

      for (let pi = 0; pi < PARTICLES_PER_FLOW; pi++) {
        const idx = fi * PARTICLES_PER_FLOW + pi;
        // Add speed variation per particle
        const speedMul = 0.4 + (pi % 3) * 0.15;
        const t = ((currentTime * speedMul + pi / PARTICLES_PER_FLOW) % 1.0);

        const floatOffset = Math.sin(currentTime * 0.8 + fi * 1.7) * 0.1;

        dummy.position.lerpVectors(from, to, t);
        dummy.position.y += floatOffset * (1 - Math.abs(t - 0.5) * 2);
        dummy.scale.setScalar(scale);
        dummy.updateMatrix();
        mesh.setMatrixAt(idx, dummy.matrix);
      }
    }

    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, TOTAL_PARTICLES]} material={particleMat}>
      <sphereGeometry args={[1, 6, 6]} />
    </instancedMesh>
  );
}

// ── Detail Panel ──

function DetailPanel({
  service,
  connectedFlows,
}: {
  service: Service;
  connectedFlows: DataFlow[];
}) {
  return (
    <Html position={[service.position[0], service.position[1] + 1.8, service.position[2]]} center>
      <div
        style={{
          color: 'white',
          fontSize: '11px',
          background: 'rgba(5, 10, 25, 0.95)',
          padding: '12px 16px',
          borderRadius: '8px',
          pointerEvents: 'none',
          border: `1px solid ${service.color}55`,
          borderLeft: `3px solid ${service.color}`,
          minWidth: '170px',
          maxWidth: '230px',
          boxShadow: `0 4px 24px rgba(0,0,0,0.5), 0 0 20px ${service.color}15`,
          backdropFilter: 'blur(8px)',
        }}
      >
        <div style={{ fontWeight: 'bold', fontSize: '13px', marginBottom: '4px', color: service.color }}>
          {service.label}
        </div>
        <div style={{ opacity: 0.7, marginBottom: '6px' }}>{service.desc}</div>
        <div style={{ fontSize: '10px', opacity: 0.5, marginBottom: '6px' }}>Tech: {service.tech}</div>
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: '6px' }}>
          <div style={{ fontWeight: 'bold', fontSize: '10px', marginBottom: '3px' }}>Connections:</div>
          {connectedFlows.map((f, i) => {
            const direction = f.from === service.id ? '->' : '<-';
            const other = f.from === service.id ? f.to : f.from;
            const otherService = serviceMap.get(other)!;
            return (
              <div key={i} style={{ fontSize: '9px', opacity: 0.8, marginBottom: '1px' }}>
                {direction} {otherService.label}: {f.label} ({f.protocol})
              </div>
            );
          })}
        </div>
      </div>
    </Html>
  );
}

// ── Blueprint Grid Floor ──

function BlueprintGridFloor() {
  const gridMat = useMemo(() => makeBlueprintGridMaterial(), []);

  // Grid line material
  const lineMat = useMemo(() => {
    const mat = new THREE.MeshBasicNodeMaterial();
    mat.transparent = true;
    mat.opacity = 0.12;
    mat.color = new THREE.Color(0x4488cc);
    return mat;
  }, []);

  const majorLineMat = useMemo(() => {
    const mat = new THREE.MeshBasicNodeMaterial();
    mat.transparent = true;
    mat.opacity = 0.25;
    mat.color = new THREE.Color(0x4488cc);
    return mat;
  }, []);

  // Generate grid lines
  const gridLines = useMemo(() => {
    const lines: { pos: [number, number, number]; rot: [number, number, number]; size: [number, number]; isMajor: boolean }[] = [];
    const span = 20;
    const step = 1;

    for (let i = -span; i <= span; i += step) {
      const isMajor = i % 5 === 0;
      // Horizontal lines (along X)
      lines.push({ pos: [0, -2.49, i], rot: [0, 0, 0], size: [span * 2, isMajor ? 0.03 : 0.015], isMajor });
      // Vertical lines (along Z)
      lines.push({ pos: [i, -2.49, 0], rot: [0, Math.PI / 2, 0], size: [span * 2, isMajor ? 0.03 : 0.015], isMajor });
    }
    return lines;
  }, []);

  return (
    <>
      <mesh position={[0, -2.5, 0]} rotation={[-Math.PI / 2, 0, 0]} material={gridMat}>
        <planeGeometry args={[40, 40]} />
      </mesh>
      {gridLines.map((line, i) => (
        <mesh key={i} position={line.pos} rotation={[-Math.PI / 2, line.rot[1], 0]} material={line.isMajor ? majorLineMat : lineMat}>
          <planeGeometry args={line.size} />
        </mesh>
      ))}
    </>
  );
}

// ── Main Component ──

// ── Trace Request Ball ──

const TRAIL_COUNT = 8;

function TraceRequestBall({ traceStep, traceProgress }: { traceStep: number; traceProgress: number }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const trailRef = useRef<THREE.InstancedMesh>(null);
  const historyRef = useRef<THREE.Vector3[]>([]);

  const mat = useMemo(() => {
    const m = new THREE.MeshStandardNodeMaterial();
    m.transparent = true;
    m.depthWrite = false;
    m.blending = THREE.AdditiveBlending;
    m.color = new THREE.Color(0xffee44);
    m.emissive = new THREE.Color(0xffee44);
    m.emissiveIntensity = 4.0;
    return m;
  }, []);

  const haloMat = useMemo(() => {
    const m = new THREE.MeshStandardNodeMaterial();
    m.transparent = true;
    m.side = THREE.BackSide;
    m.depthWrite = false;
    m.blending = THREE.AdditiveBlending;
    m.color = new THREE.Color(0xffcc22);
    m.emissive = new THREE.Color(0xffcc22);
    m.emissiveIntensity = 2.0;
    m.opacity = 0.3;
    return m;
  }, []);

  const trailMat = useMemo(() => {
    const m = new THREE.MeshBasicNodeMaterial();
    m.transparent = true;
    m.depthWrite = false;
    m.blending = THREE.AdditiveBlending;
    m.color = new THREE.Color(0xffcc44);
    m.opacity = 0.5;
    return m;
  }, []);

  if (traceStep >= TRACE_PATH.length - 1) return null;

  const fromId = TRACE_PATH[traceStep];
  const toId = TRACE_PATH[traceStep + 1];
  const fromS = serviceMap.get(fromId)!;
  const toS = serviceMap.get(toId)!;
  const x = fromS.position[0] + (toS.position[0] - fromS.position[0]) * traceProgress;
  const y = fromS.position[1] + (toS.position[1] - fromS.position[1]) * traceProgress;
  const z = fromS.position[2] + (toS.position[2] - fromS.position[2]) * traceProgress;

  // Update trail history
  const pos = new THREE.Vector3(x, y, z);
  if (historyRef.current.length === 0 || historyRef.current[historyRef.current.length - 1].distanceTo(pos) > 0.15) {
    historyRef.current.push(pos.clone());
    if (historyRef.current.length > TRAIL_COUNT) historyRef.current.shift();
  }

  // Update trail instances
  const trail = trailRef.current;
  if (trail) {
    const dummy = new THREE.Object3D();
    for (let i = 0; i < TRAIL_COUNT; i++) {
      if (i < historyRef.current.length) {
        const hp = historyRef.current[i];
        const age = 1 - i / historyRef.current.length;
        dummy.position.copy(hp);
        dummy.scale.setScalar(0.08 * age);
        dummy.updateMatrix();
        trail.setMatrixAt(i, dummy.matrix);
      } else {
        dummy.scale.setScalar(0);
        dummy.updateMatrix();
        trail.setMatrixAt(i, dummy.matrix);
      }
    }
    trail.instanceMatrix.needsUpdate = true;
  }

  return (
    <>
      <group position={[x, y, z]}>
        <mesh ref={meshRef} material={mat}>
          <sphereGeometry args={[0.15, 12, 8]} />
        </mesh>
        <mesh material={haloMat} scale={[2.5, 2.5, 2.5]}>
          <sphereGeometry args={[0.15, 8, 6]} />
        </mesh>
        <pointLight color="#ffee44" intensity={4} distance={5} />
      </group>
      <instancedMesh ref={trailRef} args={[undefined, undefined, TRAIL_COUNT]} material={trailMat}>
        <sphereGeometry args={[1, 6, 6]} />
      </instancedMesh>
    </>
  );
}

// ── Tier Labels ──

function TierLabels() {
  const tiers = [
    { label: 'CLIENT', y: 5 },
    { label: 'EDGE', y: 3 },
    { label: 'SERVICES', y: 1 },
    { label: 'DATA', y: -1 },
  ];

  // Separator lines between tiers
  const separatorY = [4, 2, 0]; // between client-edge, edge-services, services-data

  const sepMat = useMemo(() => {
    const mat = new THREE.MeshBasicNodeMaterial();
    mat.transparent = true;
    mat.opacity = 0.08;
    mat.color = new THREE.Color(0x4488cc);
    return mat;
  }, []);

  return (
    <>
      {tiers.map((t) => (
        <Html key={t.label} position={[-7.5, t.y, 0]} center>
          <div style={{
            color: 'rgba(100,160,220,0.5)', fontSize: '10px', fontWeight: 'bold',
            letterSpacing: '3px', whiteSpace: 'nowrap', pointerEvents: 'none',
            textShadow: '0 0 8px rgba(68,136,204,0.3)',
          }}>
            {t.label}
          </div>
        </Html>
      ))}
      {separatorY.map((y) => (
        <mesh key={y} position={[1, y, 0]} rotation={[0, 0, 0]}>
          <planeGeometry args={[18, 0.01]} />
          <primitive object={sepMat} attach="material" />
        </mesh>
      ))}
    </>
  );
}

// ── Background Stars ──

function BackgroundStars() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const COUNT = 150;

  const starMat = useMemo(() => {
    const mat = new THREE.MeshBasicNodeMaterial();
    mat.transparent = true;
    mat.depthWrite = false;
    mat.color = new THREE.Color(0x6688cc);
    mat.opacity = 0.6;
    return mat;
  }, []);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < COUNT; i++) {
      const angle = Math.random() * Math.PI * 2;
      const elev = (Math.random() - 0.3) * Math.PI * 0.5;
      const r = 25 + Math.random() * 10;
      dummy.position.set(
        Math.cos(angle) * Math.cos(elev) * r,
        Math.sin(elev) * r + 5,
        Math.sin(angle) * Math.cos(elev) * r
      );
      dummy.scale.setScalar(0.02 + Math.random() * 0.04);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, []);

  useFrame((state) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const t = state.clock.elapsedTime;
    const dummy = new THREE.Object3D();
    const mat = new THREE.Matrix4();
    for (let i = 0; i < COUNT; i++) {
      mesh.getMatrixAt(i, mat);
      dummy.position.setFromMatrixPosition(mat);
      // Subtle twinkle
      const twinkle = 0.5 + Math.sin(t * 1.5 + i * 7.3) * 0.5;
      const baseScale = 0.02 + (i % 10) * 0.004;
      dummy.scale.setScalar(baseScale * (0.5 + twinkle * 0.5));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, COUNT]} material={starMat}>
      <sphereGeometry args={[1, 4, 4]} />
    </instancedMesh>
  );
}

// ── Main Component ──

export default function ArchitectureBlueprint() {
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [hoveredService, setHoveredService] = useState<string | null>(null);
  const [traceActive, setTraceActive] = useState(false);
  const [traceStep, setTraceStep] = useState(0);
  const [traceProgress, setTraceProgress] = useState(0);
  const timeRef = useRef(0);
  const targetPos = useRef(new THREE.Vector3(1, 3.5, 20));
  const targetLookAt = useRef(new THREE.Vector3(1, 1.5, 0));
  const { camera } = useThree();

  const handleSelect = useCallback(
    (id: string) => {
      if (selectedService === id) {
        setSelectedService(null);
        targetPos.current.set(1, 2.5, 16);
        targetLookAt.current.set(1, 1.5, 0);
      } else {
        setSelectedService(id);
        const s = serviceMap.get(id)!;
        targetPos.current.set(s.position[0] + 1.5, s.position[1] + 2.5, s.position[2] + 9);
        targetLookAt.current.set(s.position[0], s.position[1], s.position[2]);
      }
    },
    [selectedService],
  );

  const handleEmptyClick = useCallback(() => {
    setSelectedService(null);
    targetPos.current.set(1, 2.5, 16);
    targetLookAt.current.set(1, 1.5, 0);
  }, []);

  const handleTraceRequest = useCallback(() => {
    setTraceActive(true);
    setTraceStep(0);
    setTraceProgress(0);
    setSelectedService(null);
    targetPos.current.set(1, 2.5, 16);
    targetLookAt.current.set(1, 1.5, 0);
  }, []);

  const connectedFlows = useMemo(() => {
    if (!selectedService) return [];
    return getConnectedFlows(selectedService);
  }, [selectedService]);

  const highlightedServiceIds = useMemo(() => {
    const active = hoveredService ?? selectedService;
    if (!active) return new Set<string>();
    const ids = new Set<string>();
    ids.add(active);
    for (const f of FLOWS) {
      if (f.from === active) ids.add(f.to);
      if (f.to === active) ids.add(f.from);
    }
    return ids;
  }, [hoveredService, selectedService]);

  const highlightedFlows = useMemo(() => {
    const active = hoveredService ?? selectedService;
    if (!active) return new Set<number>();
    const indices = new Set<number>();
    FLOWS.forEach((f, i) => {
      if (f.from === active || f.to === active) indices.add(i);
    });
    return indices;
  }, [hoveredService, selectedService]);

  // Determine if we should dim non-connected services
  const activeContext = hoveredService ?? selectedService;
  const shouldDim = activeContext !== null;

  // Background material (exception: simple screenUV gradient allowed)
  const bgMat = useMemo(() => {
    const mat = new THREE.MeshBasicNodeMaterial();
    mat.side = THREE.BackSide;
    const bottom = vec3(0.01, 0.015, 0.04);
    const top = vec3(0.0, 0.0, 0.015);
    mat.colorNode = mix(bottom, top, screenUV.y);
    return mat;
  }, []);

  // Background click plane material
  const bgClickMat = useMemo(() => {
    const mat = new THREE.MeshBasicNodeMaterial();
    mat.transparent = true;
    mat.opacity = 0.0;
    return mat;
  }, []);

  const currentLookAt = useRef(new THREE.Vector3(1, 2, 0));

  useFrame((_, delta) => {
    timeRef.current += delta;

    // Trace animation
    if (traceActive) {
      setTraceProgress((prev) => {
        const next = prev + delta * 1.2; // ~0.8s per segment
        if (next >= 1) {
          const nextStep = traceStep + 1;
          if (nextStep >= TRACE_PATH.length - 1) {
            setTraceActive(false);
            setTraceStep(0);
            return 0;
          }
          setTraceStep(nextStep);
          return 0;
        }
        return next;
      });
    }

    camera.position.lerp(targetPos.current, 0.04);
    currentLookAt.current.lerp(targetLookAt.current, 0.04);
    camera.lookAt(currentLookAt.current);
  });

  return (
    <>
      {/* Blue-tinted ambient for holographic atmosphere */}
      <ambientLight intensity={0.12} color={0x334466} />
      <directionalLight position={[5, 12, 8]} intensity={0.5} color={0x6688cc} />
      <directionalLight position={[-5, 5, -5]} intensity={0.15} color={0x4466aa} />
      {/* Subtle colored fill lights for depth */}
      <pointLight position={[-6, 6, 4]} intensity={1.5} color={0x2244aa} distance={20} />
      <pointLight position={[8, 0, 4]} intensity={1.0} color={0x224488} distance={18} />

      {/* Background atmosphere */}
      <mesh material={bgMat}>
        <sphereGeometry args={[35, 16, 16]} />
      </mesh>

      {/* Background stars */}
      <BackgroundStars />

      {/* Click background to deselect */}
      <mesh position={[0, 2, -5]} material={bgClickMat} onClick={handleEmptyClick}>
        <planeGeometry args={[40, 30]} />
      </mesh>

      {/* Blueprint grid floor */}
      <BlueprintGridFloor />

      {/* Tier labels */}
      <TierLabels />

      {/* Service nodes */}
      {SERVICES.map((service, i) => (
        <ServiceNode
          key={service.id}
          service={service}
          isSelected={selectedService === service.id}
          isHovered={hoveredService === service.id}
          isHighlighted={highlightedServiceIds.has(service.id)}
          isDimmed={shouldDim && !highlightedServiceIds.has(service.id)}
          onSelect={handleSelect}
          onHover={setHoveredService}
          index={i}
        />
      ))}

      {/* Connection pipes */}
      {FLOWS.map((flow, i) => (
        <ConnectionPipe
          key={`${flow.from}-${flow.to}`}
          flow={flow}
          isHighlighted={highlightedFlows.has(i)}
        />
      ))}

      {/* Data flow particles */}
      <FlowParticles
        hoveredService={hoveredService}
        selectedService={selectedService}
      />

      {/* Trace request ball */}
      {traceActive && (
        <TraceRequestBall traceStep={traceStep} traceProgress={traceProgress} />
      )}

      {/* Detail panel for selected service */}
      {selectedService && (
        <DetailPanel
          service={serviceMap.get(selectedService)!}
          connectedFlows={connectedFlows}
        />
      )}

      {/* Instructions overlay (top-left) */}
      <Html fullscreen>
        <div style={{
          position: 'absolute', top: '16px', left: '16px',
          color: 'rgba(255,255,255,0.75)', fontSize: '11px',
          background: 'rgba(5,10,25,0.75)', padding: '12px 16px',
          borderRadius: '8px', lineHeight: '1.7',
          maxWidth: '200px', pointerEvents: 'none',
          border: '1px solid rgba(68,136,204,0.15)',
          backdropFilter: 'blur(4px)',
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: '6px', color: '#88bbff', fontSize: '13px', letterSpacing: '0.5px' }}>System Architecture</div>
          <div style={{ opacity: 0.8 }}>Click a service to inspect</div>
          <div style={{ opacity: 0.8 }}>Hover to see connections</div>
          <div style={{ marginTop: '6px', fontSize: '10px', opacity: 0.5, borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '6px' }}>
            Use sidebar to navigate
          </div>
        </div>
      </Html>

      {/* Service list sidebar (right) */}
      <Html fullscreen>
        <div style={{
          position: 'absolute', top: '16px', right: '16px',
          color: 'white', fontSize: '11px',
          background: 'rgba(5,10,25,0.75)', padding: '10px 12px',
          borderRadius: '6px', maxWidth: '150px',
          pointerEvents: 'none', backdropFilter: 'blur(4px)',
          border: '1px solid rgba(100,150,255,0.15)',
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: '6px', color: '#88bbff', fontSize: '11px' }}>Services</div>
          {SERVICES.map(s => (
            <div key={s.id}
              onClick={() => handleSelect(s.id)}
              style={{
                padding: '2px 6px', marginBottom: '1px', borderRadius: '3px',
                cursor: 'pointer', pointerEvents: 'auto',
                color: selectedService === s.id ? '#fff' : s.color,
                background: selectedService === s.id ? 'rgba(255,255,255,0.12)' : 'transparent',
                fontSize: '10px', transition: 'background 0.2s',
              }}
              onMouseEnter={(e) => { (e.target as HTMLElement).style.background = 'rgba(255,255,255,0.08)'; }}
              onMouseLeave={(e) => { (e.target as HTMLElement).style.background = selectedService === s.id ? 'rgba(255,255,255,0.12)' : 'transparent'; }}
            >
              {s.label}
            </div>
          ))}
          <div style={{ marginTop: '8px', borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: '8px' }}>
            <div
              onClick={handleTraceRequest}
              style={{
                padding: '5px 8px', background: traceActive ? '#ff884433' : '#4488ff22',
                borderRadius: '4px', cursor: 'pointer', pointerEvents: 'auto',
                textAlign: 'center', fontWeight: 'bold', fontSize: '10px',
                color: traceActive ? '#ffaa44' : '#88bbff',
                border: `1px solid ${traceActive ? '#ff884444' : '#4488ff33'}`,
              }}
            >
              {traceActive ? `Tracing... ${TRACE_PATH[Math.min(traceStep, TRACE_PATH.length - 1)]}` : 'Trace Request'}
            </div>
          </div>
        </div>
      </Html>
    </>
  );
}
