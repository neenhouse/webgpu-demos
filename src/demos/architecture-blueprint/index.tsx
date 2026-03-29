import { useRef, useState, useMemo, useCallback, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three/webgpu';
import {
  mix,
  screenUV,
  vec3,
  positionLocal,
  normalLocal,
  time,
  float,
  sin,
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
  tier: 'client' | 'edge' | 'services' | 'data';
  position: [number, number, number];
  color: string;
  hex: number;
  desc: string;
  tech: string;
  health: 'healthy' | 'degraded' | 'down';
  throughput: string;
}

interface DataFlow {
  from: string;
  to: string;
  label: string;
  protocol: string;
  color: string;
  hex: number;
  latency: string;
}

// Tiered layout: Client → Edge → Services → Data
// X spacing increased ~1.3x, Y spacing increased, Task Queue pulled inward,
// slight Z-depth variation per tier for visual depth
const SERVICES: Service[] = [
  // Tier 1: Client
  { id: 'browser', label: 'Browser', type: 'frontend', tier: 'client', position: [-5, 6.5, 0.1], color: '#61dafb', hex: 0x61dafb, desc: 'React SPA', tech: 'React + Vite', health: 'healthy', throughput: '—' },
  // Tier 2: Edge
  { id: 'cdn', label: 'CDN', type: 'cdn', tier: 'edge', position: [-1.3, 4, -0.2], color: '#f38020', hex: 0xf38020, desc: 'Edge caching', tech: 'Cloudflare Pages', health: 'healthy', throughput: '8.4k req/s' },
  { id: 'gateway', label: 'API Gateway', type: 'backend', tier: 'edge', position: [2.6, 4, 0.2], color: '#22cc88', hex: 0x22cc88, desc: 'Request routing', tech: 'Workers', health: 'healthy', throughput: '3.1k req/s' },
  // Tier 3: Services
  { id: 'auth', label: 'Auth Service', type: 'backend', tier: 'services', position: [-2.6, 1.5, 0.2], color: '#ff6644', hex: 0xff6644, desc: 'JWT + sessions', tech: 'Workers', health: 'healthy', throughput: '1.8k req/s' },
  { id: 'api', label: 'API Server', type: 'backend', tier: 'services', position: [1.3, 1.5, -0.1], color: '#4488ff', hex: 0x4488ff, desc: 'Business logic', tech: 'Workers', health: 'healthy', throughput: '2.5k req/s' },
  { id: 'ai', label: 'AI Service', type: 'external', tier: 'services', position: [5.2, 1.5, 0.3], color: '#cc44ff', hex: 0xcc44ff, desc: 'LLM inference', tech: 'Claude API', health: 'degraded', throughput: '45 req/s' },
  { id: 'queue', label: 'Task Queue', type: 'queue', tier: 'edge', position: [5.2, 4, -0.2], color: '#ff4488', hex: 0xff4488, desc: 'Async jobs', tech: 'Queues', health: 'healthy', throughput: '320 msg/s' },
  // Tier 4: Data
  { id: 'db', label: 'Database', type: 'database', tier: 'data', position: [-1.3, -1, 0.1], color: '#ffaa22', hex: 0xffaa22, desc: 'Relational data', tech: 'D1 (SQLite)', health: 'healthy', throughput: '1.2k qps' },
  { id: 'kv', label: 'KV Store', type: 'cache', tier: 'data', position: [2.6, -1, -0.3], color: '#ff8844', hex: 0xff8844, desc: 'Session + config', tech: 'KV', health: 'healthy', throughput: '500 req/s' },
  { id: 'storage', label: 'Object Store', type: 'database', tier: 'data', position: [6.5, -1, 0.2], color: '#44cc88', hex: 0x44cc88, desc: 'Files + media', tech: 'R2', health: 'healthy', throughput: '150 req/s' },
];

// Customer request trace path (read)
const TRACE_PATH = ['browser', 'cdn', 'gateway', 'auth', 'api', 'db', 'api', 'ai', 'api', 'queue'];
// Write operation trace path
const TRACE_PATH_WRITE = ['browser', 'gateway', 'api', 'db', 'api', 'kv', 'api', 'queue'];

const FLOWS: DataFlow[] = [
  { from: 'browser', to: 'cdn', label: 'Static assets', protocol: 'HTTPS', color: '#61dafb', hex: 0x61dafb, latency: '8ms' },
  { from: 'browser', to: 'gateway', label: 'API calls', protocol: 'HTTPS', color: '#22cc88', hex: 0x22cc88, latency: '12ms' },
  { from: 'gateway', to: 'auth', label: 'Auth check', protocol: 'RPC', color: '#ff6644', hex: 0xff6644, latency: '4ms' },
  { from: 'gateway', to: 'api', label: 'Requests', protocol: 'RPC', color: '#4488ff', hex: 0x4488ff, latency: '3ms' },
  { from: 'api', to: 'ai', label: 'Prompts', protocol: 'HTTPS', color: '#cc44ff', hex: 0xcc44ff, latency: '850ms' },
  { from: 'api', to: 'db', label: 'Queries', protocol: 'SQL', color: '#ffaa22', hex: 0xffaa22, latency: '45ms' },
  { from: 'api', to: 'kv', label: 'Get/Set', protocol: 'KV API', color: '#ff8844', hex: 0xff8844, latency: '2ms' },
  { from: 'api', to: 'storage', label: 'Upload/Download', protocol: 'S3 API', color: '#44cc88', hex: 0x44cc88, latency: '150ms' },
  { from: 'api', to: 'queue', label: 'Enqueue', protocol: 'Queue API', color: '#ff4488', hex: 0xff4488, latency: '6ms' },
  { from: 'auth', to: 'kv', label: 'Sessions', protocol: 'KV API', color: '#ff6644', hex: 0xff6644, latency: '2ms' },
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

function getHealthColor(health: Service['health']): string {
  switch (health) {
    case 'healthy': return '#44dd88';
    case 'degraded': return '#ffcc22';
    case 'down': return '#ff4444';
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
  mat.transparent = true;
  mat.opacity = 0.85;
  return mat;
}

/** Wireframe overlay for holographic tech feel */
function makeWireframeMaterial(hexColor: number) {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.color = new THREE.Color(hexColor);
  mat.emissive = new THREE.Color(hexColor);
  mat.emissiveIntensity = 0.8;
  mat.wireframe = true;
  mat.transparent = true;
  mat.opacity = 0.35;
  mat.roughness = 0.0;
  mat.metalness = 0.0;
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
    mat.opacity = 0.08; // #27: more transparent when not highlighted
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
  traceFlash,
  dataFlash,
  onSelect,
  onDoubleClick,
  onHover,
  index,
  mountTime,
  pulseWaveTime,
}: {
  service: Service;
  isSelected: boolean;
  isHovered: boolean;
  isHighlighted: boolean;
  isDimmed: boolean;
  traceFlash: number;
  dataFlash: number;
  onSelect: (id: string) => void;
  onDoubleClick: (id: string) => void;
  onHover: (id: string | null) => void;
  index: number;
  mountTime: number;
  pulseWaveTime: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const groupRef = useRef<THREE.Group>(null);
  const haloMeshRef = useRef<THREE.Mesh>(null);
  const platformRef = useRef<THREE.Mesh>(null);
  const platformRingRef = useRef<THREE.Mesh>(null);
  const externalRingRef = useRef<THREE.Mesh>(null);
  const platformMatRef = useRef<THREE.MeshStandardNodeMaterial | null>(null);
  const platformRingMatRef = useRef<THREE.MeshStandardNodeMaterial | null>(null);
  // #51: Track when this service was last selected for smooth scale-up animation
  const selectionTime = useRef(0);
  const wasSelected = useRef(false);
  // #58: Degraded health dot blink state
  const [blinkVisible, setBlinkVisible] = useState(true);
  const blinkAccRef = useRef(0);

  const serviceMat = useMemo(() => makeServiceMaterial(service.type, service.hex), [service.type, service.hex]);
  const wireframeMat = useMemo(() => makeWireframeMaterial(service.hex), [service.hex]);
  // #92: Track wireframe opacity for smooth hover lerp
  const wireframeOpacityRef = useRef(0.2);

  // Dim material overlay for non-connected services when something is selected
  const dimMat = useMemo(() => {
    if (!isDimmed) return null;
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.transparent = true;
    mat.color = new THREE.Color(service.hex).multiplyScalar(0.1);
    mat.emissive = new THREE.Color(service.hex);
    mat.emissiveIntensity = 0.1;
    mat.opacity = 0.3;
    mat.roughness = 0.8;
    mat.metalness = 0.2;
    return mat;
  }, [service.hex, isDimmed]);

  const haloMat = useMemo(() => makeServiceHaloMaterial(service.hex), [service.hex]);

  // Platform base material (needs to be mutable for opacity pulse)
  const platformMat = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.transparent = true;
    mat.depthWrite = false;
    mat.color = new THREE.Color(service.hex).multiplyScalar(0.3);
    mat.emissive = new THREE.Color(service.hex);
    mat.emissiveIntensity = isDimmed ? 0.05 : 0.3;
    mat.opacity = isDimmed ? 0.05 : 0.15;
    mat.roughness = 0.8;
    mat.metalness = 0.0;
    platformMatRef.current = mat;
    return mat;
  }, [service.hex, isDimmed]);

  // Zone of influence ring material (larger, subtle)
  const platformRingMat = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.transparent = true;
    mat.depthWrite = false;
    mat.color = new THREE.Color(service.hex).multiplyScalar(0.2);
    mat.emissive = new THREE.Color(service.hex);
    mat.emissiveIntensity = 0.1;
    mat.opacity = 0.05;
    mat.roughness = 0.8;
    mat.metalness = 0.0;
    platformRingMatRef.current = mat;
    return mat;
  }, [service.hex]);

  // External service pulsing ring material
  const externalRingMat = useMemo(() => {
    if (service.type !== 'external') return null;
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.transparent = true;
    mat.depthWrite = false;
    mat.blending = THREE.AdditiveBlending;
    mat.color = new THREE.Color(service.hex);
    mat.emissive = new THREE.Color(service.hex);
    mat.emissiveIntensity = 1.5;
    mat.opacity = 0.4;
    mat.roughness = 0.0;
    mat.metalness = 0.0;
    return mat;
  }, [service.hex, service.type]);

  // Frontend (browser) breathing material using TSL positionLocal
  const frontendBreatheMat = useMemo(() => {
    if (service.type !== 'frontend') return null;
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.color = new THREE.Color(service.hex);
    mat.emissive = new THREE.Color(service.hex);
    mat.emissiveIntensity = 0.6;
    mat.roughness = 0.3;
    mat.metalness = 0.5;
    mat.transparent = true;
    mat.opacity = 0.85;
    // Vertex displacement: breathe via sin(time * 1.2) on normalLocal
    const breatheAmount = sin(time.mul(float(1.2))).mul(float(0.04));
    mat.positionNode = positionLocal.add(normalLocal.mul(breatheAmount));
    return mat;
  }, [service.hex, service.type]);

  const typeColor = useMemo(() => getTypeColor(service.type), [service.type]);

  // Choose main material: frontend gets breathe material
  const activeMat = isDimmed && dimMat
    ? dimMat
    : (service.type === 'frontend' && frontendBreatheMat ? frontendBreatheMat : serviceMat);

  useFrame((state, delta) => {
    const group = groupRef.current;
    if (group) {
      const t = (group.userData.t || 0) + delta;
      group.userData.t = t;
      // Base float
      let yOffset = Math.sin(t * 0.8 + index * 1.7) * 0.1;

      // Queue: extra bobbing at different frequency (#14)
      if (service.type === 'queue') {
        yOffset += Math.sin(t * 1.9 + index * 0.5) * 0.06;
      }

      group.position.y = service.position[1] + yOffset;

      // Database: slow Y-axis rotation (#13)
      if (service.type === 'database' && meshRef.current) {
        meshRef.current.rotation.y += delta * 0.15;
      }

      // CDN disc: slow Y spin (#19)
      if (service.type === 'cdn' && meshRef.current) {
        meshRef.current.rotation.y += delta * 0.3;
      }

      // Platform base opacity pulse (#15): sin(t) between 0.1 and 0.25
      if (platformMatRef.current && !isDimmed) {
        platformMatRef.current.opacity = 0.175 + Math.sin(t * 0.6) * 0.075;
        platformMatRef.current.needsUpdate = false; // opacity change doesn't need needsUpdate
      }

      // Zone of influence ring pulse (slightly different phase) (#16)
      if (platformRingMatRef.current && !isDimmed) {
        platformRingMatRef.current.opacity = 0.04 + Math.sin(t * 0.6 + 1.0) * 0.02;
      }

      // External service pulsing ring (#17)
      if (service.type === 'external' && externalRingRef.current && externalRingMat) {
        externalRingMat.opacity = 0.2 + Math.sin(t * 2.0) * 0.18;
        const ringScale = 1.0 + Math.sin(t * 2.0) * 0.1;
        externalRingRef.current.scale.setScalar(ringScale);
      }

      // #52: Outer halo shell — slow rotation on tilted axis
      if (haloMeshRef.current) {
        haloMeshRef.current.rotation.y += delta * 0.1;
      }
    }

    // #51: Track selection changes and lerp scale-up over 0.3s
    if (isSelected && !wasSelected.current) {
      selectionTime.current = 0;
      wasSelected.current = true;
    } else if (!isSelected) {
      wasSelected.current = false;
    }
    if (isSelected) {
      selectionTime.current = Math.min(selectionTime.current + delta, 0.3);
    }

    if (meshRef.current && isSelected) {
      const t = group?.userData.t || 0;
      // #51: lerp from 1.0 to target scale over 0.3s using selectionTime
      const selProgress = Math.min(selectionTime.current / 0.3, 1.0);
      const targetScale = 1.0 + selProgress * 0.05;
      const pulseScale = targetScale + Math.sin(t * 3) * 0.05 * selProgress;
      // #55: Pulse wave when trace ball arrives — scale to 1.15 and back over 0.5s
      let waveScale = 1.0;
      if (pulseWaveTime > 0 && pulseWaveTime < 0.5) {
        const waveProg = pulseWaveTime / 0.5;
        waveScale = 1.0 + Math.sin(waveProg * Math.PI) * 0.15;
      }
      meshRef.current.scale.setScalar(pulseScale * waveScale);
    } else if (meshRef.current) {
      // #55: Pulse wave for non-selected services too
      let waveScale = 1.0;
      if (pulseWaveTime > 0 && pulseWaveTime < 0.5) {
        const waveProg = pulseWaveTime / 0.5;
        waveScale = 1.0 + Math.sin(waveProg * Math.PI) * 0.15;
      }
      if (service.type !== 'database' && service.type !== 'cdn') {
        meshRef.current.scale.setScalar(waveScale);
      } else if (waveScale > 1.0) {
        // Apply wave even for rotating types
        const existing = meshRef.current.scale.x;
        meshRef.current.scale.setScalar(existing * waveScale);
      }
    }

    // #59: Entrance stagger fade — compute opacity based on mountTime and per-service delay
    const entranceDelay = index * 0.1; // 100ms stagger
    const entranceDuration = 0.5;
    const entranceProgress = Math.min(Math.max((mountTime - entranceDelay) / entranceDuration, 0), 1);
    const group2 = groupRef.current;
    if (group2) {
      // Scale the whole group from 0 to 1 for entrance
      if (entranceProgress < 1) {
        group2.scale.setScalar(entranceProgress);
      } else if (group2.scale.x !== 1) {
        group2.scale.setScalar(1);
      }
    }
    // #58: Degraded health dot blink at 2Hz (0.25s on, 0.25s off)
    if (service.health === 'degraded') {
      blinkAccRef.current += delta;
      if (blinkAccRef.current >= 0.25) {
        blinkAccRef.current = blinkAccRef.current % 0.25;
        setBlinkVisible((v) => !v);
      }
    }

    // #92: Smooth wireframe opacity lerp — 0.2 idle → 0.5 on hover, over ~0.2s
    if (!isDimmed) {
      const targetWireOpacity = (isHovered || isSelected) ? 0.5 : 0.2;
      const lerpSpeed = 1 - Math.pow(0.001, delta / 0.2); // exponential lerp ~0.2s
      wireframeOpacityRef.current += (targetWireOpacity - wireframeOpacityRef.current) * lerpSpeed;
      wireframeMat.opacity = wireframeOpacityRef.current;
    }

    // #93: Data received flash — boost emissive intensity briefly when dataFlash > 0
    if (dataFlash > 0 && activeMat) {
      const flashIntensity = 0.6 + dataFlash * 2.5; // boost up to 3.1 at peak flash=1
      (activeMat as THREE.MeshStandardNodeMaterial).emissiveIntensity = flashIntensity;
    } else if (!isDimmed && activeMat) {
      // Restore base emissive
      (activeMat as THREE.MeshStandardNodeMaterial).emissiveIntensity = 0.6;
    }

    void state;
  });

  return (
    <group ref={groupRef} position={[service.position[0], service.position[1], service.position[2]]}>
      {/* Main mesh */}
      <mesh
        ref={meshRef}
        material={activeMat}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(service.id);
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onDoubleClick(service.id);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHover(service.id);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          onHover(null);
          document.body.style.cursor = 'default';
        }}
      >
        <ServiceShape type={service.type} />
      </mesh>

      {/* Wireframe overlay — holographic tech feel (#11) */}
      {!isDimmed && (
        <mesh material={wireframeMat}>
          <ServiceShape type={service.type} />
        </mesh>
      )}

      {/* Platform base circle with pulsing opacity (#15) */}
      <mesh ref={platformRef} position={[0, -0.45, 0]} rotation={[-Math.PI / 2, 0, 0]} material={platformMat}>
        <circleGeometry args={[0.7, 24]} />
      </mesh>

      {/* Zone of influence ring — larger, subtle (#16) */}
      <mesh ref={platformRingRef} position={[0, -0.46, 0]} rotation={[-Math.PI / 2, 0, 0]} material={platformRingMat}>
        <circleGeometry args={[1.0, 32]} />
      </mesh>

      {/* External service pulsing emissive ring (#17) */}
      {service.type === 'external' && externalRingMat && (
        <mesh ref={externalRingRef} position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]} material={externalRingMat}>
          <ringGeometry args={[0.65, 0.85, 32]} />
        </mesh>
      )}

      {/* Halo shell (#52: slow rotation on Y axis) */}
      {!isDimmed && (
        <mesh ref={haloMeshRef} material={haloMat} scale={[1.25, 1.25, 1.25]}>
          <ServiceShape type={service.type} />
        </mesh>
      )}

      {/* Service label */}
      <Html position={[0, 0.9, 0]} center>
        <div
          style={{
            color: 'white',
            fontSize: '11px',
            fontFamily: 'system-ui, -apple-system, sans-serif',
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
            // #91: Scanline effect on hover — thin repeating horizontal lines
            backgroundImage: isHovered
              ? `repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.15) 2px, rgba(0,0,0,0.15) 3px), linear-gradient(rgba(5,10,25,0.9), rgba(5,10,25,0.9))`
              : undefined,
          }}
        >
          <div style={{ fontSize: '10px', fontWeight: 'bold', letterSpacing: '0.3px', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span
              style={{
                display: 'inline-block', width: '6px', height: '6px',
                borderRadius: '50%', background: getHealthColor(service.health),
                flexShrink: 0,
                boxShadow: `0 0 4px ${getHealthColor(service.health)}`,
                // #58: Degraded services blink — toggle opacity between 0.3 and 1.0 at 2Hz
                opacity: service.health === 'degraded' ? (blinkVisible ? 1.0 : 0.3) : 1.0,
              }}
            />
            {service.label}
          </div>
          <div style={{ fontSize: '8px', opacity: 0.5, marginTop: '1px' }}>{service.tech}</div>
        </div>
      </Html>

      {/* Warning tooltip for degraded AI Service when hovered */}
      {isHovered && service.id === 'ai' && (
        <Html position={[0, 1.8, 0]} center>
          <div style={{
            color: '#ffcc22',
            fontSize: '10px',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            background: 'rgba(40,20,5,0.95)',
            padding: '5px 10px',
            borderRadius: '5px',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            border: '1px solid #ffcc2266',
            boxShadow: '0 2px 12px rgba(255,200,0,0.2)',
            fontWeight: 'bold',
          }}>
            ⚠ High latency detected — 95th percentile: 2.3s
          </div>
        </Html>
      )}

      {/* Point light at service */}
      <pointLight
        color={service.color}
        intensity={isSelected ? 2.5 : isHovered ? 1.5 : isHighlighted ? 0.8 : isDimmed ? 0.05 : 0.4 + traceFlash * 3.0 + dataFlash * 2.0}
        distance={isSelected ? 7 : 5}
      />
    </group>
  );
}

