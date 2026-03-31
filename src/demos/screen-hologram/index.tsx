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
  screenUV,
  Fn,
  float,
  sin,
  fract,
  smoothstep,
  mix,
} from 'three/tsl';

export default function ScreenHologram() {
  const meshRef = useRef<THREE.Mesh>(null);

  const material = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.side = THREE.DoubleSide;
    mat.transparent = true;

    // ── Screen-space scanlines ──
    // Uses screenUV.y which gives fragment position in screen space [0,1]
    // This means scanlines are fixed on screen, not on the object
    const scanlineFreq = float(200.0);
    const scanlineScroll = time.mul(1.5);
    const scanline = sin(screenUV.y.mul(scanlineFreq).add(scanlineScroll)).mul(0.5).add(0.5);
    // Sharpen the scanline: make it more like thin bright lines
    const scanlineSharp = smoothstep(float(0.3), float(0.7), scanline);

    // ── Screen-space horizontal glitch bars ──
    // Slow-moving wide bands that create a "data transmission" feel
    const glitchBand = sin(screenUV.y.mul(8.0).add(time.mul(0.4))).mul(0.5).add(0.5);
    const glitchIntensity = smoothstep(float(0.6), float(0.9), glitchBand);

    // ── Fresnel rim for hologram edge glow ──
    const fresnel = Fn(() => {
      const viewDir = cameraPosition.sub(positionWorld).normalize();
      const nDotV = normalWorld.dot(viewDir).saturate();
      return float(1.0).sub(nDotV).pow(2.0);
    });
    const rim = fresnel();

    // ── Hologram base color: cyan-blue with screen-space variation ──
    const holoCyan = color(0x00eeff);
    const holoBlue = color(0x0055ff);
    // Blend colors based on screen Y position for a gradient feel
    const baseHolo = mix(holoBlue, holoCyan, screenUV.y);

    // ── Combine color: base * scanline modulation ──
    // Scanlines dim parts of the surface, glitch bands brighten areas
    const scanlineMod = float(0.5).add(scanlineSharp.mul(0.5));
    const glitchBoost = float(1.0).add(glitchIntensity.mul(0.6));
    mat.colorNode = baseHolo.mul(scanlineMod).mul(glitchBoost);

    // ── Opacity: hologram transparency + fresnel rim ──
    // Screen-space flicker using fract for a subtle digital feel
    const flicker = oscSine(time.mul(3.7)).mul(0.08).add(0.92);
    const baseOpacity = float(0.35).add(rim.mul(0.55));
    const coreOpacity = baseOpacity.mul(flicker).mul(scanlineMod);

    // ── Screen-space line artifacts at top and bottom ──
    // Edge fade: hologram is more transparent at screen edges
    const edgeFadeBottom = smoothstep(float(0.0), float(0.15), screenUV.y);
    const edgeFadeTop = smoothstep(float(1.0), float(0.85), screenUV.y);
    // Fract-based thin lines near top/bottom for "projection boundary" look
    const thinLines = fract(screenUV.y.mul(60.0).add(time.mul(2.0)));
    const lineMask = smoothstep(float(0.0), float(0.05), thinLines).mul(
      smoothstep(float(1.0), float(0.95), thinLines),
    );
    mat.opacityNode = coreOpacity.mul(edgeFadeBottom).mul(edgeFadeTop).mul(
      float(0.8).add(lineMask.mul(0.2)),
    );

    // ── Emissive: strong rim glow + scanline highlight ──
    const rimEmissive = holoCyan.mul(rim.mul(3.0));
    const scanlineEmissive = color(0xaaeeff).mul(scanlineSharp.mul(glitchIntensity).mul(1.5));
    mat.emissiveNode = rimEmissive.add(scanlineEmissive);

    // ── Vertex displacement: gentle floating wobble ──
    mat.positionNode = positionLocal.add(
      normalLocal.mul(
        oscSine(time.mul(1.2).add(positionLocal.y.mul(3.0))).mul(0.02),
      ),
    );

    mat.roughness = 0.1;
    mat.metalness = 0.0;

    return mat;
  }, []);

  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.25;
      // Gentle floating bob
      meshRef.current.position.y = Math.sin(Date.now() * 0.001) * 0.1;
    }
  });

  return (
    <>
      {/* Background atmosphere */}
      <mesh>
        <sphereGeometry args={[30, 16, 16]} />
        <meshBasicMaterial side={THREE.BackSide} color="#020408" />
      </mesh>

      <ambientLight intensity={0.15} />
      <hemisphereLight args={['#334466', '#111122', 0.3]} />
      <directionalLight position={[3, 5, 4]} intensity={0.5} color={0x88ccff} />
      <pointLight position={[0, 2, 3]} intensity={1.5} color={0x00ccff} distance={10} />
      <pointLight position={[0, -2, -3]} intensity={0.8} color={0x0066ff} distance={10} />
      <mesh ref={meshRef} material={material}>
        <icosahedronGeometry args={[1.3, 4]} />
      </mesh>
    </>
  );
}
