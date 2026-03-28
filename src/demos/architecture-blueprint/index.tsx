import { useRef, useState, useMemo, useCallback, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three/webgpu';

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
  desc: string;
  tech: string;
}

interface DataFlow {
  from: string;
  to: string;
  label: string;
  protocol: string;
  color: string;
}

const SERVICES: Service[] = [
  { id: 'browser', label: 'Browser', type: 'frontend', position: [-6, 4, 0], color: '#61dafb', desc: 'React SPA', tech: 'React + Vite' },
  { id: 'cdn', label: 'CDN', type: 'cdn', position: [-3, 4, 0], color: '#f38020', desc: 'Edge caching', tech: 'Cloudflare Pages' },
  { id: 'gateway', label: 'API Gateway', type: 'backend', position: [0, 4, 0], color: '#22cc88', desc: 'Request routing', tech: 'Workers' },
  { id: 'auth', label: 'Auth Service', type: 'backend', position: [-3, 1, 2], color: '#ff6644', desc: 'JWT + sessions', tech: 'Workers' },
  { id: 'api', label: 'API Server', type: 'backend', position: [0, 1, 0], color: '#4488ff', desc: 'Business logic', tech: 'Workers' },
  { id: 'ai', label: 'AI Service', type: 'external', position: [3, 1, -2], color: '#cc44ff', desc: 'LLM inference', tech: 'Claude API' },
  { id: 'db', label: 'Database', type: 'database', position: [-2, -2, 0], color: '#ffaa22', desc: 'Relational data', tech: 'D1 (SQLite)' },
  { id: 'kv', label: 'KV Store', type: 'cache', position: [2, -2, 0], color: '#ff8844', desc: 'Session + config', tech: 'KV' },
  { id: 'storage', label: 'Object Store', type: 'database', position: [0, -2, -3], color: '#44cc88', desc: 'Files + media', tech: 'R2' },
  { id: 'queue', label: 'Task Queue', type: 'queue', position: [4, 1, 2], color: '#ff4488', desc: 'Async jobs', tech: 'Queues' },
];

