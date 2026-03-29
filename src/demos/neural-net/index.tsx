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
  smoothstep,
  hash,
  vec3,
  screenUV,
  fract,
} from 'three/tsl';

/**
 * Neural Network Visualization
 *
 * A 3D neural network with 5 layers of nodes (instanced spheres)
 * connected by glowing edges (instanced cylinders). Data pulses
 * flow along connections as traveling light. Nodes activate when
 * receiving data. Layer-based color coding.
 */

// ── Network topology ──
const LAYER_SIZES = [8, 12, 12, 10, 6]; // nodes per layer
const LAYER_COUNT = LAYER_SIZES.length;
const TOTAL_NODES = LAYER_SIZES.reduce((a, b) => a + b, 0); // 48

// Edges connect every node in layer L to every node in layer L+1
const EDGE_COUNTS: number[] = [];
for (let l = 0; l < LAYER_COUNT - 1; l++) {
  EDGE_COUNTS.push(LAYER_SIZES[l] * LAYER_SIZES[l + 1]);
}
const TOTAL_EDGES = EDGE_COUNTS.reduce((a, b) => a + b, 0);

// Layout parameters
const LAYER_SPACING_X = 1.8; // horizontal distance between layers
const NODE_SPREAD_Y = 0.45; // vertical spacing between nodes in a layer
const NODE_RADIUS = 0.1;
const EDGE_THICKNESS = 0.012;

// Layer colors: input=blue, hidden1=purple, hidden2=magenta, output=green
const LAYER_COLORS = [
  new THREE.Color(0x3388ff), // input - blue
  new THREE.Color(0x8844dd), // hidden 1 - purple
  new THREE.Color(0xcc44aa), // hidden 2 - magenta
  new THREE.Color(0xdd5588), // hidden 3 - rose
  new THREE.Color(0x33dd88), // output - green
];

/** Compute node positions in XY plane centered at origin */
function computeNodePositions(): THREE.Vector3[] {
  const positions: THREE.Vector3[] = [];
  const totalWidth = (LAYER_COUNT - 1) * LAYER_SPACING_X;

  for (let l = 0; l < LAYER_COUNT; l++) {
    const count = LAYER_SIZES[l];
    const x = l * LAYER_SPACING_X - totalWidth / 2;
    const totalHeight = (count - 1) * NODE_SPREAD_Y;

    for (let n = 0; n < count; n++) {
      const y = n * NODE_SPREAD_Y - totalHeight / 2;
      positions.push(new THREE.Vector3(x, y, 0));
    }
  }
  return positions;
}

/** Creates node (sphere) TSL material with layer-based color and activation pulses */
function makeNodeMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();

  // Per-instance seed from world position
  const seed = hash(positionWorld.x.mul(97.3).add(positionWorld.y.mul(53.7)));

  // Map world X position to layer index (0-4)
  const totalWidth = float((LAYER_COUNT - 1) * LAYER_SPACING_X);
  const normalizedX = positionWorld.x.add(totalWidth.mul(0.5)).div(totalWidth).saturate();

  // 5-stop layer color gradient via chained mix/smoothstep
  const c0 = color(LAYER_COLORS[0].getHex());
  const c1 = color(LAYER_COLORS[1].getHex());
  const c2 = color(LAYER_COLORS[2].getHex());
  const c3 = color(LAYER_COLORS[3].getHex());
  const c4 = color(LAYER_COLORS[4].getHex());

  const col01 = mix(c0, c1, smoothstep(float(0.0), float(0.25), normalizedX));
  const col02 = mix(col01, c2, smoothstep(float(0.2), float(0.5), normalizedX));
  const col03 = mix(col02, c3, smoothstep(float(0.45), float(0.75), normalizedX));
  const baseColor = mix(col03, c4, smoothstep(float(0.7), float(1.0), normalizedX));

  mat.colorNode = baseColor;

  // Fresnel rim glow
  const fresnel = Fn(() => {
    const viewDir = cameraPosition.sub(positionWorld).normalize();
    const nDotV = normalWorld.dot(viewDir).saturate();
    return float(1.0).sub(nDotV).pow(2.0);
  });

  // Node activation: data wave passes through network layer by layer
  // Wave position sweeps from left (layer 0) to right (layer 4) cyclically
  const wavePos = fract(time.mul(0.18)); // slow sweep across network
  const layerPhase = normalizedX; // 0 at input, 1 at output

  // Node lights up when wave passes its layer position
  const activation = smoothstep(float(0.0), float(0.15), float(0.15).sub(layerPhase.sub(wavePos).abs()));
  // Second wave slightly behind for visual richness
  const wavePos2 = fract(time.mul(0.18).add(0.4));
  const activation2 = smoothstep(float(0.0), float(0.15), float(0.15).sub(layerPhase.sub(wavePos2).abs()));

  const totalActivation = activation.add(activation2).min(float(1.0));

  // Base emissive: moderate glow + strong activation pulse
  const emissiveBase = baseColor.mul(float(0.4).add(totalActivation.mul(2.5)));
  const emissiveRim = vec3(0.7, 0.9, 1.0).mul(fresnel()).mul(1.5);
  mat.emissiveNode = emissiveBase.add(emissiveRim);

  // Subtle vertex breathing
  mat.positionNode = positionLocal.add(
    normalLocal.mul(oscSine(time.mul(1.5).add(seed.mul(6.28))).mul(0.01)),
  );

  mat.roughness = 0.2;
  mat.metalness = 0.4;

  return mat;
}

