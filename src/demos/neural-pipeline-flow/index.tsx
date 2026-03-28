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
  atan,
} from 'three/tsl';

/**
 * Neural Pipeline Flow
 *
 * AI inference pipeline visualization showing data flowing through
 * transformer stages. Stages arranged left-to-right, each a distinct
 * 3D shape with unique TSL shading effects. 300 glowing particles flow
 * continuously through the pipeline with additive glow.
 * Click stages for detail view; hover for tooltips.
 */

// ── Stage definitions ──
const STAGES = [
  { id: 'input', label: 'Input Tokens', shape: 'box' as const, color: '#ff6644', hex: 0xff6644, x: -8, desc: 'Raw text tokenized into integer IDs' },
  { id: 'embed', label: 'Embedding', shape: 'cylinder' as const, color: '#ffaa22', hex: 0xffaa22, x: -5, desc: 'Token IDs → dense vectors (768-dim)' },
  { id: 'attn1', label: 'Attention 1', shape: 'torus' as const, color: '#44aaff', hex: 0x44aaff, x: -2, desc: 'Multi-head self-attention (Q·K·V)' },
  { id: 'ffn1', label: 'FFN 1', shape: 'box' as const, color: '#22cc88', hex: 0x22cc88, x: 0, desc: 'Feed-forward network (expand 4x, GELU, project)' },
  { id: 'attn2', label: 'Attention 2', shape: 'torus' as const, color: '#4488ff', hex: 0x4488ff, x: 2, desc: 'Second attention layer' },
  { id: 'ffn2', label: 'FFN 2', shape: 'box' as const, color: '#22aa88', hex: 0x22aa88, x: 4, desc: 'Second feed-forward layer' },
  { id: 'norm', label: 'LayerNorm', shape: 'sphere' as const, color: '#cc44ff', hex: 0xcc44ff, x: 6, desc: 'Normalize activations to zero mean, unit variance' },
  { id: 'output', label: 'Output', shape: 'octahedron' as const, color: '#ff4488', hex: 0xff4488, x: 8, desc: 'Logits → softmax → next token probability' },
];

const PARTICLE_COUNT = 300;

// ── Fresnel helper ──
const fresnelNode = Fn(() => {
  const viewDir = cameraPosition.sub(positionWorld).normalize();
  const nDotV = normalWorld.dot(viewDir).saturate();
  return float(1.0).sub(nDotV).pow(2.0);
});

// ── Helper: get color at progress along pipeline ──
function getColorAtProgress(progress: number, tmpColor: THREE.Color): THREE.Color {
  const t = Math.max(0, Math.min(1, progress));
  const segment = t * (STAGES.length - 1);
  const idx = Math.min(Math.floor(segment), STAGES.length - 2);
  const frac = segment - idx;
  const c1 = new THREE.Color(STAGES[idx].color);
  const c2 = new THREE.Color(STAGES[idx + 1].color);
  tmpColor.copy(c1).lerp(c2, frac);
  return tmpColor;
}

