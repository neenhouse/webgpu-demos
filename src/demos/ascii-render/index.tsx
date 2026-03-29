import { useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
  Fn,
  float,
  vec2,
  vec3,
  vec4,
  int,
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
  abs,
} from 'three/tsl';

/**
 * ASCII Render — 3D scene rendered as ASCII terminal characters
 *
 * Techniques:
 * 1. Quantize screen into cells (~8x12 pixel blocks)
 * 2. Compute luminance per cell
 * 3. Map luminance to ASCII character density pattern via fract()-based pixel patterns
 * 4. Green-on-black terminal aesthetic
 * 5. Scan line flicker
 */

function ASCIIPlane() {
  const { viewport } = useThree();
  const meshRef = useRef<THREE.Mesh>(null);
  const boxGroupRef = useRef<THREE.Group>(null);
  const timeUniform = useMemo(() => uniform(0.0), []);

  const material = useMemo(() => {
    const mat = new THREE.MeshBasicNodeMaterial();
    mat.side = THREE.DoubleSide;

    const ascii = Fn(() => {
      // ── Cell size in pixels ──
      const cellW = float(8.0);
      const cellH = float(10.0);

      // Which cell is this pixel in?
      const pixelPos = screenUV.mul(screenSize);
      const cellX = floor(pixelPos.x.div(cellW));
      const cellY = floor(pixelPos.y.div(cellH));

      // Center UV of this cell
      const cellCenterUV = vec2(
        cellX.add(float(0.5)).div(screenSize.x.div(cellW)),
        cellY.add(float(0.5)).div(screenSize.y.div(cellH))
      );

      // ── Sample scene luminance at cell center ──
      // Rotating box arrangement via UV pattern
      const sceneUV = cellCenterUV.sub(0.5);
      const angle = sceneUV.y.atan2(sceneUV.x).add(timeUniform.mul(0.4));
      const dist = sceneUV.length();

      // Multiple box silhouettes
      const boxUV = sceneUV.mul(float(2.0));
      const absX = abs(boxUV.x);
      const absY = abs(boxUV.y);

      // Rotating box 1
      const rot1 = timeUniform.mul(0.5);
      const cosR = cos(rot1);
      const sinR = sin(rot1);
      const box1X = abs(boxUV.x.mul(cosR).sub(boxUV.y.mul(sinR)));
      const box1Y = abs(boxUV.x.mul(sinR).add(boxUV.y.mul(cosR)));
      const box1 = smoothstep(float(0.35), float(0.33), box1X.max(box1Y));

      // Box 2 (inner, slower rotation)
      const rot2 = timeUniform.mul(0.2).add(float(0.785));
      const cos2 = cos(rot2);
      const sin2 = sin(rot2);
      const box2X = abs(boxUV.x.mul(cos2).sub(boxUV.y.mul(sin2)));
      const box2Y = abs(boxUV.x.mul(sin2).add(boxUV.y.mul(cos2)));
      const box2 = smoothstep(float(0.22), float(0.20), box2X.max(box2Y));

      // Box 3 (tiny, fast)
      const rot3 = timeUniform.mul(1.2);
      const cos3 = cos(rot3);
      const sin3 = sin(rot3);
      const box3X = abs(boxUV.x.mul(cos3).sub(boxUV.y.mul(sin3)));
      const box3Y = abs(boxUV.x.mul(sin3).add(boxUV.y.mul(cos3)));
      const box3 = smoothstep(float(0.1), float(0.09), box3X.max(box3Y));

      // Background grid
      const bgGrid = sin(boxUV.x.mul(float(6.0))).mul(sin(boxUV.y.mul(float(6.0)))).mul(float(0.5)).add(float(0.5));
      const bgLuma = bgGrid.mul(float(0.1)).mul(smoothstep(float(0.5), float(0.45), dist));

      // Combine luminance
      const sceneLuma = clamp(box1.mul(float(0.9)).add(box2.mul(float(0.6))).add(box3.mul(float(1.0))).add(bgLuma), float(0.0), float(1.0));

      // ── ASCII character pattern ──
      // 6 characters: ' ', '.', ':', '+', '#', '@'
      // Select by luminance level (0-5)
      const charLevel = floor(sceneLuma.mul(float(6.0))).min(float(5.0));

      // Sub-pixel position within cell
      const subX = fract(pixelPos.x.div(cellW));
      const subY = fract(pixelPos.y.div(cellH));

      // Character pixel patterns (simplified 4x5 grid patterns)
      // Each character encoded as a float pattern function

      // Space (level 0): all black
      const spaceGlyph = float(0.0);

      // Dot (level 1): single pixel in center
      const dotGlyph = smoothstep(float(0.35), float(0.45), subX).mul(smoothstep(float(0.65), float(0.55), subX))
        .mul(smoothstep(float(0.45), float(0.55), subY)).mul(smoothstep(float(0.65), float(0.55), subY));

      // Colon (level 2): two dots vertical
      const dot1 = smoothstep(float(0.35), float(0.45), subX).mul(smoothstep(float(0.65), float(0.55), subX))
        .mul(smoothstep(float(0.25), float(0.35), subY)).mul(smoothstep(float(0.45), float(0.35), subY));
      const dot2 = smoothstep(float(0.35), float(0.45), subX).mul(smoothstep(float(0.65), float(0.55), subX))
        .mul(smoothstep(float(0.55), float(0.65), subY)).mul(smoothstep(float(0.75), float(0.65), subY));
      const colonGlyph = dot1.add(dot2).min(float(1.0));

      // Plus (level 3): cross pattern
      const hBar = smoothstep(float(0.1), float(0.15), subX).mul(smoothstep(float(0.9), float(0.85), subX))
        .mul(smoothstep(float(0.4), float(0.45), subY)).mul(smoothstep(float(0.6), float(0.55), subY));
      const vBar = smoothstep(float(0.4), float(0.45), subX).mul(smoothstep(float(0.6), float(0.55), subX))
        .mul(smoothstep(float(0.1), float(0.15), subY)).mul(smoothstep(float(0.9), float(0.85), subY));
      const plusGlyph = hBar.add(vBar).min(float(1.0));

      // Hash (level 4): grid pattern
      const hLine1 = smoothstep(float(0.05), float(0.1), subX).mul(smoothstep(float(0.95), float(0.9), subX))
        .mul(smoothstep(float(0.28), float(0.33), subY)).mul(smoothstep(float(0.42), float(0.37), subY));
      const hLine2 = smoothstep(float(0.05), float(0.1), subX).mul(smoothstep(float(0.95), float(0.9), subX))
        .mul(smoothstep(float(0.58), float(0.63), subY)).mul(smoothstep(float(0.72), float(0.67), subY));
      const vLine1 = smoothstep(float(0.28), float(0.33), subX).mul(smoothstep(float(0.42), float(0.37), subX))
        .mul(smoothstep(float(0.05), float(0.1), subY)).mul(smoothstep(float(0.95), float(0.9), subY));
      const vLine2 = smoothstep(float(0.58), float(0.63), subX).mul(smoothstep(float(0.72), float(0.67), subX))
        .mul(smoothstep(float(0.05), float(0.1), subY)).mul(smoothstep(float(0.95), float(0.9), subY));
      const hashGlyph = hLine1.add(hLine2).add(vLine1).add(vLine2).min(float(1.0));

      // At-sign (level 5): filled block
      const atGlyph = smoothstep(float(0.05), float(0.1), subX).mul(smoothstep(float(0.95), float(0.9), subX))
        .mul(smoothstep(float(0.05), float(0.1), subY)).mul(smoothstep(float(0.95), float(0.9), subY));

      // Select glyph based on level
      const glyph0 = mix(spaceGlyph, dotGlyph, smoothstep(float(0.5), float(1.5), charLevel));
      const glyph1 = mix(glyph0,    colonGlyph, smoothstep(float(1.5), float(2.5), charLevel));
      const glyph2 = mix(glyph1,    plusGlyph,  smoothstep(float(2.5), float(3.5), charLevel));
      const glyph3 = mix(glyph2,    hashGlyph,  smoothstep(float(3.5), float(4.5), charLevel));
      const finalGlyph = mix(glyph3, atGlyph,   smoothstep(float(4.5), float(5.5), charLevel));

      // ── Terminal colors ──
      const termGreen = vec3(float(0.0), float(1.0), float(0.0));
      const termDarkGreen = vec3(float(0.0), float(0.3), float(0.0));
      const bg = vec3(float(0.0), float(0.02), float(0.0));

      const glyphColor = mix(bg, termGreen, finalGlyph);

      // ── Scanline flicker ──
      const scanFlicker = sin(cellCenterUV.y.mul(float(3.0)).sub(timeUniform.mul(float(5.0)))).mul(float(0.04)).add(float(0.96));

      // ── Phosphor persistence (glow) ──
      const glowAmount = finalGlyph.mul(float(0.3));
      const glowColor = glyphColor.add(termDarkGreen.mul(glowAmount));

      // ── CRT vignette ──
      const vigUV = screenUV.sub(0.5);
      const vignette = smoothstep(float(0.7), float(0.4), vigUV.length());

      const finalColor = glowColor.mul(scanFlicker).mul(vignette.mul(0.25).add(0.75));

      return vec4(finalColor, float(1.0));
    });

    mat.colorNode = ascii();
    return mat;
  }, [timeUniform]);

  const boxMat = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.color = new THREE.Color(0x00ff00);
    mat.emissive = new THREE.Color(0x003300);
    mat.roughness = 0.4;
    mat.metalness = 0.2;
    return mat;
  }, []);

  useFrame((_, delta) => {
    timeUniform.value += delta;
    if (boxGroupRef.current) {
      boxGroupRef.current.rotation.y += delta * 0.4;
    }
  });

  return (
    <>
      <group ref={boxGroupRef} position={[0, 0, -3]}>
        <mesh material={boxMat} position={[0, 0, 0]}>
          <boxGeometry args={[1, 1, 1]} />
        </mesh>
        <mesh material={boxMat} position={[1.5, 0, 0]} rotation={[0.3, 0.5, 0.2]}>
          <boxGeometry args={[0.6, 0.6, 0.6]} />
        </mesh>
        <mesh material={boxMat} position={[-1.5, 0, 0]} rotation={[0.5, -0.3, 0.4]}>
          <boxGeometry args={[0.7, 0.7, 0.7]} />
        </mesh>
        <mesh material={boxMat} position={[0, 1.5, 0]} rotation={[0.2, 0.7, 0.1]}>
          <boxGeometry args={[0.5, 0.5, 0.5]} />
        </mesh>
        <mesh material={boxMat} position={[0, -1.5, 0]} rotation={[0.6, 0.2, 0.8]}>
          <boxGeometry args={[0.65, 0.65, 0.65]} />
        </mesh>
      </group>
      <mesh ref={meshRef} material={material} position={[0, 0, 1]}>
        <planeGeometry args={[viewport.width, viewport.height]} />
      </mesh>
    </>
  );
}

export default function ASCIIRender() {
  return (
    <>
      <ambientLight intensity={0.3} />
      <directionalLight position={[3, 5, 5]} intensity={1.0} />
      <ASCIIPlane />
    </>
  );
}
