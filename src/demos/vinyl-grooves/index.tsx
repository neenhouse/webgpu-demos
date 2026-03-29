import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
  time,
  positionLocal,
  positionWorld,
  normalWorld,
  cameraPosition,
  Fn,
  float,
  vec3,
  mix,
  smoothstep,
  sin,
} from 'three/tsl';

/**
 * Vinyl Grooves — Spinning vinyl record with concentric groove displacement
 *
 * Techniques: Flat CylinderGeometry disk with Y displacement from sin(uv-
 * distance * 200) for grooves, rotation at 33.3 RPM, label inner circle with
 * different color, tonearm (cylinder + sphere), dark material with rainbow
 * sheen via Fresnel.
 *
 * The groove displacement is purely visual (vertex noise) to give the record
 * a physical bumpy texture. Color is dark vinyl with subtle rainbow sheen
 * angled at the tonearm position.
 */

const RPM = 33.3;
const ROT_PER_SEC = (RPM / 60) * Math.PI * 2;

const vinylPlatterMat = (() => { const m = new THREE.MeshStandardNodeMaterial(); m.color.set(0x111012); m.roughness = 0.3; m.metalness = 0.5; return m; })();
const vinylPivotMat = (() => { const m = new THREE.MeshStandardNodeMaterial(); m.color.set(0x888070); m.roughness = 0.3; m.metalness = 0.9; return m; })();
const vinylStylusMat = (() => { const m = new THREE.MeshBasicNodeMaterial(); m.color.set(new THREE.Color(0.2, 0.2, 0.2)); return m; })();
const vinylBaseMat = (() => { const m = new THREE.MeshStandardNodeMaterial(); m.color.set(0x1a1008); m.roughness = 0.8; m.metalness = 0.1; return m; })();

export default function VinylGrooves() {
  const recordRef = useRef<THREE.Mesh>(null);
  const tonearmRef = useRef<THREE.Group>(null);

  // Record material with grooves and rainbow sheen
  const recordMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();

    // UV-based groove displacement
    const grooveFn = Fn(() => {
      const px = positionLocal.x;
      const pz = positionLocal.z;

      // Radial distance from center
      const dist = px.mul(px).add(pz.mul(pz)).sqrt();

      // Groove displacement: sin of radial distance * high frequency
      const grooveFreq = float(200.0);
      const groove = sin(dist.mul(grooveFreq)).mul(float(0.003));

      // No groove on inner label (dist < 0.3) or outer edge (dist > 0.95)
      const mask = smoothstep(float(0.3), float(0.35), dist)
        .mul(smoothstep(float(0.98), float(0.93), dist));

      return vec3(positionLocal.x, positionLocal.y.add(groove.mul(mask)), positionLocal.z);
    });
    mat.positionNode = grooveFn();

    // Dark vinyl color with label area
    const colorFn = Fn(() => {
      const px = positionWorld.x;
      const pz = positionWorld.z;
      const dist = px.mul(px).add(pz.mul(pz)).sqrt();

      const vinylDark = vec3(0.05, 0.04, 0.06);
      const labelRed = vec3(0.7, 0.05, 0.05);
      const labelText = vec3(0.85, 0.82, 0.75);

      // Label at center
      const isLabel = smoothstep(float(0.3), float(0.29), dist);
      const isLabelRing = smoothstep(float(0.28), float(0.27), dist)
        .mul(smoothstep(float(0.12), float(0.13), dist));

      const c1 = mix(vinylDark, labelRed, isLabel);
      return mix(c1, labelText, isLabelRing);
    });
    mat.colorNode = colorFn();

    // Rainbow fresnel sheen
    const sheenFn = Fn(() => {
      const viewDir = cameraPosition.sub(positionWorld).normalize();
      const nDotV = normalWorld.dot(viewDir).saturate();
      const fresnel = float(1.0).sub(nDotV).pow(float(4.0));

      // Rainbow: cycle hue based on view angle + rotation
      const t = time;
      const hue = nDotV.mul(float(3.0)).add(t.mul(float(0.5)));

      // HSV-like rainbow
      const r = sin(hue).mul(float(0.5)).add(float(0.5));
      const g = sin(hue.add(float(2.094))).mul(float(0.5)).add(float(0.5));
      const b = sin(hue.add(float(4.189))).mul(float(0.5)).add(float(0.5));

      return vec3(r, g, b).mul(fresnel).mul(float(1.5));
    });
    mat.emissiveNode = sheenFn();

    mat.roughness = 0.05;
    mat.metalness = 0.6;

    return mat;
  }, []);

  // Tonearm material
  const tonearmMat = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.colorNode = vec3(float(0.7), float(0.65), float(0.5));
    mat.roughness = 0.3;
    mat.metalness = 0.9;
    return mat;
  }, []);

  useFrame((state) => {
    if (recordRef.current) {
      recordRef.current.rotation.y = state.clock.elapsedTime * ROT_PER_SEC;
    }
    if (tonearmRef.current) {
      // Tonearm slowly tracks across record
      const progress = (state.clock.elapsedTime * 0.03) % 1.0;
      const angle = -Math.PI * 0.15 - progress * Math.PI * 0.2;
      tonearmRef.current.rotation.y = angle;
    }
  });

  return (
    <>
      <color attach="background" args={['#0a0508']} />
      <ambientLight intensity={0.15} />
      <directionalLight position={[3, 8, 4]} intensity={1.2} color="#fff0e8" />
      <pointLight position={[0, 3, 0]} intensity={4} color="#ffaa44" distance={10} />
      <pointLight position={[-2, 2, 2]} intensity={2} color="#4488ff" distance={8} />

      {/* Record turntable platter */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.15, 0]} material={vinylPlatterMat}>
        <cylinderGeometry args={[1.1, 1.1, 0.04, 64]} />
      </mesh>

      {/* Vinyl record */}
      <mesh
        ref={recordRef}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.12, 0]}
        material={recordMaterial}
      >
        <cylinderGeometry args={[1.0, 1.0, 0.01, 128, 48]} />
      </mesh>

      {/* Tonearm pivot base */}
      <mesh position={[1.15, 0.1, -0.5]} material={vinylPivotMat}>
        <cylinderGeometry args={[0.04, 0.06, 0.2, 16]} />
      </mesh>

      {/* Tonearm assembly */}
      <group ref={tonearmRef} position={[1.15, 0.2, -0.5]}>
        {/* Main arm */}
        <mesh position={[-0.55, 0, 0.55]} rotation={[0, Math.PI * 0.25, -0.2]}>
          <cylinderGeometry args={[0.012, 0.018, 1.1, 12]} />
          <primitive object={tonearmMat} attach="material" />
        </mesh>
        {/* Headshell */}
        <mesh position={[-1.0, -0.12, 1.0]}>
          <boxGeometry args={[0.12, 0.04, 0.18]} />
          <primitive object={tonearmMat} attach="material" />
        </mesh>
        {/* Stylus tip */}
        <mesh position={[-1.0, -0.18, 1.08]} material={vinylStylusMat}>
          <sphereGeometry args={[0.015, 8, 8]} />
        </mesh>
        {/* Counterweight */}
        <mesh position={[0.15, 0, -0.15]}>
          <cylinderGeometry args={[0.04, 0.04, 0.08, 16]} />
          <primitive object={tonearmMat} attach="material" />
        </mesh>
      </group>

      {/* Turntable base board */}
      <mesh position={[0, -0.3, 0]} material={vinylBaseMat}>
        <boxGeometry args={[2.8, 0.1, 2.8]} />
      </mesh>
    </>
  );
}
