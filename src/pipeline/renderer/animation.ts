import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type * as THREE from 'three/webgpu';
import type { Animation } from '../spec/types';

interface AnimationState {
  startTime: number;
  initialized: boolean;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Evaluate an animation at the given elapsed time.
 * Returns the computed value for the property.
 */
function evaluateAnimation(
  anim: Animation,
  elapsed: number,
  delta: number,
  currentRotation: number,
): { value: number; newRotation: number } {
  const { type, speed, amplitude, range } = anim;
  let value = 0;
  let newRotation = currentRotation;

  switch (type) {
    case 'sine': {
      const raw = amplitude * Math.sin(elapsed * speed * Math.PI * 2);
      if (range) {
        // Remap from [-amplitude, amplitude] to [range[0], range[1]]
        const normalized = (raw / amplitude + 1) / 2; // 0..1
        value = lerp(range[0], range[1], normalized);
      } else {
        value = raw;
      }
      break;
    }

    case 'bounce': {
      value = amplitude * Math.abs(Math.sin(elapsed * speed * Math.PI));
      break;
    }

    case 'rotate': {
      // Accumulate rotation over time
      newRotation = currentRotation + delta * speed * amplitude;
      value = newRotation;
      break;
    }

    case 'sway': {
      value = amplitude * Math.sin(elapsed * speed * Math.PI * 2) * 0.5;
      break;
    }

    case 'pulse': {
      const t = (Math.sin(elapsed * speed * Math.PI * 2) + 1) / 2; // 0..1
      if (range) {
        value = lerp(range[0], range[1], t);
      } else {
        value = amplitude * t;
      }
      break;
    }

    case 'custom':
      // No-op, reserved for future use
      break;
  }

  return { value, newRotation };
}

/**
 * Apply a computed animation value to the appropriate property on a mesh or material.
 */
function applyValue(
  property: string,
  value: number,
  meshRef: React.RefObject<THREE.Mesh | THREE.InstancedMesh | THREE.Group | null>,
  materialRef: React.RefObject<THREE.MeshStandardNodeMaterial | null>,
): void {
  const mesh = meshRef.current;
  const material = materialRef.current;

  if (property.startsWith('transform.position.') && mesh) {
    const axis = property.split('.')[2] as 'x' | 'y' | 'z';
    if (axis === 'x' || axis === 'y' || axis === 'z') {
      mesh.position[axis] = value;
    }
  } else if (property.startsWith('transform.rotation.') && mesh) {
    const axis = property.split('.')[2] as 'x' | 'y' | 'z';
    if (axis === 'x' || axis === 'y' || axis === 'z') {
      mesh.rotation[axis] = value;
    }
  } else if (property === 'transform.scale' && mesh) {
    mesh.scale.setScalar(value);
  } else if (property === 'material.pbr.opacity' && material) {
    material.opacity = value;
    material.transparent = value < 1;
  } else if (property === 'material.pbr.emissive_intensity' && material) {
    material.emissiveIntensity = value;
  } else if (property === 'material.pbr.roughness' && material) {
    material.roughness = value;
  } else if (property === 'material.pbr.metalness' && material) {
    material.metalness = value;
  } else if (property === 'visibility' && mesh) {
    mesh.visible = value > 0.5;
  }
  // Unknown properties: silently ignore per spec
}

/**
 * Hook that drives animations via R3F's useFrame.
 * Evaluates all animations each frame and mutates the mesh/material refs.
 */
export function useAnimations(
  animations: Animation[] | undefined,
  meshRef: React.RefObject<THREE.Mesh | THREE.InstancedMesh | THREE.Group | null>,
  materialRef: React.RefObject<THREE.MeshStandardNodeMaterial | null>,
): void {
  // Track per-animation state (start time, accumulated rotation)
  const statesRef = useRef<AnimationState[]>([]);
  const rotationsRef = useRef<number[]>([]);

  useFrame((state, delta) => {
    if (!animations || animations.length === 0) return;

    const now = state.clock.getElapsedTime();

    // Initialize state arrays if needed
    if (statesRef.current.length !== animations.length) {
      statesRef.current = animations.map(() => ({ startTime: now, initialized: true }));
      rotationsRef.current = animations.map(() => 0);
    }

    for (let i = 0; i < animations.length; i++) {
      const anim = animations[i];
      const animState = statesRef.current[i];

      const elapsed = now - animState.startTime;

      // Handle delay
      if (elapsed < anim.delay) continue;

      const effectiveElapsed = elapsed - anim.delay;

      // Handle loop: false — freeze after one cycle
      if (!anim.loop) {
        const cycleDuration = 1 / anim.speed;
        if (effectiveElapsed > cycleDuration) {
          // Compute final value at cycle end
          const { value, newRotation } = evaluateAnimation(
            anim,
            cycleDuration,
            0,
            rotationsRef.current[i],
          );
          rotationsRef.current[i] = newRotation;
          applyValue(anim.property, value, meshRef, materialRef);
          continue;
        }
      }

      const { value, newRotation } = evaluateAnimation(
        anim,
        effectiveElapsed,
        delta,
        rotationsRef.current[i],
      );
      rotationsRef.current[i] = newRotation;
      applyValue(anim.property, value, meshRef, materialRef);
    }
  });
}
