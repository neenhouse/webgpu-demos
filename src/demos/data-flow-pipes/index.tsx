import { useRef, useMemo, useState, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
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
  fract,
} from 'three/tsl';

/**
 * Data Flow Pipes
 *
 * Data transformation pipeline visualized as a 3D pipe network with
 * flowing particles. Shows data being filtered, transformed, merged,
 * and split. Each node type has a unique TSL-driven material with
 * fresnel glow halos. Click nodes for details; hover to highlight connections.
 */

// ── Fresnel helper ──
const fresnelNode = Fn(() => {
  const viewDir = cameraPosition.sub(positionWorld).normalize();
  const nDotV = normalWorld.dot(viewDir).saturate();
  return float(1.0).sub(nDotV).pow(2.0);
});

// ── Node definitions ──
interface PipeNode {
  id: string;
  label: string;
  type: 'source' | 'transform' | 'filter' | 'merge' | 'split' | 'sink';
  position: [number, number, number];
  color: string;
  hex: number;
  desc: string;
}

interface Pipe {
  from: string;
  to: string;
  color: string;
  hex: number;
}

const NODES: PipeNode[] = [
  { id: 'api', label: 'API Input', type: 'source', position: [-6, 2, 0], color: '#44aaff', hex: 0x44aaff, desc: 'REST API requests' },
  { id: 'ws', label: 'WebSocket', type: 'source', position: [-6, -2, 0], color: '#22ccaa', hex: 0x22ccaa, desc: 'Real-time event stream' },
  { id: 'merge', label: 'Merge', type: 'merge', position: [-3, 0, 0], color: '#ffaa22', hex: 0xffaa22, desc: 'Combine input streams' },
  { id: 'validate', label: 'Validate', type: 'filter', position: [0, 0, 0], color: '#ff6644', hex: 0xff6644, desc: 'Schema validation (reject invalid)' },
  { id: 'transform', label: 'Transform', type: 'transform', position: [3, 0, 0], color: '#cc44ff', hex: 0xcc44ff, desc: 'Normalize & enrich data' },
  { id: 'split', label: 'Route', type: 'split', position: [6, 0, 0], color: '#ffcc22', hex: 0xffcc22, desc: 'Route by event type' },
  { id: 'db', label: 'Database', type: 'sink', position: [9, 2, 0], color: '#22cc88', hex: 0x22cc88, desc: 'Persistent storage' },
  { id: 'cache', label: 'Cache', type: 'sink', position: [9, 0, 0], color: '#ff8844', hex: 0xff8844, desc: 'Hot data cache (KV)' },
  { id: 'events', label: 'Event Bus', type: 'sink', position: [9, -2, 0], color: '#4466ff', hex: 0x4466ff, desc: 'Publish to subscribers' },
  { id: 'reject', label: 'Dead Letter', type: 'sink', position: [0, -3, 0], color: '#ff4444', hex: 0xff4444, desc: 'Invalid data quarantine' },
];

const PIPES: Pipe[] = [
  { from: 'api', to: 'merge', color: '#44aaff', hex: 0x44aaff },
  { from: 'ws', to: 'merge', color: '#22ccaa', hex: 0x22ccaa },
  { from: 'merge', to: 'validate', color: '#ffaa22', hex: 0xffaa22 },
  { from: 'validate', to: 'transform', color: '#cc44ff', hex: 0xcc44ff },
  { from: 'validate', to: 'reject', color: '#ff4444', hex: 0xff4444 },
  { from: 'transform', to: 'split', color: '#cc44ff', hex: 0xcc44ff },
  { from: 'split', to: 'db', color: '#22cc88', hex: 0x22cc88 },
  { from: 'split', to: 'cache', color: '#ff8844', hex: 0xff8844 },
  { from: 'split', to: 'events', color: '#4466ff', hex: 0x4466ff },
];

const PARTICLE_COUNT = 300;

// Build lookup maps
const nodeMap = new Map(NODES.map(n => [n.id, n]));

// Precompute pipe geometry data
const pipeGeoData = PIPES.map(pipe => {
  const fromNode = nodeMap.get(pipe.from)!;
  const toNode = nodeMap.get(pipe.to)!;
  const from = new THREE.Vector3(...fromNode.position);
  const to = new THREE.Vector3(...toNode.position);
  const mid = new THREE.Vector3().lerpVectors(from, to, 0.5);
  const dir = new THREE.Vector3().subVectors(to, from);
  const length = dir.length();
  dir.normalize();
  const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  return { from, to, mid, length, quat, pipe };
});

