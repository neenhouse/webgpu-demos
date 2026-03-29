import { useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
  Fn,
  float,
  vec3,
  vec4,
  vec2,
  uniform,
  screenUV,
  mix,
  smoothstep,
  Loop,
  Break,
  If,
  log2,
  sqrt,
  sin,
  cos,
  normalize,
  abs,
  pow,
  min,
  atan,
  time,
} from 'three/tsl';

const MARCH_STEPS = 80;
const POWER = 8.0;

function MandelbulbPlane() {
  const { viewport } = useThree();

  // Animated camera orbit angle
  const camAngle = useMemo(() => uniform(0.0), []);
  const aspectU = useMemo(() => uniform(viewport.width / viewport.height), []);

  const material = useMemo(() => {
    const mat = new THREE.MeshBasicNodeMaterial();
    mat.side = THREE.DoubleSide;

    const render = Fn(() => {
      const uv = screenUV.sub(vec2(0.5, 0.5));

      // Camera orbit around Y axis
      const angle = camAngle;
      const dist = float(2.4);
      const camX = sin(angle).mul(dist);
      const camZ = cos(angle).mul(dist);
      const camPos = vec3(camX, float(0.4), camZ);
      const target = vec3(0.0, 0.0, 0.0);

      // Build camera basis
      const forward = normalize(target.sub(camPos));
      const right = normalize(forward.cross(vec3(0.0, 1.0, 0.0)));
      const up = right.cross(forward);

      // Ray direction from screen UV
      const fov = float(1.2);
      const rayDir = normalize(
        forward
          .add(right.mul(uv.x.mul(fov).mul(aspectU)))
          .add(up.mul(uv.y.mul(fov)))
      );

      // ── Mandelbulb SDF ──
      // Returns distance estimate to power-N Mandelbulb
      const mandelbulbDE = Fn(([pos]: [ReturnType<typeof vec3>]) => {
        const px = float(pos.x);
        const py = float(pos.y);
        const pz = float(pos.z);
        const zx = px.toVar();
        const zy = py.toVar();
        const zz = pz.toVar();
        const dr = float(1.0).toVar();
        const r = float(0.0).toVar();

        Loop(12, () => {
          r.assign(sqrt(zx.mul(zx).add(zy.mul(zy)).add(zz.mul(zz))));
          If(r.greaterThan(float(2.0)), () => {
            Break();
          });

          // Convert to polar
          const theta = float(POWER).mul(
            Fn(() => {
              // atan2(sqrt(zx^2+zy^2), zz)
              const xy = sqrt(zx.mul(zx).add(zy.mul(zy)));
              const t = atan(xy, zz);
              return t;
            })()
          );
          const phi = float(POWER).mul(atan(zx, zy));

          // Update dr: dr = power * r^(power-1) * dr + 1
          dr.assign(pow(r, float(POWER - 1.0)).mul(float(POWER)).mul(dr).add(float(1.0)));

          // New z components
          const rPow = pow(r, float(POWER));
          const sinTheta = sin(theta);
          const newZx = rPow.mul(sinTheta).mul(cos(phi)).add(px);
          const newZy = rPow.mul(sinTheta).mul(sin(phi)).add(py);
          const newZz = rPow.mul(cos(theta)).add(pz);
          zx.assign(newZx);
          zy.assign(newZy);
          zz.assign(newZz);
        });

        return r.mul(log2(r)).div(dr).mul(float(0.5));
      });

      // Orbit trap accumulator for coloring
      const orbitTrap = float(10.0).toVar();

      // Raymarching
      const rayPos = vec3(camPos.x, camPos.y, camPos.z).toVar();
      const totalDist = float(0.0).toVar();
      const hit = float(0.0).toVar();
      const stepsTaken = float(0.0).toVar();

      Loop(MARCH_STEPS, ({ i }) => {
        const de = mandelbulbDE(rayPos);

        // Accumulate orbit trap (distance to y-z plane as trap)
        const trap = abs(rayPos.y).add(abs(rayPos.z));
        orbitTrap.assign(min(orbitTrap, trap));

        If(de.lessThan(float(0.001)), () => {
          hit.assign(float(1.0));
          stepsTaken.assign(float(i));
          Break();
        });

        If(totalDist.greaterThan(float(10.0)), () => {
          Break();
        });

        const step = de.max(float(0.0002));
        rayPos.addAssign(rayDir.mul(step));
        totalDist.addAssign(step);
      });

      // ── Coloring ──
      // Background: deep space with subtle star field
      const bgR = screenUV.x.mul(screenUV.y).mul(float(100.0)).fract().mul(float(0.01));
      const bgColor = vec3(float(0.01).add(bgR), float(0.01), float(0.08));

      // Hit coloring: 4-stop based on orbit trap
      const t = orbitTrap.div(float(4.0)).saturate();
      const c1 = vec3(0.12, 0.04, 0.25); // dark purple
      const c2 = vec3(0.85, 0.1, 0.65);  // magenta
      const c3 = vec3(0.95, 0.75, 0.1);  // gold
      const c4 = vec3(1.0, 1.0, 1.0);    // white

      const bulbColor = Fn(() => {
        const s1 = mix(c1, c2, smoothstep(float(0.0), float(0.33), t));
        const s2 = mix(s1, c3, smoothstep(float(0.33), float(0.66), t));
        return mix(s2, c4, smoothstep(float(0.66), float(1.0), t));
      })();

      // Ambient occlusion-like darkening by step count
      const ao = float(1.0).sub(stepsTaken.div(float(MARCH_STEPS)).mul(float(0.5)));
      const litColor = bulbColor.mul(ao);

      // Subtle animated glow at boundary between hit/miss
      const boundaryGlow = hit.mul(float(1.0).sub(hit)).mul(float(0.0)); // preserve boundary
      const finalColor = mix(bgColor, litColor.add(boundaryGlow), hit);

      // Vignette: darken edges
      const r2 = uv.x.mul(uv.x).add(uv.y.mul(uv.y)).sqrt();
      const vignette = smoothstep(float(0.65), float(0.3), r2);

      return vec4(finalColor.mul(vignette), float(1.0));
    });

    mat.colorNode = render();
    return mat;
  }, [camAngle, aspectU]);

  // Outer glow halo overlay (BackSide, additive)
  const haloMat = useMemo(() => {
    const mat = new THREE.MeshBasicNodeMaterial();
    mat.transparent = true;
    mat.blending = THREE.AdditiveBlending;
    mat.depthWrite = false;
    mat.side = THREE.BackSide;
    const fn = Fn(() => {
      const uv = screenUV.sub(float(0.5));
      const r = uv.x.mul(uv.x).add(uv.y.mul(uv.y)).sqrt();
      const glow = smoothstep(float(0.4), float(0.1), r).mul(float(0.04));
      const pulse = sin(time.mul(0.6)).mul(float(0.3)).add(float(0.7));
      return vec3(0.5, 0.1, 1.0).mul(glow).mul(pulse);
    });
    mat.colorNode = fn();
    return mat;
  }, []);

  // Secondary halo ring
  const haloMat2 = useMemo(() => {
    const mat = new THREE.MeshBasicNodeMaterial();
    mat.transparent = true;
    mat.blending = THREE.AdditiveBlending;
    mat.depthWrite = false;
    mat.side = THREE.BackSide;
    const fn = Fn(() => {
      const uv = screenUV.sub(float(0.5));
      const r = uv.x.mul(uv.x).add(uv.y.mul(uv.y)).sqrt();
      const glow = smoothstep(float(0.5), float(0.2), r).mul(float(0.025));
      return vec3(1.0, 0.6, 0.1).mul(glow);
    });
    mat.colorNode = fn();
    return mat;
  }, []);

  useFrame((state) => {
    camAngle.value = state.clock.elapsedTime * 0.18;
    aspectU.value = viewport.width / viewport.height;
  });

  return (
    <>
      <color attach="background" args={['#010108']} />
      {/* Atmosphere lights for edge tinting */}
      <pointLight position={[-3, 2, 2]} intensity={1.5} color="#6600ff" distance={15} />
      <pointLight position={[3, -2, 2]} intensity={1.2} color="#ff6600" distance={12} />
      <pointLight position={[0, 3, -2]} intensity={1.0} color="#ff0066" distance={10} />

      <mesh material={material}>
        <planeGeometry args={[viewport.width, viewport.height]} />
      </mesh>

      {/* Bloom halo overlays */}
      <mesh material={haloMat} position={[0, 0, -0.1]}>
        <planeGeometry args={[viewport.width, viewport.height]} />
      </mesh>
      <mesh material={haloMat2} position={[0, 0, -0.2]}>
        <planeGeometry args={[viewport.width, viewport.height]} />
      </mesh>
    </>
  );
}

export default function Mandelbulb3D() {
  return <MandelbulbPlane />;
}
