import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
  Fn,
  float,
  vec3,
  vec4,
  uniform,
  positionLocal,
  positionWorld,
  normalWorld,
  cameraPosition,
  time,
  sin,
  floor,
  mix,
  smoothstep,
  hash,
} from 'three/tsl';

/**
 * Glitch Portrait — Abstract face mesh with glitch effects
 *
 * Techniques:
 * 1. positionNode: horizontal slice offsets via hash(floor(positionLocal.y * N))
 * 2. RGB split: emissive shows different color per face angle
 * 3. Scanline distortion pattern
 * 4. Periodic glitch burst every ~3s (0.3s duration, all effects intensify)
 * 5. Neon pink/cyan/white palette
 */

export default function GlitchPortrait() {
  const meshRef = useRef<THREE.Mesh>(null);
  const innerRef = useRef<THREE.Mesh>(null);
  const haloRef1 = useRef<THREE.Mesh>(null);
  const haloRef2 = useRef<THREE.Mesh>(null);

  const timeUniform = useMemo(() => uniform(0.0), []);
  const glitchIntensity = useMemo(() => uniform(0.0), []);

  // ── Main mesh material with glitch position displacement ──
  const mainMat = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.transparent = true;
    mat.side = THREE.DoubleSide;

    // ── Vertex displacement: horizontal slice glitch ──
    mat.positionNode = Fn(() => {
      const sliceN = float(20.0);
      const sliceIdx = floor(positionLocal.y.mul(sliceN));

      // Hash-based x offset per horizontal slice
      const sliceHash = hash(sliceIdx.add(floor(time.mul(float(4.0)))));
      // Glitch: some slices get large offsets
      const isGlitched = smoothstep(float(0.75), float(0.8), sliceHash);
      const xOffset = sliceHash.sub(float(0.5)).mul(float(0.4)).mul(isGlitched).mul(glitchIntensity.add(float(0.1)));

      // Subtle base deformation (organic head shape)
      const organicWave = sin(positionLocal.y.mul(float(4.0)).add(time.mul(float(0.8)))).mul(float(0.02));

      return positionLocal.add(vec3(xOffset.add(organicWave), float(0.0), float(0.0)));
    })();

    // ── Color node: RGB split per face angle ──
    mat.colorNode = Fn(() => {
      const viewDir = cameraPosition.sub(positionWorld).normalize();
      const nDotV = normalWorld.dot(viewDir).saturate();
      const fresnel = float(1.0).sub(nDotV).pow(float(2.0));

      // Face angle determines color channel
      const faceAngle = normalWorld.x.mul(float(0.5)).add(float(0.5));
      // RGB split based on viewing angle
      const rChannel = smoothstep(float(0.4), float(0.6), faceAngle);

      // Neon pink/cyan base
      const pink = vec3(float(1.0), float(0.1), float(0.7));
      const cyan = vec3(float(0.0), float(0.9), float(1.0));
      const white = vec3(float(1.0), float(1.0), float(1.0));

      const faceColor = mix(pink, cyan, rChannel);
      const withFresnelColor = mix(faceColor, white, fresnel.mul(float(0.4)));

      // Scanline distortion
      const scanLine = sin(positionWorld.y.mul(float(30.0)).add(time.mul(float(3.0)))).mul(float(0.5)).add(float(0.5));
      const withScan = mix(withFresnelColor, withFresnelColor.mul(float(1.4)), scanLine.mul(float(0.15)));

      return vec4(withScan, float(0.92));
    })();

    // ── Emissive: RGB glow per channel ──
    mat.emissiveNode = Fn(() => {
      const viewDir = cameraPosition.sub(positionWorld).normalize();
      const nDotV = normalWorld.dot(viewDir).saturate();
      const fresnel = float(1.0).sub(nDotV).pow(float(3.0));

      // Base neon glow
      const faceAngle = normalWorld.x.mul(float(0.5)).add(float(0.5));
      const pinkGlow = vec3(float(1.0), float(0.0), float(0.6)).mul(smoothstep(float(0.3), float(0.7), faceAngle));
      const cyanGlow = vec3(float(0.0), float(1.0), float(1.0)).mul(smoothstep(float(0.7), float(0.3), faceAngle));

      const baseGlow = pinkGlow.add(cyanGlow).mul(float(0.5));

      // Rim glow
      const rimGlow = vec3(float(1.0), float(0.1), float(0.8)).mul(fresnel.mul(float(2.5)));

      // Glitch burst intensification
      const glitchGlow = baseGlow.mul(glitchIntensity.mul(float(3.0)).add(float(1.0)));

      // Scanline bright flashes during glitch
      const glitchScan = sin(positionWorld.y.mul(float(80.0)).add(time.mul(float(20.0)))).mul(float(0.5)).add(float(0.5));
      const scanBoost = glitchScan.mul(glitchIntensity.mul(float(2.0)));

      return rimGlow.add(glitchGlow).add(vec3(scanBoost, scanBoost.mul(float(0.3)), scanBoost.mul(float(0.8))));
    })();

    mat.roughness = 0.3;
    mat.metalness = 0.4;

    return mat;
  }, [timeUniform, glitchIntensity]);

  // ── Inner core (bright white/pink nucleus) ──
  const coreMat = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();

    mat.colorNode = Fn(() => {
      const pulse = sin(time.mul(float(3.0))).mul(float(0.2)).add(float(0.8));
      return vec4(float(1.0), float(0.2).mul(pulse), float(0.8).mul(pulse), float(1.0));
    })();
    mat.emissiveNode = Fn(() => {
      const pulse = sin(time.mul(float(3.0))).mul(float(0.3)).add(float(0.7));
      return vec3(float(1.5), float(0.2), float(0.9)).mul(pulse).mul(glitchIntensity.mul(float(2.0)).add(float(1.0)));
    })();
    mat.roughness = 0.2;
    mat.metalness = 0.0;

    return mat;
  }, [glitchIntensity]);

  // ── Halo shells ──
  const haloMat1 = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.transparent = true;
    mat.side = THREE.BackSide;
    mat.blending = THREE.AdditiveBlending;
    mat.depthWrite = false;

    const fresnel = Fn(() => {
      const viewDir = cameraPosition.sub(positionWorld).normalize();
      const nDotV = normalWorld.dot(viewDir).saturate();
      return float(1.0).sub(nDotV).pow(float(2.0));
    })();

    mat.emissiveNode = vec3(float(1.0), float(0.0), float(0.7)).mul(fresnel.mul(float(1.5)));
    mat.opacityNode = fresnel.mul(float(0.025));
    return mat;
  }, []);

  const haloMat2 = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.transparent = true;
    mat.side = THREE.BackSide;
    mat.blending = THREE.AdditiveBlending;
    mat.depthWrite = false;

    const fresnel = Fn(() => {
      const viewDir = cameraPosition.sub(positionWorld).normalize();
      const nDotV = normalWorld.dot(viewDir).saturate();
      return float(1.0).sub(nDotV).pow(float(1.5));
    })();

    mat.emissiveNode = vec3(float(0.0), float(1.0), float(1.0)).mul(fresnel.mul(float(1.2)));
    mat.opacityNode = fresnel.mul(float(0.018));
    return mat;
  }, []);

  useFrame((state, delta) => {
    timeUniform.value += delta;

    // Periodic glitch burst: every ~3s, 0.3s duration
    const t = state.clock.elapsedTime;
    const burstCycle = t % 3.0;
    const burstActive = burstCycle < 0.3 ? Math.pow(1.0 - burstCycle / 0.3, 0.5) : 0.0;
    glitchIntensity.value = burstActive;

    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.3;
      meshRef.current.rotation.x = Math.sin(t * 0.2) * 0.15;

      // During glitch burst, shake the mesh
      if (burstActive > 0) {
        meshRef.current.rotation.z = (Math.random() - 0.5) * 0.15 * burstActive;
      } else {
        meshRef.current.rotation.z *= 0.9;
      }
    }

    if (innerRef.current) {
      innerRef.current.rotation.y -= delta * 0.5;
      innerRef.current.rotation.z += delta * 0.3;
    }
  });

  return (
    <>
      <ambientLight intensity={0.1} color="#110022" />
      <hemisphereLight args={['#334466', '#111122', 0.3]} />
      <pointLight position={[0, 0, 3]} intensity={2.0} color="#ff00cc" distance={12} />
      <pointLight position={[-3, 2, 2]} intensity={1.5} color="#00ffff" distance={15} />
      <pointLight position={[3, -2, 2]} intensity={1.5} color="#ff1166" distance={15} />
      <pointLight position={[0, 0, 0]} intensity={1.0} color="#ffffff" distance={8} />

      {/* Inner core */}
      <mesh ref={innerRef} material={coreMat}>
        <icosahedronGeometry args={[0.4, 2]} />
      </mesh>

      {/* Main head mesh */}
      <mesh ref={meshRef} material={mainMat}>
        <icosahedronGeometry args={[1.4, 4]} />
      </mesh>

      {/* Halo shells */}
      <mesh ref={haloRef1} material={haloMat1} scale={1.6}>
        <icosahedronGeometry args={[1.4, 2]} />
      </mesh>
      <mesh ref={haloRef2} material={haloMat2} scale={2.1}>
        <icosahedronGeometry args={[1.4, 2]} />
      </mesh>

      <color attach="background" args={['#050008']} />

      <fogExp2 attach="fog" args={["#020408", 0.04]} />
    </>
  );
}
