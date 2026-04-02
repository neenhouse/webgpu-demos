import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
  time,
  positionLocal,
  positionWorld,
  uv,
  Fn,
  float,
  vec3,
  mix,
  smoothstep,
  sin,
  fract,
  abs,
  hash,
} from 'three/tsl';

/**
 * Waveform Tunnel — Fly-through tunnel with waveform-deformed walls
 *
 * Techniques: CylinderGeometry with BackSide rendering (view from inside),
 * TSL positionNode for radial vertex displacement, animated sine waveform,
 * fract/smoothstep neon grid lines, 3-stop color gradient, camera auto-advance,
 * BackSide bloom halo shells around the tunnel, instanced background star
 * particles with hash-based twinkle, colored atmosphere point lights.
 *
 * Vertices are displaced radially outward by layered sine waves that scroll
 * in time, creating the illusion of waveform walls rushing past as the camera
 * moves through the tunnel.
 */

export default function WaveformTunnel() {
  const meshRef = useRef<THREE.Mesh>(null);
  const cameraRef = useRef<{ z: number }>({ z: 10 });

  // Tunnel displacement + neon material
  const material = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.side = THREE.BackSide;

    const t = time;

    // Radial displacement: sum of waveform layers scrolling along tube Y axis
    const displaceFn = Fn(() => {
      const py = positionLocal.y;
      const px = positionLocal.x;
      const pz = positionLocal.z;

      // Waveform sine layers at different frequencies
      const w1 = sin(py.mul(3.0).sub(t.mul(4.0))).mul(float(0.3));
      const w2 = sin(py.mul(5.0).sub(t.mul(6.0)).add(float(1.5))).mul(float(0.15));
      const w3 = sin(py.mul(8.0).sub(t.mul(8.0)).add(float(3.0))).mul(float(0.08));
      const w4 = sin(py.mul(12.0).add(px.mul(2.0)).sub(t.mul(10.0))).mul(float(0.05));

      const totalDisplace = w1.add(w2).add(w3).add(w4);

      // Outward = normalize XZ * displacement
      const len = px.mul(px).add(pz.mul(pz)).sqrt().max(float(0.0001));
      const nx = px.div(len);
      const nz = pz.div(len);

      return vec3(
        px.add(nx.mul(totalDisplace)),
        py,
        pz.add(nz.mul(totalDisplace))
      );
    });

    mat.positionNode = displaceFn();

    // 3-stop color gradient along tunnel Y: purple -> cyan -> white
    const colorFn = Fn(() => {
      const py = positionLocal.y;
      const purple = vec3(0.5, 0.0, 0.8);
      const cyan = vec3(0.0, 0.9, 1.0);
      const white = vec3(0.9, 1.0, 1.0);

      const t1 = smoothstep(float(-10.0), float(-2.0), py);
      const t2 = smoothstep(float(-2.0), float(6.0), py);
      const c1 = mix(purple, cyan, t1);
      return mix(c1, white, t2);
    });
    mat.colorNode = colorFn();

    // Neon scan-line grid via fract + smoothstep
    const emissiveFn = Fn(() => {
      const py = positionLocal.y;
      const uvY = uv().y;

      // Horizontal neon bands scrolling
      const bandFreq = float(20.0);
      const scroll = py.mul(bandFreq).sub(t.mul(8.0));
      const band = fract(scroll);
      const lineStrength = smoothstep(float(0.0), float(0.04), band).sub(
        smoothstep(float(0.04), float(0.1), band)
      );

      // Waveform highlight: bright where the sine peaks
      const w1 = sin(py.mul(3.0).sub(t.mul(4.0)));
      const waveGlow = smoothstep(float(0.6), float(1.0), abs(w1)).mul(float(2.0));

      // UV-based angular lines
      const angLine = smoothstep(float(0.0), float(0.02), fract(uvY.mul(8.0)));

      const cyan = vec3(0.0, 1.0, 1.0);
      const magenta = vec3(1.0, 0.0, 1.0);
      return mix(cyan, magenta, waveGlow).mul(lineStrength.add(waveGlow).add(angLine.mul(0.3)));
    });
    mat.emissiveNode = emissiveFn();

    mat.roughness = 0.1;
    mat.metalness = 0.8;

    return mat;
  }, []);

  // BackSide bloom halo shells (outer glow layers)
  const haloMats = useMemo(() => {
    return [
      { scale: 1.04, opacity: 0.025 },
      { scale: 1.09, opacity: 0.018 },
    ].map(({ opacity }) => {
      const mat = new THREE.MeshBasicNodeMaterial();
      mat.transparent = true;
      mat.blending = THREE.AdditiveBlending;
      mat.depthWrite = false;
      mat.side = THREE.BackSide;
      mat.colorNode = vec3(0.0, 0.8, 1.0).mul(float(opacity));
      return mat;
    });
  }, []);

  // Star field outside the tunnel: 70 tiny spheres
  const starPositions = useMemo(() => {
    const positions: [number, number, number][] = [];
    for (let i = 0; i < 70; i++) {
      const theta = Math.random() * Math.PI * 2;
      const r = 4 + Math.random() * 2;
      const y = (Math.random() - 0.5) * 35;
      positions.push([
        r * Math.cos(theta),
        y,
        r * Math.sin(theta),
      ]);
    }
    return positions;
  }, []);

  const starMat = useMemo(() => {
    const mat = new THREE.MeshBasicNodeMaterial();
    const fn = Fn(() => {
      const h = hash(positionWorld.x.mul(5.1).add(positionWorld.y.mul(9.7)));
      const twinkle = sin(time.mul(h.mul(4.0).add(0.5))).mul(float(0.3)).add(float(0.7));
      return vec3(0.8, 0.9, 1.0).mul(twinkle);
    });
    mat.colorNode = fn();
    return mat;
  }, []);

  useFrame((state) => {
    // Auto-advance camera through the tunnel along Y axis
    const speed = 2.5;
    cameraRef.current.z -= speed * 0.016;
    state.camera.position.y = -state.clock.elapsedTime * 1.5;
    state.camera.position.z = 0;
    state.camera.lookAt(
      0,
      state.camera.position.y - 5,
      0
    );
  });

  return (
    <>
      <color attach="background" args={['#000000']} />

      <fogExp2 attach="fog" color="#040208" density={0.04} />
      <ambientLight intensity={0.1} />
      <hemisphereLight args={['#334466', '#111122', 0.3]} />
      <pointLight position={[0, 0, 0]} intensity={20} color="#00ffff" distance={8} />
      <pointLight position={[0, -10, 0]} intensity={15} color="#ff00ff" distance={12} />
      <pointLight position={[0, -20, 0]} intensity={12} color="#8800ff" distance={15} />
      {/* Additional atmosphere lights */}
      <pointLight position={[2, -5, 0]} intensity={6} color="#00aaff" distance={10} />
      <pointLight position={[-2, -15, 0]} intensity={5} color="#ff44ff" distance={10} />

      <mesh ref={meshRef} material={material}>
        {/* CylinderGeometry(radiusTop, radiusBottom, height, radialSegs, heightSegs) */}
        <cylinderGeometry args={[3, 3, 30, 64, 128]} />
      </mesh>

      {/* Bloom halo shells (slightly larger cylinder, BackSide) */}
      {haloMats.map((haloMat, i) => {
        const scales = [1.04, 1.09];
        return (
          <mesh key={i} material={haloMat} scale={scales[i]}>
            <cylinderGeometry args={[3, 3, 30, 32, 32]} />
          </mesh>
        );
      })}

      {/* Star field particles */}
      {starPositions.map(([x, y, z], i) => (
        <mesh key={i} position={[x, y, z]} material={starMat}>
          <sphereGeometry args={[0.025, 4, 4]} />
        </mesh>
      ))}
    </>
  );
}
