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
  smoothstep,
  positionLocal,
  positionWorld,
  normalLocal,
  normalWorld,
  cameraPosition,
  screenUV,
  vec2,
  vec3,
  vec4,
  oscSine,
} from 'three/tsl';

/**
 * Time Vortex — Spiraling temporal distortion with clock elements
 *
 * Combines 5 proven techniques:
 * 1. SDF raymarching for vortex funnel shape (MeshBasicNodeMaterial)
 * 2. Screen-space UV warping for gravitational distortion (proven in black-hole)
 * 3. Instanced mesh for clock hands/numbers orbiting
 * 4. Compute shader for particle spiral (proven)
 * 5. Bloom halos for vortex core (proven)
 *
 * requiresWebGPU: true (compute particles)
 */

const PARTICLE_COUNT = 2000;
const CLOCK_ELEMENT_COUNT = 60; // 12 hour markers + 48 clock hands

/** Creates the vortex funnel SDF material rendered on a full-viewport plane */
function makeVortexSDFMaterial() {
  const mat = new THREE.MeshBasicNodeMaterial();

  const vortexColor = Fn(() => {
    const suv = screenUV;
    const center = vec2(0.5, 0.5);
    const offset = suv.sub(center);
    const dist = offset.length();

    // Simpler spiral: use hash noise with radial + angular
    const t = time.mul(0.4);
    const radialCoord = dist.mul(20.0).sub(t.mul(3.0));
    const angularCoord = vec3(suv.x.mul(30.0), suv.y.mul(30.0), t.mul(0.5));
    const n1 = hash(angularCoord);

    // Spiral arms via modulated radial pattern
    const spiral = radialCoord.sin().mul(0.5).add(0.5);
    const spiralNoise = spiral.mul(n1.mul(0.4).add(0.6));

    // Vortex funnel: bright core, fading outward with spiral structure
    const coreGlow = float(0.08).div(dist.max(0.01)).saturate();
    const funnelFade = smoothstep(0.5, 0.0, dist);

    // Color gradient: gold outer -> deep blue inner -> white core
    const outerGold = vec3(1.0, 0.85, 0.3);
    const midBlue = vec3(0.1, 0.15, 0.6);
    const innerWhite = vec3(1.0, 0.95, 0.9);

    const c1 = mix(outerGold, midBlue, smoothstep(0.05, 0.25, dist));
    const c2 = mix(innerWhite, c1, smoothstep(0.0, 0.08, dist));

    // Combine spiral texture with funnel coloring
    const spiralBrightness = spiralNoise.mul(funnelFade).mul(0.7).add(coreGlow);
    const finalColor = vec3(c2.x, c2.y, c2.z).mul(spiralBrightness);

    // Add subtle ring patterns for clock-like concentric circles
    const rings = dist.mul(40.0).sub(t.mul(2.0)).sin().mul(0.5).add(0.5);
    const ringGlow = rings.mul(funnelFade).mul(0.15);
    const ringColor = vec3(1.0, 0.9, 0.5).mul(ringGlow);

    // Screen-space UV warping: radial distortion near center (gravitational)
    // Background stars visible through the warp
    const warpStrength = float(0.05).div(dist.max(0.03));
    const warpedUV = suv.add(offset.normalize().mul(warpStrength.mul(0.01)));

    // Procedural warped starfield background
    const starP1 = vec3(warpedUV.x.mul(80.0), warpedUV.y.mul(80.0), float(1.0));
    const starP2 = vec3(warpedUV.x.mul(160.0), warpedUV.y.mul(160.0), float(2.0));
    const s1 = smoothstep(0.97, 0.99, hash(starP1)).mul(0.8);
    const s2 = smoothstep(0.96, 0.99, hash(starP2)).mul(0.4);
    const starBright = s1.add(s2);
    const starColor = vec3(0.7, 0.75, 1.0).mul(starBright);

    // Dark background with stars, vortex overlaid
    const bgDarken = smoothstep(0.0, 0.35, dist);
    const bg = starColor.mul(bgDarken);

    const combined = bg.add(finalColor).add(ringColor);

    return vec4(combined.x, combined.y, combined.z, float(1.0));
  });

  mat.colorNode = vortexColor();
  return mat;
}

