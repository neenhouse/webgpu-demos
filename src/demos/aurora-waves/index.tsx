import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
  color,
  time,
  positionLocal,
  Fn,
  float,
  vec3,
  mix,
} from 'three/tsl';

function AuroraRibbon({
  zOffset,
  rotationY,
  colorA,
  colorB,
  speed,
  phaseOffset,
}: {
  zOffset: number;
  rotationY: number;
  colorA: number;
  colorB: number;
  speed: number;
  phaseOffset: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);

  const material = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.transparent = true;
    mat.side = THREE.BackSide;
    mat.depthWrite = false;
    mat.blending = THREE.AdditiveBlending;

    // Flowing color gradient across the ribbon
    const colorFlow = Fn(() => {
      const t = time.mul(speed).add(phaseOffset);
      const xFactor = positionLocal.x.mul(0.3).add(t);
      // Oscillate between the two aurora colors
      const blend = xFactor.sin().mul(0.5).add(0.5);
      return mix(color(colorA), color(colorB), blend);
    });

    mat.colorNode = colorFlow();

    // Emissive glow matching the color for self-illumination
    const emissiveFlow = Fn(() => {
      const t = time.mul(speed).add(phaseOffset);
      const xFactor = positionLocal.x.mul(0.3).add(t);
      const blend = xFactor.sin().mul(0.5).add(0.5);
      return mix(color(colorA), color(colorB), blend).mul(float(0.8));
    });

    mat.emissiveNode = emissiveFlow();

    // Opacity: fade at top and bottom edges, with a wave pattern
    const opacityFn = Fn(() => {
      const t = time.mul(speed * 0.7).add(phaseOffset);
      // Normalized Y position: geometry goes from -2 to +2 (height=4)
      const yNorm = positionLocal.y.div(2.0).add(0.5).clamp(0.0, 1.0);
      // Fade at edges
      const edgeFade = yNorm.mul(float(1.0).sub(yNorm)).mul(4.0).clamp(0.0, 1.0);
      // Flowing wave modulation
      const wave = positionLocal.x.mul(0.5).add(t).sin().mul(0.3).add(0.7);
      return edgeFade.mul(wave).mul(float(0.35));
    });

    mat.opacityNode = opacityFn();

    // Vertex displacement: flowing curtain effect
    mat.positionNode = Fn(() => {
      const t = time.mul(speed);
      const px = positionLocal.x;
      const py = positionLocal.y;

      // Primary wave along X
      const wave1 = px.mul(0.8).add(t.mul(0.6)).add(float(phaseOffset)).sin().mul(0.4);
      // Secondary wave along Y
      const wave2 = py.mul(1.2).add(t.mul(0.4)).add(float(phaseOffset * 2.0)).sin().mul(0.25);
      // Tertiary higher-frequency ripple
      const wave3 = px.mul(2.0).add(py.mul(1.5)).add(t.mul(0.8)).sin().mul(0.1);

      const zDisplace = wave1.add(wave2).add(wave3);
      // Slight Y displacement for undulation
      const yDisplace = px.mul(0.5).add(t.mul(0.3)).sin().mul(0.15);

      return vec3(
        positionLocal.x,
        positionLocal.y.add(yDisplace),
        positionLocal.z.add(zDisplace),
      );
    })();

    return mat;
  }, [colorA, colorB, speed, phaseOffset]);

  return (
    <mesh
      ref={meshRef}
      material={material}
      position={[0, 1.5, zOffset]}
      rotation={[0, rotationY, 0]}
    >
      <planeGeometry args={[8, 4, 64, 32]} />
    </mesh>
  );
}

function Stars({ count }: { count: number }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  useMemo(() => {
    if (!meshRef.current) return;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      dummy.position.set(
        (Math.random() - 0.5) * 30,
        (Math.random() - 0.5) * 20,
        -5 - Math.random() * 15,
      );
      const s = 0.01 + Math.random() * 0.03;
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [count]);

  const starMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.colorNode = color(0xffffff);

    // Subtle twinkle via emissive
    const twinkle = Fn(() => {
      return color(0xffffff).mul(float(0.5));
    });
    mat.emissiveNode = twinkle();

    return mat;
  }, []);

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]} material={starMaterial} frustumCulled={false}>
      <sphereGeometry args={[1, 4, 4]} />
    </instancedMesh>
  );
}

export default function AuroraWaves() {
  const groupRef = useRef<THREE.Group>(null);

  // Gentle slow drift: subtle Y oscillation and slight yaw for a floating aurora effect
  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const t = clock.getElapsedTime();
    groupRef.current.position.y = Math.sin(t * 0.12) * 0.08;
    groupRef.current.rotation.y = Math.sin(t * 0.07) * 0.03;
  });

  const ribbons = useMemo(
    () => [
      {
        zOffset: 0,
        rotationY: 0,
        colorA: 0x00ff88,
        colorB: 0x00ffcc,
        speed: 0.4,
        phaseOffset: 0,
      },
      {
        zOffset: -1.5,
        rotationY: 0.15,
        colorA: 0x00ffcc,
        colorB: 0x8844ff,
        speed: 0.35,
        phaseOffset: 2.0,
      },
      {
        zOffset: -3.0,
        rotationY: -0.1,
        colorA: 0x8844ff,
        colorB: 0xff44aa,
        speed: 0.45,
        phaseOffset: 4.0,
      },
      {
        zOffset: 1.0,
        rotationY: -0.2,
        colorA: 0x00ff88,
        colorB: 0xff44aa,
        speed: 0.3,
        phaseOffset: 6.0,
      },
    ],
    [],
  );

  return (
    <>
      <ambientLight intensity={0.05} />
      <group ref={groupRef}>
        {ribbons.map((props, i) => (
          <AuroraRibbon key={i} {...props} />
        ))}
        <Stars count={200} />
      </group>
    </>
  );
}
