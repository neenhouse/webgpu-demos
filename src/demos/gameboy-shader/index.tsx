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
} from 'three/tsl';

/**
 * Gameboy Shader — DMG-style 4-color rendering
 *
 * Techniques:
 * 1. 4 shades of green palette (#0f380f, #306230, #8bac0f, #9bbc0f)
 * 2. LCD pixel grid via fract(screenUV * screenSize / 4)
 * 3. Bayer 4x4 ordered dithering before quantization
 * 4. Dark frame border around viewport edges
 * 5. Terrain and tree scene
 */

function GameboyPlane() {
  const { viewport } = useThree();
  const meshRef = useRef<THREE.Mesh>(null);
  const terrainRef = useRef<THREE.Mesh>(null);
  const treeRef = useRef<THREE.Group>(null);
  const timeUniform = useMemo(() => uniform(0.0), []);

  const material = useMemo(() => {
    const mat = new THREE.MeshBasicNodeMaterial();
    mat.side = THREE.DoubleSide;

    const gameboy = Fn(() => {
      const uv = screenUV;

      // ── DMG-style frame border ──
      // Thick dark bezels around screen
      const bezelX = float(0.06);
      const bezelY = float(0.08);
      const inScreen = smoothstep(float(0.0), bezelX, uv.x)
        .mul(smoothstep(float(1.0), float(1.0).sub(bezelX), uv.x))
        .mul(smoothstep(float(0.0), bezelY, uv.y))
        .mul(smoothstep(float(1.0), float(1.0).sub(bezelY), uv.y));

      // ── Rounded corners for frame ──
      const corner1 = smoothstep(float(0.0), float(0.01), uv.x.sub(float(0.06)).pow(float(2.0)).add(uv.y.sub(float(0.08)).pow(float(2.0))).sub(float(0.003)));
      const corner2 = smoothstep(float(0.0), float(0.01), float(0.94).sub(uv.x).pow(float(2.0)).add(uv.y.sub(float(0.08)).pow(float(2.0))).sub(float(0.003)));
      const corner3 = smoothstep(float(0.0), float(0.01), uv.x.sub(float(0.06)).pow(float(2.0)).add(float(0.92).sub(uv.y).pow(float(2.0))).sub(float(0.003)));
      const corner4 = smoothstep(float(0.0), float(0.01), float(0.94).sub(uv.x).pow(float(2.0)).add(float(0.92).sub(uv.y).pow(float(2.0))).sub(float(0.003)));

      // ── Sample the scene at this pixel ──
      // Normalize UV within the screen area
      const screenMin = vec2(bezelX, bezelY);
      const screenMax = vec2(float(1.0).sub(bezelX), float(1.0).sub(bezelY));
      const screenUVLocal = uv.sub(screenMin).div(screenMax.sub(screenMin)).clamp(vec2(0.0, 0.0), vec2(1.0, 1.0));

      const sUV = screenUVLocal.sub(0.5);

      // Simple terrain + tree scene
      // Sky
      const skyLuma = float(0.85);

      // Ground plane
      const groundY = float(-0.1);
      const isGround = smoothstep(groundY, groundY.sub(float(0.05)), sUV.y);

      // Hills
      const hill1 = sin(sUV.x.mul(float(4.0)).add(float(0.5))).mul(float(0.08)).add(float(-0.05));
      const isHill = smoothstep(hill1, hill1.sub(float(0.02)), sUV.y);

      // Tree trunk
      const trunkX = abs(sUV.x.sub(float(0.1))).sub(float(0.02));
      const trunkY1 = sUV.y.add(float(0.15));
      const trunkY2 = float(0.08).sub(sUV.y);
      const isTrunk = smoothstep(float(0.0), float(-0.005), trunkX).mul(smoothstep(float(0.0), float(-0.005), trunkY1)).mul(smoothstep(float(0.0), float(-0.005), trunkY2));

      // Tree canopy (3 triangular layers)
      const canopyX = sUV.x.sub(float(0.1)).abs();
      const layer1 = smoothstep(float(0.0), float(-0.01), canopyX.sub(float(0.28).sub(sUV.y.add(float(0.1))))).mul(smoothstep(float(0.3), float(0.28), sUV.y));
      const layer2 = smoothstep(float(0.0), float(-0.01), canopyX.sub(float(0.22).sub(sUV.y.sub(float(0.08))))).mul(smoothstep(float(0.16), float(0.08), sUV.y)).mul(smoothstep(float(0.0), float(0.08), sUV.y));
      const layer3 = smoothstep(float(0.0), float(-0.01), canopyX.sub(float(0.16).sub(sUV.y.sub(float(0.25))))).mul(smoothstep(float(0.05), float(-0.05), sUV.y)).mul(smoothstep(float(-0.15), float(-0.05), sUV.y));
      const isTree = layer1.add(layer2).add(layer3).add(isTrunk).min(float(1.0));

      // Moving clouds
      const cloudX = sUV.x.add(timeUniform.mul(0.02));
      const cloud1 = smoothstep(float(0.03), float(0.0), abs(cloudX.add(float(0.2))).sub(float(0.08)))
        .mul(smoothstep(float(0.02), float(0.0), abs(sUV.y.sub(float(0.3))).sub(float(0.03))));
      const cloud2 = smoothstep(float(0.03), float(0.0), abs(cloudX.sub(float(0.15))).sub(float(0.06)))
        .mul(smoothstep(float(0.015), float(0.0), abs(sUV.y.sub(float(0.35))).sub(float(0.02))));
      const isClouds = cloud1.add(cloud2).min(float(1.0));

      // Scene luminance
      const rawLuma = clamp(
        skyLuma
          .mul(float(1.0).sub(isGround))
          .mul(float(1.0).sub(isHill))
          .mul(float(1.0).sub(isTree))
          .mul(float(1.0).sub(isClouds))
          .add(isGround.mul(float(0.45)))
          .add(isHill.mul(float(0.3)))
          .add(isTree.mul(float(0.1)))
          .add(isClouds.mul(float(0.9))),
        float(0.0), float(1.0)
      );

      // ── Bayer 4x4 ordered dithering ──
      const px = screenUV.x.mul(screenSize.x).floor().mod(float(4.0));
      const py = screenUV.y.mul(screenSize.y).floor().mod(float(4.0));

      // Bayer 4x4 matrix values as piecewise
      const b00 = float(0.0/16); const b01 = float(8.0/16); const b02 = float(2.0/16); const b03 = float(10.0/16);
      const b10 = float(12.0/16); const b11 = float(4.0/16); const b12 = float(14.0/16); const b13 = float(6.0/16);
      const b20 = float(3.0/16); const b21 = float(11.0/16); const b22 = float(1.0/16); const b23 = float(9.0/16);
      const b30 = float(15.0/16); const b31 = float(7.0/16); const b32 = float(13.0/16); const b33 = float(5.0/16);

      // Row 0 or row 1
      const row0val = mix(mix(b00, b01, smoothstep(float(0.5), float(1.5), px)),
                         mix(b02, b03, smoothstep(float(1.5), float(2.5), px)),
                         smoothstep(float(0.5), float(2.5), px));
      const row1val = mix(mix(b10, b11, smoothstep(float(0.5), float(1.5), px)),
                         mix(b12, b13, smoothstep(float(1.5), float(2.5), px)),
                         smoothstep(float(0.5), float(2.5), px));
      const row2val = mix(mix(b20, b21, smoothstep(float(0.5), float(1.5), px)),
                         mix(b22, b23, smoothstep(float(1.5), float(2.5), px)),
                         smoothstep(float(0.5), float(2.5), px));
      const row3val = mix(mix(b30, b31, smoothstep(float(0.5), float(1.5), px)),
                         mix(b32, b33, smoothstep(float(1.5), float(2.5), px)),
                         smoothstep(float(0.5), float(2.5), px));

      const r01 = mix(row0val, row1val, smoothstep(float(0.5), float(1.5), py));
      const r23 = mix(row2val, row3val, smoothstep(float(2.5), float(3.5), py));
      const bayer = mix(r01, r23, smoothstep(float(1.5), float(2.5), py));

      // Apply dithering and quantize to 4 levels
      const ditheredLuma = rawLuma.add(bayer.sub(float(0.5)).mul(float(0.3)));
      const level = floor(ditheredLuma.mul(float(4.0))).clamp(float(0.0), float(3.0));

      // ── 4 DMG green palette colors ──
      const shade0 = vec3(float(0x0f/255.0), float(0x38/255.0), float(0x0f/255.0)); // darkest
      const shade1 = vec3(float(0x30/255.0), float(0x62/255.0), float(0x30/255.0));
      const shade2 = vec3(float(0x8b/255.0), float(0xac/255.0), float(0x0f/255.0));
      const shade3 = vec3(float(0x9b/255.0), float(0xbc/255.0), float(0x0f/255.0)); // lightest

      const c01 = mix(shade0, shade1, smoothstep(float(0.5), float(1.5), level));
      const c12 = mix(c01,    shade2, smoothstep(float(1.5), float(2.5), level));
      const palette = mix(c12, shade3, smoothstep(float(2.5), float(3.5), level));

      // ── LCD pixel grid ──
      const pixelSize = float(4.0);
      const lcdFractX = fract(screenUV.x.mul(screenSize.x).div(pixelSize));
      const lcdFractY = fract(screenUV.y.mul(screenSize.y).div(pixelSize));
      const lcdBorderX = smoothstep(float(0.0), float(0.1), lcdFractX).mul(smoothstep(float(1.0), float(0.9), lcdFractX));
      const lcdBorderY = smoothstep(float(0.0), float(0.1), lcdFractY).mul(smoothstep(float(1.0), float(0.9), lcdFractY));
      const lcdGrid = lcdBorderX.mul(lcdBorderY);
      const withLCD = mix(palette.mul(float(0.5)), palette, lcdGrid);

      // ── Frame border (bezel) ──
      // Frame color: dark gray plastic
      const frameColor = vec3(float(0.15), float(0.13), float(0.12));
      const gameResult = mix(frameColor, withLCD, inScreen);

      return vec4(gameResult, float(1.0));
    });

    mat.colorNode = gameboy();
    return mat;
  }, [timeUniform]);

  useFrame((_, delta) => {
    timeUniform.value += delta;
    if (terrainRef.current) {
      terrainRef.current.rotation.y += delta * 0.1;
    }
  });

  return (
    <>
      <mesh ref={meshRef} material={material} position={[0, 0, 0]}>
        <planeGeometry args={[viewport.width, viewport.height]} />
      </mesh>
    </>
  );
}

export default function GameboyShader() {
  return (
    <>
      <GameboyPlane />
    </>
  );
}
