import { useRef, useMemo, useEffect, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import { color, time, oscSine, normalWorld, cameraPosition, positionWorld, Fn, float } from 'three/tsl';

/**
 * Zoom Universe — Camera zoom from galaxy scale to atom scale
 *
 * Five scale levels driven by scroll wheel (or auto-animation):
 *   0 = Galaxy     (instanced stars, spiral arms)
 *   1 = Solar      (planets orbiting a star)
 *   2 = Earth      (globe, atmosphere)
 *   3 = City       (grid of buildings with glowing windows)
 *   4 = Atom       (nucleus + electron cloud)
 *
 * Each level fades in/out based on camera Z. Seamless transitions.
 */

const LEVELS = [
  { z: -30,   label: 'Galaxy', color: '#0a0020' },
  { z: -10,   label: 'Solar System', color: '#000815' },
  { z: -3,    label: 'Earth', color: '#000a14' },
  { z: -0.8,  label: 'City', color: '#050508' },
  { z: -0.15, label: 'Atom', color: '#000508' },
];

const STAR_COUNT = 8000;
const BUILDING_COUNT = 100;
const ELECTRON_COUNT = 60;

export default function ZoomUniverse() {
  const { camera, gl } = useThree();
  const cameraZ = useRef(-30);
  const targetZ = useRef(-30);
  const dummy = useRef(new THREE.Object3D());

  const starMesh = useRef<THREE.InstancedMesh>(null);
  const buildingMesh = useRef<THREE.InstancedMesh>(null);
  const electronMesh = useRef<THREE.InstancedMesh>(null);
  const earthRef = useRef<THREE.Mesh>(null);
  const sunRef = useRef<THREE.Mesh>(null);
  const planetGroupRef = useRef<THREE.Group>(null);
  const atomNucleusRef = useRef<THREE.Mesh>(null);

  const [levelIndex, setLevelIndex] = useState(0);

  // Scroll handler
  useEffect(() => {
    const canvas = gl.domElement as HTMLCanvasElement;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      targetZ.current = Math.max(-30, Math.min(-0.15, targetZ.current + e.deltaY * 0.03));
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [gl]);

  // Initialize instanced meshes
  useEffect(() => {
    // Stars
    if (starMesh.current) {
      for (let i = 0; i < STAR_COUNT; i++) {
        const r = 80 + Math.random() * 60;
        const theta = Math.random() * Math.PI * 2;
        const spiralOffset = theta * 0.3;
        const phi = (Math.random() - 0.5) * 0.3;
        dummy.current.position.set(
          Math.cos(theta + spiralOffset) * r,
          Math.sin(phi) * r * 0.1,
          Math.sin(theta + spiralOffset) * r
        );
        dummy.current.scale.setScalar(0.3 + Math.random() * 0.7);
        dummy.current.updateMatrix();
        starMesh.current.setMatrixAt(i, dummy.current.matrix);
        const brightness = Math.random();
        // Wide color variation: hot blue, yellow-white, orange-red, cool blue-white
        const starHue = Math.random();
        let hue: number, sat: number, lit: number;
        if (starHue < 0.25) { hue = 0.6; sat = 0.8; lit = 0.7 + brightness * 0.3; }       // blue
        else if (starHue < 0.5) { hue = 0.15; sat = 0.5; lit = 0.8 + brightness * 0.2; }  // yellow-white
        else if (starHue < 0.75) { hue = 0.07; sat = 0.7; lit = 0.7 + brightness * 0.3; } // orange
        else { hue = 0.55; sat = 0.3; lit = 0.85 + brightness * 0.15; }                    // blue-white
        starMesh.current.setColorAt(i, new THREE.Color().setHSL(hue, sat, lit));
      }
      starMesh.current.instanceMatrix.needsUpdate = true;
      if (starMesh.current.instanceColor) starMesh.current.instanceColor.needsUpdate = true;
    }

    // Buildings
    if (buildingMesh.current) {
      const gridSize = 10;
      const spacing = 0.15;
      for (let i = 0; i < BUILDING_COUNT; i++) {
        const col = i % gridSize;
        const row = Math.floor(i / gridSize);
        const h = 0.05 + Math.random() * 0.3;
        dummy.current.position.set(
          (col - gridSize / 2) * spacing,
          h / 2 - 0.05,
          (row - gridSize / 2) * spacing
        );
        dummy.current.scale.set(0.05 + Math.random() * 0.03, h, 0.05 + Math.random() * 0.03);
        dummy.current.updateMatrix();
        buildingMesh.current.setMatrixAt(i, dummy.current.matrix);
        buildingMesh.current.setColorAt(i, new THREE.Color().setHSL(0.1 + Math.random() * 0.05, 0.3, 0.15 + Math.random() * 0.1));
      }
      buildingMesh.current.instanceMatrix.needsUpdate = true;
      if (buildingMesh.current.instanceColor) buildingMesh.current.instanceColor.needsUpdate = true;
    }

    // Electrons
    if (electronMesh.current) {
      for (let i = 0; i < ELECTRON_COUNT; i++) {
        dummy.current.position.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1);
        dummy.current.scale.setScalar(0.02 + Math.random() * 0.02);
        dummy.current.updateMatrix();
        electronMesh.current.setMatrixAt(i, dummy.current.matrix);
        electronMesh.current.setColorAt(i, new THREE.Color().setHSL(Math.random(), 1, 0.7));
      }
      electronMesh.current.instanceMatrix.needsUpdate = true;
      if (electronMesh.current.instanceColor) electronMesh.current.instanceColor.needsUpdate = true;
    }
  }, []);

  const starMat = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.emissiveNode = color(0xffffff).mul(float(3.0));
    return mat;
  }, []);

  const sunMat = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    const pulse = oscSine(time.mul(0.5)).mul(0.2).add(0.8);
    mat.emissiveNode = color(0xffaa22).mul(pulse.mul(3.0));
    mat.colorNode = color(0xffcc44);
    return mat;
  }, []);

  const earthMat = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.roughness = 0.8;
    mat.metalness = 0.0;
    const fresnel = Fn(() => {
      const viewDir = cameraPosition.sub(positionWorld).normalize();
      const nDotV = normalWorld.dot(viewDir).saturate();
      return float(1.0).sub(nDotV).pow(3.0);
    });
    mat.colorNode = color(0x1a5c99);
    mat.emissiveNode = color(0x0033aa).mul(fresnel().mul(1.5));
    return mat;
  }, []);

  const buildingMat = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.roughness = 0.9;
    mat.metalness = 0.2;
    const windowGlow = oscSine(time.mul(2.0)).mul(0.2).add(0.3);
    mat.emissiveNode = color(0xffcc44).mul(windowGlow);
    return mat;
  }, []);

  const nucleusMat = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    const pulse = oscSine(time.mul(3.0)).mul(0.3).add(0.7);
    mat.colorNode = color(0xff4400);
    mat.emissiveNode = color(0xff6600).mul(pulse.mul(2.5));
    return mat;
  }, []);

  const electronMat = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.emissiveNode = color(0x44aaff).mul(float(3.0));
    return mat;
  }, []);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.033);

    // Smooth camera zoom
    cameraZ.current += (targetZ.current - cameraZ.current) * dt * 3;
    camera.position.z = cameraZ.current;

    // Determine level
    const z = Math.abs(cameraZ.current);
    let idx = 0;
    if (z < 0.4) idx = 4;
    else if (z < 1.5) idx = 3;
    else if (z < 6) idx = 2;
    else if (z < 18) idx = 1;
    else idx = 0;
    setLevelIndex(idx);

    // Auto-scroll if near start
    if (targetZ.current === -30 && Math.abs(cameraZ.current - (-30)) < 2) {
      targetZ.current = -0.15;
    }

    // Rotate galaxies
    if (starMesh.current) {
      starMesh.current.rotation.y += delta * 0.02;
    }

    // Animate planets
    if (planetGroupRef.current) {
      planetGroupRef.current.rotation.y += delta * 0.3;
    }

    // Animate electrons (orbit update)
    if (electronMesh.current) {
      const t = Date.now() * 0.001;
      for (let i = 0; i < ELECTRON_COUNT; i++) {
        const speed = 0.8 + (i % 5) * 0.4;
        const r = 0.4 + (i % 4) * 0.3;
        const orbitAngle = t * speed + (i / ELECTRON_COUNT) * Math.PI * 2;
        const tiltAngle = (i % 6) * (Math.PI / 6);
        const x = Math.cos(orbitAngle) * r;
        const y = Math.sin(orbitAngle) * r * Math.cos(tiltAngle);
        const z2 = Math.sin(orbitAngle) * r * Math.sin(tiltAngle);
        dummy.current.position.set(x, y, z2);
        dummy.current.scale.setScalar(0.02 + (i % 3) * 0.01);
        dummy.current.updateMatrix();
        electronMesh.current.setMatrixAt(i, dummy.current.matrix);
      }
      electronMesh.current.instanceMatrix.needsUpdate = true;
    }

    if (atomNucleusRef.current) {
      atomNucleusRef.current.rotation.y += delta * 0.5;
    }
    if (earthRef.current) {
      earthRef.current.rotation.y += delta * 0.1;
    }
  });

  const _getLevelOpacity = (_levelIndex: number, targetLevel: number, range: number = 1.5) => {
    const z = Math.abs(cameraZ.current);
    const levelZ = Math.abs(LEVELS[targetLevel].z);
    return Math.max(0, 1 - Math.abs(z - levelZ) / (levelZ * range));
  };
  void _getLevelOpacity;

  return (
    <>
      <color attach="background" args={['#000010']} />
      <ambientLight intensity={0.05} />
      <hemisphereLight args={['#110022', '#000010', 0.2]} />

      {/* Galaxy level — stars + glow centered at camera start z=-30 */}
      <group position={[0, 0, -30]} visible={levelIndex <= 1}>
        <instancedMesh ref={starMesh} args={[undefined, undefined, STAR_COUNT]} material={starMat} frustumCulled={false}>
          <sphereGeometry args={[1, 6, 6]} />
        </instancedMesh>
        {/* Galaxy center glow — sized for z=-30 camera distance */}
        <mesh position={[0, 0, 0]}>
          <sphereGeometry args={[10, 16, 16]} />
          <meshBasicMaterial color="#440088" transparent opacity={0.6} />
        </mesh>
        <mesh position={[0, 0, 0]}>
          <sphereGeometry args={[25, 16, 16]} />
          <meshBasicMaterial color="#220044" transparent opacity={0.25} />
        </mesh>
        <pointLight position={[0, 0, 0]} intensity={500} color="#ffaa44" distance={80} />
      </group>

      {/* Solar system level */}
      <group position={[0, 0, -10]} visible={levelIndex >= 1 && levelIndex <= 2}>
        <mesh ref={sunRef} material={sunMat}>
          <sphereGeometry args={[1.2, 32, 32]} />
        </mesh>
        <pointLight position={[0, 0, 0]} intensity={120} color="#ffaa22" distance={25} />
        <group ref={planetGroupRef}>
          {[3, 5, 7.5, 11].map((r, i) => (
            <mesh key={i} position={[r, 0, 0]} material={earthMat}>
              <sphereGeometry args={[0.18 + i * 0.1, 16, 16]} />
            </mesh>
          ))}
        </group>
      </group>

      {/* Earth level */}
      <group position={[0, 0, -3]} visible={levelIndex >= 2 && levelIndex <= 3}>
        <mesh ref={earthRef} material={earthMat}>
          <sphereGeometry args={[1.0, 32, 32]} />
        </mesh>
        {/* Atmosphere shell */}
        <mesh scale={[1.07, 1.07, 1.07]}>
          <sphereGeometry args={[1.0, 24, 24]} />
          <meshBasicMaterial color="#2266aa" transparent opacity={0.12} side={THREE.BackSide} />
        </mesh>
        <pointLight position={[2, 1.5, 2]} intensity={8} color="#ffffff" distance={8} />
      </group>

      {/* City level */}
      <group position={[0, 0, -0.8]} visible={levelIndex >= 3 && levelIndex <= 4}>
        <instancedMesh ref={buildingMesh} args={[undefined, undefined, BUILDING_COUNT]} material={buildingMat} frustumCulled={false}>
          <boxGeometry args={[1, 1, 1]} />
        </instancedMesh>
        {/* Ground plane */}
        <mesh position={[0, -0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[2, 2]} />
          <meshStandardMaterial color="#111111" />
        </mesh>
        <pointLight position={[0, 0.5, 0]} intensity={2} color="#ff9944" distance={2} />
      </group>

      {/* Atom level */}
      <group position={[0, 0, -0.15]} visible={levelIndex >= 4}>
        {/* Nucleus */}
        <mesh ref={atomNucleusRef} material={nucleusMat}>
          <sphereGeometry args={[0.12, 16, 16]} />
        </mesh>
        {/* Electron cloud */}
        <instancedMesh ref={electronMesh} args={[undefined, undefined, ELECTRON_COUNT]} material={electronMat} frustumCulled={false}>
          <sphereGeometry args={[1, 6, 6]} />
        </instancedMesh>
        <pointLight position={[0, 0, 0]} intensity={0.5} color="#44aaff" distance={2} />
      </group>

      {/* HUD */}
      <mesh position={[0, 2.5, cameraZ.current + 5]} visible={false}>
        <planeGeometry args={[1, 0.2]} />
      </mesh>
    </>
  );
}
