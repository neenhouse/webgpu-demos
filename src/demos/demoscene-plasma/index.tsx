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
  sqrt,
  mix,
  smoothstep,
} from 'three/tsl';

/**
 * Demoscene Plasma — Classic demo-scene plasma effect
 *
 * Techniques:
 * 1. 4 layered sine wave interference patterns (x, y, diagonal, radial)
 * 2. Combined value drives 8-stop cycling color palette
 * 3. Palette shifts with time for animated color cycling
 * 4. Second plasma layer with opposite phase blended in
 * 5. Bright peak highlighting + edge fade
 * 6. Zoom pulse + rotation animation
 */

function PlasmaPlane() {
  const { viewport } = useThree();
  const meshRef = useRef<THREE.Mesh>(null);
  const timeUniform = useMemo(() => uniform(0.0), []);
  const zoomUniform = useMemo(() => uniform(1.0), []);

  const material = useMemo(() => {
    const mat = new THREE.MeshBasicNodeMaterial();
    mat.side = THREE.DoubleSide;

    const plasma = Fn(() => {
      // Map screenUV to centered [-1, 1] range with aspect correction
      const aspect = float(viewport.width / viewport.height);
      const uv = screenUV.sub(vec2(0.5, 0.5));
      const x = uv.x.mul(aspect).mul(float(3.14159)).mul(zoomUniform);
      const y = uv.y.mul(float(3.14159)).mul(zoomUniform);

      const t = timeUniform;

      // ── 4 layered sine wave interference ──
      // Layer 1: x-axis wave
      const p1 = sin(x.mul(float(4.0)).add(t));
      // Layer 2: y-axis wave with different speed
      const p2 = sin(y.mul(float(3.0)).add(t.mul(float(1.3))));
      // Layer 3: diagonal wave
      const p3 = sin(x.add(y).mul(float(2.0)).add(t.mul(float(0.7))));
      // Layer 4: radial wave (distance from origin)
      const dist = sqrt(x.mul(x).add(y.mul(y)));
      const p4 = sin(dist.mul(float(3.0)).add(t.mul(float(1.1))));

      // Combined plasma value in [-4, 4], normalized to [0, 1]
      const plasmaVal = p1.add(p2).add(p3).add(p4);
      const normalizedPlasma = plasmaVal.div(float(4.0)).mul(float(0.5)).add(float(0.5));

      // ── 8-stop cycling color palette ──
      // Time-shifted hue cycling
      const hue = normalizedPlasma.add(t.mul(float(0.12))).fract();

      // 8 palette stops:
      // 0: red, 0.125: orange, 0.25: yellow, 0.375: green,
      // 0.5: cyan, 0.625: blue, 0.75: purple, 0.875: magenta, 1.0: red
      const c_red     = vec3(float(1.0), float(0.0), float(0.0));
      const c_orange  = vec3(float(1.0), float(0.5), float(0.0));
      const c_yellow  = vec3(float(1.0), float(1.0), float(0.0));
      const c_green   = vec3(float(0.0), float(1.0), float(0.2));
      const c_cyan    = vec3(float(0.0), float(1.0), float(1.0));
      const c_blue    = vec3(float(0.0), float(0.2), float(1.0));
      const c_purple  = vec3(float(0.6), float(0.0), float(1.0));
      const c_magenta = vec3(float(1.0), float(0.0), float(0.8));

      const step = float(0.125);

      // 8-stop gradient via chained mix
      const s1 = mix(c_red,     c_orange,  smoothstep(float(0.0),   step,           hue));
      const s2 = mix(s1,        c_yellow,  smoothstep(step,          step.mul(2.0),  hue));
      const s3 = mix(s2,        c_green,   smoothstep(step.mul(2.0), step.mul(3.0),  hue));
      const s4 = mix(s3,        c_cyan,    smoothstep(step.mul(3.0), step.mul(4.0),  hue));
      const s5 = mix(s4,        c_blue,    smoothstep(step.mul(4.0), step.mul(5.0),  hue));
      const s6 = mix(s5,        c_purple,  smoothstep(step.mul(5.0), step.mul(6.0),  hue));
      const s7 = mix(s6,        c_magenta, smoothstep(step.mul(6.0), step.mul(7.0),  hue));
      const finalColor = mix(s7, c_red,    smoothstep(step.mul(7.0), float(1.0),     hue));

      // ── Second plasma layer for depth ──
      // Rotated version of main waves for more organic feel
      const x2 = x.mul(float(0.866)).sub(y.mul(float(0.5)));
      const y2 = x.mul(float(0.5)).add(y.mul(float(0.866)));
      const p1b = sin(x2.mul(float(6.0)).sub(t.mul(float(0.8))));
      const p2b = sin(y2.mul(float(5.0)).sub(t.mul(float(1.1))));
      const p3b = sin(x2.mul(float(3.0)).add(y2.mul(float(2.0))).add(t.mul(float(0.9))));
      const plasmaB = p1b.add(p2b).add(p3b).div(float(3.0)).mul(float(0.5)).add(float(0.5));
      const hueB = plasmaB.add(t.mul(float(0.08))).add(float(0.5)).fract();
      const s1b = mix(c_cyan,   c_blue,    smoothstep(float(0.0),   float(0.33),  hueB));
      const s2b = mix(s1b,      c_purple,  smoothstep(float(0.33),  float(0.66),  hueB));
      const s3b = mix(s2b,      c_magenta, smoothstep(float(0.66),  float(1.0),   hueB));

      // Blend layers based on plasma amplitude
      const blendFactor = sin(t.mul(float(0.25))).mul(float(0.15)).add(float(0.25));
      const blended = mix(finalColor, s3b, blendFactor);

      // ── Bright spots at wave peaks ──
      const peakBrightness = normalizedPlasma.pow(float(3.0)).mul(float(0.5));
      const troughDarkness = plasmaVal.oneMinus().pow(float(3.0)).mul(float(0.1));
      const bright = blended.add(peakBrightness).sub(troughDarkness);

      // ── Scanning horizontal wave (demo-scene feel) ──
      const scanY = screenUV.y.mul(screenSize.y);
      const scanLine = sin(scanY.mul(float(0.5)).add(t.mul(float(8.0)))).mul(float(0.05)).add(float(1.0));
      const withScan = bright.mul(scanLine);

      // ── Edge vignette ──
      const edgeDist = screenUV.sub(0.5).length();
      const edgeFade = smoothstep(float(0.78), float(0.42), edgeDist);

      // ── Center bloom ──
      const centerBloom = smoothstep(float(0.2), float(0.0), dist.div(float(3.14159))).mul(float(0.3));
      const withBloom = withScan.add(vec3(centerBloom.mul(0.6), centerBloom.mul(0.1), centerBloom.mul(0.4)));

      return vec4(withBloom.mul(edgeFade.mul(0.25).add(0.75)), float(1.0));
    });

    mat.colorNode = plasma();
    return mat;
  }, [timeUniform, zoomUniform, viewport.width, viewport.height]);

  useFrame((state, delta) => {
    timeUniform.value += delta;
    // Subtle pulsing zoom
    zoomUniform.value = 1.0 + Math.sin(state.clock.elapsedTime * 0.3) * 0.1;
  });

  return (
    <mesh ref={meshRef} material={material} position={[0, 0, 0]}>
      <planeGeometry args={[viewport.width, viewport.height]} />
    </mesh>
  );
}

