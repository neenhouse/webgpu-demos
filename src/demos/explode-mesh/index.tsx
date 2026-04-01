import { useRef, useMemo, useState, useCallback, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import { color, time, oscSine, normalWorld, cameraPosition, positionWorld, Fn, float, mix } from 'three/tsl';

/**
 * Explode Mesh — Click a dodecahedron to explode it into face fragments
 *
 * Techniques:
 * - Extract all triangles from dodecahedron geometry as face normals
 * - On click: each face flies outward along its normal + gravity
 * - Debris slows over 3 seconds, then reverse animation reassembles
 * - TSL emissive on debris edges (bright glow on face edges)
 * - Satisfying explosion → settling → reassembly loop
 * - Click to trigger next cycle at any time
 */

type Phase = 'idle' | 'exploding' | 'debris' | 'reassembling';

const GRAVITY = -3.5;
const EXPLODE_FORCE = 4.0;
const DEBRIS_DURATION = 2.5;
const REASSEMBLE_DURATION = 1.5;

interface Fragment {
  originPos: THREE.Vector3;   // Position in assembled mesh
  originRot: THREE.Euler;     // Rotation in assembled mesh
  normal: THREE.Vector3;      // Face normal for explosion direction
  velocity: THREE.Vector3;    // Current velocity
  angVel: THREE.Vector3;      // Angular velocity
  pos: THREE.Vector3;         // Current world position
  rot: THREE.Euler;           // Current rotation
}

function extractFragments(geometry: THREE.BufferGeometry): Fragment[] {
  const posAttr = geometry.getAttribute('position');
  const index = geometry.index;
  const fragments: Fragment[] = [];

  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const edge1 = new THREE.Vector3();
  const edge2 = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const centroid = new THREE.Vector3();

  const triCount = index ? index.count / 3 : posAttr.count / 3;

  for (let i = 0; i < triCount; i++) {
    let iA: number, iB: number, iC: number;
    if (index) {
      iA = index.getX(i * 3);
      iB = index.getX(i * 3 + 1);
      iC = index.getX(i * 3 + 2);
    } else {
      iA = i * 3;
      iB = i * 3 + 1;
      iC = i * 3 + 2;
    }

    a.fromBufferAttribute(posAttr, iA);
    b.fromBufferAttribute(posAttr, iB);
    c.fromBufferAttribute(posAttr, iC);

    edge1.subVectors(b, a);
    edge2.subVectors(c, a);
    normal.crossVectors(edge1, edge2).normalize();

    centroid.set(
      (a.x + b.x + c.x) / 3,
      (a.y + b.y + c.y) / 3,
      (a.z + b.z + c.z) / 3,
    );

    fragments.push({
      originPos: centroid.clone(),
      originRot: new THREE.Euler(0, 0, 0),
      normal: normal.clone(),
      velocity: new THREE.Vector3(),
      angVel: new THREE.Vector3(
        (Math.random() - 0.5) * 5,
        (Math.random() - 0.5) * 5,
        (Math.random() - 0.5) * 5,
      ),
      pos: centroid.clone(),
      rot: new THREE.Euler(0, 0, 0),
    });
  }

  return fragments;
}

export default function ExplodeMesh() {
  const [phase, setPhase] = useState<Phase>('idle');
  const phaseTimer = useRef(0);
  const fragments = useRef<Fragment[]>([]);
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const mainMeshRef = useRef<THREE.Mesh>(null);
  const dummy = useRef(new THREE.Object3D());
  const quat = useRef(new THREE.Quaternion());

  const geometry = useMemo(() => {
    const geo = new THREE.DodecahedronGeometry(1.2, 0);
    return geo;
  }, []);

  useEffect(() => {
    fragments.current = extractFragments(geometry);
  }, [geometry]);

  const startExplosion = useCallback(() => {
    if (phase === 'exploding' || phase === 'reassembling') return;
    const frags = fragments.current;

    // Reset positions to origin
    for (const f of frags) {
      f.pos.copy(f.originPos);
      f.rot.set(0, 0, 0, 'XYZ');
      // Launch velocity along face normal + random spread
      f.velocity.copy(f.normal).multiplyScalar(EXPLODE_FORCE * (0.7 + Math.random() * 0.6));
      f.velocity.x += (Math.random() - 0.5) * 2;
      f.velocity.y += Math.random() * 2;
      f.velocity.z += (Math.random() - 0.5) * 2;
      f.angVel.set(
        (Math.random() - 0.5) * 8,
        (Math.random() - 0.5) * 8,
        (Math.random() - 0.5) * 8,
      );
    }

    phaseTimer.current = 0;
    setPhase('exploding');
  }, [phase]);

  const mainMat = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.roughness = 0.2;
    mat.metalness = 0.6;
    const fresnel = Fn(() => {
      const viewDir = cameraPosition.sub(positionWorld).normalize();
      const nDotV = normalWorld.dot(viewDir).saturate();
      return float(1.0).sub(nDotV).pow(3.0);
    });
    const pulse = oscSine(time.mul(0.8)).mul(0.2).add(0.8);
    mat.colorNode = color(0x441155);
    mat.emissiveNode = color(0xcc44ff).mul(fresnel().mul(pulse.mul(1.5)));
    return mat;
  }, []);

  const fragmentMat = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.roughness = 0.15;
    mat.metalness = 0.7;
    mat.side = THREE.DoubleSide;
    const pulse = oscSine(time.mul(4.0)).mul(0.3).add(0.7);
    const fresnel = Fn(() => {
      const viewDir = cameraPosition.sub(positionWorld).normalize();
      const nDotV = normalWorld.dot(viewDir).saturate();
      return float(1.0).sub(nDotV).pow(2.0);
    });
    mat.colorNode = color(0x660088);
    mat.emissiveNode = mix(color(0xff44ff), color(0xffaa44), fresnel()).mul(pulse.mul(2.5));
    return mat;
  }, []);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.033);
    const frags = fragments.current;
    const mesh = meshRef.current;
    phaseTimer.current += dt;

    if (phase === 'idle') {
      // Idle: small oscillation on main mesh
      if (mainMeshRef.current) {
        mainMeshRef.current.rotation.y += dt * 0.4;
        mainMeshRef.current.rotation.x = Math.sin(Date.now() * 0.001) * 0.1;
      }
      return;
    }

    if (phase === 'exploding' || phase === 'debris') {
      if (phaseTimer.current > DEBRIS_DURATION && phase === 'exploding') {
        setPhase('debris');
      }
      if (phaseTimer.current > DEBRIS_DURATION + 0.5) {
        // Start reassembly
        setPhase('reassembling');
        phaseTimer.current = 0;
      }

      // Simulate fragment physics
      for (const f of frags) {
        f.velocity.y += GRAVITY * dt;
        f.velocity.multiplyScalar(1 - 0.8 * dt);
        f.pos.addScaledVector(f.velocity, dt);

        // Floor bounce
        if (f.pos.y < -3.0) {
          f.pos.y = -3.0;
          f.velocity.y = Math.abs(f.velocity.y) * 0.4;
          f.velocity.x *= 0.8;
          f.velocity.z *= 0.8;
          f.angVel.multiplyScalar(0.7);
        }

        // Angular
        f.rot.x += f.angVel.x * dt;
        f.rot.y += f.angVel.y * dt;
        f.rot.z += f.angVel.z * dt;
        f.angVel.multiplyScalar(1 - 1.5 * dt);
      }
    }

    if (phase === 'reassembling') {
      const t = Math.min(1, phaseTimer.current / REASSEMBLE_DURATION);
      const ease = 1 - Math.pow(1 - t, 3);

      for (const f of frags) {
        f.pos.lerp(f.originPos, ease * 0.12);
        f.rot.x *= (1 - ease * 0.12);
        f.rot.y *= (1 - ease * 0.12);
        f.rot.z *= (1 - ease * 0.12);
      }

      if (t >= 1.0) {
        setPhase('idle');
        // Reset main mesh
        if (mainMeshRef.current) {
          mainMeshRef.current.rotation.set(0, 0, 0);
        }
      }
    }

    // Update instanced mesh for fragments
    if (mesh && (phase === 'exploding' || phase === 'debris' || phase === 'reassembling')) {
      for (let i = 0; i < frags.length; i++) {
        const f = frags[i];
        dummy.current.position.copy(f.pos);
        dummy.current.rotation.copy(f.rot);
        dummy.current.scale.setScalar(1);
        dummy.current.updateMatrix();
        mesh.setMatrixAt(i, dummy.current.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.count = frags.length;
    }
  });

  const fragGeo = useMemo(() => {
    // Small plane for each fragment
    return new THREE.PlaneGeometry(0.15, 0.15);
  }, []);

  const maxFragCount = useMemo(() => {
    const frags = extractFragments(new THREE.DodecahedronGeometry(1.2, 0));
    return frags.length;
  }, []);

  const showMain = phase === 'idle' || phase === 'reassembling';
  const showFragments = phase === 'exploding' || phase === 'debris' || phase === 'reassembling';

  return (
    <>
      {/* Background atmosphere */}
      <mesh>
        <sphereGeometry args={[30, 16, 8]} />
        <meshBasicMaterial side={THREE.BackSide} color="#050008" />
      </mesh>

      <color attach="background" args={['#050008']} />
      <ambientLight intensity={0.08} />
      <hemisphereLight args={['#220044', '#050008', 0.4]} />
      <directionalLight position={[4, 6, 4]} intensity={0.6} />
      <pointLight position={[0, 2, 0]} intensity={30} color="#cc44ff" distance={8} />
      <pointLight position={[-3, -1, 2]} intensity={15} color="#ff8844" distance={6} />

      {/* Main mesh — visible when idle or reassembling */}
      <mesh
        ref={mainMeshRef}
        material={mainMat}
        geometry={geometry}
        visible={showMain}
        onClick={startExplosion}
      />

      {/* Fragment instances */}
      {showFragments && (
        <instancedMesh
          ref={meshRef}
          args={[fragGeo, fragmentMat, maxFragCount]}
          frustumCulled={false}
        />
      )}

      {/* Ground shadow plane */}
      <mesh position={[0, -3.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[5, 32]} />
        <meshBasicMaterial color="#0a0010" transparent opacity={0.8} />
      </mesh>

      {/* Click hint */}
      {phase === 'idle' && (
        <mesh position={[0, -2.0, 0]} visible={false}>
          <planeGeometry args={[3, 0.3]} />
          <meshBasicMaterial transparent opacity={0} />
        </mesh>
      )}
    </>
  );
}
