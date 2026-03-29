import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
  float,
  color,
  mix,
  hash,
  instanceIndex,
  uniform,
  oscSine,
  smoothstep,
  uv,
  vec2,
} from 'three/tsl';

/**
 * Volumetric Fog Rays — god rays through windows with dust motes
 *
 * Demonstrates:
 * - 3 bright directional lights creating god rays
 * - Window frame: 4 box occluders casting shadow shapes
 * - God ray translucent planes with screenUV-based radial gradient
 * - 200 instanced dust mote spheres orbiting in light beams
 * - Warm golden key light, cool blue shadow areas
 * - Fog plane with animated density
 */

const DUST_COUNT = 200;

export default function VolumetricFogRays() {
  const dustRef = useRef<THREE.InstancedMesh>(null);
  const timeUniform = useMemo(() => uniform(0), []);

  // Dust mote positions — clustered in light beam areas
  const dustMatrices = useMemo(() => {
    const dummy = new THREE.Object3D();
    const matrices: THREE.Matrix4[] = [];
    for (let i = 0; i < DUST_COUNT; i++) {
      // Concentrate in beam from window (x: -3..3, y: 0..4, z: -2..2)
      const wx = (Math.random() - 0.5) * 5;
      const wy = Math.random() * 4.5;
      const wz = (Math.random() - 0.5) * 3;
      dummy.position.set(wx, wy, wz);
      dummy.scale.setScalar(0.015 + Math.random() * 0.02);
      dummy.updateMatrix();
      matrices.push(dummy.matrix.clone());
    }
    return matrices;
  }, []);

  // Dust material: small glowing motes
  const dustMat = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    const idx = float(instanceIndex);
    const h = hash(idx);
    const phase = hash(idx.add(100));
    const shimmer = oscSine(timeUniform.mul(float(0.8).add(h.mul(1.5))).add(phase.mul(Math.PI * 2)));
    const warmDust = color(0xffeecc);
    const brightDust = color(0xffffff);
    mat.colorNode = mix(warmDust, brightDust, shimmer.mul(0.5).add(0.5));
    mat.emissiveNode = warmDust.mul(shimmer.mul(0.4).add(0.6));
    mat.roughness = 0.5;
    mat.metalness = 0.0;
    return mat;
  }, [timeUniform]);

  // God ray plane material: warm radial gradient, very transparent
  const godRayMat1 = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.transparent = true;
    mat.side = THREE.DoubleSide;
    mat.depthWrite = false;
    // UV-based radial gradient from top center
    const uvCoord = uv();
    const center = vec2(float(0.5), float(1.0));
    const dist = uvCoord.sub(center).length();
    const alpha = smoothstep(float(0.8), float(0.0), dist).mul(0.18);
    mat.colorNode = color(0xffdd88);
    mat.emissiveNode = color(0xffcc44).mul(float(1.5));
    mat.opacityNode = alpha;
    return mat;
  }, []);

  const godRayMat2 = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.transparent = true;
    mat.side = THREE.DoubleSide;
    mat.depthWrite = false;
    const uvCoord = uv();
    const center = vec2(float(0.5), float(1.0));
    const dist = uvCoord.sub(center).length();
    const alpha = smoothstep(float(0.7), float(0.0), dist).mul(0.12);
    mat.colorNode = color(0xffcc77);
    mat.emissiveNode = color(0xffaa33).mul(float(1.2));
    mat.opacityNode = alpha;
    return mat;
  }, []);

  // Window frame occluder material
  const frameMat = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.color.set(0x1a1a2e);
    mat.roughness = 0.9;
    mat.metalness = 0.1;
    return mat;
  }, []);

  // Fog plane material
  const fogMat = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.transparent = true;
    mat.side = THREE.DoubleSide;
    mat.depthWrite = false;
    const fogDensity = oscSine(timeUniform.mul(0.15)).mul(0.08).add(0.12);
    mat.colorNode = color(0xaabbcc);
    mat.emissiveNode = color(0x334455).mul(float(0.5));
    mat.opacityNode = fogDensity;
    return mat;
  }, [timeUniform]);

  useEffect(() => {
    if (dustRef.current) {
      dustMatrices.forEach((m, i) => dustRef.current!.setMatrixAt(i, m));
      dustRef.current.instanceMatrix.needsUpdate = true;
    }
  }, [dustMatrices]);

  useFrame((state, delta) => {
    timeUniform.value = state.clock.getElapsedTime();

    // Slowly drift dust particles upward
    const t = state.clock.getElapsedTime();
    const dummy = new THREE.Object3D();
    for (let i = 0; i < DUST_COUNT; i++) {
      const h = (i / DUST_COUNT);
      const baseY = (h * 4.5);
      const driftY = (baseY + t * (0.05 + h * 0.05)) % 5.0;
      const driftX = Math.sin(t * 0.2 + h * Math.PI * 2) * 0.3;
      const driftZ = Math.cos(t * 0.15 + h * Math.PI * 2) * 0.2;
      dummy.position.set(
        (h - 0.5) * 5 + driftX,
        driftY,
        (Math.sin(h * 7.3) - 0.5) * 3 + driftZ
      );
      dummy.scale.setScalar(0.015 + Math.sin(h * 13.7) * 0.01);
      dummy.updateMatrix();
      dustRef.current?.setMatrixAt(i, dummy.matrix);
    }
    if (dustRef.current) dustRef.current.instanceMatrix.needsUpdate = true;
    void delta;
  });

  return (
    <>
      {/* Ambient fill — cool and dim */}
      <ambientLight intensity={0.08} color="#334466" />

      {/* Key light 1: Warm golden god ray from upper-left */}
      <directionalLight
        position={[-4, 8, -3]}
        intensity={2.5}
        color="#ffcc55"
        castShadow
        shadow-mapSize={[512, 512]}
        shadow-bias={-0.001}
      />

      {/* Key light 2: Warm from right */}
      <directionalLight
        position={[5, 7, -2]}
        intensity={1.5}
        color="#ffaa44"
        castShadow
        shadow-mapSize={[512, 512]}
      />

      {/* Cool fill: blue from below-back */}
      <directionalLight position={[0, -2, 5]} intensity={0.4} color="#6699ff" />

      {/* Room geometry */}
      {/* Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[14, 10]} />
        <meshStandardMaterial color="#1a1a2a" roughness={0.8} metalness={0.1} />
      </mesh>

      {/* Back wall with window opening */}
      <mesh position={[0, 3, -5]} receiveShadow>
        <planeGeometry args={[14, 6]} />
        <meshStandardMaterial color="#222233" roughness={0.9} />
      </mesh>

      {/* Window frame — 4 occluder bars casting shadow patterns */}
      {/* Horizontal top bar */}
      <mesh position={[0, 4.5, -4.9]} castShadow receiveShadow>
        <boxGeometry args={[5, 0.3, 0.2]} />
        <primitive object={frameMat} />
      </mesh>
      {/* Horizontal bottom bar */}
      <mesh position={[0, 2.5, -4.9]} castShadow receiveShadow>
        <boxGeometry args={[5, 0.3, 0.2]} />
        <primitive object={frameMat} />
      </mesh>
      {/* Vertical left bar */}
      <mesh position={[-2, 3.5, -4.9]} castShadow receiveShadow>
        <boxGeometry args={[0.3, 2.5, 0.2]} />
        <primitive object={frameMat} />
      </mesh>
      {/* Vertical right bar */}
      <mesh position={[2, 3.5, -4.9]} castShadow receiveShadow>
        <boxGeometry args={[0.3, 2.5, 0.2]} />
        <primitive object={frameMat} />
      </mesh>
      {/* Center cross */}
      <mesh position={[0, 3.5, -4.9]} castShadow receiveShadow>
        <boxGeometry args={[0.2, 2.5, 0.15]} />
        <primitive object={frameMat} />
      </mesh>
      <mesh position={[0, 3.5, -4.9]} castShadow receiveShadow>
        <boxGeometry args={[5, 0.2, 0.15]} />
        <primitive object={frameMat} />
      </mesh>

      {/* God ray planes — large translucent gradients from window */}
      <mesh position={[-1, 2.5, -2]} rotation={[0, 0.15, 0]} scale={[3, 5, 1]}>
        <planeGeometry args={[1, 1]} />
        <primitive object={godRayMat1} />
      </mesh>
      <mesh position={[1.5, 2.5, -1]} rotation={[0, -0.1, 0]} scale={[2.5, 5, 1]}>
        <planeGeometry args={[1, 1]} />
        <primitive object={godRayMat2} />
      </mesh>
      <mesh position={[0, 2.5, -3]} rotation={[0, 0, 0]} scale={[4, 5, 1]}>
        <planeGeometry args={[1, 1]} />
        <primitive object={godRayMat1} />
      </mesh>

      {/* Fog plane — floating low ground fog */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.3, 0]}>
        <planeGeometry args={[14, 10]} />
        <primitive object={fogMat} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.6, 0]}>
        <planeGeometry args={[14, 10]} />
        <primitive object={fogMat} />
      </mesh>

      {/* 200 dust mote spheres */}
      <instancedMesh
        ref={dustRef}
        args={[undefined, undefined, DUST_COUNT]}
        material={dustMat}
        frustumCulled={false}
      >
        <sphereGeometry args={[1, 6, 6]} />
      </instancedMesh>

      {/* Some furniture silhouettes to ground the scene */}
      <mesh position={[-4, 0.4, 1]} castShadow receiveShadow>
        <boxGeometry args={[2, 0.8, 1.5]} />
        <meshStandardMaterial color="#1c1c2c" roughness={0.9} />
      </mesh>
      <mesh position={[3.5, 0.6, 2]} castShadow receiveShadow>
        <boxGeometry args={[1, 1.2, 1]} />
        <meshStandardMaterial color="#1c1c2c" roughness={0.9} />
      </mesh>

      {/* Point light in room for ambient warm fill */}
      <pointLight position={[0, 5, 0]} intensity={1.5} color="#443322" distance={15} decay={2} />
    </>
  );
}