// Precompute outgoing pipe indices for each node
const outgoingPipes = new Map<string, number[]>();
const incomingPipes = new Map<string, number[]>();
PIPES.forEach((pipe, i) => {
  if (!outgoingPipes.has(pipe.from)) outgoingPipes.set(pipe.from, []);
  outgoingPipes.get(pipe.from)!.push(i);
  if (!incomingPipes.has(pipe.to)) incomingPipes.set(pipe.to, []);
  incomingPipes.get(pipe.to)!.push(i);
});

// Source node IDs for respawning
const sourceNodeIds = NODES.filter(n => n.type === 'source').map(n => n.id);
// Source pipe indices
const sourcePipeIndices = PIPES.map((p, i) => sourceNodeIds.includes(p.from) ? i : -1).filter(i => i >= 0);

// ── Create TSL material for each node type ──
function makeNodeMaterial(nodeType: string, hex: number, nodeId: string): THREE.MeshStandardNodeMaterial {
  const mat = new THREE.MeshStandardNodeMaterial();
  const baseColor = color(hex);
  const fresnel = fresnelNode();

  switch (nodeType) {
    case 'source': {
      // Pulsing emissive with outward energy feel
      const pulse = float(0.7).add(time.mul(2.0).sin().mul(0.3));
      mat.colorNode = baseColor.mul(pulse);
      mat.emissiveNode = baseColor.mul(pulse.mul(2.5)).add(baseColor.mul(fresnel.mul(2.0)));
      break;
    }
    case 'transform': {
      // Circuit-board grid pattern
      const gridX = fract(positionLocal.x.mul(6.0));
      const gridY = fract(positionLocal.y.mul(6.0));
      const gridZ = fract(positionLocal.z.mul(6.0));
      const lineX = smoothstep(0.42, 0.48, gridX).sub(smoothstep(0.52, 0.58, gridX));
      const lineY = smoothstep(0.42, 0.48, gridY).sub(smoothstep(0.52, 0.58, gridY));
      const lineZ = smoothstep(0.42, 0.48, gridZ).sub(smoothstep(0.52, 0.58, gridZ));
      const gridPattern = lineX.add(lineY).add(lineZ).clamp(0.0, 1.0);
      mat.colorNode = mix(baseColor.mul(0.3), baseColor.mul(1.8), gridPattern.mul(0.7));
      mat.emissiveNode = mix(baseColor.mul(0.2), baseColor.mul(2.5), gridPattern.mul(0.5)).add(
        baseColor.mul(fresnel.mul(1.5))
      );
      break;
    }
    case 'filter': {
      // Alternating bright/dark facets via hash noise
      const noiseVal = hash(positionLocal.mul(12.0));
      const brightFacet = smoothstep(0.4, 0.6, noiseVal);
      mat.colorNode = mix(baseColor.mul(0.3), baseColor.mul(1.5), brightFacet);
      mat.emissiveNode = mix(baseColor.mul(0.2), baseColor.mul(2.0), brightFacet).add(
        baseColor.mul(fresnel.mul(1.8))
      );
      break;
    }
    case 'merge': {
      // Swirling multi-color blend
      const swirl = hash(positionLocal.mul(5.0).add(time.mul(0.4)));
      const accentColor = color(0xff8844);
      mat.colorNode = mix(baseColor, accentColor, swirl.mul(0.5));
      mat.emissiveNode = mix(baseColor.mul(0.5), accentColor.mul(2.0), swirl.mul(0.4)).add(
        baseColor.mul(fresnel.mul(2.0))
      );
      break;
    }
    case 'split': {
      // Rainbow facets
      const rainbowNoise = hash(positionLocal.mul(10.0));
      const col1 = color(0xffcc22);
      const col2 = color(0xff44aa);
      const col3 = color(0x44ffaa);
      const lowerMix = mix(col1, col2, smoothstep(0.0, 0.5, rainbowNoise));
      const fullRainbow = mix(lowerMix, col3, smoothstep(0.5, 1.0, rainbowNoise));
      mat.colorNode = fullRainbow;
      mat.emissiveNode = fullRainbow.mul(float(1.5).add(fresnel.mul(2.0)));
      break;
    }
    case 'sink': {
      if (nodeId === 'reject') {
        // Dead letter: aggressive red pulsing
        const aggressivePulse = float(0.5).add(time.mul(3.0).sin().mul(0.5));
        const darkRed = color(0x440000);
        const brightRed = color(0xff2222);
        mat.colorNode = mix(darkRed, brightRed, aggressivePulse);
        mat.emissiveNode = mix(darkRed.mul(0.5), brightRed.mul(3.0), aggressivePulse).add(
          color(0xff0000).mul(fresnel.mul(2.5))
        );
      } else {
        // Normal sinks: deep color with subtle inner glow
        const innerGlow = float(0.6).add(time.mul(0.8).sin().mul(0.2));
        mat.colorNode = baseColor.mul(0.6);
        mat.emissiveNode = baseColor.mul(innerGlow.mul(1.5)).add(baseColor.mul(fresnel.mul(1.5)));
      }
      break;
    }
    default: {
      mat.colorNode = baseColor;
      mat.emissiveNode = baseColor.mul(0.5);
    }
  }

  mat.roughness = 0.2;
  mat.metalness = 0.4;
  return mat;
}

