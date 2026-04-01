import { useRef, useMemo, useState, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
  color, time, oscSine, normalWorld, cameraPosition, positionWorld,
  positionLocal, normalLocal, Fn, float, uniform, vec3, mix, smoothstep,
} from 'three/tsl';

/**
 * Hover Morph — Sphere that morphs based on pointer proximity
 *
 * Techniques:
 * - Raycasting to get intersection point on the sphere
 * - Vertex displacement via positionNode: vertices near hit point bulge outward
 * - TSL uniform for hit point — updated each frame from CPU
 * - Color shifts around the deformation zone
 * - Smooth falloff using smoothstep in TSL
 * - BackSide atmosphere shell around main sphere
 * - Organic pulsing baseline animation
 */

const SPHERE_SEGMENTS = 64;
const MORPH_RADIUS = 0.8;

export default function HoverMorph() {
  const meshRef = useRef<THREE.Mesh>(null);
  const { gl, camera } = useThree();
  const raycaster = useRef(new THREE.Raycaster());
  const hitPoint = useRef(new THREE.Vector3(0, 0, 1.5));
  const isHovering = useRef(false);

  const hitPointUniform = useMemo(() => uniform(new THREE.Vector3(0, 0, 0)), []);
  const morphStrengthUniform = useMemo(() => uniform(0.0), []);
  const morphRadiusUniform = useMemo(() => uniform(MORPH_RADIUS), []);

  const sphereMat = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.roughness = 0.1;
    mat.metalness = 0.4;

    // Displacement: vertices near hitPoint bulge outward
    const worldPos = positionWorld;
    const toHit = worldPos.sub(hitPointUniform);
    const dist = toHit.length();

    // Smooth falloff within morphRadius
    const falloff = smoothstep(morphRadiusUniform, float(0.0), dist);
    const strength = falloff.mul(morphStrengthUniform).mul(float(0.6));

    // Displace along normal
    const displacement = normalLocal.mul(strength);
    mat.positionNode = positionLocal.add(displacement);

    // Base breathing animation
    const breathe = oscSine(time.mul(0.8)).mul(0.03);
    mat.positionNode = positionLocal.add(displacement).add(normalLocal.mul(breathe));

    // Color: shifts toward emissive color near deformation zone
    const baseColor = vec3(0.05, 0.1, 0.3);
    const deformColor = vec3(1.0, 0.4, 0.1);
    const fresnel = Fn(() => {
      const viewDir = cameraPosition.sub(positionWorld).normalize();
      const nDotV = normalWorld.dot(viewDir).saturate();
      return float(1.0).sub(nDotV).pow(2.5);
    });

    mat.colorNode = mix(color(0x0a1840), color(0xff6620), falloff.mul(float(0.8)));
    mat.emissiveNode = Fn(() => {
      const deformGlow = color(0xff8844).mul(falloff.mul(morphStrengthUniform).mul(float(2.0)));
      const rimGlow = color(0x4488ff).mul(fresnel().mul(float(0.8)));
      return deformGlow.add(rimGlow);
    })();

    return mat;
  }, [hitPointUniform, morphStrengthUniform, morphRadiusUniform]);

  const haloMat = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.transparent = true;
    mat.side = THREE.BackSide;
    mat.depthWrite = false;
    mat.blending = THREE.AdditiveBlending;
    const fresnel = Fn(() => {
      const viewDir = cameraPosition.sub(positionWorld).normalize();
      const nDotV = normalWorld.dot(viewDir).saturate();
      return float(1.0).sub(nDotV).pow(2.0);
    });
    const pulse = oscSine(time.mul(0.8)).mul(0.2).add(0.8);
    mat.emissiveNode = color(0x4488ff).mul(fresnel().mul(pulse.mul(1.5)));
    mat.opacityNode = fresnel().mul(float(0.5));
    return mat;
  }, []);

  const handlePointerMove = (e: React.PointerEvent) => {
    const rect = (gl.domElement as HTMLCanvasElement).getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.current.setFromCamera({ x, y }, camera);

    if (meshRef.current) {
      const hits = raycaster.current.intersectObject(meshRef.current);
      if (hits.length > 0) {
        hitPoint.current.copy(hits[0].point);
        isHovering.current = true;
      } else {
        isHovering.current = false;
      }
    }
  };

  const handlePointerLeave = () => {
    isHovering.current = false;
  };

  useEffect(() => {
    const canvas = gl.domElement as HTMLCanvasElement;
    canvas.addEventListener('pointermove', handlePointerMove as unknown as EventListener);
    canvas.addEventListener('pointerleave', handlePointerLeave);
    return () => {
      canvas.removeEventListener('pointermove', handlePointerMove as unknown as EventListener);
      canvas.removeEventListener('pointerleave', handlePointerLeave);
    };
  }, [gl, camera]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.033);

    if (isHovering.current) {
      // Lerp hit point uniform toward actual hit point
      (hitPointUniform.value as THREE.Vector3).lerp(hitPoint.current, 0.15);
      morphStrengthUniform.value = Math.min(1.0, (morphStrengthUniform.value as number) + dt * 3);
    } else {
      morphStrengthUniform.value = Math.max(0.0, (morphStrengthUniform.value as number) - dt * 2);
    }
  });

  return (
    <>
      {/* Background atmosphere */}
      <mesh>
        <sphereGeometry args={[30, 16, 8]} />
        <meshBasicMaterial side={THREE.BackSide} color="#020814" />
      </mesh>

      <color attach="background" args={['#020814']} />
      <ambientLight intensity={0.08} />
      <hemisphereLight args={['#112244', '#020814', 0.4]} />
      <directionalLight position={[4, 6, 4]} intensity={0.6} />
      <pointLight position={[0, 3, 2]} intensity={20} color="#4488ff" distance={8} />
      <pointLight position={[-3, -2, 2]} intensity={10} color="#ff4422" distance={8} />

      {/* Main morphing sphere */}
      <mesh ref={meshRef} material={sphereMat}>
        <sphereGeometry args={[1.2, SPHERE_SEGMENTS, SPHERE_SEGMENTS]} />
      </mesh>

      {/* Outer halo shell */}
      <mesh material={haloMat} scale={[1.5, 1.5, 1.5]}>
        <sphereGeometry args={[1.2, 32, 32]} />
      </mesh>

      {/* Hit point indicator */}
      <mesh position={[0, 0, 0]} scale={[0.05, 0.05, 0.05]}>
        <sphereGeometry args={[1, 8, 8]} />
        <meshBasicMaterial color="#ff8844" />
      </mesh>

      {/* Floating orbital particles */}
      {Array.from({ length: 8 }, (_, i) => {
        const angle = (i / 8) * Math.PI * 2;
        const r = 1.9;
        return (
          <mesh key={i} position={[Math.cos(angle) * r, Math.sin(angle * 0.7) * 0.4, Math.sin(angle) * r]}>
            <sphereGeometry args={[0.04, 8, 8]} />
            <meshBasicMaterial color={new THREE.Color().setHSL(i / 8, 1, 0.7)} />
          </mesh>
        );
      })}
    </>
  );
}
