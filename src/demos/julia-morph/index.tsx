import { useMemo } from 'react';
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
  time,
  log2,
  fract,
  mix,
  smoothstep,
  sin,
  Loop,
  Break,
  If,
} from 'three/tsl';

const MAX_ITER = 80;

function JuliaPlane() {
  const { viewport } = useThree();

  // c-parameter: animates along a circle in complex plane
  // c = 0.7885 * exp(i * t) which creates connected->dust->dendrite evolution
  const cRe = useMemo(() => uniform(0.7885), []);
  const cIm = useMemo(() => uniform(0.0), []);
  const aspectU = useMemo(() => uniform(viewport.width / viewport.height), []);

  const material = useMemo(() => {
    const mat = new THREE.MeshBasicNodeMaterial();
    mat.side = THREE.DoubleSide;

    const juliaMorph = Fn(() => {
      // Map screenUV to complex plane [-2,2] × [-2,2]
      const uv = screenUV.sub(vec2(0.5, 0.5));
      const scale = float(2.5);

      const zx = uv.x.mul(scale).mul(aspectU).toVar();
      const zy = uv.y.mul(scale).toVar();

      const iter = float(0.0).toVar();
      const escaped = float(0.0).toVar();
      const lastMag = float(0.0).toVar();

      // Julia iteration: z -> z^2 + c
      Loop(MAX_ITER, () => {
        const zx2 = zx.mul(zx);
        const zy2 = zy.mul(zy);
        const mag2 = zx2.add(zy2);

        If(mag2.greaterThan(float(256.0)), () => {
          escaped.assign(float(1.0));
          lastMag.assign(mag2);
          Break();
        });

        // z = z^2 + c
        const newZx = zx2.sub(zy2).add(cRe);
        const newZy = zx.mul(zy).mul(float(2.0)).add(cIm);
        zx.assign(newZx);
        zy.assign(newZy);
        iter.addAssign(float(1.0));
        lastMag.assign(mag2);
      });

      // ── Smooth coloring ──
      const smoothIter = iter.add(
        float(1.0).sub(
          log2(log2(lastMag.max(float(1.0))).max(float(0.001)))
            .div(log2(float(2.0)))
        )
      );

      // Normalized + cycling
      const t = smoothIter.div(float(float(MAX_ITER))).mul(float(8.0)).add(time.mul(0.1));
      const tFract = fract(t);

      // 8-stop cycling palette: psychedelic morphing colors
      const p0 = vec3(0.05, 0.0, 0.2);  // deep purple
      const p1 = vec3(0.8, 0.0, 0.5);   // hot pink
      const p2 = vec3(1.0, 0.2, 0.0);   // red-orange
      const p3 = vec3(1.0, 0.85, 0.0);  // yellow
      const p4 = vec3(0.0, 0.9, 0.4);   // green
      const p5 = vec3(0.0, 0.7, 1.0);   // sky blue
      const p6 = vec3(0.5, 0.0, 1.0);   // violet
      const p7 = vec3(0.05, 0.0, 0.2);  // back to deep purple

      const step0 = float(0.0);
      const step1 = float(0.143);
      const step2 = float(0.286);
      const step3 = float(0.429);
      const step4 = float(0.571);
      const step5 = float(0.714);
      const step6 = float(0.857);
      const step7 = float(1.0);

      const s1 = mix(p0, p1, smoothstep(step0, step1, tFract));
      const s2 = mix(s1, p2, smoothstep(step1, step2, tFract));
      const s3 = mix(s2, p3, smoothstep(step2, step3, tFract));
      const s4 = mix(s3, p4, smoothstep(step3, step4, tFract));
      const s5 = mix(s4, p5, smoothstep(step4, step5, tFract));
      const s6 = mix(s5, p6, smoothstep(step5, step6, tFract));
      const finalColor = mix(s6, p7, smoothstep(step6, step7, tFract));

      // Interior: deep dark
      const interior = vec3(0.02, 0.0, 0.08);
      const outColor = mix(interior, finalColor, escaped);

      // Vignette: subtle dark edge
      const r = uv.x.mul(uv.x).add(uv.y.mul(uv.y)).sqrt();
      const vignette = smoothstep(float(0.7), float(0.3), r);

      return vec4(outColor.mul(vignette), float(1.0));
    });

    mat.colorNode = juliaMorph();
    return mat;
  }, [cRe, cIm, aspectU]);

  // Additive halo overlay for bloom
  const haloMat1 = useMemo(() => {
    const mat = new THREE.MeshBasicNodeMaterial();
    mat.transparent = true;
    mat.blending = THREE.AdditiveBlending;
    mat.depthWrite = false;
    mat.side = THREE.BackSide;
    const fn = Fn(() => {
      const uv = screenUV.sub(float(0.5));
      const r = uv.x.mul(uv.x).add(uv.y.mul(uv.y)).sqrt();
      const glow = smoothstep(float(0.45), float(0.0), r).mul(float(0.04));
      const pulse = sin(time.mul(1.2)).mul(float(0.4)).add(float(0.6));
      return vec3(0.6, 0.1, 1.0).mul(glow).mul(pulse);
    });
    mat.colorNode = fn();
    return mat;
  }, []);

  // Third halo: faint outer atmospheric ring
  const haloMat3 = useMemo(() => {
    const mat = new THREE.MeshBasicNodeMaterial();
    mat.transparent = true;
    mat.blending = THREE.AdditiveBlending;
    mat.depthWrite = false;
    mat.side = THREE.BackSide;
    const fn = Fn(() => {
      const uv = screenUV.sub(float(0.5));
      const r = uv.x.mul(uv.x).add(uv.y.mul(uv.y)).sqrt();
      // Thin ring at viewport edge
      const ringGlow = smoothstep(float(0.5), float(0.48), r).mul(
        smoothstep(float(0.44), float(0.48), r)
      ).mul(float(0.035));
      const pulse = sin(time.mul(0.5)).mul(float(0.4)).add(float(0.6));
      return vec3(1.0, 0.0, 0.5).mul(ringGlow).mul(pulse);
    });
    mat.colorNode = fn();
    return mat;
  }, []);

  // Second halo ring
  const haloMat2 = useMemo(() => {
    const mat = new THREE.MeshBasicNodeMaterial();
    mat.transparent = true;
    mat.blending = THREE.AdditiveBlending;
    mat.depthWrite = false;
    mat.side = THREE.BackSide;
    const fn = Fn(() => {
      const uv = screenUV.sub(float(0.5));
      const r = uv.x.mul(uv.x).add(uv.y.mul(uv.y)).sqrt();
      const glow = smoothstep(float(0.5), float(0.1), r).mul(float(0.025));
      return vec3(1.0, 0.2, 0.5).mul(glow);
    });
    mat.colorNode = fn();
    return mat;
  }, []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    // c = 0.7885 * exp(i * t) - classic Julia morphing parameter
    const angle = t * 0.4;
    cRe.value = 0.7885 * Math.cos(angle);
    cIm.value = 0.7885 * Math.sin(angle);
    aspectU.value = viewport.width / viewport.height;
  });

  return (
    <>
      <color attach="background" args={['#020008']} />
      {/* Atmosphere lights */}
      <pointLight position={[-3, 2, 2]} intensity={1.5} color="#6600ff" distance={15} />
      <pointLight position={[3, -2, 2]} intensity={1.2} color="#ff0066" distance={12} />
      <pointLight position={[0, 3, -2]} intensity={1.0} color="#ff8800" distance={10} />

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
    </>
  );
}

export default function JuliaMorph() {
  return <JuliaPlane />;
}