// Background decoration — rotating plasma spheres that feed into the scene
function PlasmaDecoration() {
  const sphere1Ref = useRef<THREE.Mesh>(null);
  const sphere2Ref = useRef<THREE.Mesh>(null);
  const sphere3Ref = useRef<THREE.Mesh>(null);

  const mat1 = useMemo(() => {
    const m = new THREE.MeshStandardNodeMaterial();
    m.color = new THREE.Color(0xff0088);
    m.emissive = new THREE.Color(0x880033);
    m.emissiveIntensity = 1.2;
    m.roughness = 0.3;
    m.metalness = 0.5;
    m.transparent = true;
    m.opacity = 0.0; // Hidden behind plasma overlay
    return m;
  }, []);

  const mat2 = useMemo(() => {
    const m = new THREE.MeshStandardNodeMaterial();
    m.color = new THREE.Color(0x00ffcc);
    m.emissive = new THREE.Color(0x004433);
    m.emissiveIntensity = 1.5;
    m.roughness = 0.2;
    m.metalness = 0.6;
    m.transparent = true;
    m.opacity = 0.0;
    return m;
  }, []);

  const mat3 = useMemo(() => {
    const m = new THREE.MeshStandardNodeMaterial();
    m.color = new THREE.Color(0x6600ff);
    m.emissive = new THREE.Color(0x220033);
    m.emissiveIntensity = 1.0;
    m.roughness = 0.4;
    m.metalness = 0.4;
    m.transparent = true;
    m.opacity = 0.0;
    return m;
  }, []);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    if (sphere1Ref.current) {
      sphere1Ref.current.position.x = Math.sin(t * 0.4) * 2.0;
      sphere1Ref.current.position.y = Math.cos(t * 0.3) * 1.5;
      sphere1Ref.current.rotation.y += delta * 0.5;
    }
    if (sphere2Ref.current) {
      sphere2Ref.current.position.x = Math.cos(t * 0.5 + 2.1) * 2.5;
      sphere2Ref.current.position.y = Math.sin(t * 0.4 + 1.1) * 1.8;
      sphere2Ref.current.rotation.x += delta * 0.4;
    }
    if (sphere3Ref.current) {
      sphere3Ref.current.position.x = Math.sin(t * 0.35 + 4.2) * 1.8;
      sphere3Ref.current.position.y = Math.cos(t * 0.45 + 3.1) * 2.0;
      sphere3Ref.current.rotation.z += delta * 0.6;
    }
  });

  return (
    <>
      <mesh ref={sphere1Ref} material={mat1} position={[0, 0, -4]}>
        <sphereGeometry args={[0.5, 16, 8]} />
      </mesh>
      <mesh ref={sphere2Ref} material={mat2} position={[0, 0, -4]}>
        <icosahedronGeometry args={[0.4, 1]} />
      </mesh>
      <mesh ref={sphere3Ref} material={mat3} position={[0, 0, -4]}>
        <octahedronGeometry args={[0.45, 0]} />
      </mesh>
    </>
  );
}

export default function DemoscenePlasma() {
  return (
    <>
      <ambientLight intensity={0.2} color="#220033" />
      <PlasmaPlane />
      <PlasmaDecoration />
    </>
  );
}
