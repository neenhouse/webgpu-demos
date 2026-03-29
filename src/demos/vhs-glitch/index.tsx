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
  sin,
  cos,
  abs,
  floor,
  mix,
  smoothstep,
  hash,
  atan,
} from 'three/tsl';

/**
 * VHS Glitch — VHS tape degradation simulation
 *
 * Techniques:
 * 1. Tracking errors: horizontal bands with hash-based x offset
 * 2. Chromatic aberration: separate R/G/B channel UV offsets
 * 3. Noise bands: horizontal static stripes via hash(floor(y) + time)
 * 4. Warm color shift and desaturation (analog color degradation)
 * 5. Periodic full-screen roll via vertical UV shift every 7s
 * 6. Tape dropout flicker (random bright horizontal lines)
 * 7. Edge wear (darker at screen borders)
 */

function VHSPlane() {
  const { viewport } = useThree();
  const meshRef = useRef<THREE.Mesh>(null);
  const icoRef = useRef<THREE.Mesh>(null);
  const ring1Ref = useRef<THREE.Mesh>(null);
  const ring2Ref = useRef<THREE.Mesh>(null);

  const timeUniform = useMemo(() => uniform(0.0), []);

  const material = useMemo(() => {
    const mat = new THREE.MeshBasicNodeMaterial();
    mat.side = THREE.DoubleSide;

    const vhs = Fn(() => {
      const uv = screenUV.toVar();

      // ── Screen roll: periodic vertical scroll ──
      // Every ~7 seconds, add a fast vertical offset
      const rollCycle = timeUniform.mul(0.143).fract(); // 7s cycle
      const rollActive = smoothstep(float(0.85), float(0.95), rollCycle);
      const rollOffset = rollActive.mul(sin(timeUniform.mul(30.0)).mul(0.02));
      uv.assign(vec2(uv.x, uv.y.add(rollOffset).fract()));

      // ── Tracking error bands ──
      // Divide screen into horizontal bands, each with hash-based x offset
      const bandSize = float(0.035);
      const bandIndex = floor(uv.y.div(bandSize));
      const bandNoise = hash(bandIndex.add(floor(timeUniform.mul(4.0))));
      // Only apply glitch to ~30% of bands
      const isGlitched = smoothstep(float(0.70), float(0.75), bandNoise);
      const trackingOffset = bandNoise.sub(0.5).mul(0.08).mul(isGlitched);
      const trackedUV = vec2(uv.x.add(trackingOffset).fract(), uv.y);

      // ── Base scene content: procedural spinning icosahedron ──
      const sceneCenter = trackedUV.sub(0.5);
      const sceneDist = sceneCenter.length();
      const sceneAngle = atan(sceneCenter.y, sceneCenter.x);

      // Icosahedron-like faceted pattern
      const facets = floor(sceneAngle.mul(6.0).div(Math.PI * 2.0).add(float(6.0))).mod(float(6.0));
      const facetAngle = facets.mul(Math.PI * 2.0).div(float(6.0));
      const rotTime = timeUniform.mul(0.4);
      const facetPattern = cos(sceneAngle.sub(facetAngle).sub(rotTime)).mul(0.5).add(0.5);

      // Scene layers
      const outerShape = smoothstep(float(0.38), float(0.35), sceneDist);
      const innerHole = smoothstep(float(0.06), float(0.09), sceneDist);
      const shape = outerShape.mul(innerHole);

      const hue = facetPattern.mul(0.7).add(timeUniform.mul(0.05)).fract();
      const sceneR = sin(hue.mul(Math.PI * 2.0)).mul(0.5).add(0.5);
      const sceneG = sin(hue.mul(Math.PI * 2.0).add(Math.PI * 2.0 / 3.0)).mul(0.5).add(0.5);
      const sceneB = sin(hue.mul(Math.PI * 2.0).add(Math.PI * 4.0 / 3.0)).mul(0.5).add(0.5);

      // Neon rings
      const ring1Dist = abs(sceneDist.sub(float(0.42))).sub(float(0.008));
      const ring1 = smoothstep(float(0.008), float(0.0), ring1Dist);
      const ring2Dist = abs(sceneDist.sub(float(0.46))).sub(float(0.005));
      const ring2 = smoothstep(float(0.005), float(0.0), ring2Dist);

      const bgColor = vec3(float(0.05), float(0.04), float(0.04));
      const fgColor = vec3(sceneR.mul(0.8), sceneG.mul(0.7), sceneB.mul(0.6));
      const baseColor = mix(bgColor, fgColor, shape)
        .add(vec3(ring1.mul(float(0.9)), float(0.0), ring1.mul(float(0.5))))
        .add(vec3(float(0.0), ring2.mul(float(0.7)), ring2.mul(float(1.0))));

      // ── Chromatic aberration ──
      // R channel shifted left, B channel shifted right, G channel centered
      const aberrationAmt = float(0.006).add(isGlitched.mul(0.025));
      const uvR = vec2(trackedUV.x.sub(aberrationAmt), trackedUV.y);
      const uvB = vec2(trackedUV.x.add(aberrationAmt), trackedUV.y);

      // Sample offset R channel
      const distR = uvR.sub(0.5).length();
      const shapeR = smoothstep(float(0.38), float(0.35), distR).mul(smoothstep(float(0.06), float(0.09), distR));
      const angleR = atan(uvR.sub(0.5).y, uvR.sub(0.5).x);
      const facetsR = floor(angleR.mul(6.0).div(Math.PI * 2.0).add(float(6.0))).mod(float(6.0));
      const facetPR = cos(angleR.sub(facetsR.mul(Math.PI * 2.0).div(float(6.0))).sub(rotTime)).mul(0.5).add(0.5);
      const hueR = facetPR.mul(0.7).add(timeUniform.mul(0.05)).fract();
      const colorR = mix(float(0.05), float(0.9), sin(hueR.mul(Math.PI * 2.0)).mul(0.5).add(0.5).mul(shapeR));

      // Sample offset B channel
      const distB = uvB.sub(0.5).length();
      const shapeB = smoothstep(float(0.38), float(0.35), distB).mul(smoothstep(float(0.06), float(0.09), distB));
      const angleB = atan(uvB.sub(0.5).y, uvB.sub(0.5).x);
      const facetsB = floor(angleB.mul(6.0).div(Math.PI * 2.0).add(float(6.0))).mod(float(6.0));
      const facetPB = cos(angleB.sub(facetsB.mul(Math.PI * 2.0).div(float(6.0))).sub(rotTime)).mul(0.5).add(0.5);
      const hueB = facetPB.mul(0.7).add(timeUniform.mul(0.05)).fract();
      const colorB = mix(float(0.04), float(0.8), sin(hueB.mul(Math.PI * 2.0).add(Math.PI * 4.0 / 3.0)).mul(0.5).add(0.5).mul(shapeB));

      const aberratedColor = vec3(
        mix(baseColor.x, colorR, float(0.55)),
        baseColor.y,
        mix(baseColor.z, colorB, float(0.55))
      );

      // ── Noise bands (static stripes) ──
      const noiseLineSize = float(0.007);
      const noiseLine = floor(uv.y.div(noiseLineSize));
      const noiseVal = hash(noiseLine.add(floor(timeUniform.mul(15.0))));
      // Sparse noise: only show where hash > 0.93
      const noiseActive = smoothstep(float(0.93), float(0.97), noiseVal);
      const staticNoise = hash(uv.x.mul(400.0).floor().add(noiseLine.mul(1000.0)));
      const noiseColor = vec3(staticNoise.mul(0.9));
      const withNoise = mix(aberratedColor, noiseColor, noiseActive.mul(float(0.65)));

      // ── Warm desaturation (analog color degradation) ──
      const luma = withNoise.x.mul(0.299).add(withNoise.y.mul(0.587)).add(withNoise.z.mul(0.114));
      const warmShift = vec3(luma.mul(1.08), luma.mul(0.95), luma.mul(0.82));
      const saturation = float(0.65);
      const desaturated = mix(warmShift, withNoise, saturation);

      // ── VHS tape dropout flicker ──
      const dropout = hash(floor(uv.y.mul(200.0)).add(floor(timeUniform.mul(8.0))));
      const dropoutMask = smoothstep(float(0.99), float(1.0), dropout);
      const withDropout = mix(desaturated, vec3(0.92, 0.9, 0.82), dropoutMask);

      // ── Head switching noise at bottom of frame ──
      const headSwitchZone = smoothstep(float(0.04), float(0.0), uv.y);
      const headNoise = hash(uv.x.mul(200.0).floor().add(timeUniform.mul(30.0).floor()));
      const withHeadSwitch = mix(withDropout, vec3(headNoise.mul(0.6)), headSwitchZone.mul(float(0.8)));

      // ── Edge darkening (tape wear) ──
      const edgeDark = smoothstep(float(0.0), float(0.04), uv.x)
        .mul(smoothstep(float(1.0), float(0.96), uv.x))
        .mul(smoothstep(float(0.0), float(0.02), uv.y))
        .mul(smoothstep(float(1.0), float(0.98), uv.y));

      const finalColor = withHeadSwitch.mul(edgeDark.mul(0.12).add(0.88));

      return vec4(finalColor, float(1.0));
    });

    mat.colorNode = vhs();
    return mat;
  }, [timeUniform]);

  const icoMat = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.color = new THREE.Color(0xcc3333);
    mat.emissive = new THREE.Color(0x220000);
    mat.roughness = 0.5;
    mat.metalness = 0.3;
    return mat;
  }, []);

  const ringMat = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.color = new THREE.Color(0x0033cc);
    mat.emissive = new THREE.Color(0x000033);
    mat.roughness = 0.2;
    mat.metalness = 0.7;
    return mat;
  }, []);

  useFrame((state, delta) => {
    timeUniform.value += delta;
    if (icoRef.current) {
      icoRef.current.rotation.y += delta * 0.8;
      icoRef.current.rotation.z += delta * 0.3;
    }
    const t = state.clock.elapsedTime;
    if (ring1Ref.current) {
      ring1Ref.current.rotation.x = t * 0.5;
      ring1Ref.current.rotation.y = t * 0.3;
    }
    if (ring2Ref.current) {
      ring2Ref.current.rotation.x = -t * 0.4;
      ring2Ref.current.rotation.z = t * 0.6;
    }
  });

  return (
    <>
      <mesh ref={icoRef} material={icoMat} position={[0, 0, -2]}>
        <icosahedronGeometry args={[1.0, 0]} />
      </mesh>
      <mesh ref={ring1Ref} material={ringMat} position={[0, 0, -2]}>
        <torusGeometry args={[1.4, 0.05, 8, 32]} />
      </mesh>
      <mesh ref={ring2Ref} material={ringMat} position={[0, 0, -2]}>
        <torusGeometry args={[1.7, 0.04, 8, 32]} />
      </mesh>
      <mesh ref={meshRef} material={material} position={[0, 0, 0.5]}>
        <planeGeometry args={[viewport.width, viewport.height]} />
      </mesh>
    </>
  );
}

export default function VHSGlitch() {
  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 5, 5]} intensity={1.2} />
      <pointLight position={[0, 0, 0]} intensity={1.5} color="#ff4400" distance={8} />
      <VHSPlane />
    </>
  );
}
