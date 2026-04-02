import { useRef, useMemo, useState, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
  Fn,
  instancedArray,
  instanceIndex,
  uniform,
  float,
  vec3,
  hash,
  time,
  mix,
  smoothstep,
  positionLocal,
  normalWorld,
  cameraPosition,
  positionWorld,
  oscSine,
} from 'three/tsl';

/**
 * Aurora Cascade — Northern lights with compute-driven curtains and ground reflections
 *
 * Techniques combined (5):
 * 1. Compute shader for aurora curtain dynamics (wave propagation)
 * 2. Instanced mesh for curtain strips (1200 thin rectangles)
 * 3. Bloom halo shells for diffuse sky glow
 * 4. Y-flipped instanced mesh for ground reflections (proven in cyber-city)
 * 5. Multi-stop color gradient (green -> cyan -> purple -> pink)
 */

const STRIP_COUNT = 1200;

export default function AuroraCascade() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const reflectionRef = useRef<THREE.InstancedMesh>(null);
  const groupRef = useRef<THREE.Group>(null);
  const [initialized, setInitialized] = useState(false);
  const { gl } = useThree();

  // Compute resources: store per-strip height offset, sway, and brightness
  const compute = useMemo(() => {
    const heights = instancedArray(STRIP_COUNT, 'float');
    const sways = instancedArray(STRIP_COUNT, 'float');
    const brightnesses = instancedArray(STRIP_COUNT, 'float');

    const dtUniform = uniform(0);

    // Initialize: assign base values
    const computeInit = Fn(() => {
      const h = heights.element(instanceIndex);
      const s = sways.element(instanceIndex);
      const b = brightnesses.element(instanceIndex);

      h.assign(float(0));
      s.assign(float(0));
      b.assign(hash(instanceIndex).mul(0.5).add(0.5));
    })().compute(STRIP_COUNT);

    // Per-frame: propagate sine waves along curtain strips
    const computeUpdate = Fn(() => {
      const h = heights.element(instanceIndex);
      const s = sways.element(instanceIndex);
      const b = brightnesses.element(instanceIndex);

      const idx = float(instanceIndex);
      const t = time;

      // Per-strip phase offset using hash for variety
      const phase = hash(instanceIndex.mul(7)).mul(Math.PI * 2);
      const phase2 = hash(instanceIndex.mul(13).add(3)).mul(Math.PI * 2);

      // Wave propagation: multiple sine waves at different frequencies
      // Propagate along the curtain index to create wave-like motion
      const wave1 = idx.mul(0.05).add(t.mul(0.8)).add(phase).sin().mul(0.6);
      const wave2 = idx.mul(0.02).add(t.mul(0.3)).add(phase2).sin().mul(0.4);
      const wave3 = idx.mul(0.08).add(t.mul(1.2)).sin().mul(0.2);

      // Height variation: curtain height oscillates
      h.assign(wave1.add(wave2).add(wave3));

      // Horizontal sway
      const sway1 = idx.mul(0.03).add(t.mul(0.5)).add(phase.mul(0.7)).sin().mul(0.15);
      const sway2 = idx.mul(0.07).add(t.mul(0.9)).sin().mul(0.08);
      s.assign(sway1.add(sway2));

      // Brightness pulsing: slow overall + per-strip variation
      const baseBright = t.mul(0.4).add(phase).sin().mul(0.3).add(0.7);
      const localPulse = t.mul(1.5).add(idx.mul(0.1)).sin().mul(0.2).add(0.8);
      b.assign(baseBright.mul(localPulse).clamp(0.2, 1.0));
    })().compute(STRIP_COUNT);

    return { heights, sways, brightnesses, dtUniform, computeInit, computeUpdate };
  }, []);

  // Aurora material: additive, very low opacity, 5-stop color gradient
  const auroraMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();

    // Per-strip data from compute buffers
    const brightness = compute.brightnesses.element(instanceIndex);

    // 5-stop color gradient based on hash(positionWorld) for per-strip phase
    const colorFn = Fn(() => {
      // Use local Y position normalized to 0..1 for vertical gradient within each strip
      const verticalT = positionLocal.y.add(0.5); // strips are 1 unit tall, center at 0

      // 5-stop: green -> cyan -> blue -> purple -> pink
      const green = vec3(0.1, 1.0, 0.3);
      const cyan = vec3(0.0, 0.9, 0.8);
      const blue = vec3(0.15, 0.3, 0.9);
      const purple = vec3(0.5, 0.1, 0.8);
      const pink = vec3(0.9, 0.2, 0.6);

      // Per-strip color shift using hash for variety
      const stripPhase = hash(positionWorld.x.mul(5.3).add(positionWorld.z.mul(11.7)));
      const shiftedT = verticalT.add(stripPhase.mul(0.3)).clamp(0.0, 1.0);

      const c1 = mix(green, cyan, smoothstep(0.0, 0.25, shiftedT));
      const c2 = mix(c1, blue, smoothstep(0.2, 0.45, shiftedT));
      const c3 = mix(c2, purple, smoothstep(0.4, 0.7, shiftedT));
      const c4 = mix(c3, pink, smoothstep(0.65, 0.95, shiftedT));

      return c4;
    });

    const auroraColor = colorFn();
    mat.colorNode = auroraColor;

    // Emissive: strong self-glow modulated by compute brightness
    mat.emissiveNode = auroraColor.mul(brightness.mul(2.5));

    // Very low opacity for ethereal curtain look
    mat.transparent = true;
    mat.opacityNode = brightness.mul(0.08);
    mat.blending = THREE.AdditiveBlending;
    mat.depthWrite = false;
    mat.side = THREE.BackSide;
    mat.roughness = 1.0;
    mat.metalness = 0.0;

    return mat;
  }, [compute]);

  // Reflection material: dimmer version
  const reflectionMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();

    const brightness = compute.brightnesses.element(instanceIndex);

    const colorFn = Fn(() => {
      const verticalT = float(1.0).sub(positionLocal.y.add(0.5)); // flipped gradient
      const stripPhase = hash(positionWorld.x.mul(5.3).add(positionWorld.z.mul(11.7)));
      const shiftedT = verticalT.add(stripPhase.mul(0.3)).clamp(0.0, 1.0);

      const green = vec3(0.1, 1.0, 0.3);
      const cyan = vec3(0.0, 0.9, 0.8);
      const blue = vec3(0.15, 0.3, 0.9);
      const purple = vec3(0.5, 0.1, 0.8);
      const pink = vec3(0.9, 0.2, 0.6);

      const c1 = mix(green, cyan, smoothstep(0.0, 0.25, shiftedT));
      const c2 = mix(c1, blue, smoothstep(0.2, 0.45, shiftedT));
      const c3 = mix(c2, purple, smoothstep(0.4, 0.7, shiftedT));
      const c4 = mix(c3, pink, smoothstep(0.65, 0.95, shiftedT));

      return c4;
    });

    const reflColor = colorFn();
    mat.colorNode = reflColor;
    mat.emissiveNode = reflColor.mul(brightness.mul(0.8));

    mat.transparent = true;
    mat.opacityNode = brightness.mul(0.03);
    mat.blending = THREE.AdditiveBlending;
    mat.depthWrite = false;
    mat.side = THREE.BackSide;
    mat.roughness = 1.0;
    mat.metalness = 0.0;

    return mat;
  }, [compute]);

  // Ground material: dark reflective surface
  const groundMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.colorNode = vec3(0.005, 0.01, 0.015);
    mat.metalnessNode = float(0.95);
    mat.roughnessNode = float(0.1);
    return mat;
  }, []);

  // Sky dome material
  const skyMaterial = useMemo(() => {
    const mat = new THREE.MeshBasicNodeMaterial();
    const skyColor = Fn(() => {
      const py = positionLocal.y.div(25.0).add(0.5).clamp(0.0, 1.0);
      const bottom = vec3(0.005, 0.005, 0.02);
      const mid = vec3(0.01, 0.02, 0.05);
      const top = vec3(0.0, 0.005, 0.015);
      const c = mix(bottom, mid, smoothstep(0.0, 0.4, py));
      return mix(c, top, smoothstep(0.4, 1.0, py));
    });
    mat.colorNode = skyColor();
    mat.side = THREE.BackSide;
    return mat;
  }, []);

  // Initialize compute
  useEffect(() => {
    const renderer = gl as unknown as THREE.WebGPURenderer;
    if (renderer && renderer.computeAsync) {
      renderer.computeAsync(compute.computeInit).then(() => {
        setInitialized(true);
      });
    }
  }, [gl, compute]);

  // Set initial instance matrices: thin vertical strips arranged in curtain arcs
  useEffect(() => {
    const mesh = meshRef.current;
    const reflMesh = reflectionRef.current;
    if (!mesh || !reflMesh) return;

    const dummy = new THREE.Object3D();

    for (let i = 0; i < STRIP_COUNT; i++) {
      const t = i / STRIP_COUNT;

      // Multiple curtain arcs across the sky
      const curtainIdx = Math.floor(t * 5); // 5 curtain bands
      const localT = (t * 5) % 1; // position along each curtain

      // Each curtain is an arc across the sky
      const arcAngle = (localT - 0.5) * Math.PI * 0.8; // spread across 144 degrees
      const arcRadius = 3.0 + curtainIdx * 1.2; // staggered depth
      const x = Math.sin(arcAngle) * arcRadius;
      const z = -Math.cos(arcAngle) * arcRadius + 2.0; // push back from camera

      // Height: base at 1.5, strips extend upward
      const baseHeight = 1.5 + Math.random() * 0.5;
      const stripHeight = 1.5 + Math.random() * 1.5; // variable height strips

      // Thin width for curtain look
      const stripWidth = 0.015 + Math.random() * 0.02;

      // Main aurora strip
      dummy.position.set(x, baseHeight + stripHeight / 2, z);
      dummy.scale.set(stripWidth, stripHeight, 0.01);
      // Face slightly toward camera with some variation
      dummy.rotation.set(0, arcAngle * 0.3, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      // Reflection: Y-flipped below ground plane
      dummy.position.set(x, -(baseHeight + stripHeight / 2), z);
      dummy.updateMatrix();
      reflMesh.setMatrixAt(i, dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
    reflMesh.instanceMatrix.needsUpdate = true;
  }, []);

  // Per-frame: run compute, slow rotation
  useFrame((_, delta) => {
    if (!initialized) return;

    const dt = Math.min(delta, 0.03);
    compute.dtUniform.value = dt;

    const renderer = gl as unknown as THREE.WebGPURenderer;
    if (renderer && renderer.compute) {
      renderer.compute(compute.computeUpdate);
    }

    // Very slow rotation
    if (groupRef.current) {
      groupRef.current.rotation.y += dt * 0.03;
    }
  });

  // Starfield: small scattered points
  const starData = useMemo(() => {
    const positions: [number, number, number][] = [];
    for (let i = 0; i < 200; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.5; // upper hemisphere
      const r = 15 + Math.random() * 10;
      positions.push([
        Math.sin(phi) * Math.cos(theta) * r,
        Math.cos(phi) * r * 0.8 + 2,
        Math.sin(phi) * Math.sin(theta) * r,
      ]);
    }
    return positions;
  }, []);

  const starMaterial = useMemo(() => {
    const mat = new THREE.MeshBasicNodeMaterial();
    const pulse = oscSine(time.mul(0.3).add(hash(positionWorld.x.mul(31.7)))).mul(0.3).add(0.7);
    mat.colorNode = vec3(0.8, 0.85, 1.0).mul(pulse);
    return mat;
  }, []);

  return (
    <>

      <fogExp2 attach="fog" color="#020408" density={0.04} />
      {/* Sky dome */}
      <mesh>
        <sphereGeometry args={[30, 16, 16]} />
        <primitive object={skyMaterial} attach="material" />
      </mesh>

      {/* Minimal lighting - emissive-driven scene */}
      <ambientLight intensity={0.1} />
      <hemisphereLight args={['#334433', '#112211', 0.3]} />
      <directionalLight position={[0, 5, 3]} intensity={0.05} />

      {/* Aurora-colored point lights for scene tinting */}
      <pointLight position={[0, 4, -2]} intensity={3.0} color="#00ff88" distance={15} />
      <pointLight position={[-3, 3, -4]} intensity={2.0} color="#8800ff" distance={12} />
      <pointLight position={[3, 3, -4]} intensity={2.0} color="#00ccff" distance={12} />
      <pointLight position={[0, 5, -6]} intensity={1.5} color="#ff44aa" distance={10} />

      <group ref={groupRef}>
        {/* Aurora curtain strips */}
        <instancedMesh
          ref={meshRef}
          args={[undefined, undefined, STRIP_COUNT]}
          material={auroraMaterial}
          frustumCulled={false}
        >
          <planeGeometry args={[1, 1]} />
        </instancedMesh>

        {/* Ground reflection of aurora (Y-flipped) */}
        <instancedMesh
          ref={reflectionRef}
          args={[undefined, undefined, STRIP_COUNT]}
          material={reflectionMaterial}
          frustumCulled={false}
        >
          <planeGeometry args={[1, 1]} />
        </instancedMesh>

        {/* Dark ground plane */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
          <planeGeometry args={[60, 60]} />
          <primitive object={groundMaterial} attach="material" />
        </mesh>

        {/* Starfield */}
        {starData.map((pos, i) => (
          <mesh key={i} position={pos}>
            <icosahedronGeometry args={[0.03 + Math.random() * 0.02, 0]} />
            <primitive object={starMaterial} attach="material" />
          </mesh>
        ))}

        {/* Bloom halo shells for diffuse sky glow */}
        <AuroraHalo />
      </group>
    </>
  );
}

/** Bloom halo shells creating diffuse sky glow above aurora */
function AuroraHalo() {
  const haloMats = useMemo(() => {
    return [0, 1, 2].map((layer) => {
      const mat = new THREE.MeshStandardNodeMaterial();
      mat.transparent = true;
      mat.side = THREE.BackSide;
      mat.depthWrite = false;
      mat.blending = THREE.AdditiveBlending;

      const layerFade = float(1.0).sub(float(layer).mul(0.2));
      const pulse = oscSine(time.mul(0.3).add(float(layer).mul(1.5))).mul(0.15).add(0.85);

      const fresnel = Fn(() => {
        const viewDir = cameraPosition.sub(positionWorld).normalize();
        const nDotV = normalWorld.dot(viewDir).saturate();
        return float(1.0).sub(nDotV).pow(float(1.5).add(float(layer).mul(0.5)));
      });

      // Aurora-colored halo: green-cyan blend
      const haloColor = mix(
        vec3(0.1, 0.8, 0.3),
        vec3(0.0, 0.6, 0.8),
        float(layer).div(2.0),
      );

      mat.opacityNode = fresnel().mul(pulse).mul(layerFade).mul(0.04);
      mat.colorNode = haloColor;
      mat.emissiveNode = haloColor.mul(fresnel().mul(pulse).mul(layerFade).mul(1.5));
      mat.roughness = 0.0;
      mat.metalness = 0.0;

      return mat;
    });
  }, []);

  const scales: [number, number, number][] = [
    [6, 4, 6],
    [8, 5, 8],
    [11, 7, 11],
  ];

  return (
    <group position={[0, 3, -3]}>
      {haloMats.map((mat, i) => (
        <mesh key={i} material={mat} scale={scales[i]}>
          <icosahedronGeometry args={[1, 3]} />
        </mesh>
      ))}
    </group>
  );
}
