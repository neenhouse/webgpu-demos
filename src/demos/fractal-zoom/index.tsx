import { useMemo, useRef } from 'react';
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
  time,
  log2,
  fract,
  mix,
  smoothstep,
  Loop,
  Break,
  If,
} from 'three/tsl';

// Interesting Mandelbrot coordinates to zoom into
const ZOOM_TARGETS = [
  { x: -0.7435, y: 0.1314 }, // Seahorse valley
  { x: -0.16, y: 1.0405 }, // Top antenna spiral
  { x: -0.749, y: 0.1 }, // Near main cardioid boundary
  { x: -1.25066, y: 0.02012 }, // Mini-brot near period-3 bulb
  { x: -0.745428, y: 0.113009 }, // Deep seahorse detail
];

function FractalPlane() {
  const { viewport } = useThree();
  const meshRef = useRef<THREE.Mesh>(null);

  // Uniforms for animated zoom center and scale
  const centerX = useMemo(() => uniform(ZOOM_TARGETS[0].x), []);
  const centerY = useMemo(() => uniform(ZOOM_TARGETS[0].y), []);
  const zoomLevel = useMemo(() => uniform(1.0), []);
  const aspectUniform = useMemo(() => uniform(viewport.width / viewport.height), []);

  const material = useMemo(() => {
    const mat = new THREE.MeshBasicNodeMaterial();
    mat.side = THREE.DoubleSide;

    // ── Mandelbrot iteration in TSL ──
    const mandelbrot = Fn(() => {
      // Map screenUV to complex plane coordinates
      // screenUV is [0,1], we need to center and scale
      const uv = screenUV.sub(vec2(0.5, 0.5));
      // Scale UV by zoom and aspect
      const scale = float(3.0).div(zoomLevel);
      const cx = uv.x.mul(scale).mul(aspectUniform).add(centerX);
      const cy = uv.y.mul(scale).add(centerY);

      // Mandelbrot: z = z^2 + c, start z = 0
      const zx = float(0.0).toVar();
      const zy = float(0.0).toVar();
      const iter = int(0).toVar();
      const escaped = float(0.0).toVar();

      // Smooth iteration count vars
      const lastMag = float(0.0).toVar();

      Loop(80, () => {
        const zx2 = zx.mul(zx);
        const zy2 = zy.mul(zy);
        const mag2 = zx2.add(zy2);

        If(mag2.greaterThan(float(256.0)), () => {
          escaped.assign(float(1.0));
          lastMag.assign(mag2);
          Break();
        });

        // z = z^2 + c: (zx + i*zy)^2 = zx^2 - zy^2 + i*2*zx*zy
        const newZx = zx2.sub(zy2).add(cx);
        const newZy = zx.mul(zy).mul(2.0).add(cy);
        zx.assign(newZx);
        zy.assign(newZy);
        iter.addAssign(int(1));
        lastMag.assign(mag2);
      });

      // ── Smooth coloring using normalized iteration count ──
      // smooth_iter = iter + 1 - log2(log2(|z|)) / log2(2)
      const smoothIter = float(iter).add(
        float(1.0).sub(log2(log2(lastMag.max(float(1.0))).max(float(0.001))).div(log2(float(2.0)))),
      );

      // Normalize to [0,1] range and add time-based cycling
      const t = smoothIter.div(float(80.0)).mul(float(4.0)).add(time.mul(0.15));
      const tFract = fract(t);

      // ── Multi-stop vivid color palette ──
      // Deep blue -> cyan -> green -> yellow -> orange -> magenta -> deep blue (cycling)
      const c1 = vec3(0.02, 0.02, 0.15); // deep navy
      const c2 = vec3(0.0, 0.5, 0.8); // ocean blue
      const c3 = vec3(0.0, 0.9, 0.6); // cyan-green
      const c4 = vec3(0.95, 0.9, 0.2); // yellow
      const c5 = vec3(1.0, 0.4, 0.0); // orange
      const c6 = vec3(0.8, 0.1, 0.6); // magenta
      const c7 = vec3(0.02, 0.02, 0.15); // back to navy (seamless cycle)

      // 6-stop gradient via chained mix/smoothstep
      const stop1 = mix(c1, c2, smoothstep(float(0.0), float(0.167), tFract));
      const stop2 = mix(stop1, c3, smoothstep(float(0.167), float(0.333), tFract));
      const stop3 = mix(stop2, c4, smoothstep(float(0.333), float(0.5), tFract));
      const stop4 = mix(stop3, c5, smoothstep(float(0.5), float(0.667), tFract));
      const stop5 = mix(stop4, c6, smoothstep(float(0.667), float(0.833), tFract));
      const finalColor = mix(stop5, c7, smoothstep(float(0.833), float(1.0), tFract));

      // Interior of set is black
      const outColor = mix(vec3(0.0, 0.0, 0.0), finalColor, escaped);

      return vec4(outColor, float(1.0));
    });

    mat.colorNode = mandelbrot();

    return mat;
  }, []);

  // Animate zoom: continuously zoom in, cycling through interesting coordinates
  useFrame(() => {
    const t = performance.now() * 0.001; // seconds
    const cycleDuration = 25; // seconds per target
    const totalCycle = cycleDuration * ZOOM_TARGETS.length;
    const cycleTime = t % totalCycle;
    const targetIdx = Math.floor(cycleTime / cycleDuration);
    const nextIdx = (targetIdx + 1) % ZOOM_TARGETS.length;
    const progress = (cycleTime % cycleDuration) / cycleDuration;

    // Smooth transition between targets
    const ease = progress * progress * (3 - 2 * progress); // smoothstep
    const currentTarget = ZOOM_TARGETS[targetIdx];
    const nextTarget = ZOOM_TARGETS[nextIdx];

    // Interpolate center
    const cx = currentTarget.x + (nextTarget.x - currentTarget.x) * ease;
    const cy = currentTarget.y + (nextTarget.y - currentTarget.y) * ease;
    centerX.value = cx;
    centerY.value = cy;

    // Update aspect ratio in case viewport changes
    aspectUniform.value = viewport.width / viewport.height;

    // Exponential zoom: zoom in during first 80% of cycle, reset on transition
    const zoomProgress = Math.min(progress / 0.85, 1.0);
    const zoomEase = zoomProgress * zoomProgress * (3 - 2 * zoomProgress);
    // Zoom from 1x to ~5000x, then snap back
    zoomLevel.value = Math.pow(10, zoomEase * 3.5);
  });

  // Scale plane to fill the R3F viewport (camera at z=5, default FOV 75)
  // viewport.width/height are in Three.js world units at z=0
  return (
    <mesh ref={meshRef} material={material}>
      <planeGeometry args={[viewport.width, viewport.height]} />
    </mesh>
  );
}

export default function FractalZoom() {
  return (
    <>
      <FractalPlane />
    </>
  );
}