/** Creates edge (cylinder) TSL material with traveling data pulses */
function makeEdgeMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;

  // Per-instance timing offset from world position
  const seed = hash(positionWorld.x.mul(31.7).add(positionWorld.y.mul(89.3)).add(positionWorld.z.mul(43.1)));

  // Map world X position to network progress (left to right)
  const totalWidth = float((LAYER_COUNT - 1) * LAYER_SPACING_X);
  const normalizedX = positionWorld.x.add(totalWidth.mul(0.5)).div(totalWidth).saturate();

  // Edge layer color: blend between source and target layer colors
  const c0 = color(LAYER_COLORS[0].getHex());
  const c1 = color(LAYER_COLORS[1].getHex());
  const c2 = color(LAYER_COLORS[2].getHex());
  const c3 = color(LAYER_COLORS[3].getHex());
  const c4 = color(LAYER_COLORS[4].getHex());

  const col01 = mix(c0, c1, smoothstep(float(0.0), float(0.25), normalizedX));
  const col02 = mix(col01, c2, smoothstep(float(0.2), float(0.5), normalizedX));
  const col03 = mix(col02, c3, smoothstep(float(0.45), float(0.75), normalizedX));
  const baseColor = mix(col03, c4, smoothstep(float(0.7), float(1.0), normalizedX));

  // Traveling pulse along the cylinder
  // positionLocal.y represents position along the cylinder axis (0 to 1 for height 1)
  // The pulse moves from one end to the other
  const pulseSpeed = float(0.4);
  const localY = positionLocal.y.add(0.5); // remap from [-0.5, 0.5] to [0, 1]

  // Each edge gets its own timing offset so pulses are staggered
  const pulsePhase = fract(time.mul(pulseSpeed).add(seed));
  const pulseDist = localY.sub(pulsePhase).abs();
  const pulse = smoothstep(float(0.15), float(0.0), pulseDist);

  // Second pulse wave
  const pulsePhase2 = fract(time.mul(pulseSpeed).add(seed).add(0.5));
  const pulseDist2 = localY.sub(pulsePhase2).abs();
  const pulse2 = smoothstep(float(0.15), float(0.0), pulseDist2);

  const totalPulse = pulse.add(pulse2).min(float(1.0));

  // Base edge is dim, pulse makes it bright
  const dimColor = baseColor.mul(0.15);
  const brightColor = color(0xffffff);
  mat.colorNode = mix(dimColor, brightColor, totalPulse);

  // Emissive: pulses glow strongly
  mat.emissiveNode = mix(baseColor.mul(0.2), brightColor.mul(2.0), totalPulse);

  // Opacity: edges are semi-transparent, pulses are fully opaque
  mat.opacityNode = float(0.2).add(totalPulse.mul(0.8));

  mat.roughness = 0.3;
  mat.metalness = 0.2;

  return mat;
}

/** Creates background grid material */
function makeBackgroundMaterial() {
  const mat = new THREE.MeshBasicNodeMaterial();
  mat.side = THREE.DoubleSide;

  // Subtle dark grid via screenUV
  const gridScale = float(40.0);
  const gridX = fract(screenUV.x.mul(gridScale));
  const gridY = fract(screenUV.y.mul(gridScale));

  // Thin grid lines
  const lineX = smoothstep(float(0.0), float(0.04), gridX)
    .mul(smoothstep(float(1.0), float(0.96), gridX));
  const lineY = smoothstep(float(0.0), float(0.04), gridY)
    .mul(smoothstep(float(1.0), float(0.96), gridY));
  const gridMask = float(1.0).sub(lineX.mul(lineY)); // 1 on lines, 0 in cells

  // Subtle radial gradient darkening
  const uvCentered = screenUV.sub(float(0.5));
  const radial = uvCentered.x.mul(uvCentered.x).add(uvCentered.y.mul(uvCentered.y)).sqrt();
  const vignette = smoothstep(float(0.3), float(1.0), radial).mul(0.3);

  const bgColor = vec3(0.02, 0.02, 0.04);
  const lineColor = vec3(0.06, 0.06, 0.12);
  const finalColor = mix(bgColor, lineColor, gridMask.mul(0.5));

  mat.colorNode = mix(finalColor, vec3(0.0, 0.0, 0.0), vignette);

  return mat;
}

