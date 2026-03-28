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
  vec3,
  hash,
  time,
  color,
  mix,
  smoothstep,
  positionLocal,
  normalLocal,
  normalWorld,
  cameraPosition,
  positionWorld,
  oscSine,
  screenUV,
  fract,
} from 'three/tsl';

/**
 * Quantum Field — Probability cloud with wave function collapse
 *
 * Combines 5 proven techniques:
 * - Compute shader for 8000 quantum particles (proven in galaxy-collision)
 * - Volumetric shells for probability density envelope (proven in volumetric-cloud)
 * - Screen-space grid overlay for measurement apparatus (proven screenUV patterns)
 * - Bloom halo shells for collapse flash (proven)
 * - Multi-stop color based on energy state (proven chained mix/smoothstep)
 *
 * Every 5 seconds the cloud "collapses" — particles rush to a random point,
 * flash bright, then slowly diffuse again via Brownian motion.
 */

const PARTICLE_COUNT = 8000;
const SHELL_COUNT = 6;
const COLLAPSE_INTERVAL = 5.0;
const COLLAPSE_DURATION = 0.5;

export default function QuantumField() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const groupRef = useRef<THREE.Group>(null);
  const [initialized, setInitialized] = useState(false);
  const { gl } = useThree();

  // Collapse state tracked on CPU, pushed to GPU via uniforms
  const collapseRef = useRef({
    target: new THREE.Vector3(0, 0, 0),
    timer: 0,
    phase: 'diffuse' as 'diffuse' | 'collapsing' | 'collapsed',
  });

  // Compute resources
  const compute = useMemo(() => {
    const positions = instancedArray(PARTICLE_COUNT, 'vec3');
    const velocities = instancedArray(PARTICLE_COUNT, 'vec3');

    const dtUniform = uniform(0);
    const collapseTarget = uniform(new THREE.Vector3(0, 0, 0));
    const collapseStrength = uniform(0);
    const collapseFlash = uniform(0);

    // Initialize: distribute particles in a spherical probability cloud
    const computeInit = Fn(() => {
      const pos = positions.element(instanceIndex);
      const vel = velocities.element(instanceIndex);

      const idx = float(instanceIndex);
      const phi = hash(idx).mul(Math.PI * 2);
      const cosTheta = hash(idx.add(1)).mul(2.0).sub(1.0);
      const sinTheta = float(1.0).sub(cosTheta.mul(cosTheta)).max(0.0).sqrt();
      const r = hash(idx.add(2)).pow(1.0 / 3.0).mul(1.8);

      pos.x.assign(sinTheta.mul(phi.cos()).mul(r));
      pos.y.assign(sinTheta.mul(phi.sin()).mul(r));
      pos.z.assign(cosTheta.mul(r));

      vel.x.assign(hash(idx.add(3)).sub(0.5).mul(0.4));
      vel.y.assign(hash(idx.add(4)).sub(0.5).mul(0.4));
      vel.z.assign(hash(idx.add(5)).sub(0.5).mul(0.4));
    })().compute(PARTICLE_COUNT);

    // Per-frame update: Brownian motion + collapse attraction
    const computeUpdate = Fn(() => {
      const pos = positions.element(instanceIndex);
      const vel = velocities.element(instanceIndex);
      const dt = dtUniform;
      const idx = float(instanceIndex);

      // Random force (Brownian motion) using time-seeded hash
      const seed = idx.add(time.mul(137.7));
      const rx = hash(seed).sub(0.5).mul(4.0);
      const ry = hash(seed.add(1)).sub(0.5).mul(4.0);
      const rz = hash(seed.add(2)).sub(0.5).mul(4.0);

      vel.x.addAssign(rx.mul(dt));
      vel.y.addAssign(ry.mul(dt));
      vel.z.addAssign(rz.mul(dt));

      // Collapse attraction: pull toward target
      const strength = collapseStrength;
      const toTarget = vec3(
        collapseTarget.x.sub(pos.x),
        collapseTarget.y.sub(pos.y),
        collapseTarget.z.sub(pos.z),
      );

      const attractForce = strength.mul(strength).mul(12.0);
      vel.x.addAssign(toTarget.x.mul(attractForce).mul(dt));
      vel.y.addAssign(toTarget.y.mul(attractForce).mul(dt));
      vel.z.addAssign(toTarget.z.mul(attractForce).mul(dt));

      // Drag: moderate when diffuse, heavy when collapsing
      const drag = float(1.0).sub(dt.mul(float(0.8).add(strength.mul(4.0))));
      vel.x.mulAssign(drag);
      vel.y.mulAssign(drag);
      vel.z.mulAssign(drag);

      // Integrate position
      pos.x.addAssign(vel.x.mul(dt));
      pos.y.addAssign(vel.y.mul(dt));
      pos.z.addAssign(vel.z.mul(dt));

      // Soft boundary: push particles back if they drift > 2.5 units
      const distSq = pos.x.mul(pos.x).add(pos.y.mul(pos.y)).add(pos.z.mul(pos.z));
      If(distSq.greaterThan(6.25), () => {
        const dist = distSq.sqrt();
        const factor = float(2.5).div(dist);
        pos.x.mulAssign(factor);
        pos.y.mulAssign(factor);
        pos.z.mulAssign(factor);
        vel.x.mulAssign(-0.3);
        vel.y.mulAssign(-0.3);
        vel.z.mulAssign(-0.3);
      });
    })().compute(PARTICLE_COUNT);

    return {
      positions, velocities, dtUniform,
      collapseTarget, collapseStrength, collapseFlash,
      computeInit, computeUpdate,
    };
  }, []);

  // Wrap the uniform as a typed float node for use in TSL graphs
  const flashNode = useMemo(() => float(compute.collapseFlash), [compute]);

  // Particle material: reads compute buffers for energy-state color
  const material = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();

    // Speed-based color: blue (spread/low energy) -> gold (transition) -> white (collapsed)
    const vel = compute.velocities.element(instanceIndex);
    const speed = vel.length();
    const speedNorm = smoothstep(0.2, 4.0, speed);

    const lowEnergy = color(0x2244cc);
    const midEnergy = color(0xffaa22);
    const highEnergy = color(0xeeeeff);

    const lowerMix = mix(lowEnergy, midEnergy, smoothstep(0.0, 0.5, speedNorm));
    const fullColor = mix(lowerMix, highEnergy, smoothstep(0.4, 1.0, speedNorm));
    mat.colorNode = fullColor;

    // Emissive: glow based on speed + collapse flash
    const baseGlow = fullColor.mul(float(1.5).add(speedNorm.mul(2.0)));
    const flashGlow = vec3(1.0, 1.0, 1.0).mul(flashNode.mul(5.0));
    mat.emissiveNode = baseGlow.add(flashGlow);

    // Gentle vertex breathing
    mat.positionNode = positionLocal.add(
      normalLocal.mul(oscSine(time.mul(2.0).add(positionLocal.y.mul(3.0))).mul(0.003)),
    );

    mat.roughness = 0.3;
    mat.metalness = 0.1;

    return mat;
  }, [compute, flashNode]);

  // Volumetric shell materials (created here to avoid uniform typing issues)
  const shells = useMemo(() => {
    const result: { material: THREE.MeshStandardNodeMaterial; radius: number }[] = [];
    for (let i = 0; i < SHELL_COUNT; i++) {
      const layerNorm = i / (SHELL_COUNT - 1);
      const layerF = float(layerNorm);

      const mat = new THREE.MeshStandardNodeMaterial();
      mat.transparent = true;
      mat.side = THREE.BackSide;
      mat.depthWrite = false;
      mat.blending = THREE.AdditiveBlending;

      const timeOffset = time.mul(0.2).add(float(i).mul(0.4));

      const cloudDensity = Fn(() => {
        const freq = float(3.0 + i * 2.0);
        const p = positionWorld.mul(freq);
        const offset1 = vec3(timeOffset, timeOffset.mul(0.7), timeOffset.mul(1.3));
        const offset2 = vec3(timeOffset.mul(1.4), float(5.0), timeOffset.mul(0.8));
        const n1 = hash(p.add(offset1));
        const n2 = hash(p.mul(2.3).add(offset2));
        const combined = n1.mul(0.6).add(n2.mul(0.4));
        return smoothstep(0.3, 0.7, combined);
      });

      const fresnel = Fn(() => {
        const viewDir = cameraPosition.sub(positionWorld).normalize();
        const nDotV = normalWorld.dot(viewDir).saturate();
        return float(1.0).sub(nDotV).pow(float(2.0).add(layerF));
      });

      const density = cloudDensity();
      const fresnelVal = fresnel();

      const baseAlpha = float(0.03).sub(layerF.mul(0.015));
      const pulse = oscSine(time.mul(0.3).add(float(i).mul(0.6))).mul(0.15).add(0.85);
      const flashBoost = float(1.0).add(flashNode.mul(3.0));

      const shellOpacity = density.mul(baseAlpha).mul(pulse).mul(flashBoost).add(fresnelVal.mul(0.015));
      mat.opacityNode = shellOpacity.clamp(0.0, 0.12);

      // Color shifts from blue to gold to white during collapse
      const blueShell = color(0x2244cc);
      const goldShell = color(0xffaa22);
      const whiteShell = color(0xccddff);

      const shellColor = mix(
        mix(blueShell, goldShell, flashNode.mul(0.7)),
        whiteShell,
        flashNode.mul(flashNode),
      );
      mat.colorNode = shellColor;

      const emissiveStrength = float(1.2).sub(layerF.mul(0.6));
      mat.emissiveNode = shellColor.mul(density.mul(pulse).mul(emissiveStrength).mul(flashBoost));

      mat.roughness = 0.0;
      mat.metalness = 0.0;

      result.push({ material: mat, radius: 0.5 + layerNorm * 1.8 });
    }
    return result;
  }, [flashNode]);

  // Collapse halo materials
  const haloMats = useMemo(() => {
    return [0, 1, 2].map((layer) => {
      const mat = new THREE.MeshStandardNodeMaterial();
      mat.transparent = true;
      mat.side = THREE.BackSide;
      mat.depthWrite = false;
      mat.blending = THREE.AdditiveBlending;

      const fresnel = Fn(() => {
        const viewDir = cameraPosition.sub(positionWorld).normalize();
        const nDotV = normalWorld.dot(viewDir).saturate();
        return float(1.0).sub(nDotV).pow(float(1.5).add(float(layer).mul(0.5)));
      });

      const layerFade = float(1.0).sub(float(layer).mul(0.25));
      mat.opacityNode = fresnel().mul(flashNode).mul(layerFade).mul(0.6);

      // White-gold flash color
      const flashColor = mix(color(0xffaa22), vec3(1.0, 1.0, 1.0), flashNode);
      mat.colorNode = flashColor;
      mat.emissiveNode = flashColor.mul(fresnel().mul(flashNode).mul(layerFade).mul(4.0));

      mat.roughness = 0.0;
      mat.metalness = 0.0;

      return mat;
    });
  }, [flashNode]);

  // Initialize compute
  useEffect(() => {
    const renderer = gl as unknown as THREE.WebGPURenderer;
    if (renderer && renderer.computeAsync) {
      renderer.computeAsync(compute.computeInit).then(() => {
        setInitialized(true);
      });
    }
  }, [gl, compute]);

  // Set initial instance matrices from CPU
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const dummy = new THREE.Object3D();
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const phi = Math.random() * Math.PI * 2;
      const cosTheta = Math.random() * 2 - 1;
      const sinTheta = Math.sqrt(1 - cosTheta * cosTheta);
      const r = Math.cbrt(Math.random()) * 1.8;

      dummy.position.set(
        sinTheta * Math.cos(phi) * r,
        sinTheta * Math.sin(phi) * r,
        cosTheta * r,
      );
      dummy.scale.setScalar(0.015);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, []);

  // Per-frame: manage collapse cycle and run compute
  useFrame((_, delta) => {
    if (!initialized) return;

    const dt = Math.min(delta, 0.03);
    const c = collapseRef.current;
    c.timer += dt;

    // State machine for collapse cycle
    if (c.phase === 'diffuse' && c.timer >= COLLAPSE_INTERVAL) {
      const phi = Math.random() * Math.PI * 2;
      const cosTheta = Math.random() * 2 - 1;
      const sinTheta = Math.sqrt(1 - cosTheta * cosTheta);
      const r = Math.random() * 1.0;
      c.target.set(
        sinTheta * Math.cos(phi) * r,
        sinTheta * Math.sin(phi) * r,
        cosTheta * r,
      );
      c.phase = 'collapsing';
      c.timer = 0;
    } else if (c.phase === 'collapsing' && c.timer >= COLLAPSE_DURATION) {
      c.phase = 'collapsed';
      c.timer = 0;
    } else if (c.phase === 'collapsed' && c.timer >= 0.3) {
      c.phase = 'diffuse';
      c.timer = 0;
    }

    let strength = 0;
    let flash = 0;
    if (c.phase === 'collapsing') {
      strength = c.timer / COLLAPSE_DURATION;
    } else if (c.phase === 'collapsed') {
      strength = Math.max(0, 1.0 - c.timer * 3.0);
      flash = Math.max(0, 1.0 - c.timer * 4.0);
    }

    compute.collapseTarget.value.copy(c.target);
    compute.collapseStrength.value = strength;
    compute.collapseFlash.value = flash;
    compute.dtUniform.value = dt;

    const renderer = gl as unknown as THREE.WebGPURenderer;
    if (renderer && renderer.compute) {
      renderer.compute(compute.computeUpdate);
    }

    if (groupRef.current) {
      groupRef.current.rotation.y += dt * 0.05;
    }
  });

  const haloScales = [0.6, 0.9, 1.3];

  return (
    <>
      <ambientLight intensity={0.08} />
      <directionalLight position={[3, 3, 5]} intensity={0.15} />
      <pointLight position={[0, 0, 0]} intensity={4.0} color="#4488ff" distance={8} />
      <pointLight position={[2, 1, 1]} intensity={2.0} color="#ffaa22" distance={6} />
      <pointLight position={[-1.5, -1, 1.5]} intensity={2.0} color="#2244cc" distance={6} />

      <group ref={groupRef}>
        {/* Quantum particles */}
        <instancedMesh
          ref={meshRef}
          args={[undefined, undefined, PARTICLE_COUNT]}
          material={material}
          frustumCulled={false}
        >
          <icosahedronGeometry args={[1, 1]} />
        </instancedMesh>

        {/* Volumetric probability shells */}
        {shells.slice().reverse().map((shell, i) => (
          <mesh key={`shell-${i}`} material={shell.material}>
            <icosahedronGeometry args={[shell.radius, 4]} />
          </mesh>
        ))}

        {/* Collapse bloom halos */}
        {haloMats.map((mat, i) => (
          <mesh key={`halo-${i}`} material={mat} scale={haloScales[i]}>
            <icosahedronGeometry args={[1.0, 3]} />
          </mesh>
        ))}
      </group>

      {/* Screen-space measurement grid overlay */}
      <MeasurementGrid />
    </>
  );
}