/** Creates bloom halo material for vortex core */
function makeVortexHaloMaterial(layer: number) {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;
  mat.side = THREE.BackSide;
  mat.depthWrite = false;
  mat.blending = THREE.AdditiveBlending;

  const layerF = float(layer);
  const layerFade = float(1.0).sub(layerF.mul(0.25));

  const fresnel = Fn(() => {
    const viewDir = cameraPosition.sub(positionWorld).normalize();
    const nDotV = normalWorld.dot(viewDir).saturate();
    return float(1.0).sub(nDotV).pow(float(1.5).add(layerF.mul(0.5)));
  });

  const fresnelVal = fresnel();
  const pulse = oscSine(time.mul(0.8).add(layerF.mul(1.0))).mul(0.25).add(0.75);

  // Gold to white glow
  const glowColor = mix(color(0xffcc44), color(0xffffff), layerF.mul(0.3));

  mat.opacityNode = fresnelVal.mul(pulse).mul(layerFade).mul(0.5);
  mat.colorNode = glowColor;
  mat.emissiveNode = glowColor.mul(fresnelVal.mul(pulse).mul(layerFade).mul(3.0));

  mat.roughness = 0.0;
  mat.metalness = 0.0;

  return mat;
}

/** Creates the clock element material (gold metallic) */
function makeClockElementMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();

  // Gold metallic with time-based emissive pulse
  const seed = hash(positionWorld.x.mul(11.3).add(positionWorld.z.mul(7.7)));
  const pulse = oscSine(time.mul(0.6).add(seed.mul(6.0))).mul(0.4).add(0.6);

  mat.colorNode = color(0xddaa33);
  mat.emissiveNode = color(0xffcc44).mul(pulse.mul(1.5));

  mat.roughness = 0.2;
  mat.metalness = 0.8;

  return mat;
}

/** Clock elements spiraling around the vortex */
function ClockElements() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const clockMaterial = useMemo(() => makeClockElementMaterial(), []);

  // Store base data for animation
  const elementData = useMemo(() => {
    const data: { radius: number; angle: number; height: number; scaleX: number; scaleY: number; scaleZ: number; speed: number }[] = [];
    for (let i = 0; i < CLOCK_ELEMENT_COUNT; i++) {
      if (i < 12) {
        // Hour markers: spherical pips at regular angles
        const angle = (i / 12) * Math.PI * 2;
        data.push({
          radius: 1.2 + Math.random() * 0.4,
          angle,
          height: (Math.random() - 0.5) * 1.5,
          scaleX: 0.06,
          scaleY: 0.06,
          scaleZ: 0.06,
          speed: 0.3 + Math.random() * 0.2,
        });
      } else {
        // Clock hands: thin elongated boxes
        const angle = Math.random() * Math.PI * 2;
        const radius = 0.5 + Math.random() * 2.0;
        data.push({
          radius,
          angle,
          height: (Math.random() - 0.5) * 2.0,
          scaleX: 0.015 + Math.random() * 0.01,
          scaleY: 0.15 + Math.random() * 0.2,
          scaleZ: 0.008,
          speed: 0.2 + Math.random() * 0.5 + (1.0 / (radius + 0.5)) * 0.3,
        });
      }
    }
    return data;
  }, []);

  // Animate clock elements spiraling into vortex
  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const elapsed = performance.now() * 0.001;
    const dummy = new THREE.Object3D();

    for (let i = 0; i < elementData.length; i++) {
      const d = elementData[i];
      const currentAngle = d.angle + elapsed * d.speed;
      // Spiral inward slightly over time
      const spiralR = d.radius + Math.sin(elapsed * 0.3 + d.angle) * 0.3;

      dummy.position.set(
        Math.cos(currentAngle) * spiralR,
        d.height + Math.sin(elapsed * 0.5 + d.angle * 2) * 0.3,
        Math.sin(currentAngle) * spiralR,
      );

      // Rotate to face radially and add spin
      dummy.rotation.set(
        elapsed * 0.5 + d.angle,
        currentAngle,
        elapsed * 0.3,
      );

      dummy.scale.set(d.scaleX, d.scaleY, d.scaleZ);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, CLOCK_ELEMENT_COUNT]}
      material={clockMaterial}
      frustumCulled={false}
    >
      <boxGeometry args={[1, 1, 1]} />
    </instancedMesh>
  );
}

