import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
  color,
  time,
  oscSine,
  normalWorld,
  cameraPosition,
  positionWorld,
  positionLocal,
  normalLocal,
  uv,
  Fn,
  float,
  vec2,
  vec3,
  sin,
  cos,
  abs,
  atan,
  smoothstep,
  mix,
} from 'three/tsl';
import { spherizeUV } from 'three/tsl';

export default function UvKaleidoscope() {
  const meshRef = useRef<THREE.Mesh>(null);

  const material = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.side = THREE.DoubleSide;

    // ── Kaleidoscope UV manipulation ──
    const rawUV = uv();
    const centered = rawUV.sub(vec2(0.5, 0.5));

    // Polar coordinates
    const radius = centered.length();
    const angle = atan(centered.y, centered.x);

    // Kaleidoscope fold: 6-way mirror symmetry
    const segments = float(6.0);
    const segmentAngle = float(Math.PI * 2).div(segments);
    const foldedAngle = angle.div(segmentAngle).fract().mul(segmentAngle);
    const mirroredAngle = abs(foldedAngle.sub(segmentAngle.mul(0.5)));

    // Slow rotation animation
    const animAngle = mirroredAngle.add(time.mul(0.2));

    // Back to cartesian
    const kaleUV = vec2(
      cos(animAngle).mul(radius),
      sin(animAngle).mul(radius),
    ).add(vec2(0.5, 0.5));

    // Pulsing spherize distortion
    const warpStrength = oscSine(time.mul(0.1)).mul(1.5).add(1.0);
    const warped = spherizeUV(kaleUV, warpStrength);

    // ── Layered procedural patterns from warped kaleidoscope UVs ──

    // Tight concentric rings (high frequency for mandala detail)
    const ringDist = warped.sub(vec2(0.5, 0.5)).length();
    const rings = sin(ringDist.mul(60.0).sub(time.mul(1.2))).mul(0.5).add(0.5);

    // Secondary ring layer at different frequency for moire
    const rings2 = sin(ringDist.mul(45.0).add(time.mul(0.8))).mul(0.5).add(0.5);

    // Radial spokes
    const spokeUV = warped.sub(vec2(0.5, 0.5));
    const spokeAngle = atan(spokeUV.y, spokeUV.x);
    const spokes = sin(spokeAngle.mul(12.0).add(time.mul(0.6))).mul(0.5).add(0.5);

    // Diamond grid from warped UVs
    const gridA = sin(warped.x.mul(25.0).add(warped.y.mul(25.0)).add(time.mul(0.4)));
    const gridB = sin(warped.x.mul(25.0).sub(warped.y.mul(25.0)).sub(time.mul(0.3)));
    const diamond = gridA.mul(gridB).mul(0.5).add(0.5);

    // Petal shapes: combine radius and angle modulation
    const petals = sin(spokeAngle.mul(6.0)).mul(0.3).add(ringDist.mul(8.0)).sub(time.mul(0.5));
    const petalPattern = sin(petals).mul(0.5).add(0.5);

    // Combine all layers with weighted blend
    const pattern = rings.mul(0.25)
      .add(rings2.mul(0.15))
      .add(spokes.mul(0.2))
      .add(diamond.mul(0.2))
      .add(petalPattern.mul(0.2));

    // Sharp edges via smoothstep for mandala-like crispness
    const sharpPattern = smoothstep(float(0.35), float(0.65), pattern);

    // ── Color palette: violet -> magenta -> gold -> white ──
    const violet = color(0x5511aa);
    const magenta = color(0xdd2288);
    const gold = color(0xffaa22);
    const white = color(0xffeeff);

    // Multi-stop gradient
    const c1 = mix(violet, magenta, smoothstep(float(0.0), float(0.4), sharpPattern));
    const c2 = mix(c1, gold, smoothstep(float(0.35), float(0.7), sharpPattern));
    const finalColor = mix(c2, white, smoothstep(float(0.75), float(0.95), sharpPattern));

    mat.colorNode = finalColor;

    // ── Fresnel rim glow ──
    const fresnel = Fn(() => {
      const viewDir = cameraPosition.sub(positionWorld).normalize();
      const nDotV = normalWorld.dot(viewDir).saturate();
      return float(1.0).sub(nDotV).pow(2.0);
    });
    const rim = fresnel();

    // ── Emissive: pattern glow + rim ──
    const emissiveBase = mix(
      vec3(0.7, 0.05, 0.35),
      vec3(1.0, 0.6, 0.1),
      sharpPattern,
    );
    const patternGlow = emissiveBase.mul(sharpPattern.mul(sharpPattern).mul(2.5));
    const rimGlow = vec3(0.8, 0.2, 0.6).mul(rim.mul(1.8));
    mat.emissiveNode = patternGlow.add(rimGlow);

    // ── Vertex displacement: subtle breathing ──
    mat.positionNode = positionLocal.add(
      normalLocal.mul(
        oscSine(time.mul(0.5).add(positionLocal.y.mul(2.0))).mul(0.015),
      ),
    );

    mat.roughness = 0.2;
    mat.metalness = 0.3;

    return mat;
  }, []);

  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.15;
      meshRef.current.rotation.x += delta * 0.05;
    }
  });

  return (
    <>

      <fogExp2 attach="fog" color="#040208" density={0.04} />
      {/* Background atmosphere */}
      <mesh>
        <sphereGeometry args={[30, 16, 16]} />
        <meshBasicMaterial side={THREE.BackSide} color="#020408" />
      </mesh>

      <ambientLight intensity={0.35} />
      <directionalLight position={[5, 6, 4]} intensity={0.7} />
      <directionalLight position={[-3, -2, -5]} intensity={0.2} color={0xcc88ff} />
      <pointLight position={[0, 0, 3]} intensity={1.2} color={0xffaacc} distance={10} />
      <pointLight position={[2, 2, -2]} intensity={0.6} color={0xcc66ff} distance={10} />
      <mesh ref={meshRef} material={material}>
        <icosahedronGeometry args={[1.4, 5]} />
      </mesh>
    </>
  );
}
