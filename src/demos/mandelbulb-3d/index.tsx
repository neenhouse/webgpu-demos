import { useMemo, useRef } from 'react';
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
  time,
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
  dot,
  abs,
  pow,
  max,
  min,
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
        const zx = pos.x.toVar();
        const zy = pos.y.toVar();
        const zz = pos.z.toVar();
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
              const t = xy.atan2(zz);
              return t;
            })()
          );
          const phi = float(POWER).mul(zx.atan2(zy));

          // Update dr: dr = power * r^(power-1) * dr + 1
          dr.assign(pow(r, float(POWER - 1.0)).mul(float(POWER)).mul(dr).add(float(1.0)));

          // New z components
          const rPow = pow(r, float(POWER));
          const sinTheta = sin(theta);
          const newZx = rPow.mul(sinTheta).mul(cos(phi)).add(pos.x);
          const newZy = rPow.mul(sinTheta).mul(sin(phi)).add(pos.y);
          const newZz = rPow.mul(cos(theta)).add(pos.z);
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
      // Background: deep space
      const bgColor = vec3(0.01, 0.01, 0.08);

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

      const finalColor = mix(bgColor, litColor, hit);

      return vec4(finalColor, float(1.0));
    });

    mat.colorNode = render();
    return mat;
  }, [camAngle, aspectU]);

  useFrame((state) => {
    camAngle.value = state.clock.elapsedTime * 0.18;
    aspectU.value = viewport.width / viewport.height;
  });

  return (
    <mesh material={material}>
      <planeGeometry args={[viewport.width, viewport.height]} />
    </mesh>
  );
}

export default function Mandelbulb3D() {
  return <MandelbulbPlane />;
}
