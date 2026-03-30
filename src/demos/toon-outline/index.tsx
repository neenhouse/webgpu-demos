import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
  Fn,
  float,
  color,
  mix,
  smoothstep,
  positionWorld,
  positionLocal,
  normalWorld,
  normalLocal,
  cameraPosition,
  uniform,
  floor,
} from 'three/tsl';

/**
 * Toon Outline — cel shading with N-tone quantization and inverted hull outline
 *
 * Demonstrates:
 * - Character-like scene: sphere head, box body, cylinder limbs, cone hat
 * - Cel shading: floor(NdotL * 3) / 3 quantizes to 3 lighting tones
 * - Outline: each mesh rendered twice — BackSide scaled 1.05 in black
 * - 3-tone pastel color palette
 * - Fresnel rim highlight for illustration look
 * - Animated gentle wobble
 */

const OUTLINE_SCALE = 1.05;

export default function ToonOutline() {
  const groupRef = useRef<THREE.Group>(null);
  const timeUniform = useMemo(() => uniform(0), []);

  // Create cel shading material
  const makeCelMat = (baseColor: string, tones = 3) => {
    const mat = new THREE.MeshStandardNodeMaterial();

    const base = color(baseColor);
    const lightDir = positionWorld.normalize().sub(normalWorld).normalize();

    // Quantized NdotL for cel shading bands
    const nDotL = Fn(() => {
      // Use fixed light direction (from upper-left)
      const fixedLight = positionWorld.mul(0).add(float(-0.577)).xyz.normalize();
      // Actually use a fixed vector since we don't have TSL light direction access
      const nDotLRaw = normalWorld.y.mul(0.6).add(normalWorld.x.mul(-0.5)).add(normalWorld.z.mul(0.3)).add(0.5).clamp(0, 1);
      // Quantize to N tones
      const quantized = floor(nDotLRaw.mul(float(tones))).div(float(tones));
      return quantized;
      void fixedLight; void lightDir;
    });

    const toneValue = nDotL();

    // 3-tone cel bands: shadow / mid / highlight
    const shadowColor = base.mul(float(0.25));
    const midColor = base.mul(float(0.65));
    const highlightColor = base.mul(float(1.1));

    const celColor = mix(
      mix(shadowColor, midColor, smoothstep(float(0.0), float(0.4), toneValue)),
      highlightColor,
      smoothstep(float(0.6), float(0.9), toneValue)
    );

    mat.colorNode = celColor;

    // Fresnel rim highlight
    const viewDir = cameraPosition.sub(positionWorld).normalize();
    const nDotV = normalWorld.dot(viewDir).saturate();
    const fresnel = float(1.0).sub(nDotV).pow(3.0);
    const rimColor = color(0xffffff);
    mat.emissiveNode = rimColor.mul(fresnel.mul(0.5));

    mat.roughness = 0.8;
    mat.metalness = 0.0;

    return mat;
  };

  // Black outline material — BackSide, no shading
  const makeOutlineMat = (thickness = OUTLINE_SCALE) => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.side = THREE.BackSide;
    mat.colorNode = color(0x000000);
    mat.emissiveNode = color(0x000000);
    mat.roughness = 1.0;
    mat.metalness = 0.0;
    // Scale position outward along normal for outline thickness
    mat.positionNode = positionLocal.add(normalLocal.mul(float(thickness - 1.0)));
    return mat;
  };

  // Materials for character parts
  const skinMat = useMemo(() => makeCelMat('#ffcc99'), []);
  const bodyMat = useMemo(() => makeCelMat('#5588ff'), []);
  const pantsMat = useMemo(() => makeCelMat('#334477'), []);
  const hatMat = useMemo(() => makeCelMat('#ff4422'), []);
  const shoeMat = useMemo(() => makeCelMat('#222222'), []);

  // Outline materials
  const outlineMat = useMemo(() => makeOutlineMat(1.06), []);
  const outlineThinMat = useMemo(() => makeOutlineMat(1.04), []);

  // Eye/detail materials
  const eyeMat = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.colorNode = color(0x111111);
    mat.emissiveNode = color(0x111111);
    mat.roughness = 0.1;
    mat.metalness = 0.0;
    return mat;
  }, []);

  const blushMat = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.colorNode = color(0xff8888);
    mat.emissiveNode = color(0xff4444).mul(float(0.6));
    mat.transparent = true;
    mat.opacityNode = float(0.7);
    mat.roughness = 0.9;
    return mat;
  }, []);

  useFrame((state) => {
    // eslint-disable-next-line react-hooks/immutability
    timeUniform.value = state.clock.getElapsedTime();
    const t = state.clock.getElapsedTime();
    if (groupRef.current) {
      groupRef.current.rotation.y = Math.sin(t * 0.4) * 0.5;
      groupRef.current.position.y = Math.sin(t * 0.8) * 0.05;
    }
  });

  // Character dimensions
  const BODY_Y = 0.0;
  const HEAD_Y = 1.45;

  return (
    <>
      <ambientLight intensity={0.35} />
      <directionalLight position={[-3, 6, 4]} intensity={0.8} color="#ffffff" />
      <directionalLight position={[4, 3, -3]} intensity={0.2} color="#ffeecc" />
      <pointLight position={[0, 4, 3]} intensity={5} color="#ffffff" distance={15} />

      {/* Ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.2, 0]}>
        <planeGeometry args={[14, 10]} />
        <meshStandardMaterial color="#ddeeff" roughness={1} />
      </mesh>

      {/* Ground shadow circle */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.19, 0]}>
        <circleGeometry args={[1.5, 32]} />
        <meshStandardMaterial color="#bbccdd" roughness={1} transparent opacity={0.5} />
      </mesh>

      {/* Character group */}
      <group ref={groupRef}>
        {/* ── Body ── */}
        <mesh position={[0, BODY_Y, 0]}>
          <boxGeometry args={[0.8, 1.0, 0.5]} />
          <primitive object={bodyMat} />
        </mesh>
        <mesh position={[0, BODY_Y, 0]} scale={[1, 1, 1]}>
          <boxGeometry args={[0.8, 1.0, 0.5]} />
          <primitive object={outlineMat} />
        </mesh>

        {/* ── Belt ── */}
        <mesh position={[0, BODY_Y - 0.35, 0]}>
          <boxGeometry args={[0.82, 0.12, 0.52]} />
          <meshStandardMaterial color="#222222" roughness={0.5} />
        </mesh>

        {/* ── Pants (legs) ── */}
        {[-0.22, 0.22].map((x, i) => (
          <group key={`leg-${i}`}>
            <mesh position={[x, BODY_Y - 0.85, 0]}>
              <boxGeometry args={[0.32, 0.7, 0.45]} />
              <primitive object={pantsMat} />
            </mesh>
            <mesh position={[x, BODY_Y - 0.85, 0]}>
              <boxGeometry args={[0.32, 0.7, 0.45]} />
              <primitive object={outlineThinMat} />
            </mesh>
            {/* Shoe */}
            <mesh position={[x, BODY_Y - 1.25, 0.05]}>
              <boxGeometry args={[0.32, 0.2, 0.52]} />
              <primitive object={shoeMat} />
            </mesh>
          </group>
        ))}

        {/* ── Arms ── */}
        {[-0.65, 0.65].map((x, i) => (
          <group key={`arm-${i}`}>
            <mesh
              position={[x, BODY_Y + 0.1, 0]}
              rotation={[0, 0, i === 0 ? 0.3 : -0.3]}
            >
              <cylinderGeometry args={[0.12, 0.1, 0.8, 12]} />
              <primitive object={skinMat} />
            </mesh>
            <mesh
              position={[x, BODY_Y + 0.1, 0]}
              rotation={[0, 0, i === 0 ? 0.3 : -0.3]}
            >
              <cylinderGeometry args={[0.12, 0.1, 0.8, 12]} />
              <primitive object={outlineThinMat} />
            </mesh>
            {/* Hand */}
            <mesh position={[x + (i === 0 ? -0.12 : 0.12), BODY_Y - 0.3, 0]}>
              <sphereGeometry args={[0.15, 12, 12]} />
              <primitive object={skinMat} />
            </mesh>
          </group>
        ))}

        {/* ── Neck ── */}
        <mesh position={[0, HEAD_Y - 0.25, 0]}>
          <cylinderGeometry args={[0.12, 0.14, 0.2, 12]} />
          <primitive object={skinMat} />
        </mesh>

        {/* ── Head ── */}
        <mesh position={[0, HEAD_Y, 0]}>
          <sphereGeometry args={[0.45, 32, 32]} />
          <primitive object={skinMat} />
        </mesh>
        <mesh position={[0, HEAD_Y, 0]}>
          <sphereGeometry args={[0.45, 32, 32]} />
          <primitive object={outlineMat} />
        </mesh>

        {/* Eyes */}
        {[-0.15, 0.15].map((x, i) => (
          <mesh key={`eye-${i}`} position={[x, HEAD_Y + 0.05, 0.42]}>
            <sphereGeometry args={[0.07, 12, 12]} />
            <primitive object={eyeMat} />
          </mesh>
        ))}

        {/* Eyebrows */}
        {[-0.15, 0.15].map((x, i) => (
          <mesh key={`brow-${i}`} position={[x, HEAD_Y + 0.18, 0.41]} rotation={[0, 0, i === 0 ? -0.2 : 0.2]}>
            <boxGeometry args={[0.12, 0.04, 0.02]} />
            <primitive object={eyeMat} />
          </mesh>
        ))}

        {/* Blush cheeks */}
        {[-0.28, 0.28].map((x, i) => (
          <mesh key={`blush-${i}`} position={[x, HEAD_Y - 0.05, 0.4]}>
            <circleGeometry args={[0.1, 16]} />
            <primitive object={blushMat} />
          </mesh>
        ))}

        {/* Mouth */}
        <mesh position={[0, HEAD_Y - 0.12, 0.43]}>
          <torusGeometry args={[0.1, 0.025, 8, 16, Math.PI]} />
          <primitive object={eyeMat} />
        </mesh>

        {/* ── Hat (cone) ── */}
        <mesh position={[0, HEAD_Y + 0.52, 0]}>
          <coneGeometry args={[0.38, 0.7, 16]} />
          <primitive object={hatMat} />
        </mesh>
        <mesh position={[0, HEAD_Y + 0.52, 0]}>
          <coneGeometry args={[0.38, 0.7, 16]} />
          <primitive object={outlineMat} />
        </mesh>

        {/* Hat brim */}
        <mesh position={[0, HEAD_Y + 0.2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.35, 0.6, 24]} />
          <primitive object={hatMat} />
        </mesh>
      </group>

      {/* Background decorative elements */}
      {Array.from({ length: 6 }, (_, i) => {
        const angle = (i / 6) * Math.PI * 2;
        const r = 5;
        return (
          <group key={`bg-${i}`} position={[Math.cos(angle) * r, -0.5, Math.sin(angle) * r]}>
            <mesh>
              <cylinderGeometry args={[0.1, 0.2, 1.5 + (i % 3) * 0.5, 8]} />
              <meshStandardMaterial
                color={['#ff8899', '#88ff99', '#9988ff'][i % 3]}
                emissive={['#ff4466', '#44ff66', '#6644ff'][i % 3]}
                emissiveIntensity={0.4}
                roughness={0.7}
              />
            </mesh>
            {/* Outline for decorative cylinders */}
            <mesh>
              <cylinderGeometry args={[0.1, 0.2, 1.5 + (i % 3) * 0.5, 8]} />
              <meshStandardMaterial color="#000000" side={THREE.BackSide} />
            </mesh>
          </group>
        );
      })}

      {/* Stars in background */}
      {Array.from({ length: 12 }, (_, i) => (
        <mesh
          key={`star-${i}`}
          position={[
            Math.cos(i * 1.9) * 7,
            1 + Math.sin(i * 2.3) * 2,
            -4 - Math.abs(Math.cos(i * 1.1)) * 2,
          ]}
        >
          <sphereGeometry args={[0.08, 8, 8]} />
          <meshStandardMaterial
            color="#ffff88"
            emissive="#ffff44"
            emissiveIntensity={2.0}
          />
        </mesh>
      ))}
    </>
  );
}