// ── Halo material for nodes ──
function makeNodeHaloMaterial(hex: number, nodeId: string): THREE.MeshStandardNodeMaterial {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;
  mat.side = THREE.BackSide;
  mat.depthWrite = false;
  mat.blending = THREE.AdditiveBlending;

  const fresnel = fresnelNode();
  const glowColor = nodeId === 'reject' ? color(0xff2222) : color(hex);
  const pulse = float(0.6).add(time.mul(nodeId === 'reject' ? 2.0 : 0.8).sin().mul(0.3));

  mat.opacityNode = fresnel.mul(pulse).mul(0.45);
  mat.colorNode = glowColor;
  mat.emissiveNode = glowColor.mul(fresnel.mul(pulse).mul(3.0));
  mat.roughness = 0.0;
  mat.metalness = 0.0;
  return mat;
}

// ── Pipe TSL material with scrolling flow ──
function makePipeMaterial(hex: number): THREE.MeshStandardNodeMaterial {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;

  const pipeColor = color(hex);
  const flow = smoothstep(0.3, 0.7, fract(positionLocal.y.mul(4.0).sub(time.mul(2.0))));
  const darkBase = pipeColor.mul(0.15);
  const brightFlow = pipeColor.mul(1.2);

  mat.colorNode = mix(darkBase, brightFlow, flow.mul(0.6));
  mat.emissiveNode = mix(pipeColor.mul(0.05), pipeColor.mul(1.0), flow.mul(0.5));
  mat.opacityNode = float(0.3).add(flow.mul(0.25));
  mat.roughness = 0.3;
  mat.metalness = 0.1;
  return mat;
}

// ── Pipe halo material ──
function makePipeHaloMaterial(hex: number): THREE.MeshStandardNodeMaterial {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;
  mat.side = THREE.BackSide;
  mat.depthWrite = false;
  mat.blending = THREE.AdditiveBlending;

  const pipeColor = color(hex);
  const flow = smoothstep(0.3, 0.7, fract(positionLocal.y.mul(4.0).sub(time.mul(2.0))));
  mat.opacityNode = flow.mul(0.12);
  mat.colorNode = pipeColor;
  mat.emissiveNode = pipeColor.mul(flow.mul(1.5));
  mat.roughness = 0.0;
  mat.metalness = 0.0;
  return mat;
}

// ── Node shape component ──
function NodeGeometry({ type }: { type: string }) {
  switch (type) {
    case 'source': return <coneGeometry args={[0.5, 1.0, 16]} />;
    case 'transform': return <boxGeometry args={[0.9, 0.9, 0.9]} />;
    case 'filter': return <octahedronGeometry args={[0.55]} />;
    case 'merge': return <sphereGeometry args={[0.5, 20, 20]} />;
    case 'split': return <icosahedronGeometry args={[0.5, 0]} />;
    case 'sink': return <cylinderGeometry args={[0.45, 0.45, 0.8, 16]} />;
    default: return <boxGeometry args={[0.6, 0.6, 0.6]} />;
  }
}

