import { useRef, useMemo, useState, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three/webgpu';

/**
 * Neural Pipeline Flow
 *
 * AI inference pipeline visualization showing data flowing through
 * transformer stages. Stages arranged left-to-right, each a distinct
 * 3D shape. 200 glowing particles flow continuously through the pipeline.
 * Click stages for detail view; hover for tooltips.
 */

// ── Stage definitions ──
const STAGES = [
  { id: 'input', label: 'Input Tokens', shape: 'box' as const, color: '#ff6644', x: -8, desc: 'Raw text tokenized into integer IDs' },
  { id: 'embed', label: 'Embedding', shape: 'cylinder' as const, color: '#ffaa22', x: -5, desc: 'Token IDs → dense vectors (768-dim)' },
  { id: 'attn1', label: 'Attention 1', shape: 'torus' as const, color: '#44aaff', x: -2, desc: 'Multi-head self-attention (Q·K·V)' },
  { id: 'ffn1', label: 'FFN 1', shape: 'box' as const, color: '#22cc88', x: 0, desc: 'Feed-forward network (expand 4x, GELU, project)' },
  { id: 'attn2', label: 'Attention 2', shape: 'torus' as const, color: '#4488ff', x: 2, desc: 'Second attention layer' },
  { id: 'ffn2', label: 'FFN 2', shape: 'box' as const, color: '#22aa88', x: 4, desc: 'Second feed-forward layer' },
  { id: 'norm', label: 'LayerNorm', shape: 'sphere' as const, color: '#cc44ff', x: 6, desc: 'Normalize activations to zero mean, unit variance' },
  { id: 'output', label: 'Output', shape: 'octahedron' as const, color: '#ff4488', x: 8, desc: 'Logits → softmax → next token probability' },
];

const PARTICLE_COUNT = 200;

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
  const baseColor = useMemo(() => new THREE.Color(stage.color), [stage.color]);

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
  });

  return (
    <group position={[stage.x, 0, 0]}>
      <mesh
        ref={meshRef}
        onClick={(e: { stopPropagation: () => void }) => { e.stopPropagation(); onSelect(stage.id); }}
        onPointerOver={(e: { stopPropagation: () => void }) => { e.stopPropagation(); onHover(stage.id); }}
        onPointerOut={() => onUnhover()}
      >
        <StageGeometry shape={stage.shape} />
        <meshStandardMaterial
          color={baseColor}
          emissive={baseColor}
          emissiveIntensity={isSelected ? 1.5 : isHovered ? 0.8 : 0.4}
          roughness={0.3}
          metalness={0.4}
        />
      </mesh>
      {/* Colored point light */}
      <pointLight color={stage.color} intensity={isSelected ? 3.0 : 1.0} distance={5} />
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
function ConnectionPipe({ fromX, toX, index }: { fromX: number; toX: number; index: number }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const length = toX - fromX;
  const midX = (fromX + toX) / 2;

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const t = clock.getElapsedTime();
    // Subtle emissive pulse traveling along pipe
    const mat = meshRef.current.material as THREE.MeshStandardMaterial;
    const pulse = Math.sin(t * 2 + index * 1.3) * 0.5 + 0.5;
    mat.emissiveIntensity = 0.1 + pulse * 0.3;
  });

  return (
    <mesh ref={meshRef} position={[midX, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
      <cylinderGeometry args={[0.04, 0.04, length - 1.2, 8]} />
      <meshStandardMaterial
        color="#334466"
        emissive="#4488aa"
        emissiveIntensity={0.2}
        transparent
        opacity={0.4}
        roughness={0.5}
      />
    </mesh>
  );
}

// ── Particle system ──
function Particles({ selectedStage }: { selectedStage: string | null }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  // Initialize particle state
  const particleState = useMemo(() => {
    const progress = new Float32Array(PARTICLE_COUNT);
    const speeds = new Float32Array(PARTICLE_COUNT);
    const offsets = new Float32Array(PARTICLE_COUNT); // y/z offsets for visual spread
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      progress[i] = Math.random(); // random starting position along pipeline
      speeds[i] = 0.08 + Math.random() * 0.06; // speed variation
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

      // Slow down near selected stage
      if (selectedStage) {
        const stageId = getStageAtProgress(particleState.progress[i]);
        if (stageId === selectedStage) {
          speed *= 0.3; // slow effect
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
      dummy.scale.setScalar(0.05);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      // Set color based on progress
      getColorAtProgress(p, tmpColor);
      mesh.setColorAt(i, tmpColor);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, PARTICLE_COUNT]} frustumCulled={false}>
      <sphereGeometry args={[1, 8, 8]} />
      <meshStandardMaterial
        emissive="#ffffff"
        emissiveIntensity={2.0}
        transparent
        opacity={0.9}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </instancedMesh>
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
    // Smooth look-at by lerping a look target
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

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.1} />
      <directionalLight position={[0, 8, 5]} intensity={0.4} />

      {/* Camera controller */}
      <CameraController selectedStage={selectedStage} />

      {/* Background click catcher */}
      <mesh position={[0, 0, -5]} onClick={handleBackgroundClick}>
        <planeGeometry args={[60, 30]} />
        <meshBasicMaterial color="#0a0a12" />
      </mesh>

      {/* Connection pipes */}
      {STAGES.slice(0, -1).map((stage, i) => (
        <ConnectionPipe
          key={`pipe-${i}`}
          fromX={stage.x}
          toX={STAGES[i + 1].x}
          index={i}
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
