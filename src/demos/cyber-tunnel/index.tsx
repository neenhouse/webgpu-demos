import { useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
  Fn,
  float,
  vec2,
  vec3,
  vec4,
  time,
  screenUV,
  abs,
  sin,
  fract,
  max,
  min,
  smoothstep,
  mix,
  Loop,
  Break,
  If,
} from 'three/tsl';

/**
 * Cyber Tunnel — Infinite tunnel fly-through with neon geometry
 *
 * Techniques combined (4):
 * 1. SDF raymarching for hexagonal tunnel shape (domain repetition via fract)
 * 2. Screen-space radial speed lines from center
 * 3. Bloom halo glow for neon rings (additive glow accumulation in ray march)
 * 4. Time-driven animation for forward motion illusion
 *
 * Full-viewport SDF raymarcher rendered on a plane. The tunnel uses a hexagonal
 * cross-section SDF with domain repetition along Z for infinite length. Neon ring
 * lights at regular intervals glow with cycling pink/cyan/yellow colors.
 * Screen-space radial speed lines overlay from the center.
 */

function TunnelPlane() {
  const { viewport } = useThree();

  const material = useMemo(() => {
    const mat = new THREE.MeshBasicNodeMaterial();
    mat.side = THREE.DoubleSide;

    const tunnel = Fn(() => {
      // ── Ray setup ──
      const aspect = float(viewport.width / viewport.height);
      const uv = screenUV.sub(vec2(0.5, 0.5)).mul(2.0);
      const uvCorrected = vec2(uv.x.mul(aspect), uv.y);

      // Camera flying forward along Z
      const speed = float(2.5);
      const camZ = time.mul(speed);

      // Gentle tunnel curve: camera sways in X/Y with sin(time)
      const camSwayX = sin(time.mul(0.3)).mul(0.3);
      const camSwayY = sin(time.mul(0.2).add(1.5)).mul(0.2);

      // Ray direction
      const rd = vec3(
        uvCorrected.x.add(camSwayX.mul(0.1)),
        uvCorrected.y.add(camSwayY.mul(0.1)),
        float(1.5),
      ).normalize();

      // Accumulated color along the ray
      const finalR = float(0.0).toVar();
      const finalG = float(0.0).toVar();
      const finalB = float(0.0).toVar();
      const totalDist = float(0.0).toVar();

      // ── Raymarching loop ──
      Loop(64, () => {
        // Current sample position
        const px = rd.x.mul(totalDist).add(camSwayX);
        const py = rd.y.mul(totalDist).add(camSwayY);
        const pz = rd.z.mul(totalDist).add(camZ);

        // ── Hexagonal tunnel cross-section SDF ──
        // Approximation: max(|x|, |y|*0.866 + |x|*0.5) for hex shape
        const ax = abs(px);
        const ay = abs(py);
        const hexDist = max(ax, ay.mul(0.866).add(ax.mul(0.5)));

        // Tunnel radius with subtle breathing
        const tunnelRadius = float(1.6).add(sin(pz.mul(0.4)).mul(0.15));
        // Distance to tunnel wall (positive inside tunnel)
        const wallDist = tunnelRadius.sub(hexDist);

        // ── Domain repetition along Z for neon rings ──
        const ringSpacing = float(2.5);
        const localZ = fract(pz.div(ringSpacing).add(0.5)).sub(0.5).mul(ringSpacing);
        // Ring: thin torus on the tunnel wall
        const ringThickness = float(0.06);
        const ringZDist = abs(localZ).sub(ringThickness);
        const ringRadialDist = abs(wallDist).sub(float(0.04));
        const ringDist = max(ringZDist, ringRadialDist);

        // ── Neon color cycling based on Z position ──
        const colorPhase = pz.mul(0.12).add(time.mul(0.4));
        const cp = fract(colorPhase);
        const neonPink = vec3(1.0, 0.15, 0.6);
        const neonCyan = vec3(0.1, 0.9, 1.0);
        const neonYellow = vec3(1.0, 0.9, 0.15);
        const nc1 = mix(neonPink, neonCyan, smoothstep(float(0.0), float(0.33), cp));
        const nc2 = mix(nc1, neonYellow, smoothstep(float(0.33), float(0.66), cp));
        const neonColor = mix(nc2, neonPink, smoothstep(float(0.66), float(1.0), cp));

        // ── Ring glow: inverse-square falloff ──
        const glowDist = max(ringDist, float(0.01));
        const ringGlow = float(0.012).div(glowDist.mul(glowDist).add(0.002));

        // ── Wall ambient: very faint colored glow from rings ──
        const wallGlow = float(0.001).div(wallDist.abs().add(0.06));

        // ── Hex edge highlights: glow along hex edges ──
        // The hex edges create lines where the hex SDF gradient changes
        const hexEdge = abs(hexDist.sub(tunnelRadius.sub(0.05)));
        const edgeGlow = float(0.003).div(hexEdge.add(0.02));

        // Accumulate
        const contribution = float(0.2);
        finalR.addAssign(
          neonColor.x.mul(ringGlow).add(neonColor.x.mul(0.1).mul(wallGlow)).add(
            neonColor.x.mul(0.15).mul(edgeGlow),
          ).mul(contribution),
        );
        finalG.addAssign(
          neonColor.y.mul(ringGlow).add(neonColor.y.mul(0.1).mul(wallGlow)).add(
            neonColor.y.mul(0.15).mul(edgeGlow),
          ).mul(contribution),
        );
        finalB.addAssign(
          neonColor.z.mul(ringGlow).add(neonColor.z.mul(0.1).mul(wallGlow)).add(
            neonColor.z.mul(0.15).mul(edgeGlow),
          ).mul(contribution),
        );

        // March forward: adaptive step
        const stepSize = max(min(wallDist.mul(0.5), float(0.4)), float(0.06));
        totalDist.addAssign(stepSize);

        // Distance limit
        If(totalDist.greaterThan(float(25.0)), () => {
          Break();
        });
      });

      // ── Screen-space radial speed lines ──
      const centerUV = screenUV.sub(vec2(0.5, 0.5));
      const radialDist = centerUV.length();

      // Angular speed lines: use atan2-like pattern via components
      // Create angular coordinate using x/length ratio
      const angularVal = centerUV.x.div(radialDist.add(0.001));
      const speedLines = sin(angularVal.mul(80.0).add(radialDist.mul(40.0)).sub(time.mul(12.0)));
      const speedLineMask = smoothstep(float(0.6), float(0.95), speedLines);

      // Speed lines only visible at outer edges, fading toward center
      const radialFade = smoothstep(float(0.05), float(0.45), radialDist);
      const edgeFade = smoothstep(float(0.7), float(0.5), radialDist);
      const lineAlpha = speedLineMask.mul(radialFade).mul(edgeFade).mul(0.2);

      // Speed line color matches a fixed neon tint
      const lineColor = vec3(0.5, 0.3, 0.7);

      // Combine tunnel + speed lines
      const outR = min(finalR.add(lineColor.x.mul(lineAlpha)), float(1.0));
      const outG = min(finalG.add(lineColor.y.mul(lineAlpha)), float(1.0));
      const outB = min(finalB.add(lineColor.z.mul(lineAlpha)), float(1.0));

      // Add subtle vignette (darken edges)
      const vignette = float(1.0).sub(radialDist.mul(0.6));

      return vec4(
        outR.mul(vignette),
        outG.mul(vignette),
        outB.mul(vignette),
        float(1.0),
      );
    });

    mat.colorNode = tunnel();
    return mat;
  }, [viewport.width, viewport.height]);

  return (
    <mesh material={material}>
      <planeGeometry args={[viewport.width, viewport.height]} />
    </mesh>
  );
}

export default function CyberTunnel() {
  return (
    <>
      <TunnelPlane />
    </>
  );
}
