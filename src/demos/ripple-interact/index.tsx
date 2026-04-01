import { useRef, useMemo, useEffect, useCallback } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
  color, time, normalWorld, cameraPosition, positionWorld,
  positionLocal, normalLocal, Fn, float, uniform, vec3, mix,
  smoothstep, sin,
} from 'three/tsl';

/**
 * Ripple Interact — Click to create expanding wave ripples on a plane
 *
 * Techniques:
 * - Click anywhere on a displaced plane to add a ripple source
 * - positionNode displacement driven by up to 10 ripple uniforms
 * - Each ripple has: center (vec3), startTime (float), amplitude (float)
 * - Ripples decay over 3 seconds using elapsed time since click
 * - Color shifts at ripple crests via colorNode
 * - Multiple simultaneous ripples create interference patterns
 * - Max 10 active ripples, oldest removed when full
 */

const MAX_RIPPLES = 10;
const RIPPLE_DURATION = 3.0;
const RIPPLE_SPEED = 1.5;
const RIPPLE_WAVELENGTH = 0.6;
const PLANE_SEGS = 80;

interface RippleSource {
  center: THREE.Vector3;
  startTime: number;
}

export default function RippleInteract() {
  const { gl, camera } = useThree();
  const planeRef = useRef<THREE.Mesh>(null);
  const raycaster = useRef(new THREE.Raycaster());
  const ripples = useRef<RippleSource[]>([]);
  const currentTime = useRef(0);

  // Create uniforms for each ripple slot
  const rippleUniforms = useMemo(() => {
    return Array.from({ length: MAX_RIPPLES }, () => ({
      center: uniform(new THREE.Vector3(999, 999, 999)),
      startTime: uniform(-999.0),
      active: uniform(0.0),
    }));
  }, []);

  const waterMat = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.roughness = 0.1;
    mat.metalness = 0.6;
    mat.side = THREE.DoubleSide;

    // Build displacement from all ripple uniforms
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const computeDisplacement = Fn((): any => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let totalDisp: any = float(0.0);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let totalCrestFactor: any = float(0.0);

      for (let i = 0; i < MAX_RIPPLES; i++) {
        const center = rippleUniforms[i].center;
        const startT = rippleUniforms[i].startTime;
        const elapsed = time.sub(startT);
        const active = rippleUniforms[i].active;

        // Distance from vertex to ripple center (in XZ plane)
        const dx = positionLocal.x.sub(center.x);
        const dz = positionLocal.z.sub(center.z);
        const dist = Fn(() => {
          const d2 = dx.mul(dx).add(dz.mul(dz));
          return d2.sqrt();
        })();

        // Radial wave front
        const waveFront = dist.sub(elapsed.mul(RIPPLE_SPEED));
        const wave = sin(waveFront.mul(float(Math.PI * 2 / RIPPLE_WAVELENGTH)));

        // Envelope: gaussian decay around wave front + time decay
        const frontDist = waveFront.abs();
        const frontEnvelope = smoothstep(float(0.6), float(0.0), frontDist);
        const timeDecay = smoothstep(float(RIPPLE_DURATION), float(0.0), elapsed);
        const distDecay = smoothstep(float(8.0), float(0.5), dist);

        const rippleDisp = wave.mul(frontEnvelope).mul(timeDecay).mul(distDecay).mul(float(0.25)).mul(active);
        totalDisp = totalDisp.add(rippleDisp);

        // Crest factor for coloring
        const crest = wave.mul(float(0.5)).add(float(0.5));
        totalCrestFactor = totalCrestFactor.add(crest.mul(frontEnvelope).mul(timeDecay).mul(distDecay).mul(active));
      }

      return { disp: totalDisp, crest: totalCrestFactor };
    });

    const dispResult = computeDisplacement();
    const disp = dispResult.disp;
    const crest = dispResult.crest;

    // Apply displacement along Y (up)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mat.positionNode = positionLocal.add(vec3(float(0.0), disp as any, float(0.0)));

    // Recompute normal direction from displacement gradient
    mat.normalNode = normalLocal;

    // Color: deep water blue, shifts toward cyan/white at crests
    const baseWater = color(0x062030);
    const crestColor = color(0x44ddff);
    const whiteTop = color(0xaaffff);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const crestNorm: any = crest.div(float(MAX_RIPPLES)).saturate();
    mat.colorNode = mix(baseWater, mix(crestColor, whiteTop, crestNorm), crestNorm.mul(float(3.0)).saturate());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const emissiveAdd = mix(color(0x000000), color(0x22aacc), crestNorm.mul(float(2.0)).saturate()).mul(float(0.8)) as any;
    mat.emissiveNode = color(0x0a3050).add(emissiveAdd);

    // Fresnel for water surface look
    const fresnel = Fn(() => {
      const viewDir = cameraPosition.sub(positionWorld).normalize();
      const nDotV = normalWorld.dot(viewDir).saturate();
      return float(1.0).sub(nDotV).pow(4.0);
    });
    mat.opacityNode = float(0.85).add(fresnel().mul(float(0.15)));
    mat.transparent = true;

    return mat;
  }, [rippleUniforms]);

  const handleClick = useCallback((e: MouseEvent) => {
    const rect = (gl.domElement as HTMLCanvasElement).getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.current.setFromCamera(new THREE.Vector2(x, y), camera);

    if (planeRef.current) {
      const hits = raycaster.current.intersectObject(planeRef.current);
      if (hits.length > 0) {
        const pt = hits[0].point;

        // Add or replace oldest ripple
        if (ripples.current.length >= MAX_RIPPLES) {
          ripples.current.shift();
        }
        const idx = ripples.current.length;
        ripples.current.push({ center: pt.clone(), startTime: currentTime.current });

        // Update uniform
        const slot = idx % MAX_RIPPLES;
        rippleUniforms[slot].center.value = pt.clone();
        rippleUniforms[slot].startTime.value = currentTime.current;
        rippleUniforms[slot].active.value = 1.0;
      }
    }
  }, [gl, camera, rippleUniforms]);

  useEffect(() => {
    const canvas = gl.domElement as HTMLCanvasElement;
    canvas.addEventListener('click', handleClick);
    return () => canvas.removeEventListener('click', handleClick);
  }, [gl, handleClick]);

  useFrame((_, delta) => {
    currentTime.current += delta;

    // Deactivate expired ripples
    for (let i = 0; i < MAX_RIPPLES; i++) {
      const elapsed = currentTime.current - (rippleUniforms[i].startTime.value as number);
      if (elapsed > RIPPLE_DURATION + 0.5) {
        rippleUniforms[i].active.value = 0.0;
      }
    }
  });

  const gridMat = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.roughness = 0.9;
    mat.metalness = 0.1;
    mat.colorNode = color(0x040810);
    mat.emissiveNode = color(0x0a2030).mul(float(0.3));
    return mat;
  }, []);

  return (
    <>
      {/* Background atmosphere */}
      <mesh>
        <sphereGeometry args={[30, 16, 8]} />
        <meshBasicMaterial side={THREE.BackSide} color="#020810" />
      </mesh>

      <color attach="background" args={['#020810']} />
      <ambientLight intensity={0.1} />
      <hemisphereLight args={['#112244', '#020810', 0.5]} />
      <directionalLight position={[3, 8, 3]} intensity={0.5} />
      <pointLight position={[0, 3, 0]} intensity={30} color="#44aaff" distance={12} />
      <pointLight position={[-3, 1, -3]} intensity={15} color="#0066cc" distance={8} />

      {/* Water plane */}
      <mesh ref={planeRef} material={waterMat} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[12, 12, PLANE_SEGS, PLANE_SEGS]} />
      </mesh>

      {/* Underwater grid glow */}
      <mesh position={[0, -0.15, 0]} rotation={[-Math.PI / 2, 0, 0]} material={gridMat}>
        <planeGeometry args={[12, 12]} />
      </mesh>

      {/* Atmosphere spheres */}
      <mesh position={[0, -0.5, 0]} scale={[7, 0.1, 7]}>
        <sphereGeometry args={[1, 16, 8]} />
        <meshBasicMaterial color="#001020" transparent opacity={0.6} />
      </mesh>

      {/* Floating hint particles */}
      {Array.from({ length: 12 }, (_, i) => {
        const angle = (i / 12) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(angle) * 5.5, 0.1, Math.sin(angle) * 5.5]}>
            <sphereGeometry args={[0.04, 6, 6]} />
            <meshBasicMaterial color="#44aaff" transparent opacity={0.4} />
          </mesh>
        );
      })}
    </>
  );
}