// ── Connection Pipe Component ──

// Determine Y curve offset for same-tier connections (#29)
function getConnectionCurveOffset(fromService: Service, toService: Service): number {
  const fromY = fromService.position[1];
  const toY = toService.position[1];
  const tierTolerance = 1.0; // within 1 unit = same tier
  return Math.abs(fromY - toY) < tierTolerance ? 0.3 : 0.0;
}

function ConnectionPipe({
  flow,
  isHighlighted,
  selectedService,
  isVisited,
}: {
  flow: DataFlow;
  isHighlighted: boolean;
  selectedService: string | null;
  isVisited?: boolean;
}) {
  const pipeMatRef = useRef<THREE.MeshStandardNodeMaterial | null>(null);
  const arrowMatRef = useRef<THREE.MeshStandardNodeMaterial | null>(null);

  const fromService = serviceMap.get(flow.from)!;
  const toService = serviceMap.get(flow.to)!;
  const from = new THREE.Vector3(...fromService.position);
  const to = new THREE.Vector3(...toService.position);

  const mid = new THREE.Vector3().lerpVectors(from, to, 0.5);

  // #29: Curved mid — add Y offset at midpoint for same-tier connections
  const curveOffset = getConnectionCurveOffset(fromService, toService);
  mid.y += curveOffset;

  const dir = new THREE.Vector3().subVectors(to, from);
  const length = dir.length();
  dir.normalize();

  const up = new THREE.Vector3(0, 1, 0);
  const quat = new THREE.Quaternion().setFromUnitVectors(up, dir);
  const radius = isHighlighted ? 0.07 : 0.035;

  const pipeMat = useMemo(
    () => {
      const mat = makeConnectionMaterial(flow.hex, isHighlighted);
      pipeMatRef.current = mat;
      return mat;
    },
    [flow.hex, isHighlighted],
  );

  // Arrow marker material (same as pipe) — #21
  const arrowMat = useMemo(() => {
    const mat = makeConnectionMaterial(flow.hex, isHighlighted);
    arrowMatRef.current = mat;
    return mat;
  }, [flow.hex, isHighlighted]);

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

  // #84: Visited connection glow (traversed during trace, stays lit until trace ends)
  const visitedGlowMat = useMemo(() => {
    if (!isVisited) return null;
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.transparent = true;
    mat.depthWrite = false;
    mat.blending = THREE.AdditiveBlending;
    mat.color = new THREE.Color(flow.hex);
    mat.emissive = new THREE.Color(flow.hex);
    mat.emissiveIntensity = 2.0;
    mat.opacity = 0.25;
    return mat;
  }, [flow.hex, isVisited]);

  // #21: Arrow cone placement — small offset back from endpoint along pipe direction
  // Position the cone at the "to" end, oriented along dir
  const arrowPos = new THREE.Vector3().lerpVectors(from, to, 0.88);
  arrowPos.y += curveOffset * (1 - Math.abs(0.88 - 0.5) * 2); // follow curve
  const arrowQuat = new THREE.Quaternion().setFromUnitVectors(up, dir);

  // #26: Show connection count label on selected service connections
  const connectedFlowsCount = selectedService
    ? FLOWS.filter((f) => f.from === selectedService || f.to === selectedService).length
    : 0;
  const isConnectedToSelected = selectedService !== null &&
    (flow.from === selectedService || flow.to === selectedService);

  // #23: Animated emissive pulse on highlighted pipe
  useFrame((state) => {
    if (isHighlighted && pipeMatRef.current) {
      const t = state.clock.elapsedTime;
      pipeMatRef.current.emissiveIntensity = 0.8 + Math.sin(t * 3.5) * 0.35; // 0.8–1.15 range centred on ~1.15
      // clamp to 0.8–1.5
      pipeMatRef.current.emissiveIntensity = Math.max(0.8, Math.min(1.5, 0.8 + (Math.sin(t * 3.5) + 1) * 0.35));
    }
    if (isHighlighted && arrowMatRef.current) {
      const t = state.clock.elapsedTime;
      arrowMatRef.current.emissiveIntensity = Math.max(0.8, Math.min(1.5, 0.8 + (Math.sin(t * 3.5) + 1) * 0.35));
    }
  });

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
      {/* #84: Visited glow — stays lit after trace ball passes through */}
      {isVisited && visitedGlowMat && (
        <mesh position={mid} quaternion={quat} material={visitedGlowMat}>
          <cylinderGeometry args={[radius * 2.5, radius * 2.5, length, 8]} />
        </mesh>
      )}

      {/* #21: Arrow cone at "to" endpoint */}
      <mesh position={arrowPos} quaternion={arrowQuat} material={arrowMat}>
        <coneGeometry args={[0.08, 0.15, 8]} />
      </mesh>

      {/* #28: Glow point light at midpoint of highlighted connections */}
      {isHighlighted && (
        <pointLight
          position={[mid.x, mid.y, mid.z]}
          color={flow.color}
          intensity={0.8}
          distance={4}
        />
      )}

      {/* #22: Protocol label on highlighted connections */}
      {isHighlighted && (
        <Html position={[mid.x, mid.y + 0.35, mid.z]} center>
          <div style={{
            color: flow.color,
            fontSize: '9px',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            background: 'rgba(5,10,25,0.85)',
            padding: '2px 7px',
            borderRadius: '3px',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            border: `1px solid ${flow.color}55`,
            fontWeight: 'bold',
            letterSpacing: '0.5px',
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
          }}>
            <span>{flow.protocol}</span>
            <span style={{ opacity: 0.7, fontWeight: 'normal', fontSize: '8px' }}>{flow.latency}</span>
          </div>
        </Html>
      )}

      {/* #26: Connection count on selected service's connected pipes */}
      {isConnectedToSelected && selectedService && (
        <Html position={[mid.x, mid.y - 0.3, mid.z]} center>
          <div style={{
            color: 'rgba(180,200,255,0.7)',
            fontSize: '8px',
            background: 'rgba(5,10,25,0.75)',
            padding: '1px 5px',
            borderRadius: '3px',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            letterSpacing: '0.3px',
          }}>
            {connectedFlowsCount} conn
          </div>
        </Html>
      )}
    </group>
  );
}

