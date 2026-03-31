import { useRef, useMemo, useState, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three/webgpu';

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

// Pre-computed particle state at module scope to avoid impure Math.random() calls during render
const INITIAL_PARTICLE_PROGRESS = new Float32Array(PARTICLE_COUNT).map(() => Math.random());
const INITIAL_PARTICLE_SPEEDS = new Float32Array(PARTICLE_COUNT).map(() => 0.08 + Math.random() * 0.06);
const INITIAL_PARTICLE_OFFSETS = new Float32Array(PARTICLE_COUNT).map(() => (Math.random() - 0.5) * 0.6);

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

// ── Simple material for each stage ──
function makeStageMaterial(_stageId: string, hex: number): THREE.MeshStandardNodeMaterial {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.color = new THREE.Color(hex);
  mat.emissive = new THREE.Color(hex);
  mat.emissiveIntensity = 0.6;
  mat.roughness = 0.2;
  mat.metalness = 0.4;
  return mat;
}

// ── Simple halo shell material for a stage ──
function makeHaloMaterial(hex: number): THREE.MeshStandardNodeMaterial {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;
  mat.side = THREE.BackSide;
  mat.depthWrite = false;
  mat.blending = THREE.AdditiveBlending;
  mat.color = new THREE.Color(hex);
  mat.emissive = new THREE.Color(hex);
  mat.emissiveIntensity = 1.5;
  mat.opacity = 0.25;
  mat.roughness = 0.0;
  mat.metalness = 0.0;
  return mat;
}

// ── Simple connection pipe material ──
function makePipeMaterial(): THREE.MeshStandardNodeMaterial {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;
  mat.color = new THREE.Color(0x4499bb);
  mat.emissive = new THREE.Color(0x4499bb);
  mat.emissiveIntensity = 0.4;
  mat.opacity = 0.45;
  mat.roughness = 0.3;
  mat.metalness = 0.1;
  return mat;
}

// ── Simple pipe halo material ──
function makePipeHaloMaterial(): THREE.MeshStandardNodeMaterial {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;
  mat.side = THREE.BackSide;
  mat.depthWrite = false;
  mat.blending = THREE.AdditiveBlending;
  mat.color = new THREE.Color(0x4488aa);
  mat.emissive = new THREE.Color(0x4488aa);
  mat.emissiveIntensity = 1.0;
  mat.opacity = 0.1;
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

  // Simple particle material: bright additive glow
  const particleMat = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.transparent = true;
    mat.depthWrite = false;
    mat.blending = THREE.AdditiveBlending;
    mat.color = new THREE.Color(0xffffff);
    mat.emissive = new THREE.Color(0xffffff);
    mat.emissiveIntensity = 3.0;
    mat.opacity = 0.9;
    mat.roughness = 0.0;
    mat.metalness = 0.0;
    return mat;
  }, []);

  // Initialize particle state from pre-computed arrays to avoid impure Math.random() during render
  const particleState = useMemo(() => ({
    progress: new Float32Array(INITIAL_PARTICLE_PROGRESS),
    speeds: new Float32Array(INITIAL_PARTICLE_SPEEDS),
    offsets: new Float32Array(INITIAL_PARTICLE_OFFSETS),
  }), []);

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

      // eslint-disable-next-line react-hooks/immutability
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
    m.color = new THREE.Color(0x112233);
    m.emissive = new THREE.Color(0x112233);
    m.emissiveIntensity = 0.4;
    m.opacity = 0.5;
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
    m.color = new THREE.Color(0x070a10);
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
  const scratchLookAt = useMemo(() => new THREE.Vector3(), []);

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
    camera.getWorldDirection(scratchLookAt);
    scratchLookAt.multiplyScalar(10).add(camera.position);
    scratchLookAt.lerp(targetLookAt.current, 0.05);
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
    m.color = new THREE.Color(0x0a0a12);
    m.roughness = 1.0;
    m.metalness = 0.0;
    return m;
  }, []);

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.1} />
      <hemisphereLight args={['#334466', '#111122', 0.3]} />
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

      {/* Instructions overlay (top-left) */}
      <Html fullscreen>
        <div style={{
          position: 'absolute', top: '16px', left: '16px',
          color: 'rgba(255,255,255,0.7)', fontSize: '11px',
          background: 'rgba(0,0,0,0.5)', padding: '10px 14px',
          borderRadius: '6px', lineHeight: '1.6',
          maxWidth: '220px', pointerEvents: 'none',
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: '4px', color: '#44aaff', fontSize: '12px' }}>Neural Pipeline</div>
          <div>AI transformer inference &mdash; data flows through tokenization, attention, and feed-forward stages</div>
          <div style={{ marginTop: '6px' }}>Click a stage to inspect</div>
          <div>Hover for stage name</div>
          <div style={{ marginTop: '4px', fontSize: '10px', opacity: 0.6 }}>
            Watch data particles transform through the pipeline
          </div>
        </div>
      </Html>

      {/* Stage list sidebar (right) */}
      <Html fullscreen>
        <div style={{
          position: 'absolute', top: '16px', right: '16px',
          color: 'white', fontSize: '11px',
          background: 'rgba(5,10,25,0.75)', padding: '10px 12px',
          borderRadius: '6px', maxWidth: '160px',
          pointerEvents: 'none', backdropFilter: 'blur(4px)',
          border: '1px solid rgba(100,150,255,0.15)',
          maxHeight: '80vh', overflowY: 'auto',
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: '6px', color: '#44aaff', fontSize: '11px' }}>Pipeline Stages</div>
          {STAGES.map(stage => (
            <div key={stage.id}
              onClick={() => handleSelect(stage.id)}
              style={{
                padding: '2px 6px', marginBottom: '1px', borderRadius: '3px',
                cursor: 'pointer', pointerEvents: 'auto',
                color: selectedStage === stage.id ? '#fff' : stage.color,
                background: selectedStage === stage.id ? 'rgba(255,255,255,0.12)' : 'transparent',
                fontSize: '10px', transition: 'background 0.2s',
                display: 'flex', alignItems: 'center', gap: '5px',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = selectedStage === stage.id ? 'rgba(255,255,255,0.12)' : 'transparent'; }}
            >
              <span style={{
                display: 'inline-block', width: '6px', height: '6px',
                borderRadius: '50%', background: stage.color, flexShrink: 0,
              }} />
              {stage.label}
            </div>
          ))}

          <div style={{ marginTop: '10px', borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: '8px' }}>
            <div style={{ fontWeight: 'bold', marginBottom: '4px', color: '#44aaff', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Shape Legend</div>
            {([
              { shape: 'Box', meaning: 'Data / FFN' },
              { shape: 'Torus', meaning: 'Attention' },
              { shape: 'Cylinder', meaning: 'Embedding' },
              { shape: 'Sphere', meaning: 'Normalization' },
            ] as const).map(entry => (
              <div key={entry.shape} style={{
                fontSize: '9px', padding: '1px 6px', opacity: 0.6,
              }}>
                <span style={{ fontWeight: 'bold' }}>{entry.shape}</span> = {entry.meaning}
              </div>
            ))}
          </div>
        </div>
      </Html>
    </>
  );
}
