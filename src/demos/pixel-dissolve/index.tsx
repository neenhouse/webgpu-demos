import { useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
  Fn,
  float,
  vec2,
  vec3,
  vec4,
  uniform,
  screenUV,
  screenSize,
  time,
  sin,
  cos,
  fract,
  floor,
  mix,
  smoothstep,
  clamp,
  mod,
} from 'three/tsl';

/**
 * Pixel Dissolve — Progressive pixelation with color quantization and dithering
 *
 * Techniques:
 * 1. Progressive pixelation: floor(UV * res) / res, res animates
 * 2. Color quantization: floor(color * N) / N for chunky palette
 * 3. Ordered Bayer 4x4 dithering at the transition boundary
 * 4. Animated resolution cycling smooth->chunky->smooth
 */

// 4x4 Bayer dither matrix (normalized 0-1)
const BAYER = [
  [ 0/16,  8/16,  2/16, 10/16],
  [12/16,  4/16, 14/16,  6/16],
  [ 3/16, 11/16,  1/16,  9/16],
  [15/16,  7/16, 13/16,  5/16],
];

function PixelPlane() {
  const { viewport } = useThree();
  const meshRef = useRef<THREE.Mesh>(null);
  const torusRef = useRef<THREE.Mesh>(null);

  const timeUniform = useMemo(() => uniform(0.0), []);

  const material = useMemo(() => {
    const mat = new THREE.MeshBasicNodeMaterial();
    mat.side = THREE.DoubleSide;

    const pixelate = Fn(() => {
      // ── Resolution animation cycle ──
      // Oscillate between high res (full pixel) and low res (8x8 blocks)
      const cycle = sin(timeUniform.mul(0.4)).mul(0.5).add(0.5);
      const minRes = float(8.0);
      const maxRes = screenSize.x.div(float(1.5));
      const currentRes = mix(minRes, maxRes, cycle);

      // ── Pixelate UV ──
      const gridX = floor(screenUV.x.mul(currentRes)).div(currentRes);
      const gridY = floor(screenUV.y.mul(currentRes)).div(currentRes);
      const pixUV = vec2(gridX, gridY);

      // ── Base scene content (rotating torus knot via UV) ──
      const sceneUV = pixUV.sub(0.5);
      const dist = sceneUV.length();
      const angle = sceneUV.y.atan2(sceneUV.x);
      const rotAngle = angle.add(timeUniform.mul(0.5));

      // Torus knot pattern via nested sinusoids
      const p = float(2.0);
      const q = float(3.0);
      const knotR = sin(rotAngle.mul(p).sub(timeUniform)).mul(0.06).add(float(0.18));
      const innerMask = smoothstep(knotR.add(float(0.02)), knotR, dist);
      const outerMask = smoothstep(knotR.sub(float(0.02)), knotR, dist);
      const torus = innerMask.sub(outerMask).abs();

      // Swirling background
      const bg1 = sin(dist.mul(15.0).sub(timeUniform.mul(2.0))).mul(0.5).add(0.5);
      const bg2 = sin(angle.mul(8.0).add(timeUniform)).mul(0.5).add(0.5);

      const baseR = mix(float(0.05), float(0.95), torus.add(bg1.mul(0.15)));
      const baseG = mix(float(0.1), float(0.6), bg2.mul(0.4).add(torus.mul(0.6)));
      const baseB = mix(float(0.2), float(0.9), sin(dist.mul(8.0).add(timeUniform.mul(1.3))).mul(0.5).add(0.5));

      const rawColor = vec3(baseR, baseG, baseB);

      // ── Color quantization ──
      // At low res, reduce to 16 distinct colors per channel (4 bits)
      const quantLevels = mix(float(256.0), float(4.0), smoothstep(float(0.6), float(0.9), cycle.oneMinus()));
      const quantColor = floor(rawColor.mul(quantLevels)).div(quantLevels);

      // ── Bayer 4x4 ordered dithering at transition edge ──
      // Only active near the resolution transition point
      const transitionEdge = smoothstep(float(0.4), float(0.6), cycle.oneMinus());
      const ditheredTransition = transitionEdge.mul(float(1.0).sub(transitionEdge)).mul(float(4.0));

      // Pixel position for Bayer lookup (using screen coords)
      const px = screenUV.x.mul(screenSize.x).floor().mod(float(4.0));
      const py = screenUV.y.mul(screenSize.y).floor().mod(float(4.0));

      // Approximate Bayer lookup with math (avoid arrays in TSL)
      const bayerVal = Fn(() => {
        // 4x4 Bayer matrix encoded as math
        const row0 = vec4(float(0.0/16), float(8.0/16), float(2.0/16), float(10.0/16));
        const row1 = vec4(float(12.0/16), float(4.0/16), float(14.0/16), float(6.0/16));
        const row2 = vec4(float(3.0/16), float(11.0/16), float(1.0/16), float(9.0/16));
        const row3 = vec4(float(15.0/16), float(7.0/16), float(13.0/16), float(5.0/16));

        // Select row based on py
        const rowVal0 = mix(mix(row0.x, row0.y, smoothstep(float(0.5), float(1.5), px)),
                           mix(row0.z, row0.w, smoothstep(float(1.5), float(2.5), px)),
                           smoothstep(float(0.5), float(2.5), px));
        const rowVal1 = mix(mix(row1.x, row1.y, smoothstep(float(0.5), float(1.5), px)),
                           mix(row1.z, row1.w, smoothstep(float(1.5), float(2.5), px)),
                           smoothstep(float(0.5), float(2.5), px));
        const rowVal2 = mix(mix(row2.x, row2.y, smoothstep(float(0.5), float(1.5), px)),
                           mix(row2.z, row2.w, smoothstep(float(1.5), float(2.5), px)),
                           smoothstep(float(0.5), float(2.5), px));
        const rowVal3 = mix(mix(row3.x, row3.y, smoothstep(float(0.5), float(1.5), px)),
                           mix(row3.z, row3.w, smoothstep(float(1.5), float(2.5), px)),
                           smoothstep(float(0.5), float(2.5), px));

        const r01 = mix(rowVal0, rowVal1, smoothstep(float(0.5), float(1.5), py));
        const r23 = mix(rowVal2, rowVal3, smoothstep(float(2.5), float(3.5), py));
        return mix(r01, r23, smoothstep(float(1.5), float(2.5), py));
      })();

      // Apply dithering at transition
      const dithered = quantColor.add(bayerVal.mul(ditheredTransition).mul(float(0.3)));
      const finalColor = clamp(dithered, vec3(0.0, 0.0, 0.0), vec3(1.0, 1.0, 1.0));

      // ── Vignette ──
      const vigUV = screenUV.sub(0.5);
      const vignette = smoothstep(float(0.75), float(0.4), vigUV.length());
      const vignetted = finalColor.mul(vignette.mul(0.3).add(0.7));

      return vec4(vignetted, float(1.0));
    });

    mat.colorNode = pixelate();
    return mat;
  }, [timeUniform]);

  const torusMat = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.color = new THREE.Color(0x00ff88);
    mat.emissive = new THREE.Color(0x003322);
    mat.roughness = 0.3;
    mat.metalness = 0.5;
    return mat;
  }, []);

  useFrame((state, delta) => {
    timeUniform.value += delta;
    if (torusRef.current) {
      torusRef.current.rotation.y += delta * 0.5;
      torusRef.current.rotation.x += delta * 0.25;
    }
    // Oscillate camera z-position slightly to add depth
    const t = state.clock.elapsedTime;
    if (state.camera) {
      state.camera.position.z = 5.0 + Math.sin(t * 0.2) * 0.3;
    }
  });

  return (
    <>
      {/* Scene content behind the pixel dissolve overlay */}
      <mesh ref={torusRef} material={torusMat} position={[0, 0, -2]}>
        <torusKnotGeometry args={[0.8, 0.25, 128, 32]} />
      </mesh>
      {/* Full-viewport pixel dissolve shader */}
      <mesh ref={meshRef} material={material} position={[0, 0, 0.5]}>
        <planeGeometry args={[viewport.width, viewport.height]} />
      </mesh>
    </>
  );
}

