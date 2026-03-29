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
  vec4,
  mix,
  screenUV,
  floor,
  hash,
  max,
  min,
} from 'three/tsl';

/**
 * Frost Patterns — DLA ice crystal formation on glass with branching structures
 *
 * 256x256 grid in instancedArray (frozen/unfrozen state).
 * Compute DLA: random walkers freeze on contact with existing ice.
 * Seeds at edges.
 * Render on viewport plane: frozen=white/cyan, unfrozen=dark blue transparent.
 * Frost shimmer via time-modulated emissive.
 * Warm orange gradient background behind glass.
 *
 * Techniques: DLA compute simulation, 2D grid rendering, animated frost shimmer.
 */

const WIDTH = 256;
const TOTAL = WIDTH * WIDTH;
const WALKERS = 64;

export default function FrostPatterns() {
  const { viewport, gl } = useThree();
  const [initialized, setInitialized] = useState(false);
  const totalTimeRef = useRef(0);
  const frameCount = useRef(0);

  const compute = useMemo(() => {
    // 0 = unfrozen, 1 = frozen
    const gridA = instancedArray(TOTAL, 'float');
    const gridB = instancedArray(TOTAL, 'float');
    // Walker positions (x, y, active)
    const walkerPos = instancedArray(WALKERS, 'vec3'); // x, y, active

    const timU = uniform(0.0);
    const frameU = uniform(0.0);
    const w = float(WIDTH);

    // Init: seed edges frozen, walkers random
    const computeInit = Fn(() => {
      const idx = float(instanceIndex);
      const gx = idx.mod(w);
      const gy = floor(idx.div(w));

      // Freeze edges (border seeds)
      const isBorder = gx.lessThan(float(2)).or(gx.greaterThan(w.sub(3)))
        .or(gy.lessThan(float(2)).or(gy.greaterThan(w.sub(3))));
      If(isBorder, () => {
        gridA.element(instanceIndex).assign(float(1.0));
        gridB.element(instanceIndex).assign(float(1.0));
      });

      // Inner: unfrozen
      If(isBorder.not(), () => {
        gridA.element(instanceIndex).assign(float(0.0));
        gridB.element(instanceIndex).assign(float(0.0));
      });
    })().compute(TOTAL);

    // Init walkers
    const computeInitWalkers = Fn(() => {
      const pos = walkerPos.element(instanceIndex);
      const seed = float(instanceIndex).mul(17.37);
      pos.x.assign(hash(seed).mul(w.sub(4.0)).add(2.0));
      pos.y.assign(hash(seed.add(7.13)).mul(w.sub(4.0)).add(2.0));
      pos.z.assign(float(1.0)); // active
    })().compute(WALKERS);

    // DLA step: move walkers, freeze on contact
    const computeDLA = Fn(() => {
      const pos = walkerPos.element(instanceIndex);

      // Only process active walkers
      If(pos.z.greaterThan(0.5), () => {
        const ix = int(pos.x.round().clamp(float(1), w.sub(2)));
        const iy = int(pos.y.round().clamp(float(1), w.sub(2)));
        const cellIdx = int(iy).mul(WIDTH).add(int(ix));

        // Check if any neighbor is frozen
        const nL = gridA.element(max(cellIdx.sub(1).toFloat(), 0).toInt());
        const nR = gridA.element(min(cellIdx.add(1).toFloat(), float(TOTAL - 1)).toInt());
        const nU = gridA.element(max(cellIdx.sub(WIDTH).toFloat(), 0).toInt());
        const nD = gridA.element(min(cellIdx.add(WIDTH).toFloat(), float(TOTAL - 1)).toInt());
        const hasNeighbor = nL.add(nR).add(nU).add(nD).greaterThan(0.5);

        If(hasNeighbor, () => {
          // Freeze this cell
          gridA.element(cellIdx).assign(float(1.0));
          // Respawn walker at random position
          const seed = float(instanceIndex).mul(frameU.add(1.0).mul(13.7));
          pos.x.assign(hash(seed).mul(w.sub(8.0)).add(4.0));
          pos.y.assign(hash(seed.add(5.3)).mul(w.sub(8.0)).add(4.0));
        });

        If(hasNeighbor.not(), () => {
          // Random walk step
          const dir = hash(float(instanceIndex).mul(frameU.mul(7.3).add(13.1))).mul(4.0).floor();
          If(dir.lessThan(float(1.0)), () => { pos.x.subAssign(1.0); });
          If(dir.greaterThanEqual(float(1.0)).and(dir.lessThan(float(2.0))), () => { pos.x.addAssign(1.0); });
          If(dir.greaterThanEqual(float(2.0)).and(dir.lessThan(float(3.0))), () => { pos.y.subAssign(1.0); });
          If(dir.greaterThanEqual(float(3.0)), () => { pos.y.addAssign(1.0); });

          // Bounce off edges
          pos.x.assign(pos.x.clamp(float(1), w.sub(2)));
          pos.y.assign(pos.y.clamp(float(1), w.sub(2)));
        });
      });
    })().compute(WALKERS);

    // Render material
    const renderMat = new THREE.MeshStandardNodeMaterial();
    const u = screenUV.x;
    const v = screenUV.y;
    const renderIdx = int(floor(v.mul(w)).mul(w).add(floor(u.mul(w))).clamp(float(0), float(TOTAL - 1)));
    const frozen = gridA.element(renderIdx);

    // Shimmer via time
    const shimmer = float(1.0).add(
      u.mul(8.0).add(timU.mul(2.0)).sin().mul(0.15).mul(frozen),
    );

    // Frozen = white/cyan, unfrozen = dark blue
    const frostColor = vec3(0.85, 0.95, 1.0).mul(shimmer);
    const glassColor = vec3(0.02, 0.05, 0.12);
    const finalColor = mix(glassColor, frostColor, frozen);

    renderMat.colorNode = vec4(finalColor, float(1.0));
    renderMat.emissiveNode = vec4(
      mix(vec3(0.0), frostColor.mul(0.4), frozen),
      float(1.0),
    );
    renderMat.roughness = 0.1;
    renderMat.transparent = true;

    return {
      gridA, walkerPos,
      computeInit, computeInitWalkers, computeDLA,
      renderMat, timU, frameU,
    };
  }, []);

  // Initialize
  useEffect(() => {
    const renderer = gl as unknown as THREE.WebGPURenderer;
    if (renderer?.computeAsync) {
      renderer.computeAsync(compute.computeInit).then(() =>
        renderer.computeAsync(compute.computeInitWalkers).then(() =>
          setInitialized(true),
        ),
      );
    }
  }, [gl, compute]);

  useFrame((_, delta) => {
    totalTimeRef.current += delta;
    frameCount.current++;

    compute.timU.value = totalTimeRef.current;
    compute.frameU.value = frameCount.current;

    const renderer = gl as unknown as THREE.WebGPURenderer;
    if (initialized && renderer?.compute) {
      // Run multiple walker steps per frame for faster formation
      for (let s = 0; s < 4; s++) {
        compute.frameU.value += 0.25;
        renderer.compute(compute.computeDLA);
      }
    }
  });

  return (
    <>
      {/* Warm orange background gradient */}
      <color attach="background" args={['#ff8833']} />
      <ambientLight intensity={0.4} color="#ff8833" />
      <directionalLight position={[2, 4, 3]} intensity={1.2} color="#ffffff" />
      <pointLight position={[-2, 1, 2]} intensity={3.0} color="#ff6600" distance={10} />
      <pointLight position={[2, 1, -2]} intensity={2.0} color="#ffaa44" distance={8} />

      {/* Background warm glow plane */}
      <mesh position={[0, 0, -0.1]}>
        <planeGeometry args={[viewport.width * 1.2, viewport.height * 1.2]} />
        <meshStandardMaterial color="#ff6600" emissive="#ff4400" emissiveIntensity={0.3} roughness={0.9} />
      </mesh>

      {/* Frost glass pane */}
      <mesh position={[0, 0, 0]}>
        <planeGeometry args={[viewport.width, viewport.height]} />
        <primitive object={compute.renderMat} />
      </mesh>

      {/* Frost shimmer overlay */}
      <mesh position={[0, 0, 0.01]}>
        <planeGeometry args={[viewport.width, viewport.height]} />
        <meshStandardMaterial
          color="#aaddff"
          transparent
          opacity={0.04}
          roughness={0.0}
          metalness={0.8}
        />
      </mesh>
    </>
  );
}