// ── Halo geometry (bigger version of node shape) ──
function HaloGeometry({ type }: { type: string }) {
  switch (type) {
    case 'source': return <coneGeometry args={[0.75, 1.5, 16]} />;
    case 'transform': return <boxGeometry args={[1.35, 1.35, 1.35]} />;
    case 'filter': return <octahedronGeometry args={[0.85]} />;
    case 'merge': return <sphereGeometry args={[0.75, 20, 20]} />;
    case 'split': return <icosahedronGeometry args={[0.75, 0]} />;
    case 'sink': return <cylinderGeometry args={[0.7, 0.7, 1.2, 16]} />;
    default: return <boxGeometry args={[0.9, 0.9, 0.9]} />;
  }
}

// ── Individual node component ──
function PipeNodeMesh({
  node,
  index,
  isSelected,
  isHovered,
  isHighlighted,
  onSelect,
  onHover,
  onUnhover,
}: {
  node: PipeNode;
  index: number;
  isSelected: boolean;
  isHovered: boolean;
  isHighlighted: boolean;
  onSelect: (id: string) => void;
  onHover: (id: string) => void;
  onUnhover: () => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const haloRef = useRef<THREE.Mesh>(null);

  const nodeMat = useMemo(() => makeNodeMaterial(node.type, node.hex, node.id), [node.type, node.hex, node.id]);
  const haloMat = useMemo(() => makeNodeHaloMaterial(node.hex, node.id), [node.hex, node.id]);

  // Suppress unused variable warnings
  void isHighlighted;

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const t = clock.getElapsedTime();
    // Gentle bob
    meshRef.current.position.y = node.position[1] + Math.sin(t + index * 0.9) * 0.1;
    // Cone (source) rotated to point right
    if (node.type === 'source') {
      meshRef.current.rotation.z = -Math.PI / 2;
    }
    // Pulse on selection
    if (isSelected) {
      const scale = 1.0 + Math.sin(t * 3) * 0.1;
      meshRef.current.scale.setScalar(scale);
    } else {
      meshRef.current.scale.setScalar(1.0);
    }

    // Halo follows mesh position
    if (haloRef.current) {
      haloRef.current.position.y = meshRef.current.position.y;
      if (node.type === 'source') {
        haloRef.current.rotation.z = -Math.PI / 2;
      }
      const haloScale = isSelected ? 1.8 : 1.0;
      haloRef.current.scale.setScalar(haloScale);
    }
  });

  return (
    <group position={[node.position[0], node.position[1], node.position[2]]}>
      {/* Core mesh */}
      <mesh
        ref={meshRef}
        onClick={(e: { stopPropagation: () => void }) => { e.stopPropagation(); onSelect(node.id); }}
        onPointerOver={(e: { stopPropagation: () => void }) => { e.stopPropagation(); onHover(node.id); }}
        onPointerOut={() => onUnhover()}
        material={nodeMat}
      >
        <NodeGeometry type={node.type} />
      </mesh>
      {/* Halo shell */}
      <mesh ref={haloRef} material={haloMat}>
        <HaloGeometry type={node.type} />
      </mesh>
      {/* Point light */}
      <pointLight color={node.color} intensity={isSelected ? 5.0 : isHovered ? 2.5 : 1.5} distance={5} />
      {/* Hover tooltip */}
      {isHovered && !isSelected && (
        <Html position={[0, 1.0, 0]} center distanceFactor={10}>
          <div style={{
            color: 'white', fontSize: '12px',
            background: 'rgba(0,0,0,0.8)', padding: '4px 8px',
            borderRadius: '4px', whiteSpace: 'nowrap', pointerEvents: 'none',
          }}>{node.label} ({node.type})</div>
        </Html>
      )}
      {/* Selection popup */}
      {isSelected && (
        <Html position={[0, 1.5, 0]} center distanceFactor={10}>
          <div style={{
            color: 'white', fontSize: '13px',
            background: 'rgba(0,0,0,0.9)', padding: '10px 14px',
            borderRadius: '6px', whiteSpace: 'nowrap', pointerEvents: 'none',
            border: `1px solid ${node.color}`, maxWidth: '240px',
          }}>
            <div style={{ fontWeight: 'bold', fontSize: '15px', marginBottom: '4px', color: node.color }}>{node.label}</div>
            <div style={{ color: '#999', fontSize: '11px', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '1px' }}>{node.type}</div>
            <div style={{ whiteSpace: 'normal', lineHeight: '1.4' }}>{node.desc}</div>
          </div>
        </Html>
      )}
      {/* Node label below */}
      <Html position={[0, -1.0, 0]} center distanceFactor={10}>
        <div style={{
          color: node.color, fontSize: '10px',
          background: 'rgba(0,0,0,0.6)', padding: '2px 6px',
          borderRadius: '3px', whiteSpace: 'nowrap', pointerEvents: 'none',
          fontFamily: 'monospace',
        }}>{node.label}</div>
      </Html>
    </group>
  );
}