// Corner label decoration component for retro UI feel
function CornerLabels() {
  // Pure visual mesh decorations using simple emissive boxes
  const mat = useMemo(() => {
    const m = new THREE.MeshStandardNodeMaterial();
    m.color = new THREE.Color(0x00ff88);
    m.emissive = new THREE.Color(0x00aa44);
    m.emissiveIntensity = 1.0;
    m.roughness = 1.0;
    return m;
  }, []);

  return (
    <>
      {/* Corner accent markers */}
      <mesh material={mat} position={[-4.5, 2.5, -1]}>
        <boxGeometry args={[0.3, 0.05, 0.05]} />
      </mesh>
      <mesh material={mat} position={[-4.5, 2.5, -1]} rotation={[0, 0, Math.PI / 2]}>
        <boxGeometry args={[0.3, 0.05, 0.05]} />
      </mesh>
      <mesh material={mat} position={[4.5, 2.5, -1]}>
        <boxGeometry args={[0.3, 0.05, 0.05]} />
      </mesh>
      <mesh material={mat} position={[4.5, 2.5, -1]} rotation={[0, 0, Math.PI / 2]}>
        <boxGeometry args={[0.3, 0.05, 0.05]} />
      </mesh>
    </>
  );
}

export default function PixelDissolve() {
  return (
    <>
      <ambientLight intensity={0.4} color="#004422" />
      <directionalLight position={[3, 5, 3]} intensity={1.0} color="#00ff88" />
      <pointLight position={[0, 0, 2]} intensity={1.5} color="#00ff88" distance={10} />
      <PixelPlane />
      <CornerLabels />
    </>
  );
}
