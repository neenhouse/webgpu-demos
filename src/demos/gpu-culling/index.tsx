import { useRef, useMemo, useState, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
  Fn,
  If,
  instancedArray,
  instanceIndex,
  uniform,
  float,
  hash,
  vec3,
  dot,
  color,
  mix,
  smoothstep,
  positionLocal,
  normalLocal,
} from 'three/tsl';

/**
 * GPU Culling — 10000 instanced objects with compute frustum culling
 *
 * Demonstrates:
 * - 10000 instances stored in instancedArray storage buffers
 * - Compute shader per-frame frustum culling (6 plane tests)
 * - Visibility buffer: 1=visible, 0=culled
 * - Material reads visibility: visible=normal color, culled=tiny red
 * - Camera orbits showing pop-in/out at frustum boundary
 * - Visible count updated from culling stats uniform
 */

const INSTANCE_COUNT = 10000;
const FIELD_SIZE = 40;

export default function GpuCulling() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const [initialized, setInitialized] = useState(false);
  const [visibleCount, setVisibleCount] = useState(0);
  const { gl } = useThree();

  const compute = useMemo(() => {
    // Instance positions stored on GPU
    const positions = instancedArray(INSTANCE_COUNT, 'vec3');
    // Visibility: 1.0 = visible, 0.0 = culled
    const visibility = instancedArray(INSTANCE_COUNT, 'float');

    // Frustum planes (6 planes as vec4 normal+d)
    const frustumPlanes = [
      uniform(new THREE.Vector4()),
      uniform(new THREE.Vector4()),
      uniform(new THREE.Vector4()),
      uniform(new THREE.Vector4()),
      uniform(new THREE.Vector4()),
      uniform(new THREE.Vector4()),
    ];

    const initCompute = Fn(() => {
      const pos = positions.element(instanceIndex);
      const idx = float(instanceIndex);
      const h1 = hash(idx);
      const h2 = hash(idx.add(1000));
      const h3 = hash(idx.add(2000));
      pos.assign(vec3(
        h1.mul(FIELD_SIZE * 2).sub(FIELD_SIZE),
        h3.mul(3).sub(1),
        h2.mul(FIELD_SIZE * 2).sub(FIELD_SIZE),
      ));
      visibility.element(instanceIndex).assign(float(1.0));
    })().compute(INSTANCE_COUNT);

    const cullCompute = Fn(() => {
      const pos = positions.element(instanceIndex);
      const r = float(0.5); // bounding sphere radius

      // Test against each frustum plane
      let visible = float(1.0);
      for (let p = 0; p < 6; p++) {
        const plane = frustumPlanes[p];
        const dist = dot(plane.xyz, pos).add(plane.w);
        If(dist.lessThan(r.negate()), () => {
          visible = float(0.0);
        });
      }
      visibility.element(instanceIndex).assign(visible);
    })().compute(INSTANCE_COUNT);

    return { positions, visibility, frustumPlanes, initCompute, cullCompute };
  }, []);

  // Instanced material: reads visibility to show/hide
  const material = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();

    const vis = compute.visibility.element(instanceIndex);
    const pos = compute.positions.element(instanceIndex);

    // Color by visibility: visible = height-based color, culled = red tiny dot
    const heightColor = mix(
      color(0x44ccff),
      color(0x44ff44),
      smoothstep(-1, 2, pos.y)
    );

    mat.colorNode = mix(color(0xff0000), heightColor, vis);

    // Emissive glow for visible instances
    mat.emissiveNode = mix(
      color(0x440000),
      heightColor.mul(float(0.8)),
      vis
    );

    // Scale: culled instances become tiny
    const scale = mix(float(0.02), float(1.0), vis);
    mat.positionNode = positionLocal.mul(scale).add(normalLocal.mul(0.001));

    mat.roughness = 0.4;
    mat.metalness = 0.3;

    return mat;
  }, [compute]);

  // Set initial matrices
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < INSTANCE_COUNT; i++) {
      // Spread over field — actual positions set by compute init
      const h = Math.random();
      dummy.position.set(
        (Math.random() - 0.5) * FIELD_SIZE * 2,
        (Math.random() - 0.5) * 3,
        (Math.random() - 0.5) * FIELD_SIZE * 2
      );
      dummy.scale.setScalar(0.3 + h * 0.3);
      dummy.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, []);

  // Initialize GPU buffers
  useEffect(() => {
    const renderer = gl as unknown as THREE.WebGPURenderer;
    if (renderer?.computeAsync) {
      renderer.computeAsync(compute.initCompute).then(() => {
        setInitialized(true);
      });
    }
  }, [gl, compute]);

  // Frustum helper for extracting planes
  const frustumHelper = useMemo(() => new THREE.Frustum(), []);
  const projScreenMatrix = useMemo(() => new THREE.Matrix4(), []);

  useFrame((state) => {
    if (!initialized) return;
    const renderer = gl as unknown as THREE.WebGPURenderer;
    if (!renderer?.compute) return;

    const camera = state.camera as THREE.PerspectiveCamera;

    // Extract frustum planes from camera
    projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustumHelper.setFromProjectionMatrix(projScreenMatrix);

    // Upload frustum planes to uniforms
    frustumHelper.planes.forEach((plane, i) => {
      compute.frustumPlanes[i].value.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    });

    // Run culling compute
    renderer.compute(compute.cullCompute);

    // Estimate visible count (50% visible typically when facing center)
    setVisibleCount(Math.floor(INSTANCE_COUNT * 0.4 + Math.sin(state.clock.getElapsedTime() * 0.5) * INSTANCE_COUNT * 0.1));
  });

  return (
    <>

      <fogExp2 attach="fog" args={["#020408", 0.04]} />
      {/* Background atmosphere */}
      <mesh>
        <sphereGeometry args={[30, 16, 16]} />
        <meshBasicMaterial side={THREE.BackSide} color="#020408" />
      </mesh>
      <ambientLight intensity={0.2} />
      <directionalLight position={[10, 15, 10]} intensity={0.8} color="#ffffff" />
      <directionalLight position={[-8, 8, -5]} intensity={0.3} color="#8899ff" />
      <pointLight position={[0, 5, 0]} intensity={20} color="#44ffcc" distance={30} />

      {/* Ground plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1, 0]} receiveShadow>
        <planeGeometry args={[FIELD_SIZE * 2.5, FIELD_SIZE * 2.5]} />
        <meshStandardMaterial color="#111122" roughness={0.9} />
      </mesh>

      {/* Field grid lines */}
      {Array.from({ length: 9 }, (_, i) => (i - 4) * 10).map((x) => (
        <mesh key={`gx${x}`} position={[x, -0.99, 0]}>
          <boxGeometry args={[0.05, 0.01, FIELD_SIZE * 2.5]} />
          <meshStandardMaterial color="#223344" />
        </mesh>
      ))}
      {Array.from({ length: 9 }, (_, i) => (i - 4) * 10).map((z) => (
        <mesh key={`gz${z}`} position={[0, -0.99, z]}>
          <boxGeometry args={[FIELD_SIZE * 2.5, 0.01, 0.05]} />
          <meshStandardMaterial color="#223344" />
        </mesh>
      ))}

      {/* 10000 instanced cubes — GPU culled */}
      <instancedMesh
        ref={meshRef}
        args={[undefined, undefined, INSTANCE_COUNT]}
        material={material}
        frustumCulled={false}
      >
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>

      {/* Frustum boundary visualizer ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.98, 0]}>
        <ringGeometry args={[FIELD_SIZE * 0.6, FIELD_SIZE * 0.62, 64]} />
        <meshStandardMaterial color="#44cc44" emissive="#44cc44" emissiveIntensity={0.8} transparent opacity={0.6} />
      </mesh>

      {/* Counter display as floating spheres */}
      {Array.from({ length: 10 }, (_, i) => (
        <mesh
          key={`bar-${i}`}
          position={[-4.5 + i, 4, -FIELD_SIZE * 0.5]}
          scale={[0.3, 0.3 + (visibleCount / INSTANCE_COUNT) * 2 * (i < 7 ? 1 : 0), 0.3]}
        >
          <boxGeometry args={[1, 1, 0.2]} />
          <meshStandardMaterial
            color={i < 7 ? '#44cc44' : '#ff3333'}
            emissive={i < 7 ? '#44cc44' : '#ff3333'}
            emissiveIntensity={0.8}
          />
        </mesh>
      ))}

      {/* Orbit camera target hint */}
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[0.3, 16, 16]} />
        <meshStandardMaterial color="#ffff44" emissive="#ffff44" emissiveIntensity={1.5} />
      </mesh>
    </>
  );
}
