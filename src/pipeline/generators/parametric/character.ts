import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Generator, GeneratorResult, SceneObject } from '../types.ts';
import { seededRandom, normalizeForMerge } from './helpers.ts';

interface CharacterPreset {
  height: number;
  headRadius: number;
  torsoHeight: number;
  torsoWidth: number;
  torsoDepth: number;
  armLength: number;
  armRadius: number;
  legLength: number;
  legRadius: number;
  pose: 'standing' | 'tpose' | 'action';
}

const CHARACTER_PRESETS: Record<string, CharacterPreset> = {
  human: {
    height: 1.8, headRadius: 0.12,
    torsoHeight: 0.6, torsoWidth: 0.35, torsoDepth: 0.2,
    armLength: 0.55, armRadius: 0.04,
    legLength: 0.75, legRadius: 0.05,
    pose: 'standing',
  },
  robot: {
    height: 1.8, headRadius: 0.14,
    torsoHeight: 0.55, torsoWidth: 0.4, torsoDepth: 0.25,
    armLength: 0.5, armRadius: 0.05,
    legLength: 0.7, legRadius: 0.06,
    pose: 'standing',
  },
  creature: {
    height: 1.4, headRadius: 0.18,
    torsoHeight: 0.5, torsoWidth: 0.45, torsoDepth: 0.3,
    armLength: 0.6, armRadius: 0.05,
    legLength: 0.5, legRadius: 0.07,
    pose: 'standing',
  },
  child: {
    height: 1.0, headRadius: 0.13,
    torsoHeight: 0.35, torsoWidth: 0.25, torsoDepth: 0.15,
    armLength: 0.3, armRadius: 0.03,
    legLength: 0.4, legRadius: 0.04,
    pose: 'standing',
  },
};

const CHARACTER_KEYWORDS = [
  'character', 'human', 'humanoid', 'person', 'figure', 'robot', 'android',
  'creature', 'monster', 'npc', 'soldier', 'warrior', 'villager', 'zombie',
  'skeleton', 'alien humanoid', 'child', 'kid',
];

