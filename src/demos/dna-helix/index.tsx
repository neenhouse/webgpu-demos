import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
  color,
  time,
  oscSine,
  normalWorld,
  cameraPosition,
  positionWorld,
  positionLocal,
  normalLocal,
  Fn,
  float,
  mix,
} from 'three/tsl';

// Two helical strands + connecting rungs
const STRAND_POINTS = 80; // Points per strand
const RUNG_INTERVAL = 4; // Place a rung every N strand points
const RUNG_SEGMENTS = 3; // Spheres per rung (bridging the two strands)

const STRAND_COUNT = STRAND_POINTS * 2; // Both strands
const RUNG_COUNT = Math.floor(STRAND_POINTS / RUNG_INTERVAL) * RUNG_SEGMENTS;
const INSTANCE_COUNT = STRAND_COUNT + RUNG_COUNT;

const HELIX_RADIUS = 1.2;
const HELIX_HEIGHT = 10;
const TURNS = 3;

export default function DnaHelix() {
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.InstancedMesh>(null);

  // Compute all instance matrices for the helix
  const matrices = useMemo(() => {
    const dummy = new THREE.Object3D();
    const result: THREE.Matrix4[] = [];

    // Helper to add a sphere instance
    const addSphere = (x: number, y: number, z: number, scale: number) => {
      dummy.position.set(x, y, z);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      result.push(dummy.matrix.clone());
    };

    // Two strands offset by PI
    for (let strand = 0; strand < 2; strand++) {
      const offset = strand * Math.PI;

      for (let i = 0; i < STRAND_POINTS; i++) {
        const t = i / (STRAND_POINTS - 1);
        const angle = t * TURNS * Math.PI * 2 + offset;
        const x = HELIX_RADIUS * Math.cos(angle);
        const z = HELIX_RADIUS * Math.sin(angle);
        const y = t * HELIX_HEIGHT - HELIX_HEIGHT / 2;

        addSphere(x, y, z, 0.08);
      }
    }

    // Connecting rungs between the two strands
    for (let i = 0; i < STRAND_POINTS; i += RUNG_INTERVAL) {
      const t = i / (STRAND_POINTS - 1);
      const angle = t * TURNS * Math.PI * 2;
      const y = t * HELIX_HEIGHT - HELIX_HEIGHT / 2;

      // Positions on strand A and strand B
      const ax = HELIX_RADIUS * Math.cos(angle);
      const az = HELIX_RADIUS * Math.sin(angle);
      const bx = HELIX_RADIUS * Math.cos(angle + Math.PI);
      const bz = HELIX_RADIUS * Math.sin(angle + Math.PI);

      // Place spheres along the rung connecting the two strands
      for (let s = 0; s < RUNG_SEGMENTS; s++) {
        const frac = (s + 1) / (RUNG_SEGMENTS + 1);
        const rx = ax + (bx - ax) * frac;
        const rz = az + (bz - az) * frac;
        addSphere(rx, y, rz, 0.06);
      }
    }

    return result;
  }, []);

  // Apply instance matrices on mount
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    for (let i = 0; i < matrices.length; i++) {
      mesh.setMatrixAt(i, matrices[i]);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [matrices]);

  // TSL material: strand color based on world position, fresnel glow
  const material = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();

    const posW = positionWorld;
    const t = time.mul(0.3);

    // Determine side of the helix: use atan2(worldZ, worldX) to get angular position
    // Spheres on one half are blue-ish, the other half red-ish
    // Use x position as a simple differentiator — works because the two strands
    // are on opposite sides at any given Y slice
    const sideFactor = oscSine(posW.x.mul(1.5).add(posW.z.mul(1.5)).add(t)).mul(0.5).add(0.5);

    const blue = color(0x4488ff);
    const red = color(0xff4466);
    const baseColor = mix(blue, red, sideFactor);

    // Rungs are lighter / more white — differentiate by scale via distance from center axis
    // Rung spheres are closer to center (smaller radius), strand spheres are at HELIX_RADIUS
    const distFromAxis = posW.x.mul(posW.x).add(posW.z.mul(posW.z));
    const isRung = float(1.0).sub(distFromAxis.div(float(HELIX_RADIUS * HELIX_RADIUS + 0.5)).saturate());
    const rungWhite = color(0xccccff);

    mat.colorNode = mix(baseColor, rungWhite, isRung.mul(0.6));

    // Fresnel-based emissive glow
    const fresnel = Fn(() => {
      const viewDir = cameraPosition.sub(positionWorld).normalize();
      const nDotV = normalWorld.dot(viewDir).saturate();
      return float(1.0).sub(nDotV).pow(2.5);
    });

    // Emissive color shifts between cyan and magenta over time
    const emissiveColor = Fn(() => {
      const cyan = color(0x00ccff);
      const magenta = color(0xff00aa);
      const blend = oscSine(time.mul(0.2).add(positionWorld.y.mul(0.3))).mul(0.5).add(0.5);
      return mix(cyan, magenta, blend);
    });

    mat.emissiveNode = emissiveColor().mul(fresnel()).mul(float(1.2));

    // Subtle vertex displacement — spheres pulse gently along their normals
    mat.positionNode = positionLocal.add(
      normalLocal.mul(
        oscSine(time.mul(1.8).add(positionLocal.y.mul(5.0))).mul(0.01),
      ),
    );

    mat.roughness = 0.35;
    mat.metalness = 0.5;

    return mat;
  }, []);

  // Slow Y rotation
  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.15;
    }
  });

  return (
    <>

      <fogExp2 attach="fog" color="#020804" density={0.03} />
      {/* Background atmosphere */}
      <mesh>
        <sphereGeometry args={[30, 16, 16]} />
        <meshBasicMaterial side={THREE.BackSide} color="#020408" />
      </mesh>
      <ambientLight intensity={0.3} />
      <directionalLight position={[8, 10, 5]} intensity={1.0} color={0xffffff} />
      <directionalLight position={[-5, -3, -8]} intensity={0.4} color={0x8888ff} />
      <pointLight position={[0, 3, 2]} intensity={2.5} color={0x00ccff} distance={15} />
      <pointLight position={[0, -3, -2]} intensity={2.0} color={0xff4488} distance={15} />

      <group ref={groupRef}>
        <instancedMesh
          ref={meshRef}
          args={[undefined, undefined, INSTANCE_COUNT]}
          material={material}
          frustumCulled={false}
        >
          <sphereGeometry args={[1, 8, 8]} />
        </instancedMesh>
      </group>
    </>
  );
}
