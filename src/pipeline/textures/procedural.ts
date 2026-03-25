import {
  float,
  hash,
  positionLocal,
  uv,
  mix,
  smoothstep,
} from 'three/tsl';
// ============================================================
// Noise Generators
// ============================================================

/**
 * Single-octave hash noise at given scale.
 * Returns a float node in [0, 1].
 */
export function hashNoise(scale = 25) {
  return hash(positionLocal.mul(scale));
}

/**
 * Multi-octave hash noise blending multiple frequencies.
 * Default 3 octaves at scales [25, 67, 143] with weights [0.5, 0.3, 0.2].
 * Proven pattern from noise-dissolve demo.
 */
export function multiOctaveNoise(
  scales: number[] = [25, 67, 143],
  weights: number[] = [0.5, 0.3, 0.2],
) {
  let result = hash(positionLocal.mul(scales[0])).mul(weights[0]);
  for (let i = 1; i < scales.length; i++) {
    const scale = scales[i] ?? scales[scales.length - 1];
    const weight = weights[i] ?? weights[weights.length - 1];
    result = result.add(hash(positionLocal.mul(scale)).mul(weight));
  }
  return result;
}

/**
 * Fractional Brownian motion approximation using layered hash noise.
 * Each octave doubles frequency and halves amplitude.
 */
export function fbmNoise(
  octaves = 4,
  lacunarity = 2.0,
  gain = 0.5,
) {
  let result = hash(positionLocal.mul(25)).mul(0.5);
  let frequency = 25;
  let amplitude = 0.5;

  for (let i = 1; i < octaves; i++) {
    frequency *= lacunarity;
    amplitude *= gain;
    result = result.add(hash(positionLocal.mul(frequency)).mul(amplitude));
  }
  return result;
}

// ============================================================
// Pattern Generators
// ============================================================

/**
 * Checkerboard pattern using UV coordinates.
 * Returns a float node (0 or 1).
 */
export function checkerboard(scaleU = 8, scaleV = 8) {
  const uvCoord = uv();
  const u = uvCoord.x.mul(scaleU).floor();
  const v = uvCoord.y.mul(scaleV).floor();
  // (floor(u) + floor(v)) % 2 produces alternating 0/1
  return u.add(v).mod(2.0);
}

/**
 * Directional stripes using UV coordinates.
 * Returns a float node in [0, 1].
 */
export function stripes(
  axis: 'u' | 'v' = 'u',
  frequency = 10,
  sharpness = 0.1,
) {
  const uvCoord = uv();
  const component = axis === 'u' ? uvCoord.x : uvCoord.y;
  const sineWave = component.mul(frequency * Math.PI * 2).sin().mul(0.5).add(0.5);
  return smoothstep(float(0.5 - sharpness), float(0.5 + sharpness), sineWave);
}

/**
 * Brick pattern using UV coordinates with row offset for staggering.
 * Returns a float node (0 = mortar, 1 = brick).
 */
export function brick(
  columns = 8,
  rows = 16,
  mortarWidth = 0.05,
) {
  const uvCoord = uv();

  // Scale UVs to brick grid
  const scaledU = uvCoord.x.mul(columns);
  const scaledV = uvCoord.y.mul(rows);

  // Offset every other row by 0.5 for staggering
  const row = scaledV.floor();
  const offsetU = scaledU.add(row.mod(2.0).mul(0.5));

  // Fractional position within each brick cell
  const fractU = offsetU.fract();
  const fractV = scaledV.fract();

  // Mortar detection: narrow bands at edges of each cell
  const halfMortar = mortarWidth * 0.5;
  const horizontalBrick = smoothstep(float(halfMortar), float(halfMortar + 0.02), fractU)
    .mul(smoothstep(float(halfMortar), float(halfMortar + 0.02), float(1.0).sub(fractU)));
  const verticalBrick = smoothstep(float(halfMortar), float(halfMortar + 0.02), fractV)
    .mul(smoothstep(float(halfMortar), float(halfMortar + 0.02), float(1.0).sub(fractV)));

  return horizontalBrick.mul(verticalBrick);
}

/**
 * Wood grain concentric ring pattern.
 * Based on the wood preset pattern but generalized.
 */
export function woodGrain(
  frequency = 20,
  ringTightness = 0.5,
) {
  // Distance from a local axis for ring pattern
  const dist = positionLocal.x.mul(2)
    .add(positionLocal.y.mul(frequency))
    .add(positionLocal.z.mul(2))
    .sin()
    .mul(0.5)
    .add(0.5);

  return smoothstep(float(0.5 - ringTightness * 0.5), float(0.5 + ringTightness * 0.5), dist);
}

// ============================================================
// Weathering Generators
// ============================================================

/**
 * Rust patches using multi-frequency hash noise.
 * Returns a float node representing rust density (0 = clean, 1 = fully rusted).
 */
export function rustPatches(
  density = 0.5,
  _roughnessVar = 0.2,
) {
  const noise1 = hash(positionLocal.mul(15));
  const noise2 = hash(positionLocal.mul(40));
  const combined = noise1.mul(0.6).add(noise2.mul(0.4));
  return smoothstep(float(1.0 - density), float(1.0), combined);
}

/**
 * Dirt accumulation using gravity-based positioning combined with noise.
 * Returns a float node representing dirt amount (0 = clean, 1 = fully dirty).
 */
export function dirtAccumulation(amount = 0.3) {
  // Gravity-based: lower areas and noise-based concavities get more dirt
  const heightFactor = float(1.0).sub(positionLocal.y.mul(0.5).add(0.5)).max(0.0);
  const noiseFactor = hash(positionLocal.mul(30));
  return mix(float(0.0), float(1.0), heightFactor.mul(noiseFactor).mul(amount));
}
