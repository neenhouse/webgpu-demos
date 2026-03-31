import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
  color,
  time,
  oscSine,
  normalWorld,
  cameraPosition,
  positionWorld,
  positionLocal,
  normalLocal,
  Fn,
  float,
  vec3,
  screenUV,
  screenSize,
  floor,
  sin,
  atan,
  smoothstep,
  mix,
} from 'three/tsl';

/**
 * Resolution Warp — TSL viewportSize / resolution-dependent effects
 *
 * Demonstrates viewport resolution-aware shading:
 * - screenSize to create pixel-grid patterns at exact pixel scale
 * - Resolution-dependent pixelation that snaps UVs to coarse pixel blocks
 * - Pixel-scale CRT phosphor sub-pixel simulation
 * - Resolution-adaptive scanlines and moiré patterns
 * - Diagonal halo shimmer tied to actual screen pixel count
 */

export default function ResolutionWarp() {
  const meshRef = useRef<THREE.Mesh>(null);
  const innerRef = useRef<THREE.Mesh>(null);

  // Main material: resolution-dependent pixelated surface with CRT effect
  const material = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.transparent = true;
    mat.side = THREE.DoubleSide;

    // --- Resolution-dependent pixelation ---
    // Large pixel blocks so the effect is clearly visible
    const pixelScale = float(12.0); // real pixels per virtual pixel block
    const gridSize = screenSize.div(pixelScale);
    const pixelatedUV = floor(screenUV.mul(gridSize)).div(gridSize);

    // --- Resolution-dependent moiré ---
    const aspectRatio = screenSize.x.div(screenSize.y);
    const moireFreq = screenSize.x.div(60.0);
    const moire = sin(
      pixelatedUV.x.mul(moireFreq).add(
        pixelatedUV.y.mul(moireFreq.mul(aspectRatio))
      ).add(time.mul(1.0))
    ).mul(0.5).add(0.5);

    // --- Radial pattern from screen center (pixelated) ---
    const centeredUV = pixelatedUV.sub(0.5);
    const dist = centeredUV.length();
    const angle = atan(centeredUV.y, centeredUV.x);

    // Concentric rings + radial spokes
    const rings = sin(dist.mul(35.0).sub(time.mul(2.0))).mul(0.5).add(0.5);
    const spokes = sin(angle.mul(10.0).add(time.mul(0.6))).mul(0.5).add(0.5);
    const pattern = mix(rings, spokes, moire);

    // --- Color palette: warm center, cool edge, pink accent ---
    const warmColor = vec3(1.0, 0.5, 0.0);    // amber
    const coolColor = vec3(0.0, 0.5, 1.0);    // electric blue
    const accentColor = vec3(1.0, 0.1, 0.35); // hot pink

    const colorMix = mix(warmColor, coolColor, dist.mul(2.5).saturate());
    const finalColor = mix(colorMix, accentColor, pattern.mul(0.3));
    mat.colorNode = finalColor;

    // --- Pixel grid lines (visible dark borders between pixel blocks) ---
    const pixelCoords = screenUV.mul(screenSize);
    const gridFractX = pixelCoords.x.mod(pixelScale).div(pixelScale);
    const gridFractY = pixelCoords.y.mod(pixelScale).div(pixelScale);
    // Create dark 1-2px borders between pixel blocks
    const gridLineX = smoothstep(0.0, 0.15, gridFractX).mul(smoothstep(1.0, 0.85, gridFractX));
    const gridLineY = smoothstep(0.0, 0.15, gridFractY).mul(smoothstep(1.0, 0.85, gridFractY));
    const gridDarkening = mix(float(0.0), float(1.0), gridLineX.mul(gridLineY));

    // --- CRT phosphor sub-pixel columns ---
    const subPixelPhase = pixelCoords.x.mod(3.0);
    const phosphorR = smoothstep(0.0, 1.0, subPixelPhase).mul(
      smoothstep(2.0, 1.0, subPixelPhase)
    );
    const phosphorG = smoothstep(1.0, 2.0, subPixelPhase).mul(
      smoothstep(3.0, 2.0, subPixelPhase)
    );
    const phosphorMod = vec3(
      float(0.55).add(phosphorR.mul(0.45)),
      float(0.55).add(phosphorG.mul(0.45)),
      float(0.65)
    );

    // --- Horizontal CRT scanlines (resolution-dependent spacing) ---
    const scanlineFreq = screenSize.y.div(4.0);
    const scanline = sin(screenUV.y.mul(scanlineFreq).mul(Math.PI)).mul(0.5).add(0.5);
    const scanlineMod = mix(float(0.2), float(1.0), scanline);

    // --- Fresnel rim ---
    const fresnel = Fn(() => {
      const viewDir = cameraPosition.sub(positionWorld).normalize();
      const nDotV = normalWorld.dot(viewDir).saturate();
      return float(1.0).sub(nDotV).pow(2.5);
    })();

    // --- Emissive: modulated by all resolution-dependent effects ---
    const emissiveBase = finalColor.mul(phosphorMod).mul(gridDarkening).mul(scanlineMod);
    const rimGlow = vec3(0.05, 0.5, 0.9).mul(fresnel.mul(2.0));
    mat.emissiveNode = emissiveBase.mul(0.7).add(rimGlow);

    // --- Vertex displacement: gentle breathing ---
    mat.positionNode = positionLocal.add(
      normalLocal.mul(oscSine(time.mul(1.5).add(positionLocal.y.mul(3.0))).mul(0.02))
    );

    mat.roughness = 0.8;
    mat.metalness = 0.0;

    return mat;
  }, []);

  // Inner glowing core
  const coreMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();

    const pulse = oscSine(time.mul(0.8)).mul(0.3).add(0.7);
    const coreColor = color(0xffaa33).mul(pulse);
    mat.colorNode = coreColor;
    mat.emissiveNode = coreColor.mul(1.5);
    mat.roughness = 0.3;
    mat.metalness = 0.0;

    return mat;
  }, []);

  // Halo shells with resolution-dependent diagonal shimmer
  const haloMaterials = useMemo(() => {
    return [1.35, 1.65, 2.0].map((scale, i) => {
      const mat = new THREE.MeshStandardNodeMaterial();
      mat.transparent = true;
      mat.side = THREE.BackSide;
      mat.blending = THREE.AdditiveBlending;
      mat.depthWrite = false;

      const fresnel = Fn(() => {
        const viewDir = cameraPosition.sub(positionWorld).normalize();
        const nDotV = normalWorld.dot(viewDir).saturate();
        return float(1.0).sub(nDotV).pow(1.5 + i * 0.5);
      })();

      // Diagonal shimmer tied to actual screen pixel count
      const shimmer = sin(
        screenUV.x.mul(screenSize.x.div(25.0))
          .add(screenUV.y.mul(screenSize.y.div(25.0)))
          .add(time.mul(1.5 + i * 0.7))
      ).mul(0.35).add(0.65);

      const haloColor = i === 0
        ? color(0xff7722)
        : i === 1
        ? color(0x2299ff)
        : color(0xff2277);

      mat.emissiveNode = haloColor.mul(fresnel).mul(shimmer).mul(0.5);
      mat.opacityNode = fresnel.mul(0.12).mul(shimmer);

      return { mat, scale };
    });
  }, []);

  useFrame((_, delta) => {
    if (meshRef.current) meshRef.current.rotation.y += delta * 0.2;
    if (innerRef.current) innerRef.current.rotation.y -= delta * 0.3;
  });

  return (
    <>
      <ambientLight intensity={0.1} />
      <hemisphereLight args={['#334466', '#111122', 0.3]} />
      <directionalLight position={[5, 5, 5]} intensity={0.15} />
      <pointLight position={[0, 0, 0]} intensity={2.5} color="#ffaa44" distance={8} />
      <pointLight position={[2, 1, 2]} intensity={1.5} color="#2299ff" distance={10} />
      <pointLight position={[-2, -1, -2]} intensity={1.5} color="#ff3377" distance={10} />

      {/* Inner glowing core */}
      <mesh ref={innerRef} material={coreMaterial}>
        <icosahedronGeometry args={[0.35, 3]} />
      </mesh>

      {/* Main pixelated sphere */}
      <mesh ref={meshRef} material={material}>
        <icosahedronGeometry args={[1.2, 5]} />
      </mesh>

      {/* Halo shells */}
      {haloMaterials.map(({ mat, scale }, i) => (
        <mesh key={i} material={mat} scale={scale}>
          <icosahedronGeometry args={[1.2, 3]} />
        </mesh>
      ))}
    </>
  );
}
