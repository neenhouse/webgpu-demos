import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import * as THREE from 'three/webgpu';
import {
  color,
  normalWorld,
  cameraPosition,
  positionWorld,
  Fn,
  float,
  time,
  oscSine,
  mix,
  vec3,
  positionLocal,
  normalLocal,
} from 'three/tsl';

/**
 * Billboard HUD — Sci-fi data visualization with always-facing labels
 *
 * Features:
 * - 8 data nodes (instanced spheres) at different positions in 3D space
 * - Each node has a <Billboard> with <Text> label showing metric name + animated value
 * - Connecting lines between nodes (using thin cylinder instances)
 * - Nodes pulse in sync with their data value
 * - TSL glowing node materials with Fresnel
 * - Sci-fi HUD aesthetic: dark, high-contrast, cyan/green palette
 * - Slow camera orbit for dynamic parallax on billboard labels
 * - Grid floor for spatial reference
 */

type DataNode = {
  id: string;
  label: string;
  unit: string;
  baseValue: number;
  amplitude: number;
  freq: number;
  position: [number, number, number];
  color: number;
  connectedTo: number[];
};

const DATA_NODES: DataNode[] = [
  { id: 'cpu', label: 'CPU', unit: '%', baseValue: 62, amplitude: 18, freq: 0.7, position: [0, 1.5, 0], color: 0x00ffcc, connectedTo: [1, 2, 4] },
  { id: 'mem', label: 'MEM', unit: 'GB', baseValue: 14.2, amplitude: 2.8, freq: 0.4, position: [-2.5, 0.5, 1.5], color: 0x44aaff, connectedTo: [0, 3] },
  { id: 'net', label: 'NET', unit: 'MB/s', baseValue: 285, amplitude: 120, freq: 1.2, position: [2.5, 0.2, 1.5], color: 0xff6644, connectedTo: [0, 5] },
  { id: 'gpu', label: 'GPU', unit: '%', baseValue: 88, amplitude: 8, freq: 0.5, position: [-1.8, 2.5, -1.5], color: 0xffcc22, connectedTo: [1, 6] },
  { id: 'fps', label: 'FPS', unit: '', baseValue: 60, amplitude: 4, freq: 1.8, position: [1.8, 1.8, -2], color: 0xaa44ff, connectedTo: [0, 7] },
  { id: 'lat', label: 'LAT', unit: 'ms', baseValue: 12, amplitude: 8, freq: 0.9, position: [3.0, 1.0, -0.5], color: 0x44ff88, connectedTo: [2, 7] },
  { id: 'pkt', label: 'PKT', unit: 'k/s', baseValue: 42, amplitude: 15, freq: 0.6, position: [-3.0, 1.5, -0.5], color: 0xff44cc, connectedTo: [3, 1] },
  { id: 'temp', label: 'TMP', unit: '°C', baseValue: 68, amplitude: 6, freq: 0.35, position: [0, 0.3, -3.0], color: 0xff8844, connectedTo: [4, 5] },
];

function makeNodeMaterial(nodeColor: number, phase: number) {
  const mat = new THREE.MeshStandardNodeMaterial();

  const pulse = oscSine(time.mul(1.2).add(phase)).mul(0.35).add(0.65);
  mat.colorNode = color(nodeColor);

  const fresnel = Fn(() => {
    const viewDir = cameraPosition.sub(positionWorld).normalize();
    const nDotV = normalWorld.dot(viewDir).saturate();
    return float(1.0).sub(nDotV).pow(2.5);
  });

  mat.emissiveNode = color(nodeColor).mul(pulse.mul(2.5)).add(
    color(0xffffff).mul(fresnel().mul(1.5))
  );

  mat.positionNode = positionLocal.add(
    normalLocal.mul(oscSine(time.mul(1.5).add(phase)).mul(0.02))
  );

  mat.roughness = 0.1;
  mat.metalness = 0.6;
  return mat;
}