// ── Pipe tube between nodes ──
function PipeTube({
  pipeIndex,
  isHighlighted,
}: {
  pipeIndex: number;
  isHighlighted: boolean;
}) {
  const geo = pipeGeoData[pipeIndex];

  const pipeMat = useMemo(() => makePipeMaterial(geo.pipe.hex), [geo.pipe.hex]);
  const pipeHaloMat = useMemo(() => makePipeHaloMaterial(geo.pipe.hex), [geo.pipe.hex]);

  // Suppress unused variable warning
  void isHighlighted;

  return (
    <group>
      {/* Core pipe */}
      <mesh
        position={[geo.mid.x, geo.mid.y, geo.mid.z]}
        quaternion={[geo.quat.x, geo.quat.y, geo.quat.z, geo.quat.w]}
        material={pipeMat}
      >
        <cylinderGeometry args={[0.1, 0.1, geo.length - 0.8, 12]} />
      </mesh>
      {/* Halo tube */}
      <mesh
        position={[geo.mid.x, geo.mid.y, geo.mid.z]}
        quaternion={[geo.quat.x, geo.quat.y, geo.quat.z, geo.quat.w]}
        material={pipeHaloMat}
      >
        <cylinderGeometry args={[0.15, 0.15, geo.length - 0.8, 12]} />
      </mesh>
    </group>
  );
}