// ── Create TSL material for each stage type ──
function makeStageMaterial(stageId: string, hex: number): THREE.MeshStandardNodeMaterial {
  const mat = new THREE.MeshStandardNodeMaterial();
  const baseColor = color(hex);
  const fresnel = fresnelNode();

  switch (stageId) {
    case 'input':
    case 'ffn1':
    case 'ffn2': {
      // Box stages: scanline / circuit-board pattern
      const isFfn = stageId !== 'input';
      if (isFfn) {
        // FFN: grid / circuit-board pattern
        const gridX = fract(positionLocal.x.mul(8.0));
        const gridY = fract(positionLocal.y.mul(8.0));
        const gridZ = fract(positionLocal.z.mul(8.0));
        const lineX = smoothstep(0.42, 0.48, gridX).sub(smoothstep(0.52, 0.58, gridX));
        const lineY = smoothstep(0.42, 0.48, gridY).sub(smoothstep(0.52, 0.58, gridY));
        const lineZ = smoothstep(0.42, 0.48, gridZ).sub(smoothstep(0.52, 0.58, gridZ));
        const gridPattern = lineX.add(lineY).add(lineZ).clamp(0.0, 1.0);
        const darkBase = baseColor.mul(0.3);
        const brightLine = baseColor.mul(2.0);
        mat.colorNode = mix(darkBase, brightLine, gridPattern.mul(0.7));
        mat.emissiveNode = mix(baseColor.mul(0.3), baseColor.mul(2.5), gridPattern.mul(0.6)).add(
          baseColor.mul(fresnel.mul(1.5))
        );
      } else {
        // Input: scanline scrolling upward
        const scanline = smoothstep(0.4, 0.6, fract(positionLocal.y.mul(10.0).add(time.mul(0.8))));
        mat.colorNode = mix(baseColor.mul(0.4), baseColor.mul(1.5), scanline);
        mat.emissiveNode = mix(baseColor.mul(0.2), baseColor.mul(2.0), scanline).add(
          baseColor.mul(fresnel.mul(1.5))
        );
      }
      break;
    }
    case 'embed': {
      // Cylinder: rotating vertical color bands
      const angle = atan(positionLocal.x, positionLocal.z);
      const bandPattern = fract(angle.mul(3.0 / (Math.PI * 2)).add(time.mul(0.3)));
      const band = smoothstep(0.3, 0.5, bandPattern).sub(smoothstep(0.5, 0.7, bandPattern));
      const warmShift = color(0xffdd44);
      mat.colorNode = mix(baseColor.mul(0.5), warmShift, band.mul(0.6));
      mat.emissiveNode = mix(baseColor.mul(0.4), warmShift.mul(2.0), band.mul(0.5)).add(
        baseColor.mul(fresnel.mul(1.8))
      );
      break;
    }
    case 'attn1':
    case 'attn2': {
      // Torus: multi-color swirling hash noise
      const noiseVal = hash(positionLocal.mul(5.0).add(time.mul(0.5)));
      const warmColor = color(stageId === 'attn1' ? 0x44aaff : 0x4488ff);
      const accentColor = color(stageId === 'attn1' ? 0xff88cc : 0x88ffcc);
      mat.colorNode = mix(warmColor, accentColor, noiseVal.mul(0.6));
      mat.emissiveNode = mix(warmColor.mul(0.5), accentColor.mul(2.0), noiseVal.mul(0.4)).add(
        warmColor.mul(fresnel.mul(2.0))
      );
      break;
    }
    case 'norm': {
      // Sphere: smooth pulsing gradient + fresnel color shift
      const yGrad = smoothstep(-0.6, 0.6, positionLocal.y);
      const pulse = float(0.5).add(time.mul(1.5).sin().mul(0.3));
      const bottomColor = color(0x8822cc);
      const topColor = color(0xff66ff);
      mat.colorNode = mix(bottomColor, topColor, yGrad.mul(pulse));
      mat.emissiveNode = mix(bottomColor.mul(0.5), topColor.mul(2.5), yGrad.mul(pulse)).add(
        baseColor.mul(fresnel.mul(2.0))
      );
      break;
    }
    case 'output': {
      // Octahedron: rainbow fresnel via vertical gradient
      const yNorm = positionLocal.y.mul(1.5).add(0.5).clamp(0.0, 1.0);
      const rainbowLow = color(0xff4488);
      const rainbowMid = color(0xffaa44);
      const rainbowHigh = color(0x44ffaa);
      const lowerMix = mix(rainbowLow, rainbowMid, smoothstep(0.0, 0.5, yNorm));
      const fullRainbow = mix(lowerMix, rainbowHigh, smoothstep(0.5, 1.0, yNorm));
      mat.colorNode = fullRainbow;
      mat.emissiveNode = fullRainbow.mul(float(1.5).add(fresnel.mul(2.5)));
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

// ── Make halo shell material for a stage ──
function makeHaloMaterial(hex: number): THREE.MeshStandardNodeMaterial {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;
  mat.side = THREE.BackSide;
  mat.depthWrite = false;
  mat.blending = THREE.AdditiveBlending;

  const fresnel = fresnelNode();
  const pulse = float(0.6).add(time.mul(0.8).sin().mul(0.3));
  const glowColor = color(hex);

  mat.opacityNode = fresnel.mul(pulse).mul(0.5);
  mat.colorNode = glowColor;
  mat.emissiveNode = glowColor.mul(fresnel.mul(pulse).mul(3.0));
  mat.roughness = 0.0;
  mat.metalness = 0.0;
  return mat;
}

// ── Connection pipe TSL material ──
function makePipeMaterial(): THREE.MeshStandardNodeMaterial {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;

  // Scrolling brightness along the pipe (y is pipe length axis)
  const flow = smoothstep(0.3, 0.7, fract(positionLocal.y.mul(3.0).sub(time.mul(1.5))));
  const baseBlue = color(0x334466);
  const brightBlue = color(0x66ccff);

  mat.colorNode = mix(baseBlue, brightBlue, flow.mul(0.6));
  mat.emissiveNode = mix(baseBlue.mul(0.1), brightBlue.mul(1.5), flow.mul(0.5));
  mat.opacityNode = float(0.35).add(flow.mul(0.25));
  mat.roughness = 0.3;
  mat.metalness = 0.1;
  return mat;
}

// ── Pipe halo material ──
function makePipeHaloMaterial(): THREE.MeshStandardNodeMaterial {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;
  mat.side = THREE.BackSide;
  mat.depthWrite = false;
  mat.blending = THREE.AdditiveBlending;

  const flow = smoothstep(0.3, 0.7, fract(positionLocal.y.mul(3.0).sub(time.mul(1.5))));
  const glowColor = color(0x4488aa);
  mat.opacityNode = flow.mul(0.15);
  mat.colorNode = glowColor;
  mat.emissiveNode = glowColor.mul(flow.mul(2.0));
  mat.roughness = 0.0;
  mat.metalness = 0.0;
  return mat;
}

// ── Stage shape geometry component ──
function StageGeometry({ shape }: { shape: string }) {
  switch (shape) {
    case 'box': return <boxGeometry args={[1, 1.5, 1]} />;
    case 'cylinder': return <cylinderGeometry args={[0.6, 0.6, 1.5, 24]} />;
    case 'torus': return <torusGeometry args={[0.6, 0.2, 16, 32]} />;
    case 'sphere': return <sphereGeometry args={[0.6, 24, 24]} />;
    case 'octahedron': return <octahedronGeometry args={[0.7]} />;
    default: return <boxGeometry args={[1, 1, 1]} />;
  }
}

// ── Halo geometry (same shape but slightly larger) ──
function HaloGeometry({ shape }: { shape: string }) {
  switch (shape) {
    case 'box': return <boxGeometry args={[1.5, 2.2, 1.5]} />;
    case 'cylinder': return <cylinderGeometry args={[0.9, 0.9, 2.2, 24]} />;
    case 'torus': return <torusGeometry args={[0.9, 0.35, 16, 32]} />;
    case 'sphere': return <sphereGeometry args={[0.9, 24, 24]} />;
    case 'octahedron': return <octahedronGeometry args={[1.05]} />;
    default: return <boxGeometry args={[1.5, 1.5, 1.5]} />;
  }
}

// ── Individual stage component ──
function Stage({
  stage,
  index,
  isSelected,
  isHovered,
  onSelect,
  onHover,
  onUnhover,
}: {
  stage: typeof STAGES[number];
  index: number;
  isSelected: boolean;
  isHovered: boolean;
  onSelect: (id: string) => void;
  onHover: (id: string) => void;
  onUnhover: () => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const haloRef = useRef<THREE.Mesh>(null);

  const stageMat = useMemo(() => makeStageMaterial(stage.id, stage.hex), [stage.id, stage.hex]);
  const haloMat = useMemo(() => makeHaloMaterial(stage.hex), [stage.hex]);

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const t = clock.getElapsedTime();
    // Gentle floating
    meshRef.current.position.y = Math.sin(t + index * 0.8) * 0.15;
    // Torus stages rotate
    if (stage.shape === 'torus') {
      meshRef.current.rotation.y = t * 0.5;
      meshRef.current.rotation.x = Math.sin(t * 0.3) * 0.3;
    }
    // Pulse on selection
    if (isSelected) {
      const scale = 1.0 + Math.sin(t * 3) * 0.08;
      meshRef.current.scale.setScalar(scale);
    } else {
      meshRef.current.scale.setScalar(1.0);
    }

    // Halo shell follows position, doubles size when selected
    if (haloRef.current) {
      haloRef.current.position.y = meshRef.current.position.y;
      if (stage.shape === 'torus') {
        haloRef.current.rotation.y = meshRef.current.rotation.y;
        haloRef.current.rotation.x = meshRef.current.rotation.x;
      }
      const haloScale = isSelected ? 2.0 : 1.0;
      haloRef.current.scale.setScalar(haloScale);
    }
  });

  return (
    <group position={[stage.x, 0, 0]}>
      {/* Core mesh */}
      <mesh
        ref={meshRef}
        onClick={(e: { stopPropagation: () => void }) => { e.stopPropagation(); onSelect(stage.id); }}
        onPointerOver={(e: { stopPropagation: () => void }) => { e.stopPropagation(); onHover(stage.id); }}
        onPointerOut={() => onUnhover()}
        material={stageMat}
      >
        <StageGeometry shape={stage.shape} />
      </mesh>
      {/* Halo shell */}
      <mesh ref={haloRef} material={haloMat}>
        <HaloGeometry shape={stage.shape} />
      </mesh>
      {/* Colored point light - stronger on selection */}
      <pointLight color={stage.color} intensity={isSelected ? 5.0 : isHovered ? 2.5 : 1.5} distance={6} />
      {/* Hover tooltip */}
      {isHovered && !isSelected && (
        <Html position={[0, 1.3, 0]} center distanceFactor={10}>
          <div style={{
            color: 'white', fontSize: '12px',
            background: 'rgba(0,0,0,0.8)', padding: '4px 8px',
            borderRadius: '4px', whiteSpace: 'nowrap', pointerEvents: 'none',
          }}>{stage.label}</div>
        </Html>
      )}
      {/* Selection detail popup */}
      {isSelected && (
        <Html position={[0, 1.8, 0]} center distanceFactor={10}>
          <div style={{
            color: 'white', fontSize: '13px',
            background: 'rgba(0,0,0,0.9)', padding: '10px 14px',
            borderRadius: '6px', whiteSpace: 'nowrap', pointerEvents: 'none',
            border: `1px solid ${stage.color}`, maxWidth: '260px',
          }}>
            <div style={{ fontWeight: 'bold', fontSize: '15px', marginBottom: '4px', color: stage.color }}>{stage.label}</div>
            <div style={{ whiteSpace: 'normal', lineHeight: '1.4' }}>{stage.desc}</div>
          </div>
        </Html>
      )}
      {/* Stage label below */}
      <Html position={[0, -1.3, 0]} center distanceFactor={10}>
        <div style={{
          color: stage.color, fontSize: '10px',
          background: 'rgba(0,0,0,0.6)', padding: '2px 6px',
          borderRadius: '3px', whiteSpace: 'nowrap', pointerEvents: 'none',
          fontFamily: 'monospace',
        }}>{stage.label}</div>
      </Html>
    </group>
  );
}

// ── Connection pipe between adjacent stages ──
function ConnectionPipe({ fromX, toX }: { fromX: number; toX: number }) {
  const length = toX - fromX;
  const midX = (fromX + toX) / 2;

  const pipeMat = useMemo(() => makePipeMaterial(), []);
  const pipeHaloMat = useMemo(() => makePipeHaloMaterial(), []);

  return (
    <group>
      {/* Core pipe */}
      <mesh position={[midX, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={pipeMat}>
        <cylinderGeometry args={[0.06, 0.06, length - 1.2, 12]} />
      </mesh>
      {/* Halo tube */}
      <mesh position={[midX, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={pipeHaloMat}>
        <cylinderGeometry args={[0.09, 0.09, length - 1.2, 12]} />
      </mesh>
    </group>
  );
}

// ── Particle system ──
function Particles({ selectedStage }: { selectedStage: string | null }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  // Particle material: bright additive glow
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

  // Initialize particle state
  const particleState = useMemo(() => {
    const progress = new Float32Array(PARTICLE_COUNT);
    const speeds = new Float32Array(PARTICLE_COUNT);
    const offsets = new Float32Array(PARTICLE_COUNT);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      progress[i] = Math.random();
      speeds[i] = 0.08 + Math.random() * 0.06;
      offsets[i] = (Math.random() - 0.5) * 0.6;
    }
    return { progress, speeds, offsets };
  }, []);

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const tmpColor = useMemo(() => new THREE.Color(), []);

  // Get the x range of the pipeline
  const xMin = STAGES[0].x;
  const xMax = STAGES[STAGES.length - 1].x;
  const xRange = xMax - xMin;

  // Find stage index for a given progress value (for slow-down effect)
  const getStageAtProgress = useCallback((p: number) => {
    const x = xMin + p * xRange;
    for (let i = 0; i < STAGES.length; i++) {
      if (Math.abs(x - STAGES[i].x) < 1.0) return STAGES[i].id;
    }
    return null;
  }, [xMin, xRange]);

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      let speed = particleState.speeds[i];

      // Slow down and enlarge near selected stage
      if (selectedStage) {
        const stageId = getStageAtProgress(particleState.progress[i]);
        if (stageId === selectedStage) {
          speed *= 0.3;
        }
      }

      particleState.progress[i] += speed * delta;
      if (particleState.progress[i] >= 1.0) {
        particleState.progress[i] = 0;
        particleState.offsets[i] = (Math.random() - 0.5) * 0.6;
      }

      const p = particleState.progress[i];
      const x = xMin + p * xRange;
      const yOff = Math.sin(p * Math.PI * 4 + i) * 0.2 + particleState.offsets[i] * 0.3;
      const zOff = Math.cos(p * Math.PI * 3 + i * 0.5) * 0.3 + particleState.offsets[i] * 0.4;

      dummy.position.set(x, yOff, zOff);

      // Slightly larger particles, bigger when near selected stage
      let particleScale = 0.07;
      if (selectedStage) {
        const stageId = getStageAtProgress(p);
        if (stageId === selectedStage) {
          particleScale = 0.12;
        }
      }
      dummy.scale.setScalar(particleScale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      // Set color based on progress — more saturated
      getColorAtProgress(p, tmpColor);
      // Boost brightness
      tmpColor.multiplyScalar(1.5);
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

    const gridX = fract(positionLocal.x.mul(2.0));
    const gridZ = fract(positionLocal.z.mul(2.0));
    const lineX = smoothstep(0.46, 0.49, gridX).sub(smoothstep(0.51, 0.54, gridX));
    const lineZ = smoothstep(0.46, 0.49, gridZ).sub(smoothstep(0.51, 0.54, gridZ));
    const gridPattern = lineX.add(lineZ).clamp(0.0, 1.0);

    m.colorNode = color(0x112233);
    m.emissiveNode = color(0x223344).mul(gridPattern.mul(0.3));
    m.opacityNode = float(0.4).add(gridPattern.mul(0.2));
    m.roughness = 0.8;
    m.metalness = 0.1;
    return m;
  }, []);

  return (
    <mesh position={[0, -2.5, 0]} rotation={[-Math.PI / 2, 0, 0]} material={mat}>
      <planeGeometry args={[30, 12]} />
    </mesh>
  );
}

// ── Background sphere ──
function BackgroundSphere() {
  const mat = useMemo(() => {
    const m = new THREE.MeshStandardNodeMaterial();
    m.side = THREE.BackSide;
    // Dark gradient from deep blue at bottom to near-black at top
    const yGrad = positionLocal.y.mul(0.02).add(0.5).clamp(0.0, 1.0);
    const bottomColor = color(0x0a0e1a);
    const topColor = color(0x050508);
    m.colorNode = mix(bottomColor, topColor, yGrad);
    m.emissiveNode = mix(color(0x060a14), color(0x020204), yGrad);
    m.roughness = 1.0;
    m.metalness = 0.0;
    return m;
  }, []);

  return (
    <mesh material={mat}>
      <sphereGeometry args={[40, 32, 32]} />
    </mesh>
  );
}

// ── Camera controller ──
function CameraController({ selectedStage }: { selectedStage: string | null }) {
  const targetPos = useRef(new THREE.Vector3(0, 3, 16));
  const targetLookAt = useRef(new THREE.Vector3(0, 0, 0));

  useFrame(({ camera }) => {
    if (selectedStage) {
      const stage = STAGES.find(s => s.id === selectedStage);
      if (stage) {
        targetPos.current.set(stage.x, 1.5, 6);
        targetLookAt.current.set(stage.x, 0, 0);
      }
    } else {
      targetPos.current.set(0, 3, 16);
      targetLookAt.current.set(0, 0, 0);
    }

    camera.position.lerp(targetPos.current, 0.05);
    // Smooth look-at
    const currentLookAt = new THREE.Vector3();
    camera.getWorldDirection(currentLookAt);
    currentLookAt.multiplyScalar(10).add(camera.position);
    currentLookAt.lerp(targetLookAt.current, 0.05);
    camera.lookAt(targetLookAt.current);
  });

  return null;
}

// ── Main component ──
export default function NeuralPipelineFlow() {
  const [selectedStage, setSelectedStage] = useState<string | null>(null);
  const [hoveredStage, setHoveredStage] = useState<string | null>(null);

  const handleSelect = useCallback((id: string) => {
    setSelectedStage(prev => prev === id ? null : id);
  }, []);

  const handleBackgroundClick = useCallback(() => {
    setSelectedStage(null);
  }, []);

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
      <CameraController selectedStage={selectedStage} />

      {/* Background gradient sphere */}
      <BackgroundSphere />

      {/* Subtle fog via fog color */}
      <fog attach="fog" args={['#060a14', 15, 45]} />

      {/* Background click catcher */}
      <mesh position={[0, 0, -5]} onClick={handleBackgroundClick} material={bgClickMat}>
        <planeGeometry args={[60, 30]} />
      </mesh>

      {/* Grid floor */}
      <GridFloor />

      {/* Connection pipes */}
      {STAGES.slice(0, -1).map((stage, i) => (
        <ConnectionPipe
          key={`pipe-${i}`}
          fromX={stage.x}
          toX={STAGES[i + 1].x}
        />
      ))}

      {/* Stages */}
      {STAGES.map((stage, i) => (
        <Stage
          key={stage.id}
          stage={stage}
          index={i}
          isSelected={selectedStage === stage.id}
          isHovered={hoveredStage === stage.id}
          onSelect={handleSelect}
          onHover={setHoveredStage}
          onUnhover={() => setHoveredStage(null)}
        />
      ))}

      {/* Data particles */}
      <Particles selectedStage={selectedStage} />
    </>
  );
}
