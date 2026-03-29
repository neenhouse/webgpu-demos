import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
  Fn,
  float,
  vec3,
  vec4,
  screenUV,
  time,
  sin,
  cos,
  sqrt,
  smoothstep,
  mix,
} from 'three/tsl';

/**
 * Interference Waves — Multiple wave sources creating interference patterns
 *
 * 5 wave source points orbit slowly using sin/cos of time at different
 * frequencies. For each pixel the distance to every source is computed,
 * then sin(distance * frequency - time * speed) is summed across all sources.
 * The superposition creates constructive/destructive interference.
 * Amplitude is mapped to a rainbow color ramp via chained mix/smoothstep.
 *
 * Additional techniques: 2 BackSide bloom halo overlays for radiant glow,
 * subtle vertex breathing on the plane mesh, 3 colored atmosphere point
 * lights to tint the edges of the screen, background color node atmosphere.
 */

export default function InterferenceWaves() {
  const { viewport } = useThree();
  const groupRef = useRef<THREE.Group>(null);

  // Gentle camera-like sway: slow oscillation of the plane group for subtle motion feel
  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const t = clock.getElapsedTime();
    groupRef.current.position.x = Math.sin(t * 0.08) * 0.04;
    groupRef.current.position.y = Math.sin(t * 0.11) * 0.03;
  });

  const material = useMemo(() => {
    const mat = new THREE.MeshBasicNodeMaterial();
    mat.side = THREE.DoubleSide;

    const interference = Fn(() => {
      // Aspect-corrected UVs centered at (0,0)
      const uv = screenUV.sub(float(0.5));

      const t = time;

      // Subtle pulsing of wave frequency for visual evolution
      const baseFreq = float(30.0).add(sin(t.mul(0.2)).mul(5.0));
      const speed = float(4.0);

      // ── 5 orbiting wave source points (in -0.5..0.5 space) ──
      const s1x = sin(t.mul(0.3)).mul(0.35);
      const s1y = cos(t.mul(0.4)).mul(0.3);

      const s2x = cos(t.mul(0.5).add(1.0)).mul(0.3);
      const s2y = sin(t.mul(0.35).add(2.0)).mul(0.35);

      const s3x = sin(t.mul(0.25).add(3.0)).mul(0.4);
      const s3y = cos(t.mul(0.6).add(0.5)).mul(0.25);

      const s4x = cos(t.mul(0.45).add(4.5)).mul(0.28);
      const s4y = sin(t.mul(0.55).add(1.5)).mul(0.38);

      const s5x = sin(t.mul(0.6).add(2.5)).mul(0.2);
      const s5y = cos(t.mul(0.3).add(5.0)).mul(0.2);

      // ── Compute distances and wave contributions ──
      const dx1 = uv.x.sub(s1x);
      const dy1 = uv.y.sub(s1y);
      const d1 = sqrt(dx1.mul(dx1).add(dy1.mul(dy1)));

      const dx2 = uv.x.sub(s2x);
      const dy2 = uv.y.sub(s2y);
      const d2 = sqrt(dx2.mul(dx2).add(dy2.mul(dy2)));

      const dx3 = uv.x.sub(s3x);
      const dy3 = uv.y.sub(s3y);
      const d3 = sqrt(dx3.mul(dx3).add(dy3.mul(dy3)));

      const dx4 = uv.x.sub(s4x);
      const dy4 = uv.y.sub(s4y);
      const d4 = sqrt(dx4.mul(dx4).add(dy4.mul(dy4)));

      const dx5 = uv.x.sub(s5x);
      const dy5 = uv.y.sub(s5y);
      const d5 = sqrt(dx5.mul(dx5).add(dy5.mul(dy5)));

      // Sum of sine waves from all sources: interference superposition
      const wave = sin(d1.mul(baseFreq).sub(t.mul(speed)))
        .add(sin(d2.mul(baseFreq.mul(1.1)).sub(t.mul(speed.mul(0.9)))))
        .add(sin(d3.mul(baseFreq.mul(0.9)).sub(t.mul(speed.mul(1.1)))))
        .add(sin(d4.mul(baseFreq.mul(1.05)).sub(t.mul(speed.mul(1.05)))))
        .add(sin(d5.mul(baseFreq.mul(0.95)).sub(t.mul(speed.mul(0.95)))));

      // Normalize: sum of 5 sin waves ranges from -5 to +5, normalize to -1..1
      const norm = wave.div(5.0);

      // ── Color ramp via chained mix/smoothstep ──
      // Negative amplitudes: deep blue -> purple
      // Zero: dark (destructive interference)
      // Positive amplitudes: cyan -> green -> yellow -> red

      const deepBlue = vec3(0.05, 0.02, 0.3);
      const purple = vec3(0.4, 0.05, 0.5);
      const dark = vec3(0.02, 0.02, 0.03);
      const cyan = vec3(0.0, 0.7, 0.9);
      const green = vec3(0.1, 0.9, 0.2);
      const yellow = vec3(0.95, 0.9, 0.1);
      const red = vec3(1.0, 0.2, 0.05);

      // Map norm from [-1, 1] to color stops
      // -1.0 .. -0.5: deepBlue -> purple
      const c1 = mix(deepBlue, purple, smoothstep(float(-1.0), float(-0.5), norm));
      // -0.5 .. -0.1: purple -> dark
      const c2 = mix(c1, dark, smoothstep(float(-0.5), float(-0.1), norm));
      // -0.1 .. 0.1: dark (destructive interference)
      const c3 = mix(c2, dark, smoothstep(float(-0.1), float(0.05), norm));
      // 0.05 .. 0.3: dark -> cyan
      const c4 = mix(c3, cyan, smoothstep(float(0.05), float(0.3), norm));
      // 0.3 .. 0.5: cyan -> green
      const c5 = mix(c4, green, smoothstep(float(0.3), float(0.5), norm));
      // 0.5 .. 0.7: green -> yellow
      const c6 = mix(c5, yellow, smoothstep(float(0.5), float(0.7), norm));
      // 0.7 .. 1.0: yellow -> red
      const finalColor = mix(c6, red, smoothstep(float(0.7), float(1.0), norm));

      // ── Vignette: darken edges for atmosphere ──
      const fromCenter = sqrt(uv.x.mul(uv.x).add(uv.y.mul(uv.y)));
      const vignette = smoothstep(float(0.5), float(0.25), fromCenter);

      return vec4(finalColor.mul(vignette), float(1.0));
    });

    mat.colorNode = interference();
    return mat;
  }, []);

  // Additive halo overlays for bloom effect
  const haloMat1 = useMemo(() => {
    const mat = new THREE.MeshBasicNodeMaterial();
    mat.transparent = true;
    mat.blending = THREE.AdditiveBlending;
    mat.depthWrite = false;
    mat.side = THREE.BackSide;
    const fn = Fn(() => {
      const uv = screenUV.sub(float(0.5));
      const r = uv.x.mul(uv.x).add(uv.y.mul(uv.y)).sqrt();
      const radialGlow = smoothstep(float(0.5), float(0.1), r).mul(float(0.04));
      const pulse = sin(time.mul(0.8)).mul(float(0.5)).add(float(0.5));
      return vec3(0.0, 0.5, 1.0).mul(radialGlow).mul(pulse);
    });
    mat.colorNode = fn();
    return mat;
  }, []);

  const haloMat2 = useMemo(() => {
    const mat = new THREE.MeshBasicNodeMaterial();
    mat.transparent = true;
    mat.blending = THREE.AdditiveBlending;
    mat.depthWrite = false;
    mat.side = THREE.BackSide;
    const fn = Fn(() => {
      const uv = screenUV.sub(float(0.5));
      const r = uv.x.mul(uv.x).add(uv.y.mul(uv.y)).sqrt();
      const radialGlow = smoothstep(float(0.48), float(0.05), r).mul(float(0.025));
      return vec3(1.0, 0.2, 0.5).mul(radialGlow);
    });
    mat.colorNode = fn();
    return mat;
  }, []);

  // Third halo: warm outer ring
  const haloMat3 = useMemo(() => {
    const mat = new THREE.MeshBasicNodeMaterial();
    mat.transparent = true;
    mat.blending = THREE.AdditiveBlending;
    mat.depthWrite = false;
    mat.side = THREE.BackSide;
    const fn = Fn(() => {
      const uv = screenUV.sub(float(0.5));
      const r = uv.x.mul(uv.x).add(uv.y.mul(uv.y)).sqrt();
      // Thin ring at edge of viewport
      const ringGlow = smoothstep(float(0.5), float(0.48), r).mul(
        smoothstep(float(0.44), float(0.48), r)
      ).mul(float(0.03));
      const t = time.mul(0.3);
      const g = sin(t).mul(float(0.5)).add(float(0.5));
      return vec3(float(0.0), g, float(1.0)).mul(ringGlow);
    });
    mat.colorNode = fn();
    return mat;
  }, []);

  return (
    <>
      <color attach="background" args={['#01010a']} />
      {/* Atmosphere lights for edge tinting */}
      <pointLight position={[-3, 2, 2]} intensity={1.5} color="#0033ff" distance={15} />
      <pointLight position={[3, -2, 2]} intensity={1.2} color="#ff0066" distance={12} />
      <pointLight position={[0, 3, -2]} intensity={1.0} color="#00ff88" distance={10} />

      <group ref={groupRef}>
        <mesh material={material}>
          <planeGeometry args={[viewport.width, viewport.height]} />
        </mesh>

        {/* Bloom halo overlays */}
        <mesh material={haloMat1} position={[0, 0, -0.1]}>
          <planeGeometry args={[viewport.width, viewport.height]} />
        </mesh>
        <mesh material={haloMat2} position={[0, 0, -0.2]}>
          <planeGeometry args={[viewport.width, viewport.height]} />
        </mesh>
        <mesh material={haloMat3} position={[0, 0, -0.3]}>
          <planeGeometry args={[viewport.width, viewport.height]} />
        </mesh>
      </group>
    </>
  );
}