function makeNodeHaloMaterial(nodeColor: number, phase: number) {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;
  mat.side = THREE.BackSide;
  mat.depthWrite = false;
  mat.blending = THREE.AdditiveBlending;

  const pulse = oscSine(time.mul(1.2).add(phase)).mul(0.3).add(0.7);
  const fresnel = Fn(() => {
    const viewDir = cameraPosition.sub(positionWorld).normalize();
    const nDotV = normalWorld.dot(viewDir).saturate();
    return float(1.0).sub(nDotV).pow(1.8);
  });

  mat.colorNode = color(nodeColor);
  mat.emissiveNode = color(nodeColor).mul(fresnel().mul(pulse).mul(3.5));
  mat.opacityNode = fresnel().mul(pulse).mul(0.5);
  mat.roughness = 0.0;
  return mat;
}

function makeLineMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;
  mat.depthWrite = false;

  const pulse = oscSine(time.mul(0.8)).mul(0.2).add(0.8);
  mat.colorNode = vec3(0.0, 0.9, 0.8);
  mat.emissiveNode = vec3(0.0, 0.7, 0.6).mul(pulse.mul(1.5));
  mat.opacityNode = float(0.35).mul(pulse);
  mat.roughness = 0.0;
  return mat;
}

function makeGridMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;
  mat.colorNode = vec3(0.0, 0.5, 0.4);
  mat.emissiveNode = vec3(0.0, 0.3, 0.25).mul(0.5);
  mat.opacityNode = float(0.3);
  mat.roughness = 1.0;
  return mat;
}

function makeBackgroundMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.side = THREE.BackSide;

  const gradient = Fn(() => {
    const up = normalWorld.y.mul(0.5).add(0.5);
    const deep = vec3(0.0, 0.01, 0.03);
    const mid = vec3(0.01, 0.03, 0.06);
    return mix(deep, mid, up);
  });

  mat.colorNode = gradient();
  mat.emissiveNode = gradient().mul(0.4);
  mat.roughness = 1.0;
  return mat;
}

/** Connection line between two 3D points */
function ConnectionLine({ from, to }: { from: [number, number, number]; to: [number, number, number] }) {
  const mat = useMemo(() => makeLineMaterial(), []);

  const { midpoint, length, rotation } = useMemo(() => {
    const a = new THREE.Vector3(...from);
    const b = new THREE.Vector3(...to);
    const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
    const len = a.distanceTo(b);

    // Orient cylinder from a to b
    const dir = new THREE.Vector3().subVectors(b, a).normalize();
    const quaternion = new THREE.Quaternion();
    quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    const euler = new THREE.Euler().setFromQuaternion(quaternion);

    return {
      midpoint: mid.toArray() as [number, number, number],
      length: len,
      rotation: [euler.x, euler.y, euler.z] as [number, number, number],
    };
  }, [from, to]);

  return (
    <mesh position={midpoint} rotation={rotation} material={mat}>
      <cylinderGeometry args={[0.012, 0.012, length, 6]} />
    </mesh>
  );
}

