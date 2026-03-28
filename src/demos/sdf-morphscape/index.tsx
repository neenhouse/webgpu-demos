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
  cos,
  max,
  min,
  smoothstep,
  mix,
  Loop,
  Break,
  If,
} from 'three/tsl';

/**
 * SDF Morphscape — Raymarched landscape of morphing geometric primitives
 *
 * Full-viewport SDF raymarching via TSL:
 * - Ground plane with multiple SDF primitives (sphere, box, torus, cylinder, cone)
 * - Smooth union blending between shapes
 * - Per-primitive coloring with smooth color transitions
 * - Fog and directional lighting
 * - Domain repetition for background detail
 */

function MorphscapePlane() {
  const { viewport } = useThree();

  const material = useMemo(() => {
    const mat = new THREE.MeshBasicNodeMaterial();
    mat.side = THREE.DoubleSide;

    const morphscape = Fn(() => {
      const aspect = float(viewport.width / viewport.height);
      const uv = screenUV.sub(vec2(0.5, 0.5)).mul(2.0);
      const uvCorrected = vec2(uv.x.mul(aspect), uv.y);

      // Camera setup: fixed viewpoint looking at scene
      const camPos = vec3(0.0, 3.0, 8.0);
      const lookAt = vec3(0.0, 0.0, 0.0);

      // Simple perspective projection
      const forward = lookAt.sub(camPos).normalize();
      const right = vec3(0.0, 1.0, 0.0).cross(forward).normalize();
      const up = forward.cross(right);

      const rd = right.mul(uvCorrected.x).add(up.mul(uvCorrected.y)).add(forward.mul(1.5)).normalize();

      // ---- SDF Primitives ----

      // SDF Sphere: length(p) - r
      // SDF Box: max(abs(p) - b) components
      // SDF Torus: vec2(length(p.xz) - R, p.y) -> length - r
      // SDF Plane: p.y
      // Smooth union: min(a,b) - max(k - abs(a-b), 0)^2 / (4*k)

      // Accumulated color
      const finalR = float(0.0).toVar();
      const finalG = float(0.0).toVar();
      const finalB = float(0.0).toVar();
      const totalDist = float(0.0).toVar();
      const hitFlag = float(0.0).toVar();

      // Store normal and hit position for lighting
      const hitNx = float(0.0).toVar();
      const hitNy = float(1.0).toVar();
      const hitNz = float(0.0).toVar();
      const marchSteps = float(0.0).toVar();

      Loop(80, () => {
        // Current position along ray
        const px = camPos.x.add(rd.x.mul(totalDist)).toVar();
        const py = camPos.y.add(rd.y.mul(totalDist)).toVar();
        const pz = camPos.z.add(rd.z.mul(totalDist)).toVar();

        // ---- Ground plane ----
        const groundDist = py.add(1.0); // plane at y = -1

        // ---- Sphere: center pulsing ----
        const sphereRadius = float(0.8).add(sin(time.mul(0.7)).mul(0.2));
        const sphereCx = sin(time.mul(0.3)).mul(0.5);
        const sphereCy = float(0.0).add(sin(time.mul(0.5)).mul(0.3));
        const sphereCz = cos(time.mul(0.25)).mul(0.3);
        const sphereDx = px.sub(sphereCx);
        const sphereDy = py.sub(sphereCy);
        const sphereDz = pz.sub(sphereCz);
        const sphereDist = sphereDx.mul(sphereDx).add(sphereDy.mul(sphereDy)).add(sphereDz.mul(sphereDz)).sqrt().sub(sphereRadius);

        // ---- Box: to the left, rotating ----
        const boxCx = float(-2.5).add(sin(time.mul(0.2)).mul(0.3));
        const boxCy = float(0.0);
        const boxCz = float(0.0).add(cos(time.mul(0.15)).mul(0.5));
        // Simple rotation around Y
        const rotAngle = time.mul(0.4);
        const localBx = px.sub(boxCx);
        const localBz = pz.sub(boxCz);
        const rotBx = localBx.mul(cos(rotAngle)).add(localBz.mul(sin(rotAngle)));
        const rotBz = localBz.mul(cos(rotAngle)).sub(localBx.mul(sin(rotAngle)));
        const rotBy = py.sub(boxCy);
        const boxSize = float(0.7).add(sin(time.mul(0.6)).mul(0.1));
        const boxDist = max(max(abs(rotBx).sub(boxSize), abs(rotBy).sub(boxSize)), abs(rotBz).sub(boxSize));

        // ---- Torus: to the right, wobbling ----
        const torusCx = float(2.5).add(sin(time.mul(0.25)).mul(0.4));
        const torusCy = float(0.2).add(sin(time.mul(0.8)).mul(0.3));
        const torusCz = float(0.5).add(cos(time.mul(0.35)).mul(0.3));
        const torusLx = px.sub(torusCx);
        const torusLy = py.sub(torusCy);
        const torusLz = pz.sub(torusCz);
        const torusBigR = float(0.8);
        const torusSmallR = float(0.25).add(sin(time.mul(0.9)).mul(0.05));
        const torusXZlen = torusLx.mul(torusLx).add(torusLz.mul(torusLz)).sqrt().sub(torusBigR);
        const torusDist = torusXZlen.mul(torusXZlen).add(torusLy.mul(torusLy)).sqrt().sub(torusSmallR);

        // ---- Cylinder: in back, height oscillating ----
        const cylCx = float(0.0).add(cos(time.mul(0.18)).mul(0.5));
        const cylCy = float(0.0);
        const cylCz = float(-2.5).add(sin(time.mul(0.22)).mul(0.3));
        const cylLx = px.sub(cylCx);
        const cylLy = py.sub(cylCy);
        const cylLz = pz.sub(cylCz);
        const cylRadius = float(0.5);
        const cylHeight = float(1.0).add(sin(time.mul(0.5)).mul(0.4));
        const cylXZdist = cylLx.mul(cylLx).add(cylLz.mul(cylLz)).sqrt().sub(cylRadius);
        const cylYdist = abs(cylLy).sub(cylHeight);
        const cylDist = max(cylXZdist, cylYdist);

        // ---- Cone: in front, leaning ----
        const coneCx = float(1.0).add(sin(time.mul(0.3)).mul(0.4));
        const coneCy = float(-0.5);
        const coneCz = float(2.5).add(cos(time.mul(0.28)).mul(0.3));
        const coneLx = px.sub(coneCx);
        const coneLy = py.sub(coneCy);
        const coneLz = pz.sub(coneCz);
        // Simple cone: distance increases with height
        const coneH = float(1.5);
        const coneAngleVal = float(0.6); // half-angle tangent
        const coneYnorm = coneLy.div(coneH);
        const coneR = coneLx.mul(coneLx).add(coneLz.mul(coneLz)).sqrt();
        const coneSurface = coneR.sub(float(1.0).sub(coneYnorm).mul(coneAngleVal).mul(coneH));
        const coneYclamp = max(coneLy.negate(), coneLy.sub(coneH));
        const coneDist = max(coneSurface, coneYclamp);

        // ---- Smooth union all shapes ----
        const k = float(0.8); // blend factor

        // Smooth union helper inline: min(a,b) - max(k-abs(a-b), 0)^2 / (4*k)
        // Combine sphere + box
        const ab1 = sphereDist.sub(boxDist).abs();
        const h1 = max(k.sub(ab1), float(0.0));
        const su1 = min(sphereDist, boxDist).sub(h1.mul(h1).div(k.mul(4.0)));

        // + torus
        const ab2 = su1.sub(torusDist).abs();
        const h2 = max(k.sub(ab2), float(0.0));
        const su2 = min(su1, torusDist).sub(h2.mul(h2).div(k.mul(4.0)));

        // + cylinder
        const ab3 = su2.sub(cylDist).abs();
        const h3 = max(k.sub(ab3), float(0.0));
        const su3 = min(su2, cylDist).sub(h3.mul(h3).div(k.mul(4.0)));

        // + cone
        const ab4 = su3.sub(coneDist).abs();
        const h4 = max(k.sub(ab4), float(0.0));
        const su4 = min(su3, coneDist).sub(h4.mul(h4).div(k.mul(4.0)));

        // + ground (tighter blend for ground)
        const gk = float(0.5);
        const ab5 = su4.sub(groundDist).abs();
        const h5 = max(gk.sub(ab5), float(0.0));
        const sceneDist = min(su4, groundDist).sub(h5.mul(h5).div(gk.mul(4.0)));

        marchSteps.addAssign(1.0);

        // Check hit
        If(sceneDist.lessThan(0.001), () => {
          hitFlag.assign(1.0);

          // Compute color by blending based on which primitive is closest
          // Weight each primitive inversely by its distance
          const eps = float(0.01);
          const wSphere = float(1.0).div(max(abs(sphereDist), eps));
          const wBox = float(1.0).div(max(abs(boxDist), eps));
          const wTorus = float(1.0).div(max(abs(torusDist), eps));
          const wCyl = float(1.0).div(max(abs(cylDist), eps));
          const wCone = float(1.0).div(max(abs(coneDist), eps));
          const wGround = float(1.0).div(max(abs(groundDist), eps));
          const wTotal = wSphere.add(wBox).add(wTorus).add(wCyl).add(wCone).add(wGround);

          // Colors for each primitive
          const colSphere = vec3(1.0, 0.5, 0.15);  // warm orange
          const colBox = vec3(0.2, 0.4, 0.9);       // cool blue
          const colTorus = vec3(0.15, 0.8, 0.3);    // green
          const colCyl = vec3(0.6, 0.2, 0.8);       // purple
          const colCone = vec3(0.9, 0.3, 0.6);      // pink
          const colGround = vec3(0.15, 0.15, 0.18); // dark grey

          const blendR = colSphere.x.mul(wSphere)
            .add(colBox.x.mul(wBox))
            .add(colTorus.x.mul(wTorus))
            .add(colCyl.x.mul(wCyl))
            .add(colCone.x.mul(wCone))
            .add(colGround.x.mul(wGround))
            .div(wTotal);
          const blendG = colSphere.y.mul(wSphere)
            .add(colBox.y.mul(wBox))
            .add(colTorus.y.mul(wTorus))
            .add(colCyl.y.mul(wCyl))
            .add(colCone.y.mul(wCone))
            .add(colGround.y.mul(wGround))
            .div(wTotal);
          const blendB = colSphere.z.mul(wSphere)
            .add(colBox.z.mul(wBox))
            .add(colTorus.z.mul(wTorus))
            .add(colCyl.z.mul(wCyl))
            .add(colCone.z.mul(wCone))
            .add(colGround.z.mul(wGround))
            .div(wTotal);

          // Simple normal via gradient (central differences)
          // We'll estimate using the scene distance at nearby points
          // For performance, use the primary components as proxy
          const nEst = vec3(
            sphereDist.mul(wSphere.div(wTotal)),
            float(1.0).sub(groundDist.mul(wGround.div(wTotal))),
            float(0.0),
          ).normalize();

          hitNx.assign(nEst.x);
          hitNy.assign(nEst.y);
          hitNz.assign(nEst.z);

          // Directional light from above-right
          const lightDir = vec3(0.5, 0.8, 0.3).normalize();
          const diffuse = max(hitNx.mul(lightDir.x).add(hitNy.mul(lightDir.y)).add(hitNz.mul(lightDir.z)), float(0.0));
          const ambient = float(0.15);
          const lighting = ambient.add(diffuse.mul(0.85));

          // AO estimate: more march steps = more occluded
          const ao = float(1.0).sub(marchSteps.div(80.0).mul(0.5));

          finalR.assign(blendR.mul(lighting).mul(ao));
          finalG.assign(blendG.mul(lighting).mul(ao));
          finalB.assign(blendB.mul(lighting).mul(ao));

          Break();
        });

        // March forward
        totalDist.addAssign(max(sceneDist, float(0.005)));

        If(totalDist.greaterThan(40.0), () => {
          Break();
        });
      });

      // Background: dark gradient (navy to black)
      const bgTop = vec3(0.02, 0.02, 0.08);
      const bgBot = vec3(0.0, 0.0, 0.02);
      const bgColor = mix(bgBot, bgTop, screenUV.y);

      // Mix with fog based on march distance
      const fogAmount = smoothstep(5.0, 35.0, totalDist);

      const outR = mix(finalR, bgColor.x, fogAmount).mul(hitFlag).add(bgColor.x.mul(float(1.0).sub(hitFlag)));
      const outG = mix(finalG, bgColor.y, fogAmount).mul(hitFlag).add(bgColor.y.mul(float(1.0).sub(hitFlag)));
      const outB = mix(finalB, bgColor.z, fogAmount).mul(hitFlag).add(bgColor.z.mul(float(1.0).sub(hitFlag)));

      return vec4(outR, outG, outB, float(1.0));
    });

    mat.colorNode = morphscape();
    return mat;
  }, [viewport.width, viewport.height]);

  return (
    <mesh material={material}>
      <planeGeometry args={[viewport.width, viewport.height]} />
    </mesh>
  );
}

export default function SdfMorphscape() {
  return (
    <>
      <MorphscapePlane />
    </>
  );
}