// ── Particle system ──
function FlowParticles({ selectedNode: _selectedNode }: { selectedNode: string | null }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  // Bright additive particle material
  const particleMat = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.transparent = true;
    mat.depthWrite = false;
    mat.blending = THREE.AdditiveBlending;

    const glow = color(0xffffff);
    mat.colorNode = glow;
    mat.emissiveNode = glow.mul(3.0);
    mat.opacityNode = float(0.9);
    mat.roughness = 0.0;
    mat.metalness = 0.0;
    return mat;
  }, []);

  // Particle state: each particle is on a specific pipe with a progress
  const particleState = useMemo(() => {
    const pipeIdx = new Int32Array(PARTICLE_COUNT);
    const progress = new Float32Array(PARTICLE_COUNT);
    const speed = new Float32Array(PARTICLE_COUNT);
    const isRejected = new Uint8Array(PARTICLE_COUNT);
    const rejectTimer = new Float32Array(PARTICLE_COUNT);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      pipeIdx[i] = sourcePipeIndices[Math.floor(Math.random() * sourcePipeIndices.length)];
      progress[i] = Math.random();
      speed[i] = 0.3 + Math.random() * 0.3;
      isRejected[i] = 0;
      rejectTimer[i] = 0;
    }
    return { pipeIdx, progress, speed, isRejected, rejectTimer };
  }, []);

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const tmpColor = useMemo(() => new THREE.Color(), []);
  const tmpFrom = useMemo(() => new THREE.Vector3(), []);
  const tmpTo = useMemo(() => new THREE.Vector3(), []);

  // Advance particle to next pipe when it reaches end of current pipe
  const advanceParticle = useCallback((i: number) => {
    const currentPipe = PIPES[particleState.pipeIdx[i]];
    const destNodeId = currentPipe.to;
    const destNode = nodeMap.get(destNodeId)!;

    switch (destNode.type) {
      case 'sink': {
        particleState.pipeIdx[i] = sourcePipeIndices[Math.floor(Math.random() * sourcePipeIndices.length)];
        particleState.progress[i] = 0;
        particleState.speed[i] = 0.3 + Math.random() * 0.3;
        particleState.isRejected[i] = 0;
        return;
      }
      case 'filter': {
        const outPipes = outgoingPipes.get(destNodeId) || [];
        if (Math.random() < 0.2) {
          const rejectPipe = outPipes.find(pi => PIPES[pi].to === 'reject');
          if (rejectPipe !== undefined) {
            particleState.pipeIdx[i] = rejectPipe;
            particleState.isRejected[i] = 1;
            particleState.rejectTimer[i] = 0.5;
          } else {
            particleState.pipeIdx[i] = outPipes[0];
          }
        } else {
          const passPipe = outPipes.find(pi => PIPES[pi].to !== 'reject');
          if (passPipe !== undefined) {
            particleState.pipeIdx[i] = passPipe;
          } else {
            particleState.pipeIdx[i] = outPipes[0];
          }
          particleState.isRejected[i] = 0;
        }
        particleState.progress[i] = 0;
        return;
      }
      case 'split': {
        const outPipes = outgoingPipes.get(destNodeId) || [];
        particleState.pipeIdx[i] = outPipes[Math.floor(Math.random() * outPipes.length)];
        particleState.progress[i] = 0;
        particleState.isRejected[i] = 0;
        return;
      }
      default: {
        const outPipes = outgoingPipes.get(destNodeId) || [];
        if (outPipes.length > 0) {
          particleState.pipeIdx[i] = outPipes[Math.floor(Math.random() * outPipes.length)];
          particleState.progress[i] = 0;
          particleState.isRejected[i] = 0;
        } else {
          particleState.pipeIdx[i] = sourcePipeIndices[Math.floor(Math.random() * sourcePipeIndices.length)];
          particleState.progress[i] = 0;
          particleState.isRejected[i] = 0;
        }
        return;
      }
    }
  }, [particleState]);

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particleState.progress[i] += particleState.speed[i] * delta;
      particleState.rejectTimer[i] = Math.max(0, particleState.rejectTimer[i] - delta);

      if (particleState.progress[i] >= 1.0) {
        advanceParticle(i);
      }

      const geo = pipeGeoData[particleState.pipeIdx[i]];
      if (!geo) continue;

      const p = particleState.progress[i];
      tmpFrom.copy(geo.from);
      tmpTo.copy(geo.to);

      const x = tmpFrom.x + (tmpTo.x - tmpFrom.x) * p;
      const y = tmpFrom.y + (tmpTo.y - tmpFrom.y) * p;
      const z = tmpFrom.z + (tmpTo.z - tmpFrom.z) * p;

      const wobbleY = Math.sin(p * Math.PI * 6 + i * 0.7) * 0.06;
      const wobbleZ = Math.cos(p * Math.PI * 4 + i * 1.1) * 0.06;

      dummy.position.set(x, y + wobbleY, z + wobbleZ);
      dummy.scale.setScalar(0.06);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      // Color: pipe color, or bright red flash if rejected
      if (particleState.isRejected[i] && particleState.rejectTimer[i] > 0) {
        const flash = Math.sin(particleState.rejectTimer[i] * 20) * 0.5 + 0.5;
        tmpColor.setRGB(1.5, flash * 0.3, flash * 0.2);
      } else {
        tmpColor.set(geo.pipe.color);
        // Boost brightness for glow effect
        tmpColor.multiplyScalar(1.5);
      }
      mesh.setColorAt(i, tmpColor);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, PARTICLE_COUNT]} frustumCulled={false} material={particleMat}>
      <sphereGeometry args={[1, 8, 8]} />
    </instancedMesh>
  );
}

// ── Grid floor ──
function GridFloor() {
  const mat = useMemo(() => {
    const m = new THREE.MeshStandardNodeMaterial();
    m.transparent = true;

    const gridX = fract(positionLocal.x.mul(1.5));
    const gridZ = fract(positionLocal.z.mul(1.5));
    const lineX = smoothstep(0.46, 0.49, gridX).sub(smoothstep(0.51, 0.54, gridX));
    const lineZ = smoothstep(0.46, 0.49, gridZ).sub(smoothstep(0.51, 0.54, gridZ));
    const gridPattern = lineX.add(lineZ).clamp(0.0, 1.0);

    m.colorNode = color(0x0e1520);
    m.emissiveNode = color(0x1a2535).mul(gridPattern.mul(0.3));
    m.opacityNode = float(0.4).add(gridPattern.mul(0.2));
    m.roughness = 0.8;
    m.metalness = 0.1;
    return m;
  }, []);

  return (
    <mesh position={[2, -5, 0]} rotation={[-Math.PI / 2, 0, 0]} material={mat}>
      <planeGeometry args={[30, 18]} />
    </mesh>
  );
}

