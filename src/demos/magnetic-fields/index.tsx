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
  int,
  vec3,
  hash,
  time,
  color,
  mix,
  smoothstep,
} from 'three/tsl';

/**
 * Magnetic Fields — 3000 particles tracing magnetic field lines
 *
 * Techniques:
 * - 3000 particles in GPU instancedArray tracing B-field lines
 * - 4 magnetic poles (2 dipole pairs) with N/S attraction/repulsion
 * - Compute: particle velocity aligned to local B-field vector
 * - Respawn near poles when particles escape the field region
 * - Color by field strength: dark blue -> bright white
 * - Glowing pole spheres with emissive halos
 * - Slow continuous pole rotation for dynamic field lines
 */

const PARTICLE_COUNT = 3000;

export default function MagneticFields() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const [initialized, setInitialized] = useState(false);
  const { gl } = useThree();

  const compute = useMemo(() => {
    const positions = instancedArray(PARTICLE_COUNT, 'vec3');

    // 4 poles: 2 positive, 2 negative
    // pole positions as uniforms
    const pole0 = uniform(new THREE.Vector3(-1.5, 0.0, 0.0));
    const pole1 = uniform(new THREE.Vector3(1.5, 0.0, 0.0));
    const pole2 = uniform(new THREE.Vector3(0.0, 0.0, -1.5));
    const pole3 = uniform(new THREE.Vector3(0.0, 0.0, 1.5));

    const dtUniform = uniform(0.016);
    const speedUniform = uniform(1.2);

    const computeInit = Fn(() => {
      const idx = instanceIndex;
      const pos = positions.element(idx);

      // Scatter near poles initially
      const poleSelect = hash(idx).mul(4.0).toInt().modInt(int(4));
      const baseX = float(0.0).toVar();
      const baseY = float(0.0).toVar();
      const baseZ = float(0.0).toVar();

      If(poleSelect.equal(int(0)), () => {
        baseX.assign(float(-1.5));
      });
      If(poleSelect.equal(int(1)), () => {
        baseX.assign(float(1.5));
      });
      If(poleSelect.equal(int(2)), () => {
        baseZ.assign(float(-1.5));
      });
      If(poleSelect.equal(int(3)), () => {
        baseZ.assign(float(1.5));
      });

      const angle = hash(idx.add(10)).mul(Math.PI * 2);
      const r = hash(idx.add(20)).mul(0.3).add(0.05);
      pos.assign(vec3(
        baseX.add(angle.cos().mul(r)),
        baseY.add(hash(idx.add(30)).mul(0.6).sub(0.3)),
        baseZ.add(angle.sin().mul(r))
      ));
    })().compute(PARTICLE_COUNT);

    const computeUpdate = Fn(() => {
      const idx = instanceIndex;
      const pos = positions.element(idx);
      const dt = dtUniform;

      // Compute B field as sum of dipole contributions
      // B = sum_i(charge_i * (pos - pole_i) / |pos - pole_i|^3)
      const charges = [1.0, -1.0, 1.0, -1.0];
      const poles = [pole0, pole1, pole2, pole3];

      const bField = vec3(0.0, 0.0, 0.0).toVar();

      for (let i = 0; i < 4; i++) {
        const toParticle = pos.sub(poles[i]);
        const dist = toParticle.length().max(float(0.1));
        const strength = float(Math.abs(charges[i]));
        const falloff = dist.mul(dist).mul(dist);
        const contribution = toParticle.normalize().mul(strength.div(falloff));
        if (charges[i] > 0) {
          bField.addAssign(contribution);
        } else {
          bField.subAssign(contribution);
        }
      }

      const fieldStrength = bField.length();

      // Velocity aligned to field direction
      If(fieldStrength.greaterThan(float(0.001)), () => {
        const fieldDir = bField.normalize();
        pos.addAssign(fieldDir.mul(speedUniform.mul(dt)));
      });

      // Respawn if too far from center
      const distFromCenter = pos.length();
      If(distFromCenter.greaterThan(float(4.0)), () => {
        const poleSelect = hash(idx.add(time.mul(100.0).toInt())).mul(4.0).toInt().modInt(int(4));
        const bx = float(0.0).toVar();
        const bz = float(0.0).toVar();
        If(poleSelect.equal(int(0)), () => { bx.assign(float(-1.5)); });
        If(poleSelect.equal(int(1)), () => { bx.assign(float(1.5)); });
        If(poleSelect.equal(int(2)), () => { bz.assign(float(-1.5)); });
        If(poleSelect.equal(int(3)), () => { bz.assign(float(1.5)); });

        const angle = hash(idx.add(time.mul(200.0).toInt())).mul(Math.PI * 2);
        const r = hash(idx.add(time.mul(300.0).toInt())).mul(0.3).add(0.05);
        pos.assign(vec3(
          bx.add(angle.cos().mul(r)),
          hash(idx.add(time.mul(400.0).toInt())).mul(0.6).sub(0.3),
          bz.add(angle.sin().mul(r))
        ));
      });
    })().compute(PARTICLE_COUNT);

    return { positions, pole0, pole1, pole2, pole3, dtUniform, computeInit, computeUpdate };
  }, []);

  const material = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();

    const pos = compute.positions.element(instanceIndex);

    // Field strength at particle position (approximated by distance to nearest pole)
    const d0 = pos.sub(compute.pole0).length();
    const d1 = pos.sub(compute.pole1).length();
    const d2 = pos.sub(compute.pole2).length();
    const d3 = pos.sub(compute.pole3).length();
    const minDist = d0.min(d1).min(d2).min(d3);
    const fieldStrength = smoothstep(float(2.0), float(0.2), minDist);

    const weakColor = color(0x000a33);
    const midColor = color(0x4488ff);
    const strongColor = color(0xeeffff);

    mat.colorNode = mix(weakColor, mix(midColor, strongColor, smoothstep(float(0.5), float(1.0), fieldStrength)), fieldStrength);
    mat.emissiveNode = mix(weakColor, strongColor, fieldStrength).mul(float(2.5));
    mat.roughness = 0.1;
    mat.metalness = 0.3;

    return mat;
  }, [compute]);

  useEffect(() => {
    const renderer = gl as unknown as THREE.WebGPURenderer;
    if (renderer?.computeAsync) {
      renderer.computeAsync(compute.computeInit).then(() => {
        setInitialized(true);
      });
    }
  }, [gl, compute]);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      dummy.position.set(
        (Math.random() - 0.5) * 4,
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 4
      );
      dummy.scale.setScalar(0.035);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, []);

  const polePositions = useMemo(() => [
    { pos: new THREE.Vector3(-1.5, 0, 0), color: '#ff2244', label: 'N' },
    { pos: new THREE.Vector3(1.5, 0, 0), color: '#2244ff', label: 'S' },
    { pos: new THREE.Vector3(0, 0, -1.5), color: '#ff2244', label: 'N' },
    { pos: new THREE.Vector3(0, 0, 1.5), color: '#2244ff', label: 'S' },
  ], []);

  useFrame((_, delta) => {
    if (!initialized) return;
    const renderer = gl as unknown as THREE.WebGPURenderer;
    if (!renderer?.compute) return;

    compute.dtUniform.value = Math.min(delta, 0.025);

    // Slowly rotate pole pair 2 around Y axis
    const t = Date.now() * 0.0003;
    const r2 = 1.5;
    compute.pole2.value.set(Math.cos(t) * r2, 0, Math.sin(t) * r2);
    compute.pole3.value.set(-Math.cos(t) * r2, 0, -Math.sin(t) * r2);

    renderer.compute(compute.computeUpdate);
  });

  return (
    <>
      <color attach="background" args={['#000508']} />

      <fogExp2 attach="fog" color="#030306" density={0.03} />
      <ambientLight intensity={0.1} />
      <hemisphereLight args={['#334466', '#111122', 0.3]} />
      <pointLight position={[-1.5, 0.5, 0]} intensity={25} color="#ff2244" distance={8} />
      <pointLight position={[1.5, 0.5, 0]} intensity={25} color="#2244ff" distance={8} />
      <pointLight position={[0, 0.5, -1.5]} intensity={20} color="#ff4422" distance={8} />
      <pointLight position={[0, 0.5, 1.5]} intensity={20} color="#2255ff" distance={8} />

      <instancedMesh
        ref={meshRef}
        args={[undefined, undefined, PARTICLE_COUNT]}
        material={material}
        frustumCulled={false}
      >
        <icosahedronGeometry args={[1, 0]} />
      </instancedMesh>

      {/* Pole spheres */}
      {polePositions.map((p, i) => (
        <group key={i}>
          <mesh position={p.pos}>
            <sphereGeometry args={[0.12, 16, 16]} />
            <meshStandardMaterial
              color={p.color}
              emissive={p.color}
              emissiveIntensity={3.0}
              roughness={0.2}
              metalness={0.5}
            />
          </mesh>
          {/* Halo */}
          <mesh position={p.pos}>
            <sphereGeometry args={[0.22, 16, 16]} />
            <meshStandardMaterial
              color={p.color}
              transparent
              opacity={0.08}
              side={THREE.BackSide}
            />
          </mesh>
        </group>
      ))}

      {/* Central axis indicator */}
      <mesh position={[0, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.01, 0.01, 3.5, 6]} />
        <meshBasicMaterial color="#334455" />
      </mesh>
    </>
  );
}