const FLOWS: DataFlow[] = [
  { from: 'browser', to: 'cdn', label: 'Static assets', protocol: 'HTTPS', color: '#61dafb' },
  { from: 'browser', to: 'gateway', label: 'API calls', protocol: 'HTTPS', color: '#22cc88' },
  { from: 'gateway', to: 'auth', label: 'Auth check', protocol: 'RPC', color: '#ff6644' },
  { from: 'gateway', to: 'api', label: 'Requests', protocol: 'RPC', color: '#4488ff' },
  { from: 'api', to: 'ai', label: 'Prompts', protocol: 'HTTPS', color: '#cc44ff' },
  { from: 'api', to: 'db', label: 'Queries', protocol: 'SQL', color: '#ffaa22' },
  { from: 'api', to: 'kv', label: 'Get/Set', protocol: 'KV API', color: '#ff8844' },
  { from: 'api', to: 'storage', label: 'Upload/Download', protocol: 'S3 API', color: '#44cc88' },
  { from: 'api', to: 'queue', label: 'Enqueue', protocol: 'Queue API', color: '#ff4488' },
  { from: 'auth', to: 'kv', label: 'Sessions', protocol: 'KV API', color: '#ff6644' },
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

// ── Service Shape Component ──

function ServiceShape({ type }: { type: Service['type'] }) {
  switch (type) {
    case 'frontend':
      return <boxGeometry args={[3, 0.3, 2]} />;
    case 'backend':
      return <boxGeometry args={[1.5, 1, 1.5]} />;
    case 'database':
      return <cylinderGeometry args={[0.8, 0.8, 1, 16]} />;
    case 'cache':
      return <octahedronGeometry args={[0.7]} />;
    case 'cdn':
      return <cylinderGeometry args={[1, 1, 0.2, 16]} />;
    case 'queue':
      return <torusGeometry args={[0.5, 0.2, 8, 24]} />;
    case 'external':
      return <icosahedronGeometry args={[0.7]} />;
  }
}

// ── Service Node Component ──

function ServiceNode({
  service,
  isSelected,
  isHovered,
  isHighlighted,
  onSelect,
  onHover,
  time,
  index,
}: {
  service: Service;
  isSelected: boolean;
  isHovered: boolean;
  isHighlighted: boolean;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  time: number;
  index: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const col = useMemo(() => new THREE.Color(service.color), [service.color]);

  const floatY = Math.sin(time * 0.8 + index * 1.7) * 0.1;
  const pulse = isSelected ? 1.0 + Math.sin(time * 3) * 0.05 : 1.0;
  const emissiveIntensity = isSelected ? 1.5 : isHovered ? 1.0 : isHighlighted ? 0.7 : 0.3;

  const typeColor = useMemo(() => getTypeColor(service.type), [service.type]);

  return (
    <group position={[service.position[0], service.position[1] + floatY, service.position[2]]}>
      <mesh
        ref={meshRef}
        scale={[pulse, pulse, pulse]}
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
        <meshStandardMaterial
          color={col}
          emissive={col}
          emissiveIntensity={emissiveIntensity}
          metalness={0.4}
          roughness={0.4}
        />
      </mesh>

      {/* Service label */}
      <Html position={[0, 1.0, 0]} center distanceFactor={10}>
        <div
          style={{
            color: 'white',
            fontSize: '11px',
            background: `linear-gradient(135deg, rgba(0,0,0,0.85), rgba(${parseInt(typeColor.slice(1, 3), 16)},${parseInt(typeColor.slice(3, 5), 16)},${parseInt(typeColor.slice(5, 7), 16)},0.3))`,
            padding: '4px 10px',
            borderRadius: '4px',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            border: `1px solid ${typeColor}44`,
            fontWeight: isSelected ? 'bold' : 'normal',
          }}
        >
          <div>{service.label}</div>
          <div style={{ fontSize: '9px', opacity: 0.7 }}>{service.tech}</div>
        </div>
      </Html>

      {/* Point light at service */}
      <pointLight color={service.color} intensity={isSelected ? 1.5 : 0.3} distance={5} />
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
  const col = new THREE.Color(flow.color);
  const radius = isHighlighted ? 0.06 : 0.04;
  const opacity = isHighlighted ? 0.5 : 0.15;

  return (
    <mesh position={mid} quaternion={quat}>
      <cylinderGeometry args={[radius, radius, length, 6]} />
      <meshStandardMaterial
        color={col}
        emissive={col}
        emissiveIntensity={isHighlighted ? 0.8 : 0.2}
        transparent
        opacity={opacity}
      />
    </mesh>
  );
}

// ── Flow Particles (instanced for performance) ──

const PARTICLES_PER_FLOW = 8;
const TOTAL_PARTICLES = FLOWS.length * PARTICLES_PER_FLOW;

function FlowParticles({
  hoveredService,
  time,
}: {
  hoveredService: string | null;
  time: number;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const colorsRef = useRef<Float32Array | null>(null);

  // Pre-compute flow endpoints
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

  // Initialize instance colors
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

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const dummy = new THREE.Object3D();

    for (let fi = 0; fi < flowData.length; fi++) {
      const { from, to, flow } = flowData[fi];
      const isHighlighted = hoveredService !== null &&
        (flow.from === hoveredService || flow.to === hoveredService);
      const scale = isHighlighted ? 0.08 : 0.04;

      for (let pi = 0; pi < PARTICLES_PER_FLOW; pi++) {
        const idx = fi * PARTICLES_PER_FLOW + pi;
        const t = ((time * 0.5 + pi / PARTICLES_PER_FLOW) % 1.0);

        // Add floating offset based on flow index
        const floatOffset = Math.sin(time * 0.8 + fi * 1.7) * 0.1;

        dummy.position.lerpVectors(from, to, t);
        dummy.position.y += floatOffset * (1 - Math.abs(t - 0.5) * 2); // Only float in middle
        dummy.scale.setScalar(scale);
        dummy.updateMatrix();
        mesh.setMatrixAt(idx, dummy.matrix);
      }
    }

    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, TOTAL_PARTICLES]}>
      <sphereGeometry args={[1, 6, 6]} />
      <meshStandardMaterial
        color="#ffffff"
        emissive="#ffffff"
        emissiveIntensity={2.0}
        transparent
        opacity={0.8}
      />
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
    <Html position={[service.position[0], service.position[1] + 2.2, service.position[2]]} center distanceFactor={10}>
      <div
        style={{
          color: 'white',
          fontSize: '11px',
          background: 'rgba(10, 15, 30, 0.95)',
          padding: '10px 14px',
          borderRadius: '6px',
          pointerEvents: 'none',
          border: `1px solid ${service.color}`,
          minWidth: '160px',
          maxWidth: '220px',
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

// ── Grid Floor ──

function GridFloor() {
  return (
    <mesh position={[0, -4, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[40, 40]} />
      <meshStandardMaterial
        color="#0a0f1e"
        emissive="#1a2040"
        emissiveIntensity={0.1}
        transparent
        opacity={0.8}
      />
    </mesh>
  );
}

function GridLines() {
  const lines = useMemo(() => {
    const result: { from: [number, number, number]; to: [number, number, number] }[] = [];
    const size = 20;
    const step = 2;
    for (let i = -size; i <= size; i += step) {
      result.push({ from: [i, -3.99, -size], to: [i, -3.99, size] });
      result.push({ from: [-size, -3.99, i], to: [size, -3.99, i] });
    }
    return result;
  }, []);

  return (
    <>
      {lines.map((line, i) => {
        const from = new THREE.Vector3(...line.from);
        const to = new THREE.Vector3(...line.to);
        const mid = new THREE.Vector3().lerpVectors(from, to, 0.5);
        const dir = new THREE.Vector3().subVectors(to, from);
        const length = dir.length();
        dir.normalize();
        const up = new THREE.Vector3(0, 1, 0);
        const quat = new THREE.Quaternion().setFromUnitVectors(up, dir);

        return (
          <mesh key={i} position={mid} quaternion={quat}>
            <cylinderGeometry args={[0.01, 0.01, length, 3]} />
            <meshBasicMaterial color="#1a2555" transparent opacity={0.3} />
          </mesh>
        );
      })}
    </>
  );
}

// ── Main Component ──

export default function ArchitectureBlueprint() {
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [hoveredService, setHoveredService] = useState<string | null>(null);
  const timeRef = useRef(0);
  const targetPos = useRef(new THREE.Vector3(2, 6, 12));
  const targetLookAt = useRef(new THREE.Vector3(0, 0, 0));
  const { camera } = useThree();

  const handleSelect = useCallback(
    (id: string) => {
      if (selectedService === id) {
        // Deselect - return to overview
        setSelectedService(null);
        targetPos.current.set(2, 6, 12);
        targetLookAt.current.set(0, 0, 0);
      } else {
        setSelectedService(id);
        const s = serviceMap.get(id)!;
        targetPos.current.set(s.position[0] + 2, s.position[1] + 3, s.position[2] + 6);
        targetLookAt.current.set(s.position[0], s.position[1], s.position[2]);
      }
    },
    [selectedService],
  );

  const handleEmptyClick = useCallback(() => {
    setSelectedService(null);
    targetPos.current.set(2, 6, 12);
    targetLookAt.current.set(0, 0, 0);
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

  useFrame((_, delta) => {
    timeRef.current += delta;

    // Smooth camera
    camera.position.lerp(targetPos.current, 0.04);
    camera.lookAt(
      camera.position.x + (targetLookAt.current.x - camera.position.x) * 0.04,
      camera.position.y + (targetLookAt.current.y - camera.position.y) * 0.04,
      (targetLookAt.current.z) * 0.5,
    );
  });

  return (
    <>
      <ambientLight intensity={0.15} />
      <directionalLight position={[5, 10, 5]} intensity={0.4} />
      <directionalLight position={[-5, 5, -5]} intensity={0.15} />

      {/* Click background to deselect */}
      <mesh position={[0, 0, -10]} onClick={handleEmptyClick}>
        <planeGeometry args={[60, 40]} />
        <meshBasicMaterial color="#0a0f1e" />
      </mesh>

      {/* Grid floor */}
      <GridFloor />
      <GridLines />

      {/* Service nodes */}
      {SERVICES.map((service, i) => (
        <ServiceNode
          key={service.id}
          service={service}
          isSelected={selectedService === service.id}
          isHovered={hoveredService === service.id}
          isHighlighted={highlightedServiceIds.has(service.id)}
          onSelect={handleSelect}
          onHover={setHoveredService}
          time={timeRef.current}
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
      <FlowParticles hoveredService={hoveredService ?? selectedService} time={timeRef.current} />

      {/* Detail panel for selected service */}
      {selectedService && (
        <DetailPanel
          service={serviceMap.get(selectedService)!}
          connectedFlows={connectedFlows}
        />
      )}
    </>
  );
}
