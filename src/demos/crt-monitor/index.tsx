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
  sin,
  cos,
  mix,
  smoothstep,
  step,
  atan,
} from 'three/tsl';

/**
 * CRT Monitor — Full CRT simulation with phosphor display
 *
 * Techniques:
 * 1. Barrel distortion (screen curvature) — UV offset from center by distance²
 * 2. Scanlines via sin(screenUV.y * screenSize.y / 2 * PI) — every 2 pixels
 * 3. Phosphor RGB sub-pixels via mod(3) cycling R/G/B
 * 4. Vignette: dark corners matching real CRT phosphor falloff
 * 5. Color bleeding: chromatic aberration offset per R/B channel
 * 6. Screen flicker: subtle high-frequency sin oscillation
 * 7. Phosphor edge glow at screen boundary
 */

function CRTPlane() {
  const { viewport } = useThree();
  const meshRef = useRef<THREE.Mesh>(null);
  const torusRef = useRef<THREE.Mesh>(null);
  const orb1Ref = useRef<THREE.Mesh>(null);
  const orb2Ref = useRef<THREE.Mesh>(null);

  const timeUniform = useMemo(() => uniform(0.0), []);

  const material = useMemo(() => {
    const mat = new THREE.MeshBasicNodeMaterial();
    mat.side = THREE.DoubleSide;

    const crt = Fn(() => {
      // ── Barrel distortion ──
      // Shift UV to center, apply curvature, shift back
      const centered = screenUV.sub(vec2(0.5, 0.5));
      const distAmt = float(0.18);
      const r2 = centered.x.mul(centered.x).add(centered.y.mul(centered.y));
      const barrel = centered.mul(float(1.0).add(r2.mul(distAmt)));
      const distortedUV = barrel.add(vec2(0.5, 0.5));

      // Pixel outside the barrel-distorted screen area → clamp to 0
      const inScreenX = step(float(0.0), distortedUV.x).mul(step(distortedUV.x, float(1.0)));
      const inScreenY = step(float(0.0), distortedUV.y).mul(step(distortedUV.y, float(1.0)));
      const inScreen = inScreenX.mul(inScreenY);

      // ── Base scene: procedural torus knot-like swirl ──
      const sceneUV = distortedUV.sub(0.5);
      const angle = atan(sceneUV.y, sceneUV.x).add(timeUniform.mul(0.3));
      const dist = sceneUV.length();
      const torusPattern = sin(dist.mul(12.0).sub(timeUniform.mul(2.0))).mul(0.5).add(0.5);
      const spiral = sin(angle.mul(6.0).add(dist.mul(8.0)).sub(timeUniform.mul(1.5))).mul(0.5).add(0.5);
      const sceneR = mix(float(0.05), float(0.9), torusPattern.mul(spiral));
      const sceneG = mix(float(0.2), float(0.8), sin(angle.mul(3.0).add(timeUniform)).mul(0.5).add(0.5));
      const sceneB = mix(float(0.0), float(0.7), cos(dist.mul(10.0).sub(timeUniform)).mul(0.5).add(0.5));

      // Torus shape mask (ring)
      const innerR = smoothstep(float(0.08), float(0.12), dist);
      const outerR = smoothstep(float(0.48), float(0.45), dist);
      const torusMask = innerR.mul(outerR);

      // Secondary small orbs
      const orb1UV = distortedUV.sub(vec2(float(0.25).add(sin(timeUniform.mul(0.7)).mul(0.1)), float(0.5)));
      const orb1Dist = orb1UV.length();
      const orb1 = smoothstep(float(0.06), float(0.04), orb1Dist);

      const orb2UV = distortedUV.sub(vec2(float(0.75).add(cos(timeUniform.mul(0.9)).mul(0.1)), float(0.5)));
      const orb2Dist = orb2UV.length();
      const orb2 = smoothstep(float(0.06), float(0.04), orb2Dist);

      // Background gradient (dark top, slightly lighter bottom — old phosphor)
      const bgLuma = float(0.03).add(sceneUV.y.add(0.5).mul(0.04));
      const bgColor = vec3(bgLuma.mul(0.5), bgLuma.mul(1.2), bgLuma.mul(0.7));
      const fgColor = vec3(sceneR, sceneG, sceneB);

      // Combine scene elements
      const baseColor = mix(bgColor, fgColor, torusMask)
        .add(vec3(float(0.0), orb1.mul(float(0.8)), orb1.mul(float(0.2))))
        .add(vec3(orb2.mul(float(0.6)), float(0.0), orb2.mul(float(0.9))));

      // ── Color bleeding (chromatic aberration) ──
      const bleedAmt = float(0.004);
      const bleedUV_R = distortedUV.add(vec2(bleedAmt.negate(), float(0.0)));
      const bleedUV_B = distortedUV.add(vec2(bleedAmt, float(0.0)));

      const distR = bleedUV_R.sub(0.5).length();
      const distB = bleedUV_B.sub(0.5).length();
      const torusR = sin(distR.mul(12.0).sub(timeUniform.mul(2.0))).mul(0.5).add(0.5);
      const torusB = sin(distB.mul(12.0).sub(timeUniform.mul(2.0))).mul(0.5).add(0.5);
      const maskR = smoothstep(float(0.08), float(0.12), distR).mul(smoothstep(float(0.48), float(0.45), distR));
      const maskB = smoothstep(float(0.08), float(0.12), distB).mul(smoothstep(float(0.48), float(0.45), distB));
      const finalR = mix(float(0.03), float(0.9), torusR.mul(maskR));
      const finalB = mix(float(0.0), float(0.7), torusB.mul(maskB));

      const bleedColor = vec3(
        mix(baseColor.x, finalR, float(0.4)),
        baseColor.y,
        mix(baseColor.z, finalB, float(0.4))
      );

      // ── Scanlines (every 2 pixels via screenSize.y/2) ──
      const scanFreq = screenSize.y.div(float(2.0));
      const scanline = sin(distortedUV.y.mul(scanFreq).mul(Math.PI));
      const scanlineMod = scanline.mul(0.25).add(0.75);

      // ── Phosphor RGB sub-pixel columns ──
      const pixelX = distortedUV.x.mul(screenSize.x);
      const subPx = pixelX.mod(float(3.0));
      const phosphorR = smoothstep(float(0.0), float(1.0), subPx).mul(smoothstep(float(2.0), float(1.0), subPx));
      const phosphorG = smoothstep(float(1.0), float(2.0), subPx).mul(smoothstep(float(3.0), float(2.0), subPx));
      const phosphorB2 = smoothstep(float(2.0), float(3.0), subPx);
      const phosphorMod = vec3(
        float(0.6).add(phosphorR.mul(0.4)),
        float(0.6).add(phosphorG.mul(0.4)),
        float(0.6).add(phosphorB2.mul(0.4))
      );

      // ── Vignette ──
      const vigUV = distortedUV.sub(0.5);
      const vigDist = vigUV.length();
      const vignette = smoothstep(float(0.7), float(0.3), vigDist);

      // ── Combine all CRT effects ──
      const crtColor = bleedColor.mul(phosphorMod).mul(scanlineMod).mul(vignette);

      // ── Screen flicker (subtle, high-frequency) ──
      const flicker = sin(timeUniform.mul(47.3)).mul(0.015).add(0.985);
      const flickered = crtColor.mul(flicker);

      // Mask to black outside the CRT screen area
      const maskedColor = flickered.mul(inScreen);

      // ── Phosphor edge glow at screen boundary ──
      const edgeGlow = smoothstep(float(0.48), float(0.50), vigDist).mul(
        smoothstep(float(0.55), float(0.50), vigDist)
      );
      const withGlow = maskedColor.add(vec3(float(0.0), edgeGlow.mul(0.25), float(0.0)));

      // ── Warm greenish tint (P1 phosphor color) ──
      const phosphorTint = vec3(float(0.85), float(1.0), float(0.85));
      const tinted = withGlow.mul(phosphorTint);

      return vec4(tinted, float(1.0));
    });

    mat.colorNode = crt();
    return mat;
  }, [timeUniform]);

  // Background torus knot (gives visual interest behind the CRT overlay)
  const torusMat = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.color = new THREE.Color(0x00ff33);
    mat.emissive = new THREE.Color(0x003300);
    mat.roughness = 0.3;
    mat.metalness = 0.6;
    return mat;
  }, []);

  const orbMat = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.color = new THREE.Color(0x0055ff);
    mat.emissive = new THREE.Color(0x001133);
    mat.roughness = 0.2;
    mat.metalness = 0.8;
    return mat;
  }, []);

  const orbMat2 = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.color = new THREE.Color(0xff00aa);
    mat.emissive = new THREE.Color(0x330011);
    mat.roughness = 0.2;
    mat.metalness = 0.8;
    return mat;
  }, []);

  useFrame((state, delta) => {
    timeUniform.value += delta;
    if (torusRef.current) {
      torusRef.current.rotation.y += delta * 0.5;
      torusRef.current.rotation.x += delta * 0.3;
    }
    const t = state.clock.elapsedTime;
    if (orb1Ref.current) {
      orb1Ref.current.position.x = -1.5 + Math.sin(t * 0.7) * 0.5;
    }
    if (orb2Ref.current) {
      orb2Ref.current.position.x = 1.5 + Math.cos(t * 0.9) * 0.5;
    }
  });

  return (
    <>
      {/* Background scene elements */}
      <mesh ref={torusRef} material={torusMat} position={[0, 0, -2]}>
        <torusKnotGeometry args={[0.8, 0.25, 128, 32]} />
      </mesh>
      <mesh ref={orb1Ref} material={orbMat} position={[-1.5, 0, -2]}>
        <sphereGeometry args={[0.35, 16, 8]} />
      </mesh>
      <mesh ref={orb2Ref} material={orbMat2} position={[1.5, 0, -2]}>
        <sphereGeometry args={[0.35, 16, 8]} />
      </mesh>

      {/* Full-viewport CRT post-process overlay */}
      <mesh ref={meshRef} material={material} position={[0, 0, 0.5]}>
        <planeGeometry args={[viewport.width, viewport.height]} />
      </mesh>
    </>
  );
}

export default function CRTMonitor() {
  return (
    <>
      <ambientLight intensity={0.3} color="#00ff33" />
      <directionalLight position={[3, 3, 3]} intensity={0.8} color="#33ff66" />
      <pointLight position={[0, 0, 0]} intensity={2.0} color="#00cc44" distance={10} />
      <CRTPlane />
    </>
  );
}