/** A single data node with Billboard label */
function DataNodeComponent({ node, index }: { node: DataNode; index: number }) {
  const coreMat = useMemo(() => makeNodeMaterial(node.color, index * 0.785), [node.color, index]);
  const haloMat = useMemo(() => makeNodeHaloMaterial(node.color, index * 0.785), [node.color, index]);
  const valueRef = useRef<string>(`${node.baseValue.toFixed(1)}${node.unit}`);
  const textRef = useRef<{ text: string } | null>(null);

  useFrame(() => {
    const t = Date.now() * 0.001;
    const val = node.baseValue + Math.sin(t * node.freq + index * 1.3) * node.amplitude;
    const formatted = node.unit === 'GB' || node.unit === 'ms'
      ? val.toFixed(1)
      : Math.round(val).toString();
    valueRef.current = `${formatted}${node.unit}`;
    if (textRef.current) {
      textRef.current.text = `${node.label}\n${valueRef.current}`;
    }
  });

  const hexColor = `#${node.color.toString(16).padStart(6, '0')}`;

  return (
    <group position={node.position}>
      {/* Node sphere */}
      <mesh material={coreMat}>
        <sphereGeometry args={[0.15, 20, 20]} />
      </mesh>
      <mesh material={haloMat} scale={[2.5, 2.5, 2.5]}>
        <sphereGeometry args={[0.15, 12, 12]} />
      </mesh>

      {/* Billboard label */}
      <Billboard follow={true} lockX={false} lockY={false} lockZ={false}>
        <Text
          ref={textRef}
          fontSize={0.12}
          color={hexColor}
          anchorX="center"
          anchorY="middle"
          position={[0, 0.4, 0]}
          outlineWidth={0.008}
          outlineColor="#000000"
          textAlign="center"
        >
          {`${node.label}\n${node.baseValue.toFixed(1)}${node.unit}`}
        </Text>
        {/* Background panel */}
        <mesh position={[0, 0.4, -0.01]}>
          <planeGeometry args={[0.38, 0.22]} />
          <meshStandardMaterial color={0x001a14} transparent opacity={0.75} />
        </mesh>
        {/* Border */}
        <mesh position={[0, 0.4, -0.005]}>
          <planeGeometry args={[0.4, 0.24]} />
          <meshStandardMaterial color={node.color} transparent opacity={0.4} />
        </mesh>
      </Billboard>
    </group>
  );
}

export default function BillboardHUD() {
  const bgMat = useMemo(() => makeBackgroundMaterial(), []);
  const gridMat = useMemo(() => makeGridMaterial(), []);
  const cameraState = useRef({ angle: 0 });

  useFrame(({ camera }, delta) => {
    cameraState.current.angle += delta * 0.15;
    const r = 7;
    const angle = cameraState.current.angle;
    camera.position.set(
      Math.cos(angle) * r,
      3,
      Math.sin(angle) * r
    );
    camera.lookAt(0, 1.2, 0);
  });

  // Build connection pairs (avoid duplicates)
  const connections = useMemo(() => {
    const pairs: Array<{ from: [number, number, number]; to: [number, number, number]; key: string }> = [];
    const seen = new Set<string>();

    DATA_NODES.forEach((node, i) => {
      node.connectedTo.forEach(j => {
        const key = [Math.min(i, j), Math.max(i, j)].join('-');
        if (!seen.has(key)) {
          seen.add(key);
          pairs.push({
            from: node.position,
            to: DATA_NODES[j].position,
            key,
          });
        }
      });
    });

    return pairs;
  }, []);

  return (
    <>
      <ambientLight intensity={0.05} />
      <hemisphereLight args={['#334466', '#111122', 0.3]} />
      <pointLight position={[0, 4, 0]} intensity={0.5} color={0x00ffcc} distance={12} />

      {/* Background */}
      <mesh material={bgMat}>
        <sphereGeometry args={[25, 32, 32]} />
      </mesh>

      {/* Grid floor for spatial reference */}
      {Array.from({ length: 13 }, (_, i) => {
        const offset = (i - 6) * 0.8;
        return (
          <group key={i}>
            <mesh position={[offset, -0.1, 0]} rotation={[-Math.PI / 2, 0, 0]} material={gridMat}>
              <planeGeometry args={[0.008, 10]} />
            </mesh>
            <mesh position={[0, -0.1, offset]} rotation={[-Math.PI / 2, 0, 0]} material={gridMat}>
              <planeGeometry args={[10, 0.008]} />
            </mesh>
          </group>
        );
      })}

      {/* Connection lines */}
      {connections.map(c => (
        <ConnectionLine key={c.key} from={c.from} to={c.to} />
      ))}

      {/* Data nodes with Billboard labels */}
      {DATA_NODES.map((node, i) => (
        <DataNodeComponent key={node.id} node={node} index={i} />
      ))}

      {/* Central hub ring */}
      <mesh position={[0, 1.5, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.3, 0.015, 8, 40]} />
        <meshStandardMaterial color={0x00ffcc} emissive={0x00ffcc} emissiveIntensity={2.0} transparent opacity={0.8} />
      </mesh>
    </>
  );
}