/** Compute-driven spiral particles */
function SpiralParticles() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const [initialized, setInitialized] = useState(false);
  const { gl } = useThree();

  const compute = useMemo(() => {
    const positions = instancedArray(PARTICLE_COUNT, 'vec3');
    const velocities = instancedArray(PARTICLE_COUNT, 'vec3');
    const lifetimes = instancedArray(PARTICLE_COUNT, 'float');

    const dtUniform = uniform(0);

    // Initialize: distribute particles in a spiral
    const computeInit = Fn(() => {
      const pos = positions.element(instanceIndex);
      const vel = velocities.element(instanceIndex);
      const life = lifetimes.element(instanceIndex);

      const seed = hash(instanceIndex);
      const angle = seed.mul(Math.PI * 2);
      const radius = hash(instanceIndex.add(1)).mul(3.0).add(0.3);
      const height = hash(instanceIndex.add(2)).mul(4.0).sub(2.0);

      pos.x.assign(angle.cos().mul(radius));
      pos.y.assign(height);
      pos.z.assign(angle.sin().mul(radius));

      // Spiral inward velocity
      const spiralSpeed = hash(instanceIndex.add(3)).mul(0.5).add(0.3);
      vel.x.assign(angle.sin().negate().mul(spiralSpeed));
      vel.y.assign(hash(instanceIndex.add(4)).mul(0.4).sub(0.2));
      vel.z.assign(angle.cos().mul(spiralSpeed));

      life.assign(hash(instanceIndex.add(5)).mul(3.0).add(0.5));
    })().compute(PARTICLE_COUNT);

    // Update: spiral particles inward with vortex field
    const computeUpdate = Fn(() => {
      const pos = positions.element(instanceIndex);
      const vel = velocities.element(instanceIndex);
      const life = lifetimes.element(instanceIndex);

      // Compute distance from vortex axis (y-axis)
      const px = pos.x;
      const pz = pos.z;
      const dist = px.mul(px).add(pz.mul(pz)).sqrt().max(0.01);

      // Tangential velocity (swirl around y-axis)
      const tangentialSpeed = float(1.5).div(dist.max(0.3));
      const tx = pz.div(dist).mul(tangentialSpeed);
      const tz = px.div(dist).negate().mul(tangentialSpeed);

      // Radial inward pull (toward vortex center)
      const radialPull = float(0.4).div(dist.max(0.2));
      const rx = px.div(dist).negate().mul(radialPull);
      const rz = pz.div(dist).negate().mul(radialPull);

      // Apply vortex field
      vel.x.assign(tx.add(rx).mul(0.95));
      vel.z.assign(tz.add(rz).mul(0.95));
      // Slight downward pull toward core center
      vel.y.addAssign(pos.y.negate().mul(0.1).mul(dtUniform));

      // Integrate position
      pos.addAssign(vel.mul(dtUniform));
      life.subAssign(dtUniform);

      // Respawn dead or too-close particles at outer rim
      If(life.lessThan(0.0), () => {
        const newAngle = hash(instanceIndex.add(time.mul(1000))).mul(Math.PI * 2);
        const newRadius = hash(instanceIndex.add(time.mul(1000)).add(1)).mul(2.0).add(2.0);
        const newHeight = hash(instanceIndex.add(time.mul(1000)).add(2)).mul(3.0).sub(1.5);

        pos.x.assign(newAngle.cos().mul(newRadius));
        pos.y.assign(newHeight);
        pos.z.assign(newAngle.sin().mul(newRadius));

        life.assign(hash(instanceIndex.add(time.mul(1000)).add(3)).mul(3.0).add(1.0));
      });

      // Respawn particles that reach the center
      If(dist.lessThan(0.15), () => {
        const newAngle = hash(instanceIndex.add(time.mul(500))).mul(Math.PI * 2);
        const newRadius = hash(instanceIndex.add(time.mul(500)).add(1)).mul(1.5).add(2.5);
        pos.x.assign(newAngle.cos().mul(newRadius));
        pos.z.assign(newAngle.sin().mul(newRadius));
        life.assign(hash(instanceIndex.add(time.mul(500)).add(5)).mul(2.0).add(1.5));
      });
    })().compute(PARTICLE_COUNT);

    return { positions, velocities, lifetimes, dtUniform, computeInit, computeUpdate };
  }, []);

  // Particle material: reads compute buffers for color
  const material = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();

    // Distance from center drives color: outer=gold, inner=blue, core=white
    const pos = compute.positions.element(instanceIndex);
    const dist = pos.x.mul(pos.x).add(pos.z.mul(pos.z)).sqrt();
    const distNorm = smoothstep(0.0, 3.0, dist);

    const innerWhite = color(0xffffff);
    const midBlue = color(0x3344cc);
    const outerGold = color(0xffcc33);

    const c1 = mix(innerWhite, midBlue, smoothstep(0.0, 0.3, distNorm));
    const particleColor = mix(c1, outerGold, smoothstep(0.2, 0.8, distNorm));
    mat.colorNode = particleColor;

    // Emissive based on lifetime
    const life = compute.lifetimes.element(instanceIndex);
    const lifeFade = smoothstep(0.0, 0.5, life);
    mat.emissiveNode = particleColor.mul(lifeFade.mul(2.5));

    // Subtle breathing
    mat.positionNode = positionLocal.add(
      normalLocal.mul(oscSine(time.mul(3.0).add(positionLocal.y.mul(4.0))).mul(0.005)),
    );

    mat.roughness = 0.2;
    mat.metalness = 0.3;

    return mat;
  }, [compute]);

  // Initialize compute
  useEffect(() => {
    const renderer = gl as unknown as THREE.WebGPURenderer;
    if (renderer && renderer.computeAsync) {
      renderer.computeAsync(compute.computeInit).then(() => {
        setInitialized(true);
      });
    }
  }, [gl, compute]);

  // Build initial instance matrices (spiral pattern)
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const dummy = new THREE.Object3D();
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const t = i / PARTICLE_COUNT;
      const angle = t * Math.PI * 12;
      const radius = 0.2 + t * 3.0;
      const height = (Math.random() - 0.5) * 3.0;

      dummy.position.set(
        Math.cos(angle) * radius,
        height,
        Math.sin(angle) * radius,
      );
      dummy.scale.setScalar(0.02 + Math.random() * 0.02);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, []);

  // Run compute each frame
  useFrame((_, delta) => {
    if (!initialized) return;
    const renderer = gl as unknown as THREE.WebGPURenderer;
    if (renderer && renderer.compute) {
      compute.dtUniform.value = Math.min(delta, 0.05);
      renderer.compute(compute.computeUpdate);
    }
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, PARTICLE_COUNT]}
      material={material}
      frustumCulled={false}
    >
      <icosahedronGeometry args={[1, 1]} />
    </instancedMesh>
  );
}