// ── Flow Particles (instanced for performance) ──

const PARTICLES_PER_FLOW = 16; // #30: increased from 12 for denser flow
const TOTAL_PARTICLES = FLOWS.length * PARTICLES_PER_FLOW;

function FlowParticles({
  hoveredService,
  selectedService,
  onParticleArrival,
}: {
  hoveredService: string | null;
  selectedService: string | null;
  onParticleArrival?: (serviceId: string) => void;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const colorsRef = useRef<Float32Array | null>(null);

  const flowData = useMemo(() => {
    return FLOWS.map((flow) => {
      const fromService = serviceMap.get(flow.from)!;
      const toService = serviceMap.get(flow.to)!;
      // #29: Same-tier curve offset for particle path
      const curveOffset = getConnectionCurveOffset(fromService, toService);
      return {
        from: new THREE.Vector3(...fromService.position),
        to: new THREE.Vector3(...toService.position),
        color: new THREE.Color(flow.color),
        flow,
        curveOffset,
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
    const colors = colorsRef.current;

    for (let fi = 0; fi < flowData.length; fi++) {
      const { from, to, flow, curveOffset, color } = flowData[fi];
      const isHighlighted = active !== null &&
        (flow.from === active || flow.to === active);
      const baseScale = isHighlighted ? 0.08 : 0.05;

      // #24: Boost saturation/vibrance when highlighted by scaling up color channels
      if (colors) {
        for (let pi = 0; pi < PARTICLES_PER_FLOW; pi++) {
          const cidx = (fi * PARTICLES_PER_FLOW + pi) * 3;
          if (isHighlighted) {
            colors[cidx] = Math.min(1, color.r * 1.4);
            colors[cidx + 1] = Math.min(1, color.g * 1.4);
            colors[cidx + 2] = Math.min(1, color.b * 1.4);
          } else {
            colors[cidx] = color.r;
            colors[cidx + 1] = color.g;
            colors[cidx + 2] = color.b;
          }
        }
      }

      // #54: Compute perpendicular vector for sinusoidal wavy offset
      const flowDir = new THREE.Vector3().subVectors(to, from).normalize();
      // Cross with up to get a sideways perpendicular
      const perpVec = new THREE.Vector3().crossVectors(flowDir, new THREE.Vector3(0, 1, 0)).normalize();
      // If flow is mostly vertical, use X axis instead
      if (perpVec.lengthSq() < 0.01) perpVec.set(1, 0, 0);

      // #93: Detect when any particle crosses t>0.95 (arrives at destination)
      let arrivedThisFrame = false;
      for (let pi = 0; pi < PARTICLES_PER_FLOW; pi++) {
        const speedMul = 0.4 + (pi % 3) * 0.15;
        const tNow = ((currentTime * speedMul + pi / PARTICLES_PER_FLOW) % 1.0);
        const tPrev = ((( currentTime - (1/60)) * speedMul + pi / PARTICLES_PER_FLOW) % 1.0);
        if (tNow > 0.95 && tPrev <= 0.95 && !arrivedThisFrame) {
          arrivedThisFrame = true;
          if (onParticleArrival) {
            onParticleArrival(flow.to);
          }
        }
      }

      for (let pi = 0; pi < PARTICLES_PER_FLOW; pi++) {
        const idx = fi * PARTICLES_PER_FLOW + pi;
        // Add speed variation per particle
        const speedMul = 0.4 + (pi % 3) * 0.15;
        const t = ((currentTime * speedMul + pi / PARTICLES_PER_FLOW) % 1.0);
        const floatOffset = Math.sin(currentTime * 0.8 + fi * 1.7) * 0.1;

        dummy.position.lerpVectors(from, to, t);
        // #29: Follow the arc — apply curveOffset at midpoint using parabolic weight
        const arcWeight = 1 - Math.abs(t - 0.5) * 2;
        dummy.position.y += curveOffset * arcWeight;
        dummy.position.y += floatOffset * arcWeight;

        // #54: Sinusoidal perpendicular offset for wavy path
        const waveFreq = 4.0 + fi * 0.5; // slightly different freq per flow
        const wavePhase = currentTime * 1.5 + pi * (Math.PI * 2 / PARTICLES_PER_FLOW);
        const waveAmplitude = 0.12;
        const waveSin = Math.sin(waveFreq * t * Math.PI + wavePhase) * waveAmplitude;
        dummy.position.x += perpVec.x * waveSin;
        dummy.position.z += perpVec.z * waveSin;

        // #25: Every 3rd particle is 1.5x scale (data packet effect)
        const isDataPacket = pi % 3 === 0;
        dummy.scale.setScalar(baseScale * (isDataPacket ? 1.5 : 1.0));
        dummy.updateMatrix();
        mesh.setMatrixAt(idx, dummy.matrix);
      }
    }

    if (colors && mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
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
  onClose,
}: {
  service: Service;
  connectedFlows: DataFlow[];
  onClose: () => void;
}) {
  const typeColor = getTypeColor(service.type);
  const healthColor = getHealthColor(service.health);
  const connectionCount = connectedFlows.length;

  // #66: Fade-in + slide-up on mount using CSS transition via state
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <Html position={[service.position[0] + 2.2, service.position[1] + 0.5, service.position[2]]} center>
      <div
        style={{
          color: 'white',
          fontSize: '11px',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          background: 'rgba(5, 10, 25, 0.95)',
          padding: '12px 16px',
          borderRadius: '8px',
          pointerEvents: 'auto',
          border: `1px solid ${service.color}55`,
          borderLeft: `3px solid ${service.color}`,
          minWidth: '170px',
          maxWidth: '230px',
          boxShadow: `0 4px 24px rgba(0,0,0,0.5), 0 0 20px ${service.color}15`,
          backdropFilter: 'blur(8px)',
          position: 'relative',
          // #66: fade in and slide up
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(8px)',
          transition: 'opacity 0.25s ease, transform 0.25s ease',
        }}
      >
        {/* #67: Close button */}
        <button
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          style={{
            position: 'absolute', top: '6px', right: '8px',
            background: 'transparent', border: 'none', color: 'rgba(180,200,255,0.5)',
            fontSize: '14px', cursor: 'pointer', lineHeight: 1,
            padding: '2px 4px', borderRadius: '3px',
            fontFamily: 'system-ui, -apple-system, sans-serif',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.9)'; (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.1)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'rgba(180,200,255,0.5)'; (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
        >
          ×
        </button>

        {/* Header with connection count */}
        <div style={{ fontWeight: 'bold', fontSize: '13px', marginBottom: '2px', color: service.color, display: 'flex', alignItems: 'center', gap: '6px', paddingRight: '16px' }}>
          <span
            style={{
              display: 'inline-block', width: '7px', height: '7px',
              borderRadius: '50%', background: healthColor,
              flexShrink: 0, boxShadow: `0 0 5px ${healthColor}`,
            }}
          />
          {service.label}
          <span style={{ fontSize: '10px', fontWeight: 'normal', color: 'rgba(180,200,255,0.6)', marginLeft: 'auto' }}>
            ({connectionCount} conn)
          </span>
        </div>

        {/* Tier badge */}
        <div style={{ marginBottom: '5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{
            fontSize: '8px', padding: '1px 5px', borderRadius: '3px',
            background: 'rgba(100,150,255,0.12)', color: 'rgba(140,180,255,0.8)',
            border: '1px solid rgba(100,150,255,0.2)', letterSpacing: '0.5px',
            textTransform: 'uppercase',
          }}>
            {service.tier}
          </span>
          <span style={{
            fontSize: '8px', padding: '1px 5px', borderRadius: '3px',
            background: `${typeColor}15`, color: typeColor,
            border: `1px solid ${typeColor}30`, letterSpacing: '0.5px',
          }}>
            {service.type}
          </span>
        </div>

        <div style={{ opacity: 0.7, marginBottom: '4px' }}>{service.desc}</div>
        <div style={{ fontSize: '10px', opacity: 0.5, marginBottom: '4px' }}>Tech: {service.tech}</div>

        {/* Throughput row */}
        {service.throughput !== '—' && (
          <div style={{
            fontSize: '10px', marginBottom: '6px',
            display: 'flex', alignItems: 'center', gap: '6px',
          }}>
            <span style={{ opacity: 0.5 }}>Throughput:</span>
            <span style={{ color: '#88ddbb', fontWeight: 'bold' }}>{service.throughput}</span>
          </div>
        )}

        <div style={{ borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: '6px' }}>
          <div style={{ fontWeight: 'bold', fontSize: '10px', marginBottom: '3px' }}>Connections:</div>
          {connectedFlows.map((f, i) => {
            const isOutgoing = f.from === service.id;
            const other = isOutgoing ? f.to : f.from;
            const otherService = serviceMap.get(other)!;
            const arrow = isOutgoing ? `→ ${otherService.label}` : `← ${otherService.label}`;
            return (
              // #65: Colored dot before each connection entry matching the connection color
              <div key={i} style={{ fontSize: '9px', opacity: 0.8, marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{
                  display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%',
                  background: f.color, flexShrink: 0,
                  boxShadow: `0 0 3px ${f.color}99`,
                }} />
                <span style={{ color: isOutgoing ? '#88bbff' : '#ffaa88', fontWeight: 'bold' }}>{arrow}</span>
                <span style={{ opacity: 0.65 }}>· {f.label} ({f.protocol})</span>
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

  // Generate grid lines — minor lines every 2 units from -15 to +15, major every 5
  const gridLines = useMemo(() => {
    const lines: { pos: [number, number, number]; rot: [number, number, number]; size: [number, number]; isMajor: boolean; distFromCenter: number }[] = [];
    const span = 15;
    const minorStep = 2;

    for (let i = -span; i <= span; i += minorStep) {
      const isMajor = i % 5 === 0;
      // Horizontal lines (along X) — distFromCenter based on Z offset
      lines.push({ pos: [0, -2.49, i], rot: [0, 0, 0], size: [span * 2, isMajor ? 0.03 : 0.015], isMajor, distFromCenter: Math.abs(i) });
      // Vertical lines (along Z) — distFromCenter based on X offset
      lines.push({ pos: [i, -2.49, 0], rot: [0, Math.PI / 2, 0], size: [span * 2, isMajor ? 0.03 : 0.015], isMajor, distFromCenter: Math.abs(i) });
    }
    return lines;
  }, []);

  // #75: Per-line material refs for wave animation
  const lineMatRefs = useRef<(THREE.MeshBasicNodeMaterial | null)[]>([]);

  const lineMats = useMemo(() =>
    gridLines.map((_line, i) => {
      const mat = new THREE.MeshBasicNodeMaterial();
      mat.transparent = true;
      mat.opacity = 0.12;
      mat.color = new THREE.Color(0x4488cc);
      lineMatRefs.current[i] = mat;
      return mat;
    }),
  [gridLines]);

  // #75: Animate grid line opacity — wave pattern based on distance from center
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    for (let i = 0; i < gridLines.length; i++) {
      const mat = lineMatRefs.current[i];
      if (!mat) continue;
      const line = gridLines[i];
      const baseOpacity = line.isMajor ? 0.25 : 0.12;
      // Wave: lines further from center are dimmer; wave travels outward
      const distFactor = Math.max(0, 1 - line.distFromCenter / 15);
      const wave = Math.sin(t * 0.5 - line.distFromCenter * 0.3) * 0.5 + 0.5;
      mat.opacity = baseOpacity * (0.4 + distFactor * 0.4 + wave * 0.2);
    }
  });

  return (
    <>
      <mesh position={[0, -2.5, 0]} rotation={[-Math.PI / 2, 0, 0]} material={gridMat}>
        <planeGeometry args={[60, 60]} />
      </mesh>
      {gridLines.map((line, i) => (
        <mesh key={i} position={line.pos} rotation={[-Math.PI / 2, line.rot[1], 0]} material={lineMats[i]}>
          <planeGeometry args={line.size} />
        </mesh>
      ))}
    </>
  );
}

// ── Main Component ──

// ── Trace Request Ball ──

const TRAIL_COUNT = 8;
// #82: Speed trail ghost copies
const SPEED_TRAIL_COUNT = 4;
// #87: Particle burst pool size (8 particles per arrival)
const BURST_PARTICLE_COUNT = 8;

// #81: Get color hex for service type used by trace ball
function getTypeHex(type: Service['type']): number {
  switch (type) {
    case 'frontend': return 0x44ffff;
    case 'backend': return 0x22ee66;
    case 'database': return 0xffcc22;
    case 'cache': return 0xff8844;
    case 'external': return 0xcc44ff;
    case 'queue': return 0xff44aa;
    case 'cdn': return 0xf38020;
  }
}

// #87: Particle burst spawned when trace ball arrives at a service
function TraceBurstParticles({ position, color }: { position: [number, number, number]; color: number }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const startRef = useRef<{ px: number; py: number; pz: number; vx: number; vy: number; vz: number }[]>([]);
  const ageRef = useRef(0);

  const mat = useMemo(() => {
    const m = new THREE.MeshBasicNodeMaterial();
    m.transparent = true;
    m.depthWrite = false;
    m.blending = THREE.AdditiveBlending;
    m.color = new THREE.Color(color);
    m.opacity = 0.9;
    return m;
  }, [color]);

  // Initialize velocities once on mount
  useEffect(() => {
    const vels = [];
    for (let i = 0; i < BURST_PARTICLE_COUNT; i++) {
      const theta = (i / BURST_PARTICLE_COUNT) * Math.PI * 2;
      const phi = (Math.random() - 0.5) * Math.PI;
      const speed = 1.5 + Math.random() * 1.5;
      vels.push({
        px: position[0], py: position[1], pz: position[2],
        vx: Math.cos(theta) * Math.cos(phi) * speed,
        vy: Math.sin(phi) * speed + 0.5,
        vz: Math.sin(theta) * Math.cos(phi) * speed,
      });
    }
    startRef.current = vels;
    ageRef.current = 0;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    ageRef.current += delta;
    const age = ageRef.current;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < BURST_PARTICLE_COUNT; i++) {
      const v = startRef.current[i];
      if (!v) { dummy.scale.setScalar(0); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix); continue; }
      dummy.position.set(
        v.px + v.vx * age,
        v.py + v.vy * age - 2.0 * age * age, // gravity
        v.pz + v.vz * age,
      );
      const life = Math.max(0, 1 - age / 0.5);
      dummy.scale.setScalar(0.05 * life);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    // Fade opacity
    mat.opacity = Math.max(0, 0.9 * Math.max(0, 1 - ageRef.current / 0.5));
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, BURST_PARTICLE_COUNT]} material={mat}>
      <sphereGeometry args={[1, 4, 4]} />
    </instancedMesh>
  );
}

// #88: Floor light trail — fading glow dots on the floor along the trace path
function FloorLightTrail({ positions, fadeTime }: { positions: THREE.Vector3[]; fadeTime: number }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const mat = useMemo(() => {
    const m = new THREE.MeshBasicNodeMaterial();
    m.transparent = true;
    m.depthWrite = false;
    m.blending = THREE.AdditiveBlending;
    m.color = new THREE.Color(0x44aaff);
    m.opacity = 0.35;
    return m;
  }, []);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    // Fade: full at fadeTime=0, gone at fadeTime=3
    const alpha = Math.max(0, 1 - fadeTime / 3.0);
    mat.opacity = 0.35 * alpha;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < positions.length; i++) {
      dummy.position.set(positions[i].x, -2.49, positions[i].z);
      dummy.scale.setScalar(0.08);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  if (positions.length === 0) return null;
  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, Math.max(1, positions.length)]} material={mat}>
      <sphereGeometry args={[1, 4, 4]} />
    </instancedMesh>
  );
}

// #89: Completion animation — ball expands and dissolves
function TraceCompletionBall({ position, color }: { position: THREE.Vector3; color: number }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const ageRef = useRef(0);
  const mat = useMemo(() => {
    const m = new THREE.MeshStandardNodeMaterial();
    m.transparent = true;
    m.depthWrite = false;
    m.blending = THREE.AdditiveBlending;
    m.color = new THREE.Color(color);
    m.emissive = new THREE.Color(color);
    m.emissiveIntensity = 5.0;
    m.opacity = 1.0;
    return m;
  }, [color]);

  useFrame((_, delta) => {
    ageRef.current += delta;
    const t = Math.min(ageRef.current / 0.6, 1.0);
    if (meshRef.current) {
      meshRef.current.scale.setScalar(0.15 + t * 0.65); // 0.15 → 0.8
      mat.opacity = Math.max(0, 1.0 - t);
    }
  });

  return (
    <mesh ref={meshRef} position={position} material={mat}>
      <sphereGeometry args={[1, 12, 8]} />
    </mesh>
  );
}

function TraceRequestBall({
  traceStep,
  traceProgress,
  activePath,
  visitedConnections: _visitedConnections,
  onBallArrival,
  onFloorPoint,
}: {
  traceStep: number;
  traceProgress: number;
  activePath: string[];
  visitedConnections: Set<string>;
  onBallArrival: (serviceId: string, pos: THREE.Vector3, color: number) => void;
  onFloorPoint: (pos: THREE.Vector3) => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const trailRef = useRef<THREE.InstancedMesh>(null);
  const historyRef = useRef<THREE.Vector3[]>([]);
  // #82: Speed trail position history
  const speedHistoryRef = useRef<THREE.Vector3[]>([]);
  // #60: Accumulated rotation for spinning ball
  const spinRef = useRef(0);
  // #81: Lerp color ref
  const ballColorRef = useRef(new THREE.Color(0xffee44));
  const prevStepRef = useRef(-1);
  // #87: Track arrivals to spawn bursts
  const arrivedStepRef = useRef(-1);
  // #88: Floor trail update throttle
  const lastFloorUpdateRef = useRef(new THREE.Vector3(9999, 0, 0));

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

  // #82: Speed trail ghost materials with decreasing opacity
  const speedTrailMats = useMemo(() => {
    const opacities = [0.3, 0.2, 0.1, 0.05];
    return opacities.map((op) => {
      const m = new THREE.MeshStandardNodeMaterial();
      m.transparent = true;
      m.depthWrite = false;
      m.blending = THREE.AdditiveBlending;
      m.color = new THREE.Color(0xffcc44);
      m.emissive = new THREE.Color(0xffcc44);
      m.emissiveIntensity = 2.0;
      m.opacity = op;
      return m;
    });
  }, []);

  // #60: Spin the ball on Y axis at 3 rad/sec using useFrame
  useFrame((_, delta) => {
    if (meshRef.current) {
      spinRef.current += delta * 3.0;
      meshRef.current.rotation.y = spinRef.current;
    }
  });

  if (traceStep >= activePath.length - 1) return null;

  const fromId = activePath[traceStep];
  const toId = activePath[traceStep + 1];
  const fromS = serviceMap.get(fromId)!;
  const toS = serviceMap.get(toId)!;
  const x = fromS.position[0] + (toS.position[0] - fromS.position[0]) * traceProgress;
  const y = fromS.position[1] + (toS.position[1] - fromS.position[1]) * traceProgress;
  const z = fromS.position[2] + (toS.position[2] - fromS.position[2]) * traceProgress;

  // #81: Lerp ball color toward destination service type color
  const targetHex = getTypeHex(toS.type);
  const targetColor = new THREE.Color(targetHex);
  ballColorRef.current.lerp(targetColor, 0.05);
  mat.color.copy(ballColorRef.current);
  mat.emissive.copy(ballColorRef.current);
  haloMat.color.copy(ballColorRef.current);
  haloMat.emissive.copy(ballColorRef.current);
  // Also update speed trail color
  for (const stm of speedTrailMats) {
    stm.color.copy(ballColorRef.current);
    stm.emissive.copy(ballColorRef.current);
  }

  // #87: Detect step change → fire arrival burst
  if (traceStep !== prevStepRef.current) {
    prevStepRef.current = traceStep;
    if (traceStep !== arrivedStepRef.current) {
      arrivedStepRef.current = traceStep;
      const arrPos = new THREE.Vector3(fromS.position[0], fromS.position[1], fromS.position[2]);
      onBallArrival(fromId, arrPos, targetHex);
    }
  }

  // Update trail history
  const pos = new THREE.Vector3(x, y, z);
  if (historyRef.current.length === 0 || historyRef.current[historyRef.current.length - 1].distanceTo(pos) > 0.15) {
    historyRef.current.push(pos.clone());
    if (historyRef.current.length > TRAIL_COUNT) historyRef.current.shift();
  }

  // #82: Update speed trail (4 evenly spaced history positions)
  if (speedHistoryRef.current.length === 0 || speedHistoryRef.current[speedHistoryRef.current.length - 1].distanceTo(pos) > 0.08) {
    speedHistoryRef.current.push(pos.clone());
    if (speedHistoryRef.current.length > SPEED_TRAIL_COUNT + 2) speedHistoryRef.current.shift();
  }

  // #88: Drop floor trail point every 0.4 units
  if (lastFloorUpdateRef.current.distanceTo(pos) > 0.4) {
    lastFloorUpdateRef.current.copy(pos);
    onFloorPoint(pos.clone());
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

  // #82: Speed trail ghost ellipsoids — 4 copies at previous positions
  const speedTrailHistory = speedHistoryRef.current;

  // #83: Destination label text
  const destLabel = `→ ${toS.label}`;

  return (
    <>
      <group position={[x, y, z]}>
        <mesh ref={meshRef} material={mat}>
          <sphereGeometry args={[0.15, 12, 8]} />
        </mesh>
        <mesh material={haloMat} scale={[2.5, 2.5, 2.5]}>
          <sphereGeometry args={[0.15, 8, 6]} />
        </mesh>
        <pointLight color={`#${ballColorRef.current.getHexString()}`} intensity={4} distance={5} />

        {/* #83: Destination label badge */}
        <Html position={[0, 0.45, 0]} center>
          <div style={{
            color: '#ffffff',
            fontSize: '9px',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            background: `rgba(5,10,25,0.88)`,
            padding: '2px 7px',
            borderRadius: '10px',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            border: `1px solid #${ballColorRef.current.getHexString()}88`,
            fontWeight: 'bold',
            letterSpacing: '0.3px',
            boxShadow: `0 0 8px #${ballColorRef.current.getHexString()}44`,
          }}>
            {destLabel}
          </div>
        </Html>
      </group>

      {/* Original trail */}
      <instancedMesh ref={trailRef} args={[undefined, undefined, TRAIL_COUNT]} material={trailMat}>
        <sphereGeometry args={[1, 6, 6]} />
      </instancedMesh>

      {/* #82: Speed trail ghost ellipsoids */}
      {speedTrailHistory.slice(-SPEED_TRAIL_COUNT).reverse().map((hp, i) => (
        <mesh
          key={i}
          position={hp}
          material={speedTrailMats[i] ?? speedTrailMats[SPEED_TRAIL_COUNT - 1]}
          scale={[0.15, 0.15, 0.4]}
        >
          <sphereGeometry args={[1, 6, 4]} />
        </mesh>
      ))}
    </>
  );
}

// ── Tier Labels ──

function TierLabels() {
  const tiers = [
    { label: 'CLIENT', y: 6.5 },
    { label: 'EDGE', y: 4 },
    { label: 'SERVICES', y: 1.5 },
    { label: 'DATA', y: -1 },
  ];

  // Separator lines between tiers
  const separatorY = [5.25, 2.75, 0.25]; // between client-edge, edge-services, services-data

  const sepMatRef = useRef<THREE.MeshBasicNodeMaterial | null>(null);
  const sepMeshRefs = useRef<(THREE.Mesh | null)[]>([]);

  const sepMat = useMemo(() => {
    const mat = new THREE.MeshBasicNodeMaterial();
    mat.transparent = true;
    mat.opacity = 0.08;
    mat.color = new THREE.Color(0x4488cc);
    sepMatRef.current = mat;
    return mat;
  }, []);

  // #57: Track camera X offset for parallax on tier labels
  const { camera } = useThree();
  const [parallaxX, setParallaxX] = useState(0);

  useFrame((state) => {
    // #56: Pulse separator line opacity between 0.04 and 0.12 using sin(time)
    if (sepMatRef.current) {
      const t = state.clock.elapsedTime;
      sepMatRef.current.opacity = 0.08 + Math.sin(t * 0.7) * 0.04;
    }

    // #57: Compute parallax offset from camera drift (opposite direction, subtle)
    const camX = camera.position.x;
    // Parallax: labels move slightly opposite to camera X drift
    setParallaxX(-(camX - 1) * 0.08);
  });

  return (
    <>
      {tiers.map((t) => (
        <Html key={t.label} position={[-10 + parallaxX, t.y, 0]} center>
          <div style={{
            color: 'rgba(100,160,220,0.5)', fontSize: '10px', fontWeight: 'bold',
            letterSpacing: '3px', whiteSpace: 'nowrap', pointerEvents: 'none',
            // #97: Stronger text shadow for better readability against dark background
            textShadow: '0 0 12px rgba(68,136,204,0.6), 0 1px 3px rgba(0,0,0,0.8), 0 0 30px rgba(68,136,204,0.2)',
            fontFamily: 'system-ui, -apple-system, sans-serif',
          }}>
            {t.label}
          </div>
        </Html>
      ))}
      {separatorY.map((y, i) => (
        <mesh key={y} ref={(el) => { sepMeshRefs.current[i] = el; }} position={[1, y, 0]} rotation={[0, 0, 0]}>
          <planeGeometry args={[22, 0.01]} />
          <primitive object={sepMat} attach="material" />
        </mesh>
      ))}
    </>
  );
}

// ── Background Stars ──

// #78: Color temperature palette for stars — warm white, cool blue, slight purple
const STAR_COLORS = [
  new THREE.Color(0xddeeff), // warm white
  new THREE.Color(0x8899cc), // cool blue
  new THREE.Color(0x6677bb), // cool blue-grey
  new THREE.Color(0xaabbdd), // neutral blue-white
  new THREE.Color(0x9988cc), // slight purple
  new THREE.Color(0xccddff), // bright cold white
];

function BackgroundStars() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  // #53: Group ref for slow rotation of all stars as a group
  const groupRef = useRef<THREE.Group>(null);
  const COUNT = 150;

  const starMat = useMemo(() => {
    const mat = new THREE.MeshBasicNodeMaterial();
    mat.transparent = true;
    mat.depthWrite = false;
    // #78: base color white so instanceColor takes over
    mat.color = new THREE.Color(0xffffff);
    mat.opacity = 0.6;
    return mat;
  }, []);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    // #78: Assign varied color temperatures via instanceColor
    const colors = new Float32Array(COUNT * 3);
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
      const c = STAR_COLORS[i % STAR_COLORS.length];
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    mesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
    mesh.instanceMatrix.needsUpdate = true;
  }, []);

  useFrame((state, delta) => {
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

    // #53: Slowly rotate the star group as a whole
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.003;
    }
  });

  return (
    // #53: Wrap in a group to rotate all stars together
    <group ref={groupRef}>
      <instancedMesh ref={meshRef} args={[undefined, undefined, COUNT]} material={starMat}>
        <sphereGeometry args={[1, 4, 4]} />
      </instancedMesh>
    </group>
  );
}

// ── Ambient Particle Clusters (mid-ground atmosphere) ──

// #73: 3-4 very subtle ambient particle clusters floating in mid-ground
function AmbientParticleClusters() {
  const clusterConfigs = useMemo(() => [
    { center: [-4, 3, -3], count: 30, color: new THREE.Color(0x4466cc) },
    { center: [6, 2, -4], count: 30, color: new THREE.Color(0x336699) },
    { center: [0, 0, -5], count: 28, color: new THREE.Color(0x224488) },
    { center: [3, 5, -3], count: 25, color: new THREE.Color(0x5566bb) },
  ] as const, []);

  const TOTAL = clusterConfigs.reduce((a, c) => a + c.count, 0);

  const meshRef = useRef<THREE.InstancedMesh>(null);
  // Store initial positions and drift offsets per particle
  const initDataRef = useRef<{ px: number; py: number; pz: number; phase: number; speed: number }[]>([]);

  const mat = useMemo(() => {
    const m = new THREE.MeshBasicNodeMaterial();
    m.transparent = true;
    m.depthWrite = false;
    m.blending = THREE.AdditiveBlending;
    m.color = new THREE.Color(0xffffff);
    m.opacity = 0.18;
    return m;
  }, []);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const colors = new Float32Array(TOTAL * 3);
    const initData: typeof initDataRef.current = [];
    const dummy = new THREE.Object3D();
    let idx = 0;

    for (const cluster of clusterConfigs) {
      for (let i = 0; i < cluster.count; i++) {
        const spread = 3.5;
        const px = cluster.center[0] + (Math.random() - 0.5) * spread;
        const py = cluster.center[1] + (Math.random() - 0.5) * spread * 0.6;
        const pz = cluster.center[2] + (Math.random() - 0.5) * spread;
        dummy.position.set(px, py, pz);
        dummy.scale.setScalar(0.01 + Math.random() * 0.01);
        dummy.updateMatrix();
        mesh.setMatrixAt(idx, dummy.matrix);
        colors[idx * 3] = cluster.color.r;
        colors[idx * 3 + 1] = cluster.color.g;
        colors[idx * 3 + 2] = cluster.color.b;
        initData.push({ px, py, pz, phase: Math.random() * Math.PI * 2, speed: 0.1 + Math.random() * 0.1 });
        idx++;
      }
    }
    initDataRef.current = initData;
    mesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
    mesh.instanceMatrix.needsUpdate = true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFrame((state) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const t = state.clock.elapsedTime;
    const dummy = new THREE.Object3D();
    const data = initDataRef.current;
    for (let i = 0; i < data.length; i++) {
      const d = data[i];
      dummy.position.set(
        d.px + Math.sin(t * d.speed + d.phase) * 0.3,
        d.py + Math.cos(t * d.speed * 0.7 + d.phase) * 0.2,
        d.pz + Math.sin(t * d.speed * 0.5 + d.phase + 1.0) * 0.25,
      );
      dummy.scale.setScalar(0.01 + Math.abs(Math.sin(t * d.speed + d.phase)) * 0.01);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, TOTAL]} material={mat}>
      <sphereGeometry args={[1, 4, 4]} />
    </instancedMesh>
  );
}

// ── Nebula Background Spheres ──

// #77: 3 large translucent spheres with BackSide + AdditiveBlending for nebula effect
function NebulaSpheres() {
  const configs = useMemo(() => [
    { pos: [-8, 8, -30], radius: 14, color: 0x112255 },
    { pos: [10, 2, -35], radius: 16, color: 0x0a1a44 },
    { pos: [1, -3, -28], radius: 12, color: 0x0d1133 },
  ], []);

  const mats = useMemo(() => configs.map((c) => {
    const m = new THREE.MeshBasicNodeMaterial();
    m.transparent = true;
    m.depthWrite = false;
    m.side = THREE.BackSide;
    m.blending = THREE.AdditiveBlending;
    m.color = new THREE.Color(c.color);
    m.opacity = 0.02;
    return m;
  }), [configs]);

  return (
    <>
      {configs.map((c, i) => (
        <mesh key={i} position={c.pos as [number, number, number]} material={mats[i]}>
          <sphereGeometry args={[c.radius, 12, 12]} />
        </mesh>
      ))}
    </>
  );
}

// ── Floor Glow Rings (per service) ──

// #74: Subtle glow ring on floor below each service, at y=-2.49, service color, opacity 0.04, radius 1.2
function FloorGlowRings() {
  const mats = useMemo(() =>
    SERVICES.map((s) => {
      const m = new THREE.MeshBasicNodeMaterial();
      m.transparent = true;
      m.depthWrite = false;
      m.blending = THREE.AdditiveBlending;
      m.color = new THREE.Color(s.hex);
      m.opacity = 0.04;
      return m;
    }), []);

  return (
    <>
      {SERVICES.map((s, i) => (
        <mesh
          key={s.id}
          position={[s.position[0], -2.49, s.position[2]]}
          rotation={[-Math.PI / 2, 0, 0]}
          material={mats[i]}
        >
          <circleGeometry args={[1.2, 32]} />
        </mesh>
      ))}
    </>
  );
}

// ── Main Component ──

export default function ArchitectureBlueprint() {
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [hoveredService, setHoveredService] = useState<string | null>(null);
  const [, setFocusedService] = useState<string | null>(null);
  const [traceActive, setTraceActive] = useState(false);
  const [traceIsWrite, setTraceIsWrite] = useState(false);
  const traceIsWriteRef = useRef(false);
  const [traceStep, setTraceStep] = useState(0);
  const [traceProgress, setTraceProgress] = useState(0);
  const [traceComplete, setTraceComplete] = useState(false);
  const [traceCompletePath, setTraceCompletePath] = useState<string[]>([]);
  const traceCompleteTimeRef = useRef(0);
  const traceAutoHoveredRef = useRef<string | null>(null);
  const timeRef = useRef(0);
  const targetPos = useRef(new THREE.Vector3(1, 3, 22));
  const targetLookAt = useRef(new THREE.Vector3(1, 2.5, 0));
  const { camera } = useThree();

  // #84: Track which connection pairs (fromId-toId) have been visited during trace
  const [visitedConnections, setVisitedConnections] = useState<Set<string>>(new Set());
  const visitedConnectionsRef = useRef<Set<string>>(new Set());
  const prevTraceStepVisitRef = useRef(-1);

  // #85: Camera follow — lerp lookAt 30% toward trace ball
  const traceBallPosRef = useRef(new THREE.Vector3(0, 0, 0));

  // #87: Burst particles — list of { id, position, color } to render
  const [burstEffects, setBurstEffects] = useState<{ id: number; position: [number, number, number]; color: number }[]>([]);
  const burstCounterRef = useRef(0);

  // #88: Floor trail points accumulated during trace
  const [floorTrailPoints, setFloorTrailPoints] = useState<THREE.Vector3[]>([]);
  const floorTrailPointsRef = useRef<THREE.Vector3[]>([]);
  const floorTrailFadeRef = useRef(0);
  const [floorTrailFadeTime, setFloorTrailFadeTime] = useState(0);

  // #89: Completion ball state
  const [completionBall, setCompletionBall] = useState<{ position: THREE.Vector3; color: number } | null>(null);
  const completionBallTimerRef = useRef(0);

  // #59: Mount time for entrance stagger animation
  const [mountTime, setMountTime] = useState(0);
  const mountTimeRef = useRef(0);

  // #55: Pulse wave time per service — maps service id to time since arrival
  const pulseWaveTimesRef = useRef<Record<string, number>>({});
  const [pulseWaveTimes, setPulseWaveTimes] = useState<Record<string, number>>({});
  const prevTraceStepRef = useRef(-1);

  // #93: Data flash times per service — maps service id to flash intensity (0-1) for particle arrival
  const dataFlashTimesRef = useRef<Record<string, number>>({});
  const [dataFlashTimes, setDataFlashTimes] = useState<Record<string, number>>({});

  const handleParticleArrival = useCallback((serviceId: string) => {
    dataFlashTimesRef.current[serviceId] = 1.0; // start at full flash
    setDataFlashTimes({ ...dataFlashTimesRef.current });
  }, []);

  const handleSelect = useCallback(
    (id: string) => {
      // #90: During trace, clicking services shows details without interrupting the animation
      if (traceActive) {
        setSelectedService((prev) => prev === id ? null : id);
        return;
      }
      if (selectedService === id) {
        setSelectedService(null);
        setFocusedService(null);
        targetPos.current.set(1, 3, 22);
        targetLookAt.current.set(1, 2.5, 0);
      } else {
        setSelectedService(id);
        setFocusedService(null);
        const s = serviceMap.get(id)!;
        targetPos.current.set(s.position[0] + 1.5, s.position[1] + 2.5, s.position[2] + 7);
        targetLookAt.current.set(s.position[0], s.position[1], s.position[2]);
      }
    },
    [selectedService, traceActive],
  );

  const handleDoubleClick = useCallback(
    (id: string) => {
      setSelectedService(id);
      setFocusedService(id);
      const s = serviceMap.get(id)!;
      targetPos.current.set(s.position[0] + 0.5, s.position[1] + 1.5, s.position[2] + 4);
      targetLookAt.current.set(s.position[0], s.position[1], s.position[2]);
    },
    [],
  );

  const handleEmptyClick = useCallback(() => {
    setSelectedService(null);
    setFocusedService(null);
    targetPos.current.set(1, 3, 22);
    targetLookAt.current.set(1, 2.5, 0);
  }, []);

  const handleResetView = useCallback(() => {
    setSelectedService(null);
    setFocusedService(null);
    targetPos.current.set(1, 3, 22);
    targetLookAt.current.set(1, 2.5, 0);
  }, []);

  const handleTraceRequest = useCallback(() => {
    setTraceActive(true);
    setTraceIsWrite(false);
    traceIsWriteRef.current = false;
    setTraceStep(0);
    setTraceProgress(0);
    setTraceComplete(false);
    setSelectedService(null);
    setFocusedService(null);
    targetPos.current.set(1, 3, 22);
    targetLookAt.current.set(1, 2.5, 0);
    // Reset trace-related state
    visitedConnectionsRef.current = new Set();
    setVisitedConnections(new Set());
    prevTraceStepVisitRef.current = -1;
    floorTrailPointsRef.current = [];
    setFloorTrailPoints([]);
    floorTrailFadeRef.current = 0;
    setFloorTrailFadeTime(0);
    setCompletionBall(null);
    completionBallTimerRef.current = 0;
    setBurstEffects([]);
  }, []);

  const handleTraceWrite = useCallback(() => {
    setTraceActive(true);
    setTraceIsWrite(true);
    traceIsWriteRef.current = true;
    setTraceStep(0);
    setTraceProgress(0);
    setTraceComplete(false);
    setSelectedService(null);
    setFocusedService(null);
    targetPos.current.set(1, 3, 22);
    targetLookAt.current.set(1, 2.5, 0);
    // Reset trace-related state
    visitedConnectionsRef.current = new Set();
    setVisitedConnections(new Set());
    prevTraceStepVisitRef.current = -1;
    floorTrailPointsRef.current = [];
    setFloorTrailPoints([]);
    floorTrailFadeRef.current = 0;
    setFloorTrailFadeTime(0);
    setCompletionBall(null);
    completionBallTimerRef.current = 0;
    setBurstEffects([]);
  }, []);

  // #87: Callback when trace ball arrives at a service
  const handleBallArrival = useCallback((serviceId: string, pos: THREE.Vector3, color: number) => {
    void serviceId;
    const id = burstCounterRef.current++;
    setBurstEffects((prev) => [...prev, { id, position: [pos.x, pos.y, pos.z] as [number, number, number], color }]);
    // Remove burst after 0.6s
    setTimeout(() => {
      setBurstEffects((prev) => prev.filter((b) => b.id !== id));
    }, 600);
  }, []);

  // #88: Callback when trace ball drops a floor trail point
  const handleFloorPoint = useCallback((pos: THREE.Vector3) => {
    floorTrailPointsRef.current = [...floorTrailPointsRef.current, pos];
    setFloorTrailPoints([...floorTrailPointsRef.current]);
  }, []);

  // Escape key deselects
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedService(null);
        setFocusedService(null);
        targetPos.current.set(1, 3, 22);
        targetLookAt.current.set(1, 2.5, 0);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
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

  // Trace complete flash alpha (1 → 0 over 2s)
  const traceFlashAlpha = traceComplete
    ? Math.max(0, 1 - traceCompleteTimeRef.current / 2.0)
    : 0;

  // Determine if we should dim non-connected services
  const activeContext = hoveredService ?? selectedService;
  const shouldDim = activeContext !== null;

  // Background material (exception: simple screenUV gradient allowed)
  const bgMat = useMemo(() => {
    const mat = new THREE.MeshBasicNodeMaterial();
    mat.side = THREE.BackSide;
    // #71: Deeper gradient — darker bottom with slight warm dark, blue-purple top
    const bottom = vec3(0.005, 0.008, 0.025);
    const top = vec3(0.01, 0.005, 0.03);
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

  const currentLookAt = useRef(new THREE.Vector3(1, 2.5, 0));

  // #76: Ambient light ref for slow color cycling
  const ambientLightRef = useRef<THREE.AmbientLight>(null);

  useFrame((_, delta) => {
    timeRef.current += delta;

    // #76: Slowly cycle ambient light color through blue-purple-blue (period 20s)
    if (ambientLightRef.current) {
      const t = timeRef.current;
      const cycle = Math.sin((t / 20) * Math.PI * 2); // -1 to 1 over 20s
      // Blue: 0x334466, Purple tint: blend toward 0x442255
      const r = 0.2 + cycle * 0.07;   // 0.13–0.27
      const g = 0.27 + cycle * (-0.04); // 0.23–0.31
      const b = 0.4 + cycle * 0.05;   // 0.35–0.45
      ambientLightRef.current.color.setRGB(r, g, b);
    }

    // #59: Advance mount time for entrance stagger animation
    mountTimeRef.current += delta;
    if (mountTimeRef.current !== mountTime) {
      // Only update state while entrance is still running (last service at index 9, delay 0.9s + 0.5s duration = 1.4s)
      const maxEntranceTime = (SERVICES.length - 1) * 0.1 + 0.5 + 0.05;
      if (mountTimeRef.current <= maxEntranceTime) {
        setMountTime(mountTimeRef.current);
      } else if (mountTime < maxEntranceTime) {
        setMountTime(maxEntranceTime);
      }
    }

    // #55: Detect when trace ball arrives at a new service and trigger pulse wave
    const activePath = traceIsWriteRef.current ? TRACE_PATH_WRITE : TRACE_PATH;
    if (traceActive && traceStep !== prevTraceStepRef.current) {
      prevTraceStepRef.current = traceStep;
      const arrivedId = activePath[traceStep];
      if (arrivedId) {
        pulseWaveTimesRef.current[arrivedId] = 0;
        setPulseWaveTimes({ ...pulseWaveTimesRef.current });
      }
    }

    // Advance all active pulse wave timers
    let pulseChanged = false;
    for (const id of Object.keys(pulseWaveTimesRef.current)) {
      pulseWaveTimesRef.current[id] += delta;
      if (pulseWaveTimesRef.current[id] > 0.5) {
        delete pulseWaveTimesRef.current[id];
        pulseChanged = true;
      } else {
        pulseChanged = true;
      }
    }
    if (pulseChanged) {
      setPulseWaveTimes({ ...pulseWaveTimesRef.current });
    }

    // #93: Advance data flash decay (flash decays from 1 to 0 over 0.3s)
    let flashChanged = false;
    for (const id of Object.keys(dataFlashTimesRef.current)) {
      dataFlashTimesRef.current[id] -= delta / 0.3;
      if (dataFlashTimesRef.current[id] <= 0) {
        delete dataFlashTimesRef.current[id];
        flashChanged = true;
      } else {
        flashChanged = true;
      }
    }
    if (flashChanged) {
      setDataFlashTimes({ ...dataFlashTimesRef.current });
    }

    // Trace animation
    if (traceActive) {
      // #84: Mark connection as visited when step advances
      if (traceStep !== prevTraceStepVisitRef.current) {
        prevTraceStepVisitRef.current = traceStep;
        if (traceStep < activePath.length - 1) {
          const fromId = activePath[traceStep];
          const toId = activePath[traceStep + 1];
          const key = `${fromId}-${toId}`;
          if (!visitedConnectionsRef.current.has(key)) {
            visitedConnectionsRef.current = new Set(visitedConnectionsRef.current);
            visitedConnectionsRef.current.add(key);
            setVisitedConnections(new Set(visitedConnectionsRef.current));
          }
        }
      }

      // #85: Update trace ball position for camera follow
      if (traceStep < activePath.length - 1) {
        const fromId = activePath[traceStep];
        const toId = activePath[traceStep + 1];
        const fS = serviceMap.get(fromId);
        const tS = serviceMap.get(toId);
        if (fS && tS) {
          traceBallPosRef.current.set(
            fS.position[0] + (tS.position[0] - fS.position[0]) * traceProgress,
            fS.position[1] + (tS.position[1] - fS.position[1]) * traceProgress,
            fS.position[2] + (tS.position[2] - fS.position[2]) * traceProgress,
          );
        }
      }

      setTraceProgress((prev) => {
        const next = prev + delta * 1.2; // ~0.8s per segment
        if (next >= 1) {
          const nextStep = traceStep + 1;
          if (nextStep >= activePath.length - 1) {
            setTraceActive(false);
            setTraceStep(0);
            // Trigger trace-complete flash
            setTraceComplete(true);
            setTraceCompletePath([...activePath]);
            traceCompleteTimeRef.current = 0;
            // #88: Start floor trail fade
            floorTrailFadeRef.current = 0;
            setFloorTrailFadeTime(0);
            // #89: Spawn completion ball at last position
            const lastId = activePath[activePath.length - 1];
            const lastS = serviceMap.get(lastId);
            if (lastS) {
              setCompletionBall({
                position: new THREE.Vector3(...lastS.position),
                color: getTypeHex(lastS.type),
              });
              completionBallTimerRef.current = 0;
            }
            return 0;
          }
          setTraceStep(nextStep);
          return 0;
        }
        return next;
      });
    }

    // #88: Advance floor trail fade after trace completes
    if (!traceActive && floorTrailPointsRef.current.length > 0) {
      floorTrailFadeRef.current += delta;
      setFloorTrailFadeTime(floorTrailFadeRef.current);
      if (floorTrailFadeRef.current >= 3.0) {
        floorTrailPointsRef.current = [];
        setFloorTrailPoints([]);
        floorTrailFadeRef.current = 0;
      }
    }

    // #89: Remove completion ball after 0.65s
    if (completionBall) {
      completionBallTimerRef.current += delta;
      if (completionBallTimerRef.current >= 0.65) {
        setCompletionBall(null);
      }
    }

    // Auto-highlight current trace service during trace (only call setState on change)
    if (traceActive) {
      const currentId = activePath[Math.min(traceStep, activePath.length - 1)];
      if (traceAutoHoveredRef.current !== currentId) {
        traceAutoHoveredRef.current = currentId;
        setHoveredService(currentId);
      }
    } else if (traceAutoHoveredRef.current !== null) {
      traceAutoHoveredRef.current = null;
    }

    // Trace complete flash — fade over 2s
    if (traceComplete) {
      traceCompleteTimeRef.current += delta;
      if (traceCompleteTimeRef.current >= 2.0) {
        setTraceComplete(false);
        setTraceCompletePath([]);
        setHoveredService(null);
        // Also clear visited connections after completion flash
        visitedConnectionsRef.current = new Set();
        setVisitedConnections(new Set());
      }
    }

    // Idle drift — slowly orbit camera when nothing is selected
    const isIdle = !selectedService && !traceActive;
    const t = timeRef.current;
    const driftPeriod = 30; // ~30s period
    const driftRadius = 0.5;
    const driftX = isIdle ? Math.sin((t / driftPeriod) * Math.PI * 2) * driftRadius : 0;
    const driftZ = isIdle ? Math.cos((t / driftPeriod) * Math.PI * 2) * driftRadius : 0;

    // Ease-out lerp factor
    const lerpFactor = 0.04 + 0.06 * (1 - Math.exp(-delta * 3));

    const driftedTarget = new THREE.Vector3(
      targetPos.current.x + driftX,
      targetPos.current.y,
      targetPos.current.z + driftZ,
    );
    camera.position.lerp(driftedTarget, lerpFactor);

    // #85: Camera follow — lerp lookAt 30% toward trace ball position during trace
    const baseLookAt = targetLookAt.current.clone();
    const effectiveLookAt = traceActive
      ? baseLookAt.lerp(traceBallPosRef.current, 0.3)
      : baseLookAt;
    currentLookAt.current.lerp(effectiveLookAt, lerpFactor);
    camera.lookAt(currentLookAt.current);
  });

  return (
    <>
      {/* Blue-tinted ambient for holographic atmosphere */}
      {/* #76: ref for slow color cycling in useFrame */}
      <ambientLight ref={ambientLightRef} intensity={0.12} color={0x334466} />
      {/* #100: Increased main directional light 0.5 → 0.6 for better scene illumination */}
      <directionalLight position={[5, 12, 8]} intensity={0.6} color={0x6688cc} />
      <directionalLight position={[-5, 5, -5]} intensity={0.15} color={0x4466aa} />
      {/* Subtle colored fill lights for depth */}
      <pointLight position={[-6, 6, 4]} intensity={1.5} color={0x2244aa} distance={20} />
      <pointLight position={[8, 0, 4]} intensity={1.0} color={0x224488} distance={18} />
      {/* #100: Warm fill light from below-right for three-point lighting depth */}
      <pointLight position={[6, -3, 6]} intensity={0.3} color={0x332211} distance={25} />

      {/* Background atmosphere */}
      <mesh material={bgMat}>
        <sphereGeometry args={[50, 16, 16]} />
      </mesh>

      {/* #77: Nebula background glow spheres */}
      <NebulaSpheres />

      {/* Background stars */}
      <BackgroundStars />

      {/* Click background to deselect */}
      <mesh position={[0, 3, -5]} material={bgClickMat} onClick={handleEmptyClick}>
        <planeGeometry args={[60, 50]} />
      </mesh>

      {/* #72: Subtle exponential fog for depth */}
      <fogExp2 attach="fog" args={[0x010408, 0.015]} />

      {/* Blueprint grid floor */}
      <BlueprintGridFloor />

      {/* #74: Floor glow rings below each service */}
      <FloorGlowRings />

      {/* #73: Ambient particle clusters in mid-ground */}
      <AmbientParticleClusters />

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
          traceFlash={traceCompletePath.includes(service.id) ? traceFlashAlpha : 0}
          dataFlash={dataFlashTimes[service.id] ?? 0}
          onSelect={handleSelect}
          onDoubleClick={handleDoubleClick}
          onHover={setHoveredService}
          index={i}
          mountTime={mountTime}
          pulseWaveTime={pulseWaveTimes[service.id] ?? 0}
        />
      ))}

      {/* #80: Dim point lights below each service at y=-2, reflect service color on floor */}
      {SERVICES.map((s) => (
        <pointLight
          key={`floor-light-${s.id}`}
          position={[s.position[0], -2, s.position[2]]}
          color={s.color}
          intensity={0.1}
          distance={3}
        />
      ))}

      {/* Connection pipes */}
      {FLOWS.map((flow, i) => (
        <ConnectionPipe
          key={`${flow.from}-${flow.to}`}
          flow={flow}
          isHighlighted={highlightedFlows.has(i)}
          selectedService={selectedService}
          isVisited={visitedConnections.has(`${flow.from}-${flow.to}`)}
        />
      ))}

      {/* Data flow particles */}
      <FlowParticles
        hoveredService={hoveredService}
        selectedService={selectedService}
        onParticleArrival={handleParticleArrival}
      />

      {/* Trace request ball */}
      {traceActive && (
        <TraceRequestBall
          traceStep={traceStep}
          traceProgress={traceProgress}
          activePath={traceIsWrite ? TRACE_PATH_WRITE : TRACE_PATH}
          visitedConnections={visitedConnections}
          onBallArrival={handleBallArrival}
          onFloorPoint={handleFloorPoint}
        />
      )}

      {/* #87: Burst particle effects on service arrival */}
      {burstEffects.map((b) => (
        <TraceBurstParticles key={b.id} position={b.position} color={b.color} />
      ))}

      {/* #88: Floor light trail */}
      {floorTrailPoints.length > 0 && (
        <FloorLightTrail positions={floorTrailPoints} fadeTime={floorTrailFadeTime} />
      )}

      {/* #89: Completion ball expansion */}
      {completionBall && (
        <TraceCompletionBall position={completionBall.position} color={completionBall.color} />
      )}

      {/* Detail panel for selected service */}
      {selectedService && (
        <DetailPanel
          service={serviceMap.get(selectedService)!}
          connectedFlows={connectedFlows}
          onClose={handleEmptyClick}
        />
      )}

      {/* #79: Vignette — darken corners via CSS radial gradient overlay */}
      {/* #98: Stronger corners (0.65 opacity) and transparent zone starts at 50% */}
      <Html fullscreen>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            background: 'radial-gradient(ellipse at 50% 50%, transparent 50%, rgba(0,0,4,0.65) 100%)',
            zIndex: 0,
          }}
        />
      </Html>

      {/* Instructions overlay (top-left) */}
      <Html fullscreen>
        <div style={{
          position: 'absolute', top: '16px', left: '16px',
          color: 'rgba(255,255,255,0.75)', fontSize: '11px',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          background: 'rgba(5,10,25,0.75)', padding: '12px 16px',
          borderRadius: '8px', lineHeight: '1.7',
          maxWidth: '200px', pointerEvents: 'none',
          border: '1px solid rgba(68,136,204,0.15)',
          // #99: Subtle border-bottom glow matching blue theme
          borderBottom: '1px solid rgba(68,136,204,0.4)',
          boxShadow: '0 4px 12px rgba(68,136,204,0.15)',
          backdropFilter: 'blur(4px)',
          overflow: 'hidden',
        }}>
          {/* #61: Subtle top border gradient strip */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: '2px',
            background: 'linear-gradient(90deg, transparent, #4488cc88, #88bbff99, #4488cc88, transparent)',
          }} />
          <div style={{ fontWeight: 'bold', marginBottom: '6px', color: '#88bbff', fontSize: '13px', letterSpacing: '0.5px' }}>System Architecture</div>
          <div style={{ opacity: 0.8 }}>Click a service to inspect</div>
          <div style={{ opacity: 0.8 }}>Double-click to zoom in</div>
          <div style={{ opacity: 0.8 }}>Hover to see connections</div>
          <div style={{ marginTop: '6px', fontSize: '10px', opacity: 0.5, borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '6px' }}>
            Esc to deselect · sidebar to navigate
          </div>
          {/* #64: Legend section */}
          <div style={{ marginTop: '8px', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '8px' }}>
            <div style={{ fontSize: '9px', fontWeight: 'bold', color: 'rgba(136,187,255,0.6)', letterSpacing: '0.5px', marginBottom: '5px', textTransform: 'uppercase' }}>Shape Legend</div>
            {[
              { shape: '▬', label: 'Frontend', color: '#61dafb' },
              { shape: '■', label: 'Backend', color: '#22cc88' },
              { shape: '⬡', label: 'Database', color: '#ffaa22' },
              { shape: '◆', label: 'Cache', color: '#ff8844' },
              { shape: '◎', label: 'CDN / Queue', color: '#f38020' },
              { shape: '✦', label: 'External', color: '#cc44ff' },
            ].map(({ shape, label, color }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px', fontSize: '9px' }}>
                <span style={{ color, fontSize: '11px', lineHeight: 1, flexShrink: 0 }}>{shape}</span>
                <span style={{ opacity: 0.7 }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </Html>

      {/* Service list sidebar (right) */}
      <Html fullscreen>
        <div style={{
          position: 'absolute', top: '16px', right: '16px',
          color: 'white', fontSize: '11px',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          background: 'rgba(5,10,25,0.75)', padding: '10px 12px',
          borderRadius: '6px', maxWidth: '160px',
          // #70: Scrollable sidebar
          maxHeight: 'calc(100vh - 100px)',
          overflowY: 'auto',
          pointerEvents: 'none', backdropFilter: 'blur(4px)',
          border: '1px solid rgba(100,150,255,0.15)',
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: '6px', color: '#88bbff', fontSize: '11px' }}>Services</div>
          {SERVICES.map(s => {
            const isSelected = selectedService === s.id;
            const isHoveredInSidebar = hoveredService === s.id;
            const healthColor = getHealthColor(s.health);
            // #90: During trace, clicking a service shows its details without interrupting trace
            const handleServiceClick = () => {
              if (traceActive) {
                // Toggle detail panel without touching trace state
                setSelectedService((prev) => prev === s.id ? null : s.id);
              } else {
                handleSelect(s.id);
              }
            };
            return (
              <div key={s.id}
                onClick={handleServiceClick}
                style={{
                  padding: '2px 6px', marginBottom: '1px', borderRadius: '3px',
                  cursor: 'pointer', pointerEvents: 'auto',
                  color: isSelected ? '#fff' : s.color,
                  background: isSelected
                    ? 'rgba(255,255,255,0.12)'
                    : isHoveredInSidebar
                      ? 'rgba(255,255,255,0.06)'
                      : 'transparent',
                  fontSize: '10px',
                  // #95: Smooth transitions for hover/select visual states
                  transition: 'background 0.2s, opacity 0.2s, color 0.2s',
                  fontWeight: isHoveredInSidebar && !isSelected ? '600' : 'normal',
                  display: 'flex', alignItems: 'center', gap: '5px',
                  opacity: isSelected ? 1 : isHoveredInSidebar ? 0.9 : 0.75,
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = isSelected ? 'rgba(255,255,255,0.12)' : isHoveredInSidebar ? 'rgba(255,255,255,0.06)' : 'transparent'; }}
              >
                <span style={{
                  display: 'inline-block', width: '6px', height: '6px',
                  borderRadius: '50%', background: healthColor,
                  flexShrink: 0,
                }} />
                {s.label}
              </div>
            );
          })}
          {/* #62: Section divider between service list and action buttons */}
          <div style={{
            margin: '8px -2px 8px',
            height: '1px',
            background: 'linear-gradient(90deg, transparent, rgba(100,150,255,0.3), transparent)',
          }} />
          <div>
            <div
              onClick={handleTraceRequest}
              style={{
                padding: '5px 8px',
                background: (traceActive && !traceIsWrite) ? '#ff884433' : '#4488ff22',
                borderRadius: '4px', cursor: 'pointer', pointerEvents: 'auto',
                textAlign: 'center', fontWeight: 'bold', fontSize: '10px',
                color: (traceActive && !traceIsWrite) ? '#ffaa44' : '#88bbff',
                border: `1px solid ${(traceActive && !traceIsWrite) ? '#ff884444' : '#4488ff33'}`,
                // #94: Left border accent matching button color
                borderLeft: `3px solid ${(traceActive && !traceIsWrite) ? '#ffaa44' : '#88bbff'}`,
                marginBottom: '4px',
                transition: 'filter 0.15s',
              }}
              // #63: Hover brightness effect on Trace buttons
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.filter = 'brightness(1.35)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.filter = 'brightness(1)'; }}
            >
              {(traceActive && !traceIsWrite) ? (
                <span>
                  Tracing... {TRACE_PATH[Math.min(traceStep, TRACE_PATH.length - 1)]}
                  {/* #86: Step progress indicator */}
                  <span style={{ display: 'block', fontSize: '8px', opacity: 0.7, marginTop: '1px', fontWeight: 'normal' }}>
                    Step {Math.min(traceStep + 1, TRACE_PATH.length - 1)}/{TRACE_PATH.length - 1}
                  </span>
                </span>
              ) : 'Trace Request'}
            </div>
            <div
              onClick={handleTraceWrite}
              style={{
                padding: '5px 8px',
                background: (traceActive && traceIsWrite) ? '#ff448833' : '#44ff8822',
                borderRadius: '4px', cursor: 'pointer', pointerEvents: 'auto',
                textAlign: 'center', fontWeight: 'bold', fontSize: '10px',
                color: (traceActive && traceIsWrite) ? '#ff8844' : '#66ddaa',
                border: `1px solid ${(traceActive && traceIsWrite) ? '#ff448844' : '#44ff8833'}`,
                // #94: Left border accent matching button color
                borderLeft: `3px solid ${(traceActive && traceIsWrite) ? '#ff8844' : '#66ddaa'}`,
                marginBottom: '4px',
                transition: 'filter 0.15s',
              }}
              // #63: Hover brightness effect on Trace buttons
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.filter = 'brightness(1.35)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.filter = 'brightness(1)'; }}
            >
              {(traceActive && traceIsWrite) ? (
                <span>
                  Tracing... {TRACE_PATH_WRITE[Math.min(traceStep, TRACE_PATH_WRITE.length - 1)]}
                  {/* #86: Step progress indicator */}
                  <span style={{ display: 'block', fontSize: '8px', opacity: 0.7, marginTop: '1px', fontWeight: 'normal' }}>
                    Step {Math.min(traceStep + 1, TRACE_PATH_WRITE.length - 1)}/{TRACE_PATH_WRITE.length - 1}
                  </span>
                </span>
              ) : 'Trace Write'}
            </div>
            <div
              onClick={handleResetView}
              style={{
                padding: '5px 8px', background: 'rgba(255,255,255,0.04)',
                borderRadius: '4px', cursor: 'pointer', pointerEvents: 'auto',
                textAlign: 'center', fontWeight: 'bold', fontSize: '10px',
                color: 'rgba(150,180,220,0.7)',
                border: '1px solid rgba(255,255,255,0.1)',
                transition: 'filter 0.15s',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.filter = 'brightness(1.25)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.filter = 'brightness(1)'; }}
            >
              Reset View
            </div>
          </div>
        </div>
      </Html>

      {/* #69: Stats bar at bottom */}
      <Html fullscreen>
        <div style={{
          position: 'absolute', bottom: '12px', left: '50%', transform: 'translateX(-50%)',
          color: 'rgba(136,187,255,0.5)', fontSize: '10px',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          background: 'rgba(5,10,25,0.7)', padding: '4px 16px',
          borderRadius: '20px', whiteSpace: 'nowrap', pointerEvents: 'none',
          border: '1px solid rgba(68,136,204,0.15)',
          backdropFilter: 'blur(4px)',
          letterSpacing: '0.3px',
        }}>
          {/* #96: Dynamic stats during trace — show step progress instead of static counts */}
          {traceActive ? (() => {
            const activePath = traceIsWrite ? TRACE_PATH_WRITE : TRACE_PATH;
            const currentStep = Math.min(traceStep + 1, activePath.length - 1);
            const totalSteps = activePath.length - 1;
            return `Tracing: step ${currentStep}/${totalSteps} · ${activePath[Math.min(traceStep, activePath.length - 1)]} → ${activePath[Math.min(traceStep + 1, activePath.length - 1)]}`;
          })() : `${SERVICES.length} services · ${FLOWS.length} connections · ${SERVICES.filter(s => s.health === 'down').length} incidents`}
        </div>
      </Html>
    </>
  );
}
