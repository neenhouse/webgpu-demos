import { useRef, useState, useMemo, useCallback, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three/webgpu';
import {
  Fn,
  color,
  float,
  mix,
  smoothstep,
  time,
  positionLocal,
  positionWorld,
  normalWorld,
  cameraPosition,
  hash,
  oscSine,
  vec3,
  screenUV,
  atan,
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

// ── TSL Material Factories ──

/** Frontend (box): scan lines scrolling down the surface */
function makeFrontendMaterial(hexColor: number) {
  const mat = new THREE.MeshStandardNodeMaterial();
  const baseCol = color(hexColor);

  const scanLines = Fn(() => {
    const scan = positionLocal.y.mul(20.0).add(time.mul(1.5)).fract();
    const line = smoothstep(float(0.4), float(0.5), scan).mul(smoothstep(float(0.6), float(0.5), scan));
    return line;
  });

  const fresnel = Fn(() => {
    const viewDir = cameraPosition.sub(positionWorld).normalize();
    const nDotV = normalWorld.dot(viewDir).saturate();
    return float(1.0).sub(nDotV).pow(2.0);
  });

  mat.colorNode = mix(baseCol.mul(0.15), baseCol.mul(0.5), scanLines());
  mat.emissiveNode = baseCol.mul(scanLines()).mul(1.5).add(baseCol.mul(fresnel()).mul(2.0)).add(baseCol.mul(0.3));
  mat.roughness = 0.3;
  mat.metalness = 0.5;

  return mat;
}

/** Backend (tall box): horizontal server rack bands with hash noise */
function makeBackendMaterial(hexColor: number) {
  const mat = new THREE.MeshStandardNodeMaterial();
  const baseCol = color(hexColor);

  const rackBands = Fn(() => {
    const band = positionLocal.y.mul(8.0).floor();
    const noise = hash(band.mul(17.3).add(positionLocal.x.mul(5.0)));
    const bandLine = smoothstep(float(0.85), float(0.9), positionLocal.y.mul(8.0).fract());
    return noise.mul(0.5).add(bandLine.mul(0.5));
  });

  const fresnel = Fn(() => {
    const viewDir = cameraPosition.sub(positionWorld).normalize();
    const nDotV = normalWorld.dot(viewDir).saturate();
    return float(1.0).sub(nDotV).pow(2.0);
  });

  mat.colorNode = mix(baseCol.mul(0.1), baseCol.mul(0.4), rackBands());
  mat.emissiveNode = baseCol.mul(rackBands()).mul(1.0).add(baseCol.mul(fresnel()).mul(1.8)).add(baseCol.mul(0.2));
  mat.roughness = 0.4;
  mat.metalness = 0.6;

  return mat;
}

/** Database (cylinder): rotating angular ring pattern */
function makeDatabaseMaterial(hexColor: number) {
  const mat = new THREE.MeshStandardNodeMaterial();
  const baseCol = color(hexColor);

  const ringPattern = Fn(() => {
    // Horizontal bands that subtly rotate
    const angle = atan(positionLocal.x, positionLocal.z).add(time.mul(0.5));
    const angularBands = angle.mul(3.0).fract();
    const ring = smoothstep(float(0.3), float(0.35), angularBands).mul(smoothstep(float(0.7), float(0.65), angularBands));
    const yBands = smoothstep(float(0.85), float(0.9), positionLocal.y.mul(6.0).fract());
    return ring.mul(0.6).add(yBands.mul(0.4));
  });

  const fresnel = Fn(() => {
    const viewDir = cameraPosition.sub(positionWorld).normalize();
    const nDotV = normalWorld.dot(viewDir).saturate();
    return float(1.0).sub(nDotV).pow(2.0);
  });

  mat.colorNode = mix(baseCol.mul(0.1), baseCol.mul(0.5), ringPattern());
  mat.emissiveNode = baseCol.mul(ringPattern()).mul(1.2).add(baseCol.mul(fresnel()).mul(2.0)).add(baseCol.mul(0.2));
  mat.roughness = 0.3;
  mat.metalness = 0.5;

  return mat;
}

/** Cache (octahedron): fast flickering hash noise */
function makeCacheMaterial(hexColor: number) {
  const mat = new THREE.MeshStandardNodeMaterial();
  const baseCol = color(hexColor);

  const flickerNoise = Fn(() => {
    const n1 = hash(positionLocal.mul(12.0).add(time.mul(8.0)));
    const n2 = hash(positionLocal.mul(6.0).sub(time.mul(5.0)));
    return n1.mul(0.6).add(n2.mul(0.4));
  });

  const fresnel = Fn(() => {
    const viewDir = cameraPosition.sub(positionWorld).normalize();
    const nDotV = normalWorld.dot(viewDir).saturate();
    return float(1.0).sub(nDotV).pow(2.0);
  });

  mat.colorNode = mix(baseCol.mul(0.15), baseCol.mul(0.6), flickerNoise());
  mat.emissiveNode = baseCol.mul(flickerNoise()).mul(1.8).add(baseCol.mul(fresnel()).mul(2.2)).add(baseCol.mul(0.3));
  mat.roughness = 0.2;
  mat.metalness = 0.4;

  return mat;
}

/** CDN (disc): concentric radial pulses */
function makeCdnMaterial(hexColor: number) {
  const mat = new THREE.MeshStandardNodeMaterial();
  const baseCol = color(hexColor);

  const radialPulse = Fn(() => {
    const dist = positionLocal.x.mul(positionLocal.x).add(positionLocal.z.mul(positionLocal.z)).sqrt();
    const pulse = dist.mul(6.0).sub(time.mul(2.0)).fract();
    const ring = smoothstep(float(0.3), float(0.4), pulse).mul(smoothstep(float(0.6), float(0.5), pulse));
    return ring;
  });

  const fresnel = Fn(() => {
    const viewDir = cameraPosition.sub(positionWorld).normalize();
    const nDotV = normalWorld.dot(viewDir).saturate();
    return float(1.0).sub(nDotV).pow(2.0);
  });

  mat.colorNode = mix(baseCol.mul(0.1), baseCol.mul(0.5), radialPulse());
  mat.emissiveNode = baseCol.mul(radialPulse()).mul(1.5).add(baseCol.mul(fresnel()).mul(2.0)).add(baseCol.mul(0.3));
  mat.roughness = 0.3;
  mat.metalness = 0.4;

  return mat;
}

/** Queue (torus): spinning circular flow */
function makeQueueMaterial(hexColor: number) {
  const mat = new THREE.MeshStandardNodeMaterial();
  const baseCol = color(hexColor);

  const spinFlow = Fn(() => {
    const angle = atan(positionLocal.x, positionLocal.z);
    const flow = angle.div(Math.PI).add(time.mul(1.5)).fract();
    const band = smoothstep(float(0.2), float(0.3), flow).mul(smoothstep(float(0.8), float(0.7), flow));
    return band;
  });

  const fresnel = Fn(() => {
    const viewDir = cameraPosition.sub(positionWorld).normalize();
    const nDotV = normalWorld.dot(viewDir).saturate();
    return float(1.0).sub(nDotV).pow(2.0);
  });

  mat.colorNode = mix(baseCol.mul(0.1), baseCol.mul(0.5), spinFlow());
  mat.emissiveNode = baseCol.mul(spinFlow()).mul(1.5).add(baseCol.mul(fresnel()).mul(2.0)).add(baseCol.mul(0.3));
  mat.roughness = 0.2;
  mat.metalness = 0.5;

  return mat;
}

/** External (icosahedron): mysterious deep glow with strong fresnel */
function makeExternalMaterial(hexColor: number) {
  const mat = new THREE.MeshStandardNodeMaterial();
  const baseCol = color(hexColor);

  const pulse = oscSine(time.mul(0.8)).mul(0.3).add(0.7);

  const fresnel = Fn(() => {
    const viewDir = cameraPosition.sub(positionWorld).normalize();
    const nDotV = normalWorld.dot(viewDir).saturate();
    return float(1.0).sub(nDotV).pow(2.5);
  });

  const noise = Fn(() => {
    return hash(positionLocal.mul(5.0).add(time.mul(0.4)));
  });

  mat.colorNode = baseCol.mul(0.15).add(baseCol.mul(noise()).mul(0.15));
  mat.emissiveNode = baseCol.mul(fresnel()).mul(3.5).add(baseCol.mul(pulse).mul(0.6));
  mat.roughness = 0.1;
  mat.metalness = 0.3;

  return mat;
}

/** Create a halo shell for any service node */
function makeServiceHaloMaterial(hexColor: number) {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;
  mat.side = THREE.BackSide;
  mat.depthWrite = false;
  mat.blending = THREE.AdditiveBlending;

  const fresnel = Fn(() => {
    const viewDir = cameraPosition.sub(positionWorld).normalize();
    const nDotV = normalWorld.dot(viewDir).saturate();
    return float(1.0).sub(nDotV).pow(1.8);
  });

  const pulse = oscSine(time.mul(0.9)).mul(0.2).add(0.8);
  const glowColor = color(hexColor);

  mat.opacityNode = fresnel().mul(pulse).mul(0.4);
  mat.colorNode = glowColor;
  mat.emissiveNode = glowColor.mul(fresnel().mul(pulse).mul(3.0));
  mat.roughness = 0.0;
  mat.metalness = 0.0;

  return mat;
}

function makeServiceMaterial(type: Service['type'], hexColor: number) {
  switch (type) {
    case 'frontend': return makeFrontendMaterial(hexColor);
    case 'backend': return makeBackendMaterial(hexColor);
    case 'database': return makeDatabaseMaterial(hexColor);
    case 'cache': return makeCacheMaterial(hexColor);
    case 'cdn': return makeCdnMaterial(hexColor);
    case 'queue': return makeQueueMaterial(hexColor);
    case 'external': return makeExternalMaterial(hexColor);
  }
}

/** Connection tube material with scrolling brightness */
function makeConnectionMaterial(hexColor: number, isHighlighted: boolean) {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;
  const baseCol = color(hexColor);

  if (isHighlighted) {
    const scroll = Fn(() => {
      const flow = positionLocal.y.mul(3.0).sub(time.mul(2.0)).fract();
      const band = smoothstep(float(0.3), float(0.5), flow).mul(smoothstep(float(0.7), float(0.5), flow));
      return band.mul(0.6).add(0.4);
    });

    mat.colorNode = baseCol.mul(0.3);
    mat.emissiveNode = baseCol.mul(scroll()).mul(2.0);
    mat.opacityNode = float(0.6);
  } else {
    mat.colorNode = baseCol.mul(0.08);
    mat.emissiveNode = baseCol.mul(0.15);
    mat.opacityNode = float(0.15);
  }

  mat.roughness = 0.3;
  mat.metalness = 0.2;

  return mat;
}

/** Blueprint grid floor material */
function makeBlueprintGridMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();

  const gridPattern = Fn(() => {
    const scale = float(0.3);
    const gx = smoothstep(float(0.92), float(0.96), positionLocal.x.mul(scale).fract());
    const gy = smoothstep(float(0.92), float(0.96), positionLocal.y.mul(scale).fract());
    return gx.add(gy).clamp(0.0, 1.0);
  });

  const base = vec3(0.005, 0.008, 0.025);
  const gridCol = vec3(0.02, 0.05, 0.12);

  mat.colorNode = mix(base, gridCol, gridPattern().mul(0.5));
  mat.emissiveNode = mix(vec3(0, 0, 0), vec3(0.01, 0.03, 0.08), gridPattern().mul(0.3));
  mat.roughness = 0.8;
  mat.metalness = 0.3;

  return mat;
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
    const baseCol = color(service.hex);
    mat.colorNode = baseCol.mul(0.05);
    mat.emissiveNode = baseCol.mul(0.05);
    mat.opacityNode = float(0.4);
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

      {/* Halo shell */}
      {!isDimmed && (
        <mesh material={haloMat} scale={[1.4, 1.4, 1.4]}>
          <ServiceShape type={service.type} />
        </mesh>
      )}

      {/* Service label — fixed position, no distanceFactor for alignment */}
      <Html position={[0, 1.2, 0]} center>
        <div
          style={{
            color: 'white',
            fontSize: '11px',
            background: 'rgba(0,0,0,0.8)',
            padding: '3px 8px',
            borderRadius: '3px',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            borderLeft: `2px solid ${typeColor}`,
            fontWeight: isSelected ? 'bold' : 'normal',
            opacity: isDimmed ? 0.3 : 1,
            transform: 'translateY(-100%)',
          }}
        >
          <div style={{ fontSize: '10px', fontWeight: 'bold' }}>{service.label}</div>
          <div style={{ fontSize: '8px', opacity: 0.6 }}>{service.tech}</div>
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
  const radius = isHighlighted ? 0.06 : 0.04;

  const pipeMat = useMemo(
    () => makeConnectionMaterial(flow.hex, isHighlighted),
    [flow.hex, isHighlighted],
  );

  return (
    <mesh position={mid} quaternion={quat} material={pipeMat}>
      <cylinderGeometry args={[radius, radius, length, 6]} />
    </mesh>
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

  // Particle material using TSL for additive glow
  const particleMat = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.transparent = true;
    mat.depthWrite = false;
    mat.blending = THREE.AdditiveBlending;

    const pulse = oscSine(time.mul(3.0)).mul(0.3).add(0.7);
    mat.colorNode = color(0xffffff);
    mat.emissiveNode = color(0xffffff).mul(pulse).mul(3.0);
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
      const scale = isHighlighted ? 0.06 : 0.04;

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
    <Html position={[service.position[0], service.position[1] + 2.2, service.position[2]]} center>
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

// ── Blueprint Grid Floor ──

function BlueprintGridFloor() {
  const gridMat = useMemo(() => makeBlueprintGridMaterial(), []);

  return (
    <mesh position={[0, -2.5, 0]} rotation={[-Math.PI / 2, 0, 0]} material={gridMat}>
      <planeGeometry args={[40, 40]} />
    </mesh>
  );
}

// ── Main Component ──

// ── Trace Request Ball ──

function TraceRequestBall({ traceStep, traceProgress }: { traceStep: number; traceProgress: number }) {
  const meshRef = useRef<THREE.Mesh>(null);

  const mat = useMemo(() => {
    const m = new THREE.MeshStandardNodeMaterial();
    m.transparent = true;
    m.depthWrite = false;
    m.blending = THREE.AdditiveBlending;
    const pulse = oscSine(time.mul(6.0)).mul(0.3).add(1.0);
    m.colorNode = color(0xffee44);
    m.emissiveNode = color(0xffee44).mul(pulse).mul(4.0);
    return m;
  }, []);

  const haloMat = useMemo(() => {
    const m = new THREE.MeshStandardNodeMaterial();
    m.transparent = true;
    m.side = THREE.BackSide;
    m.depthWrite = false;
    m.blending = THREE.AdditiveBlending;
    m.colorNode = color(0xffcc22);
    m.emissiveNode = color(0xffcc22).mul(2.0);
    m.opacityNode = float(0.3);
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

  return (
    <group position={[x, y, z]}>
      <mesh ref={meshRef} material={mat}>
        <sphereGeometry args={[0.15, 12, 8]} />
      </mesh>
      <mesh material={haloMat} scale={[2.5, 2.5, 2.5]}>
        <sphereGeometry args={[0.15, 8, 6]} />
      </mesh>
      <pointLight color="#ffee44" intensity={3} distance={4} />
    </group>
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
  return (
    <>
      {tiers.map((t) => (
        <Html key={t.label} position={[-7.5, t.y, 0]} center>
          <div style={{
            color: 'rgba(100,140,200,0.4)', fontSize: '9px', fontWeight: 'bold',
            letterSpacing: '2px', whiteSpace: 'nowrap', pointerEvents: 'none',
          }}>
            {t.label}
          </div>
        </Html>
      ))}
    </>
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
  const targetPos = useRef(new THREE.Vector3(1, 2, 14));
  const targetLookAt = useRef(new THREE.Vector3(1, 2, 0));
  const { camera } = useThree();

  const handleSelect = useCallback(
    (id: string) => {
      if (selectedService === id) {
        setSelectedService(null);
        targetPos.current.set(1, 2, 14);
        targetLookAt.current.set(1, 2, 0);
      } else {
        setSelectedService(id);
        const s = serviceMap.get(id)!;
        targetPos.current.set(s.position[0] + 1.5, s.position[1] + 2, s.position[2] + 6);
        targetLookAt.current.set(s.position[0], s.position[1], s.position[2]);
      }
    },
    [selectedService],
  );

  const handleEmptyClick = useCallback(() => {
    setSelectedService(null);
    targetPos.current.set(1, 2, 14);
    targetLookAt.current.set(1, 2, 0);
  }, []);

  const handleTraceRequest = useCallback(() => {
    setTraceActive(true);
    setTraceStep(0);
    setTraceProgress(0);
    setSelectedService(null);
    targetPos.current.set(1, 2, 14);
    targetLookAt.current.set(1, 2, 0);
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

  // Background material
  const bgMat = useMemo(() => {
    const mat = new THREE.MeshBasicNodeMaterial();
    mat.side = THREE.BackSide;
    const bgColor = Fn(() => {
      const bottom = vec3(0.01, 0.015, 0.04);
      const top = vec3(0.0, 0.0, 0.015);
      const mid = vec3(0.02, 0.01, 0.05);
      const yFactor = screenUV.y;
      const base = mix(bottom, top, yFactor);
      const glowBand = smoothstep(float(0.2), float(0.4), yFactor).mul(smoothstep(float(0.6), float(0.4), yFactor));
      return mix(base, mid, glowBand.mul(0.3));
    });
    mat.colorNode = bgColor();
    return mat;
  }, []);

  // Background click plane material
  const bgClickMat = useMemo(() => {
    const mat = new THREE.MeshBasicNodeMaterial();
    mat.colorNode = color(0x000000);
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
      <ambientLight intensity={0.15} color={0x334466} />
      <directionalLight position={[5, 10, 5]} intensity={0.4} color={0x6688cc} />
      <directionalLight position={[-5, 5, -5]} intensity={0.15} color={0x4466aa} />

      {/* Background atmosphere */}
      <mesh material={bgMat}>
        <sphereGeometry args={[35, 16, 16]} />
      </mesh>

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
          color: 'rgba(255,255,255,0.7)', fontSize: '11px',
          background: 'rgba(0,0,0,0.5)', padding: '10px 14px',
          borderRadius: '6px', lineHeight: '1.6',
          maxWidth: '190px', pointerEvents: 'none',
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: '4px', color: '#88bbff', fontSize: '12px' }}>System Architecture</div>
          <div>Click a service to inspect</div>
          <div>Hover to see connections</div>
          <div style={{ marginTop: '4px', fontSize: '10px', opacity: 0.6 }}>
            Use the service list to navigate
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