function generateCharacterBody(preset: CharacterPreset, rng: () => number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // Calculate vertical layout
  const legBottom = 0;
  const legTop = legBottom + preset.legLength;
  const torsoBottom = legTop;
  const torsoTop = torsoBottom + preset.torsoHeight;
  const headCenter = torsoTop + preset.headRadius + 0.02;

  // Head
  const isRobot = preset.torsoWidth >= 0.4 && preset.torsoDepth >= 0.25;
  if (isRobot) {
    const head = new THREE.BoxGeometry(
      preset.headRadius * 2, preset.headRadius * 2, preset.headRadius * 2,
    );
    head.translate(0, headCenter, 0);
    parts.push(normalizeForMerge(head));
  } else {
    const head = new THREE.SphereGeometry(preset.headRadius, 8, 6);
    head.translate(0, headCenter, 0);
    parts.push(normalizeForMerge(head));
  }

  // Torso
  const torso = new THREE.BoxGeometry(preset.torsoWidth, preset.torsoHeight, preset.torsoDepth);
  torso.translate(0, torsoBottom + preset.torsoHeight / 2, 0);
  parts.push(normalizeForMerge(torso));

  // Determine arm angles based on pose
  let armAngleLeft = 10; // degrees from vertical
  let armAngleRight = 10;
  if (preset.pose === 'tpose') {
    armAngleLeft = 90;
    armAngleRight = 90;
  } else if (preset.pose === 'action') {
    armAngleLeft = 60;
    armAngleRight = 20;
  }

  // Arms
  const shoulderY = torsoTop - 0.05;
  const shoulderOffset = preset.torsoWidth / 2 + preset.armRadius;

  // Left arm
  const leftArm = new THREE.CylinderGeometry(preset.armRadius * 0.8, preset.armRadius, preset.armLength, 6);
  leftArm.translate(0, -preset.armLength / 2, 0);
  const leftArmMatrix = new THREE.Matrix4();
  leftArmMatrix.makeRotationZ((armAngleLeft * Math.PI) / 180);
  leftArm.applyMatrix4(leftArmMatrix);
  leftArm.translate(-shoulderOffset, shoulderY, 0);
  parts.push(normalizeForMerge(leftArm));

  // Right arm
  const rightArm = new THREE.CylinderGeometry(preset.armRadius * 0.8, preset.armRadius, preset.armLength, 6);
  rightArm.translate(0, -preset.armLength / 2, 0);
  const rightArmMatrix = new THREE.Matrix4();
  rightArmMatrix.makeRotationZ((-armAngleRight * Math.PI) / 180);
  rightArm.applyMatrix4(rightArmMatrix);
  rightArm.translate(shoulderOffset, shoulderY, 0);
  parts.push(normalizeForMerge(rightArm));

  // Hands (small spheres at arm endpoints)
  const leftHandAngle = (armAngleLeft * Math.PI) / 180;
  const leftHandX = -shoulderOffset - Math.sin(leftHandAngle) * preset.armLength;
  const leftHandY = shoulderY - Math.cos(leftHandAngle) * preset.armLength;
  const leftHand = new THREE.SphereGeometry(preset.armRadius * 1.3, 4, 4);
  leftHand.translate(leftHandX, leftHandY, 0);
  parts.push(normalizeForMerge(leftHand));

  const rightHandAngle = (armAngleRight * Math.PI) / 180;
  const rightHandX = shoulderOffset + Math.sin(rightHandAngle) * preset.armLength;
  const rightHandY = shoulderY - Math.cos(rightHandAngle) * preset.armLength;
  const rightHand = new THREE.SphereGeometry(preset.armRadius * 1.3, 4, 4);
  rightHand.translate(rightHandX, rightHandY, 0);
  parts.push(normalizeForMerge(rightHand));

  // Legs
  const hipOffset = preset.torsoWidth / 4;

  // Determine leg pose
  let leftLegAngle = 0;
  let rightLegAngle = 0;
  if (preset.pose === 'action') {
    leftLegAngle = 20;
    rightLegAngle = -10;
  }

  // Left leg
  const leftLeg = new THREE.CylinderGeometry(preset.legRadius * 0.9, preset.legRadius, preset.legLength, 6);
  leftLeg.translate(0, -preset.legLength / 2, 0);
  if (leftLegAngle !== 0) {
    const leftLegMatrix = new THREE.Matrix4();
    leftLegMatrix.makeRotationX((leftLegAngle * Math.PI) / 180);
    leftLeg.applyMatrix4(leftLegMatrix);
  }
  leftLeg.translate(-hipOffset, torsoBottom, 0);
  parts.push(normalizeForMerge(leftLeg));

  // Right leg
  const rightLeg = new THREE.CylinderGeometry(preset.legRadius * 0.9, preset.legRadius, preset.legLength, 6);
  rightLeg.translate(0, -preset.legLength / 2, 0);
  if (rightLegAngle !== 0) {
    const rightLegMatrix = new THREE.Matrix4();
    rightLegMatrix.makeRotationX((rightLegAngle * Math.PI) / 180);
    rightLeg.applyMatrix4(rightLegMatrix);
  }
  rightLeg.translate(hipOffset, torsoBottom, 0);
  parts.push(normalizeForMerge(rightLeg));

  // Feet (small boxes at leg endpoints)
  const footLength = preset.legRadius * 3;
  const footHeight = preset.legRadius * 1.5;

  const leftFoot = new THREE.BoxGeometry(preset.legRadius * 2, footHeight, footLength);
  const leftFootY = legBottom + footHeight / 2;
  leftFoot.translate(-hipOffset, leftFootY, footLength * 0.2);
  parts.push(normalizeForMerge(leftFoot));

  const rightFoot = new THREE.BoxGeometry(preset.legRadius * 2, footHeight, footLength);
  rightFoot.translate(hipOffset, leftFootY, footLength * 0.2);
  parts.push(normalizeForMerge(rightFoot));

  // Add slight asymmetry for creature type
  if (preset.torsoWidth >= 0.45) {
    // Creature: displace some vertices slightly
    const merged = mergeGeometries(parts, false);
    if (!merged) throw new Error('Failed to merge character geometries');
    const positions = merged.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const disp = (rng() - 0.5) * 0.02;
      positions.setX(i, positions.getX(i) + disp);
    }
    return merged;
  }

  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error('Failed to merge character geometries');
  return merged;
}

export const characterGenerator: Generator = {
  name: 'parametric/character',

  canHandle(object: SceneObject): number {
    if (object.generator === 'parametric/character') return 0.95;
    const prompt = object.prompt.toLowerCase();
    const matchCount = CHARACTER_KEYWORDS.filter(kw => prompt.includes(kw)).length;
    if (matchCount >= 2) return 0.7;
    if (matchCount === 1) return 0.5;
    return 0;
  },

  generate(object: SceneObject): GeneratorResult {
    const start = performance.now();
    const params = object.params ?? {};

    const typeName = (params.type as string) ?? 'human';
    const seed = (params.seed as number) ?? 0;
    const rng = seededRandom(seed);

    const basePreset = CHARACTER_PRESETS[typeName] ?? CHARACTER_PRESETS.human;
    const pose = (params.pose as CharacterPreset['pose']) ?? basePreset.pose;
    const preset: CharacterPreset = {
      height: (params.height as number) ?? basePreset.height,
      headRadius: (params.headRadius as number) ?? basePreset.headRadius,
      torsoHeight: (params.torsoHeight as number) ?? basePreset.torsoHeight,
      torsoWidth: (params.torsoWidth as number) ?? basePreset.torsoWidth,
      torsoDepth: (params.torsoDepth as number) ?? basePreset.torsoDepth,
      armLength: (params.armLength as number) ?? basePreset.armLength,
      armRadius: (params.armRadius as number) ?? basePreset.armRadius,
      legLength: (params.legLength as number) ?? basePreset.legLength,
      legRadius: (params.legRadius as number) ?? basePreset.legRadius,
      pose,
    };

    const geometry = generateCharacterBody(preset, rng);
    geometry.computeVertexNormals();

    const elapsed = performance.now() - start;

    return {
      geometry,
      metadata: {
        vertexCount: geometry.attributes.position.count,
        faceCount: geometry.index ? geometry.index.count / 3 : 0,
        generator: 'parametric/character',
        prompt: object.prompt,
        generationTime: elapsed,
      },
    };
  },
};
