import { useRef, useMemo, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
  Fn,
  float,
  vec3,
  vec4,
  uv,
  cameraPosition,
  positionWorld,
  normalWorld,
  mix,
  smoothstep,
} from 'three/tsl';

const U_SEGS = 120;
const V_SEGS = 20;
const PARTICLE_COUNT = 200;

// Möbius strip parametric equations
// u in [0, 2π], v in [-0.5, 0.5]
function moebiusPoint(u: number, v: number): THREE.Vector3 {
  const R = 1.5; // main radius
  const w = 0.5; // half-width
  const x = (R + v * w * Math.cos(u / 2)) * Math.cos(u);
  const y = (R + v * w * Math.cos(u / 2)) * Math.sin(u);
  const z = v * w * Math.sin(u / 2);
  return new THREE.Vector3(x, y, z);
}

function moebiusNormal(u: number, v: number): THREE.Vector3 {
  const eps = 0.001;
  const p = moebiusPoint(u, v);
  const pu = moebiusPoint(u + eps, v).sub(p).divideScalar(eps);
  const pv = moebiusPoint(u, v + eps).sub(p).divideScalar(eps);
  return pu.clone().cross(pv).normalize();
}

function buildMoebiusGeometry() {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let j = 0; j <= V_SEGS; j++) {
    for (let i = 0; i <= U_SEGS; i++) {
      const u = (i / U_SEGS) * Math.PI * 2;
      const v = (j / V_SEGS) - 0.5;

      const pos = moebiusPoint(u, v);
      positions.push(pos.x, pos.y, pos.z);

      const n = moebiusNormal(u, v);
      normals.push(n.x, n.y, n.z);
      uvs.push(i / U_SEGS, j / V_SEGS);
    }
  }

  for (let j = 0; j < V_SEGS; j++) {
    for (let i = 0; i < U_SEGS; i++) {
      const a = j * (U_SEGS + 1) + i;
      const b = a + 1;
      const c = (j + 1) * (U_SEGS + 1) + i;
      const d = c + 1;
      indices.push(a, b, d);
      indices.push(a, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
}

export default function MoebiusFlow() {
  const groupRef = useRef<THREE.Group>(null);
  const particleMeshRef = useRef<THREE.InstancedMesh | null>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  // Particle u-parameters (each particle at different u position)
  const particleU = useMemo(() => {
    const arr: number[] = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      arr.push((i / PARTICLE_COUNT) * Math.PI * 2);
    }
    return arr;
  }, []);

  const geometry = useMemo(() => buildMoebiusGeometry(), []);

  // Strip material: semi-transparent DoubleSide with color-by-u
  const stripMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.side = THREE.DoubleSide;
    mat.transparent = true;

    // Color by u-parameter to show topology
    const stripColor = Fn(() => {
      const u = uv().x; // normalized u [0,1]
      // Color cycles: blue -> teal -> green -> orange -> red -> blue
      const t1 = smoothstep(float(0.0), float(0.2), u);
      const t2 = smoothstep(float(0.2), float(0.4), u);
      const t3 = smoothstep(float(0.4), float(0.6), u);
      const t4 = smoothstep(float(0.6), float(0.8), u);
      const t5 = smoothstep(float(0.8), float(1.0), u);

      const blue = vec3(0.1, 0.3, 1.0);
      const teal = vec3(0.0, 0.9, 0.8);
      const green = vec3(0.2, 0.95, 0.3);
      const orange = vec3(1.0, 0.5, 0.05);
      const magenta = vec3(0.9, 0.1, 0.8);

      const s1 = mix(blue, teal, t1);
      const s2 = mix(s1, green, t2);
      const s3 = mix(s2, orange, t3);
      const s4 = mix(s3, magenta, t4);
      return mix(s4, blue, t5);
    });

    mat.colorNode = stripColor();

    const fresnelGlow = Fn(() => {
      const viewDir = cameraPosition.sub(positionWorld).normalize();
      const nDotV = normalWorld.dot(viewDir).abs().saturate();
      const f = float(1.0).sub(nDotV).pow(float(2.5));
      const u = uv().x;
      const glowColor = mix(vec3(0.1, 0.5, 1.0), vec3(1.0, 0.4, 0.1), u);
      return glowColor.mul(f).mul(float(2.0));
    });

    mat.emissiveNode = fresnelGlow();
    mat.opacity = 0.65;
    mat.roughness = 0.3;
    mat.metalness = 0.5;

    return mat;
  }, []);

  // Wireframe overlay
  const wireMaterial = useMemo(() => {
    const mat = new THREE.MeshBasicNodeMaterial();
    mat.wireframe = true;
    mat.transparent = true;
    mat.colorNode = vec4(0.2, 1.0, 0.5, 0.12);
    return mat;
  }, []);

  // Particle material: color shifts with traversal position
  const particleMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();

    const particleColor = Fn(() => {
      const posW = positionWorld;
      // Use Y position to modulate color: blue when bottom, orange when top
      const t = posW.y.add(float(2.0)).div(float(4.0)).saturate();
      return mix(vec3(0.1, 0.4, 1.0), vec3(1.0, 0.5, 0.05), t);
    });

    mat.colorNode = particleColor();

    const glow = Fn(() => {
      const viewDir = cameraPosition.sub(positionWorld).normalize();
      const nDotV = normalWorld.dot(viewDir).saturate();
      const f = float(1.0).sub(nDotV).pow(float(3.0));
      const posW = positionWorld;
      const t = posW.y.add(float(2.0)).div(float(4.0)).saturate();
      return mix(vec3(0.1, 0.5, 1.0), vec3(1.0, 0.5, 0.0), t).mul(f).mul(float(3.0));
    });

    mat.emissiveNode = glow();
    mat.roughness = 0.2;
    mat.metalness = 0.6;

    return mat;
  }, []);

  const setParticleRef = useCallback((el: THREE.InstancedMesh | null) => {
    particleMeshRef.current = el;
  }, []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const speed = 0.4; // radians per second

    const mesh = particleMeshRef.current;
    if (mesh) {
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        // Advance u parameter
        const u = (particleU[i] + t * speed) % (Math.PI * 2);
        // Particle rides on the strip surface at v=0
        const pos = moebiusPoint(u, 0);
        const n = moebiusNormal(u, 0);

        dummy.position.copy(pos).addScaledVector(n, 0.05);
        dummy.scale.setScalar(0.04);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }

    if (groupRef.current) {
      groupRef.current.rotation.y = t * 0.15;
      groupRef.current.rotation.z = Math.sin(t * 0.07) * 0.1;
    }
  });

  return (
    <>

      <fogExp2 attach="fog" color="#030306" density={0.03} />
      {/* Background atmosphere */}
      <mesh>
        <sphereGeometry args={[30, 16, 16]} />
        <meshBasicMaterial side={THREE.BackSide} color="#020408" />
      </mesh>

      <ambientLight intensity={0.15} />
      <hemisphereLight args={['#334466', '#111122', 0.3]} />
      <pointLight position={[3, 2, 4]} intensity={2} color={0x44ff88} />
      <pointLight position={[-3, -2, 3]} intensity={1.5} color={0xff8844} />
      <pointLight position={[0, 4, -3]} intensity={1.2} color={0x4488ff} />

      <group ref={groupRef}>
        {/* Möbius strip surface */}
        <mesh geometry={geometry} material={stripMaterial} />
        <mesh geometry={geometry} material={wireMaterial} />

        {/* Flowing particles */}
        <instancedMesh
          ref={setParticleRef}
          args={[undefined, undefined, PARTICLE_COUNT]}
          material={particleMaterial}
          frustumCulled={false}
        >
          <sphereGeometry args={[1, 8, 6]} />
        </instancedMesh>
      </group>
    </>
  );
}
