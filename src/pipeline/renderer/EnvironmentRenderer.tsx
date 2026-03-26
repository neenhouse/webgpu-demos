/* eslint-disable react-hooks/immutability */
import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import type { Environment, Light } from '../spec/types';

interface EnvironmentRendererProps {
  environment: Environment;
}

function LightRenderer({ light, index }: { light: Light; index: number }) {
  const lightColor = light.color ?? '#ffffff';
  const lightIntensity = light.intensity ?? 1.0;

  const dirTargetRef = useRef<THREE.Group>(null);
  const dirLightRef = useRef<THREE.DirectionalLight>(null);
  const spotTargetRef = useRef<THREE.Group>(null);
  const spotLightRef = useRef<THREE.SpotLight>(null);

  useEffect(() => {
    if (light.type === 'directional' && dirLightRef.current && dirTargetRef.current && light.target) {
      dirTargetRef.current.position.set(...light.target);
      dirLightRef.current.target = dirTargetRef.current as unknown as THREE.Object3D;
    }
  }, [light]);

  useEffect(() => {
    if (light.type === 'spot' && spotLightRef.current && spotTargetRef.current && light.target) {
      spotTargetRef.current.position.set(...light.target);
      spotLightRef.current.target = spotTargetRef.current as unknown as THREE.Object3D;
    }
  }, [light]);

  switch (light.type) {
    case 'directional':
      return (
        <group key={index}>
          <directionalLight
            ref={dirLightRef}
            position={light.position ?? [0, 5, 0]}
            color={lightColor}
            intensity={lightIntensity}
            castShadow={light.castShadow}
          />
          {light.target && <group ref={dirTargetRef} />}
        </group>
      );

    case 'point':
      return (
        <pointLight
          key={index}
          position={light.position ?? [0, 5, 0]}
          color={lightColor}
          intensity={lightIntensity}
          distance={light.distance}
          castShadow={light.castShadow}
        />
      );

    case 'spot': {
      const angleRad = light.angle !== undefined ? (light.angle * Math.PI) / 180 : Math.PI / 6;
      return (
        <group key={index}>
          <spotLight
            ref={spotLightRef}
            position={light.position ?? [0, 5, 0]}
            color={lightColor}
            intensity={lightIntensity}
            angle={angleRad}
            distance={light.distance}
            castShadow={light.castShadow}
          />
          {light.target && <group ref={spotTargetRef} />}
        </group>
      );
    }

    case 'hemisphere':
      return (
        <hemisphereLight
          key={index}
          color={lightColor}
          groundColor="#444444"
          intensity={lightIntensity}
        />
      );

    default:
      return null;
  }
}

export default function EnvironmentRenderer({ environment }: EnvironmentRendererProps) {
  const scene = useThree((state) => state.scene);

  useEffect(() => {
    // Background color
    if (environment.background && environment.background !== 'transparent') {
      scene.background = new THREE.Color(environment.background);
    } else {
      scene.background = null;
    }

    // Fog
    if (environment.fog) {
      const fog = environment.fog;
      if (fog.type === 'linear') {
        scene.fog = new THREE.Fog(fog.color, fog.near ?? 10, fog.far ?? 50);
      } else if (fog.type === 'exponential') {
        scene.fog = new THREE.FogExp2(fog.color, fog.density ?? 0.1);
      }
    } else {
      scene.fog = null;
    }

    return () => {
      // Clean up on unmount
      scene.background = null;
      scene.fog = null;
    };
  }, [environment, scene]);

  return (
    <>
      {/* Ambient light */}
      <ambientLight
        color={environment.ambient.color}
        intensity={environment.ambient.intensity}
      />

      {/* Lights array */}
      {environment.lights.map((light, index) => (
        <LightRenderer key={index} light={light} index={index} />
      ))}
    </>
  );
}