// ── Background sphere ──
function BackgroundSphere() {
  const mat = useMemo(() => {
    const m = new THREE.MeshStandardNodeMaterial();
    m.side = THREE.BackSide;
    const yGrad = positionLocal.y.mul(0.02).add(0.5).clamp(0.0, 1.0);
    const bottomColor = color(0x080c16);
    const topColor = color(0x040406);
    m.colorNode = mix(bottomColor, topColor, yGrad);
    m.emissiveNode = mix(color(0x050810), color(0x020203), yGrad);
    m.roughness = 1.0;
    m.metalness = 0.0;
    return m;
  }, []);

  return (
    <mesh material={mat}>
      <sphereGeometry args={[45, 32, 32]} />
    </mesh>
  );
}

// ── Camera controller ──
function CameraController({ selectedNode }: { selectedNode: string | null }) {
  const targetPos = useRef(new THREE.Vector3(2, 2, 16));
  const targetLookAt = useRef(new THREE.Vector3(2, 0, 0));

  useFrame(({ camera }) => {
    if (selectedNode) {
      const node = nodeMap.get(selectedNode);
      if (node) {
        targetPos.current.set(node.position[0], node.position[1] + 1.5, 6);
        targetLookAt.current.set(node.position[0], node.position[1], 0);
      }
    } else {
      targetPos.current.set(2, 2, 16);
      targetLookAt.current.set(2, 0, 0);
    }

    camera.position.lerp(targetPos.current, 0.05);
    camera.lookAt(targetLookAt.current);
  });

  return null;
}

// ── Main component ──
export default function DataFlowPipes() {
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  const handleSelect = useCallback((id: string) => {
    setSelectedNode(prev => prev === id ? null : id);
  }, []);

  const handleBackgroundClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  // Determine which pipes to highlight (connected to hovered node)
  const highlightedPipes = useMemo(() => {
    if (!hoveredNode) return new Set<number>();
    const set = new Set<number>();
    PIPES.forEach((pipe, i) => {
      if (pipe.from === hoveredNode || pipe.to === hoveredNode) set.add(i);
    });
    return set;
  }, [hoveredNode]);

  // Nodes connected to hovered node (for highlight)
  const highlightedNodes = useMemo(() => {
    if (!hoveredNode) return new Set<string>();
    const set = new Set<string>();
    PIPES.forEach(pipe => {
      if (pipe.from === hoveredNode) set.add(pipe.to);
      if (pipe.to === hoveredNode) set.add(pipe.from);
    });
    return set;
  }, [hoveredNode]);

  // Background click catcher material
  const bgClickMat = useMemo(() => {
    const m = new THREE.MeshStandardNodeMaterial();
    m.colorNode = color(0x0a0a12);
    m.roughness = 1.0;
    m.metalness = 0.0;
    return m;
  }, []);

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.08} />
      <directionalLight position={[0, 8, 5]} intensity={0.3} />

      {/* Camera controller */}
      <CameraController selectedNode={selectedNode} />

      {/* Background gradient sphere */}
      <BackgroundSphere />

      {/* Subtle fog */}
      <fog attach="fog" args={['#050810', 15, 50]} />

      {/* Background click catcher */}
      <mesh position={[2, 0, -5]} onClick={handleBackgroundClick} material={bgClickMat}>
        <planeGeometry args={[60, 30]} />
      </mesh>

      {/* Grid floor */}
      <GridFloor />

      {/* Pipes */}
      {PIPES.map((_, i) => (
        <PipeTube
          key={`pipe-${i}`}
          pipeIndex={i}
          isHighlighted={highlightedPipes.has(i)}
        />
      ))}

      {/* Nodes */}
      {NODES.map((node, i) => (
        <PipeNodeMesh
          key={node.id}
          node={node}
          index={i}
          isSelected={selectedNode === node.id}
          isHovered={hoveredNode === node.id}
          isHighlighted={highlightedNodes.has(node.id)}
          onSelect={handleSelect}
          onHover={setHoveredNode}
          onUnhover={() => setHoveredNode(null)}
        />
      ))}

      {/* Flow particles */}
      <FlowParticles selectedNode={selectedNode} />
    </>
  );
}