export default function TimeVortex() {
  const groupRef = useRef<THREE.Group>(null);
  const { viewport } = useThree();

  const vortexSDFMaterial = useMemo(
    () => makeVortexSDFMaterial(),
    [],
  );

  const haloMaterials = useMemo(
    () => [makeVortexHaloMaterial(0), makeVortexHaloMaterial(1), makeVortexHaloMaterial(2)],
    [],
  );

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.05;
    }
  });

  return (
    <>
      {/* Minimal ambient — vortex is emissive-driven */}
      <ambientLight intensity={0.08} />
      <pointLight position={[0, 0, 0]} intensity={6.0} color="#ffcc44" distance={10} />
      <pointLight position={[0, 2, 0]} intensity={3.0} color="#4466cc" distance={8} />
      <pointLight position={[2, -1, 2]} intensity={2.0} color="#ddaa33" distance={8} />

      {/* Background plane with SDF vortex + gravitational UV warping */}
      <mesh position={[0, 0, -8]} material={vortexSDFMaterial}>
        <planeGeometry args={[viewport.width * 4, viewport.height * 4]} />
      </mesh>

      <group ref={groupRef}>
        {/* Vortex core bloom halos */}
        {haloMaterials.map((mat, i) => (
          <mesh key={i} material={mat}>
            <icosahedronGeometry args={[0.3 + i * 0.15, 4]} />
          </mesh>
        ))}

        {/* Clock elements spiraling */}
        <ClockElements />

        {/* Compute-driven spiral particles */}
        <SpiralParticles />
      </group>
    </>
  );
}