export default function NeuralNet() {
  const groupRef = useRef<THREE.Group>(null);
  const nodeMeshRef = useRef<THREE.InstancedMesh>(null);
  const edgeMeshRef = useRef<THREE.InstancedMesh>(null);

  // Precompute node positions
  const nodePositions = useMemo(() => computeNodePositions(), []);

  // Build a flat array of edge source/target indices for matrix computation
  const edgeData = useMemo(() => {
    const edges: { srcIdx: number; tgtIdx: number }[] = [];
    let nodeOffset = 0;

    for (let l = 0; l < LAYER_COUNT - 1; l++) {
      const srcCount = LAYER_SIZES[l];
      const tgtCount = LAYER_SIZES[l + 1];
      const tgtOffset = nodeOffset + srcCount;

      for (let s = 0; s < srcCount; s++) {
        for (let t = 0; t < tgtCount; t++) {
          edges.push({ srcIdx: nodeOffset + s, tgtIdx: tgtOffset + t });
        }
      }
      nodeOffset += srcCount;
    }
    return edges;
  }, []);

  // Set up node instance matrices
  useEffect(() => {
    const mesh = nodeMeshRef.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();

    for (let i = 0; i < TOTAL_NODES; i++) {
      const pos = nodePositions[i];
      dummy.position.copy(pos);
      dummy.scale.setScalar(NODE_RADIUS);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [nodePositions]);

  // Set up edge instance matrices: each cylinder connects two node positions
  useEffect(() => {
    const mesh = edgeMeshRef.current;
    if (!mesh) return;

    const dummy = new THREE.Object3D();
    const direction = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);

    for (let i = 0; i < edgeData.length; i++) {
      const { srcIdx, tgtIdx } = edgeData[i];
      const src = nodePositions[srcIdx];
      const tgt = nodePositions[tgtIdx];

      // Midpoint
      dummy.position.lerpVectors(src, tgt, 0.5);

      // Direction from source to target
      direction.subVectors(tgt, src);
      const length = direction.length();
      direction.normalize();

      // Orient cylinder along the connection direction
      // CylinderGeometry is along Y by default, so rotate Y axis to match direction
      const quat = new THREE.Quaternion();
      quat.setFromUnitVectors(up, direction);
      dummy.quaternion.copy(quat);

      // Scale: thin in XZ, length along Y
      dummy.scale.set(EDGE_THICKNESS, length, EDGE_THICKNESS);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [edgeData, nodePositions]);

  // Materials
  const nodeMaterial = useMemo(() => makeNodeMaterial(), []);
  const edgeMaterial = useMemo(() => makeEdgeMaterial(), []);
  const bgMaterial = useMemo(() => makeBackgroundMaterial(), []);

  // Slow Y rotation
  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.08;
    }
  });

  return (
    <>
      <ambientLight intensity={0.08} />
      <directionalLight position={[5, 5, 5]} intensity={0.25} />
      {/* Layer-aligned accent lights */}
      <pointLight position={[-3.5, 0, 1.5]} intensity={1.0} color={0x3388ff} distance={8} />
      <pointLight position={[-1.0, 0, 1.5]} intensity={0.8} color={0x8844dd} distance={6} />
      <pointLight position={[1.0, 0, 1.5]} intensity={0.8} color={0xcc44aa} distance={6} />
      <pointLight position={[3.5, 0, 1.5]} intensity={1.0} color={0x33dd88} distance={8} />

      {/* Background grid */}
      <mesh position={[0, 0, -3]} material={bgMaterial}>
        <planeGeometry args={[20, 15]} />
      </mesh>

      <group ref={groupRef}>
        {/* Network nodes: instanced spheres */}
        <instancedMesh
          ref={nodeMeshRef}
          args={[undefined, undefined, TOTAL_NODES]}
          material={nodeMaterial}
          frustumCulled={false}
        >
          <icosahedronGeometry args={[1, 2]} />
        </instancedMesh>

        {/* Network edges: instanced cylinders */}
        <instancedMesh
          ref={edgeMeshRef}
          args={[undefined, undefined, TOTAL_EDGES]}
          material={edgeMaterial}
          frustumCulled={false}
        >
          <cylinderGeometry args={[1, 1, 1, 6, 1]} />
        </instancedMesh>
      </group>
    </>
  );
}
