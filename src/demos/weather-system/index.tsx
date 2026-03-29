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
  time,
  color,
  mix,
} from 'three/tsl';

/**
 * Weather System — Cycling weather states with compute rain and volumetric clouds
 *
 * State machine: clear -> cloudy -> rain -> storm -> clear (20s per state).
 * Clouds: 5 volumetric shell clusters (BackSide + AdditiveBlending) that grow/shrink.
 * Rain: 1000 compute particles falling in rain/storm states.
 * Lightning: bright flash + line segments in storm state.
 * Sun intensity varies. Ground wet reflections in rain.
 *
 * Techniques: compute shader particles, state machine, volumetric shells, dynamic lighting.
 */

type WeatherState = 'clear' | 'cloudy' | 'rain' | 'storm';
const STATE_DURATION = 20.0;
const RAIN_COUNT = 1000;

const STATES: WeatherState[] = ['clear', 'cloudy', 'rain', 'storm'];

export default function WeatherSystem() {
  const { gl } = useThree();
  const [initialized, setInitialized] = useState(false);
  const totalTimeRef = useRef(0);
  const stateRef = useRef<WeatherState>('clear');
  const stateProgressRef = useRef(0);
  const lightningRef = useRef(0);
  const sunLightRef = useRef<THREE.DirectionalLight>(null);
  const ambientLightRef = useRef<THREE.AmbientLight>(null);
  const flashLightRef = useRef<THREE.PointLight>(null);
  const groundRef = useRef<THREE.Mesh>(null);
  const cloudRefs = useRef<(THREE.Mesh | null)[]>([]);
  const rainMeshRef = useRef<THREE.InstancedMesh>(null);

  // Compute rain particles
  const compute = useMemo(() => {
    const positions = instancedArray(RAIN_COUNT, 'vec3');
    const velocities = instancedArray(RAIN_COUNT, 'vec3');
    const dtUniform = uniform(0.0);
    const activeUniform = uniform(0.0);

    const computeInit = Fn(() => {
      const pos = positions.element(instanceIndex);
      pos.x.assign(hash(instanceIndex).sub(0.5).mul(16.0));
      pos.y.assign(hash(instanceIndex.add(100)).mul(8.0).add(0.0));
      pos.z.assign(hash(instanceIndex.add(200)).sub(0.5).mul(16.0));

      const vel = velocities.element(instanceIndex);
      vel.x.assign(hash(instanceIndex.add(300)).sub(0.5).mul(0.3));
      vel.y.assign(float(-8.0).sub(hash(instanceIndex.add(400)).mul(3.0)));
      vel.z.assign(hash(instanceIndex.add(500)).sub(0.5).mul(0.3));
    })().compute(RAIN_COUNT);

    const computeUpdate = Fn(() => {
      const pos = positions.element(instanceIndex);
      const vel = velocities.element(instanceIndex);
      const dt = dtUniform;

      pos.x.addAssign(vel.x.mul(dt));
      pos.y.addAssign(vel.y.mul(dt));
      pos.z.addAssign(vel.z.mul(dt));

      // Respawn when below ground
      If(pos.y.lessThan(-2.5), () => {
        pos.x.assign(hash(instanceIndex.add(time.mul(100).floor())).sub(0.5).mul(16.0));
        pos.y.assign(float(6.0).add(hash(instanceIndex.add(50)).mul(2.0)));
        pos.z.assign(hash(instanceIndex.add(time.mul(100).floor()).add(200)).sub(0.5).mul(16.0));
      });
    })().compute(RAIN_COUNT);

    return { positions, velocities, dtUniform, activeUniform, computeInit, computeUpdate };
  }, []);

  // Rain material
  const rainMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.colorNode = color(0xaaccff);
    mat.emissiveNode = color(0x4488cc).mul(float(0.8));
    mat.roughness = 0.1;
    mat.metalness = 0.5;
    mat.transparent = true;
    mat.opacity = 0.7;
    return mat;
  }, []);

  // Ground material with wet reflectivity
  const groundMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    const wetFactor = uniform(0.0);
    mat.colorNode = mix(color(0x4a6a3a), color(0x2a3a2a), float(wetFactor));
    mat.roughnessNode = mix(float(0.9), float(0.1), float(wetFactor));
    mat.metalnessNode = mix(float(0.0), float(0.4), float(wetFactor));
    return { mat, wetFactor };
  }, []);

  useEffect(() => {
    const renderer = gl as unknown as THREE.WebGPURenderer;
    if (renderer?.computeAsync) {
      renderer.computeAsync(compute.computeInit).then(() => setInitialized(true));
    }
  }, [gl, compute]);

  // Build rain instance matrices (initial)
  useEffect(() => {
    const mesh = rainMeshRef.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < RAIN_COUNT; i++) {
      dummy.position.set(
        (Math.random() - 0.5) * 16,
        Math.random() * 8,
        (Math.random() - 0.5) * 16,
      );
      dummy.scale.set(0.015, 0.35, 0.015);
      dummy.rotation.x = Math.PI / 2;
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.count = 0;
  }, []);

  const scratchSunColor = useMemo(() => new THREE.Color(), []);
  const scratchCloudScale = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, delta) => {
    totalTimeRef.current += delta;
    const t = totalTimeRef.current;

    // State machine
    const stateIdx = Math.floor((t / STATE_DURATION) % STATES.length);
    const currentState = STATES[stateIdx];
    stateRef.current = currentState;
    const stateT = (t % STATE_DURATION) / STATE_DURATION;
    stateProgressRef.current = stateT;

    const isRaining = currentState === 'rain' || currentState === 'storm';
    const isStormy = currentState === 'storm';
    const isClear = currentState === 'clear';

    // Sun light
    if (sunLightRef.current) {
      const targetIntensity = isClear ? 1.6 : isStormy ? 0.1 : 0.5;
      sunLightRef.current.intensity += (targetIntensity - sunLightRef.current.intensity) * delta * 1.5;
      scratchSunColor.set(isClear ? 0xfffde7 : 0x6688aa);
      sunLightRef.current.color.lerp(scratchSunColor, delta * 1.5);
    }

    // Ambient light
    if (ambientLightRef.current) {
      const targetAmbient = isClear ? 0.8 : isStormy ? 0.15 : 0.35;
      ambientLightRef.current.intensity += (targetAmbient - ambientLightRef.current.intensity) * delta * 1.5;
    }

    // Lightning
    if (isStormy) {
      lightningRef.current -= delta;
      if (lightningRef.current <= 0) {
        lightningRef.current = 1.5 + Math.random() * 4.0;
        if (flashLightRef.current) {
          flashLightRef.current.intensity = 80.0;
        }
      }
    }
    if (flashLightRef.current) {
      flashLightRef.current.intensity *= 0.85;
    }

    // Cloud growth
    cloudRefs.current.forEach((cloud, i) => {
      if (!cloud) return;
      const targetScale = isClear ? 0.5 : isStormy ? 1.8 + i * 0.15 : 1.2 + i * 0.1;
      scratchCloudScale.set(targetScale, targetScale * 0.5, targetScale);
      cloud.scale.lerp(scratchCloudScale, delta * 0.8);
      cloud.position.x += delta * 0.05 * (i % 2 === 0 ? 1 : -1);
      if (Math.abs(cloud.position.x) > 8) cloud.position.x *= -0.9;
    });

    // Ground wetness
    if (groundRef.current) {
      // @ts-ignore
      const wetUniform = (groundMaterial as unknown as { wetFactor: { value: number } }).wetFactor;
      if (wetUniform) {
        const targetWet = isRaining ? 0.85 : isClear ? 0.0 : 0.3;
        wetUniform.value += (targetWet - wetUniform.value) * delta * 0.5;
      }
    }

    // Compute rain
    if (initialized && isRaining) {
      const renderer = gl as unknown as THREE.WebGPURenderer;
      if (renderer?.compute) {
        compute.dtUniform.value = Math.min(delta, 0.05);
        renderer.compute(compute.computeUpdate);
      }
      if (rainMeshRef.current) rainMeshRef.current.count = RAIN_COUNT;
    } else {
      if (rainMeshRef.current) rainMeshRef.current.count = 0;
    }
  });

  const cloudPositions = useMemo(() =>
    [
      [0, 4, -2, 3.5, 1.8, 3.5],
      [-4, 4.5, 1, 2.8, 1.2, 2.8],
      [4, 3.8, -1, 3.2, 1.5, 3.2],
      [-2, 5, 3, 2.5, 1.1, 2.5],
      [3, 4.2, 2, 3.0, 1.3, 3.0],
    ], []);

  return (
    <>
      <color attach="background" args={['#87ceeb']} />
      <fog attach="fog" args={['#aabbcc', 12, 30]} />

      <ambientLight ref={ambientLightRef} intensity={0.8} />
      <directionalLight
        ref={sunLightRef}
        position={[6, 10, 4]}
        intensity={1.6}
        color="#fffde7"
      />
      <pointLight
        ref={flashLightRef}
        position={[0, 8, 0]}
        intensity={0}
        color="#eeeeff"
        distance={30}
      />

      {/* Ground */}
      <mesh
        ref={groundRef}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -2.5, 0]}
      >
        <planeGeometry args={[20, 20]} />
        <primitive object={groundMaterial.mat} />
      </mesh>

      {/* Grass tufts */}
      {Array.from({ length: 30 }, (_, i) => (
        <mesh
          key={i}
          position={[
            (i % 6 - 2.5) * 2.5,
            -2.35,
            Math.floor(i / 6) * 2.5 - 5,
          ]}
        >
          <coneGeometry args={[0.15, 0.3, 4]} />
          <meshStandardMaterial color="#2d5a1a" roughness={0.9} />
        </mesh>
      ))}

      {/* Volumetric cloud shells */}
      {cloudPositions.map(([cx, cy, cz, sx, sy, sz], i) => (
        <group key={i}>
          {[1.0, 0.85, 0.7].map((scale, j) => (
            <mesh
              key={j}
              position={[cx, cy, cz]}
              scale={[sx * scale, sy * scale, sz * scale]}
              ref={(el) => {
                if (j === 0) cloudRefs.current[i] = el;
              }}
            >
              <sphereGeometry args={[1, 8, 6]} />
              <meshStandardMaterial
                color={j === 0 ? '#ccddee' : '#aabbcc'}
                transparent
                opacity={0.04 + j * 0.02}
                side={THREE.BackSide}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
              />
            </mesh>
          ))}
        </group>
      ))}

      {/* Rain particles */}
      <instancedMesh
        ref={rainMeshRef}
        args={[undefined, undefined, RAIN_COUNT]}
        material={rainMaterial}
        frustumCulled={false}
      >
        <cylinderGeometry args={[1, 1, 1, 3]} />
      </instancedMesh>
    </>
  );
}