/**
 * Screen-space measurement grid overlay — thin lines suggesting a measurement apparatus.
 */
function MeasurementGrid() {
  const { viewport } = useThree();

  const gridMaterial = useMemo(() => {
    const mat = new THREE.MeshBasicNodeMaterial();
    mat.transparent = true;
    mat.depthWrite = false;
    mat.depthTest = false;
    mat.blending = THREE.AdditiveBlending;

    // Grid lines every 0.1 normalized screen units
    const gridX = fract(screenUV.x.mul(10.0));
    const gridY = fract(screenUV.y.mul(10.0));

    const lineX = smoothstep(float(0.0), float(0.015), gridX).mul(
      smoothstep(float(1.0), float(0.985), gridX),
    );
    const lineY = smoothstep(float(0.0), float(0.015), gridY).mul(
      smoothstep(float(1.0), float(0.985), gridY),
    );
    const gridLine = float(1.0).sub(lineX.mul(lineY));

    // Sub-grid: finer lines every 0.05
    const subGridX = fract(screenUV.x.mul(20.0));
    const subGridY = fract(screenUV.y.mul(20.0));
    const subLineX = smoothstep(float(0.0), float(0.01), subGridX).mul(
      smoothstep(float(1.0), float(0.99), subGridX),
    );
    const subLineY = smoothstep(float(0.0), float(0.01), subGridY).mul(
      smoothstep(float(1.0), float(0.99), subGridY),
    );
    const subGridLine = float(1.0).sub(subLineX.mul(subLineY));

    const totalGrid = gridLine.mul(0.12).add(subGridLine.mul(0.03));
    const pulse = oscSine(time.mul(0.15)).mul(0.3).add(0.7);

    const gridColor = color(0x2266aa);
    mat.colorNode = gridColor.mul(totalGrid.mul(pulse));
    mat.opacityNode = totalGrid.mul(pulse).mul(0.5);

    return mat;
  }, []);

  return (
    <mesh material={gridMaterial} position={[0, 0, 3.5]} renderOrder={999}>
      <planeGeometry args={[viewport.width * 1.2, viewport.height * 1.2]} />
    </mesh>
  );
}
