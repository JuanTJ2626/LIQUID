/**
 * physics.ts
 *
 * Physical optical refraction math engine based directly on Kube's Liquid Glass technique:
 * https://kube.io/blog/liquid-glass-css-svg
 *
 * Classification:
 * ───────────────
 * KUBE CORE:
 *   • Surface profile h(r) & derivative dh/dr
 *   • Surface normal vector N
 *   • Vector Snell's Law refraction: n1 * sin(θ1) = n2 * sin(θ2) => refracted ray R
 *   • Radial displacement magnitude precomputation
 *   • 2D screen vector field construction
 *
 * EXTENSIONS (Optional Layer):
 *   • Schlick Fresnel specular formula
 *   • Additional profiles (lip, concave, mixed)
 */

export type SurfaceType = 'convex-circle' | 'convex-squircle' | 'concave' | 'lip' | 'mixed';

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface RefractionRayResult {
  refracted: Vector3 | null;
  tir: boolean; // Total Internal Reflection flag
  cosTheta1: number;
  cosTheta2: number;
}

export interface RefractionField {
  /** Normalized displacement magnitudes in [-1..1] for radial distance samples [0..1] */
  normalizedDisplacements: Float32Array;
  /** Maximum un-normalized displacement magnitude in pixels */
  maximumDisplacement: number;
  /** Number of radial samples */
  numSamples: number;
  /** Fresnel highlight intensity curve [0..1] for radial samples */
  fresnelHighlights: Float32Array;
}

// ── 1. Smooth Step Helpers ───────────────────────────────────────────────────

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function smootherstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * t * (t * (t * 6 - 15) + 10);
}

// ── 2. Surface Height Profile Abstraction ────────────────────────────────────

/**
 * Surface profile function h(r) evaluated naturally across r ∈ [0..1]
 * @param r Normalized radial distance [0..1] from center (0) to outer edge (1)
 * @param bezelFrac Fraction of radius dedicated to the bevel rim [0.05..0.5]
 * @param type Surface shape profile
 * @returns Height value h ∈ [0..1]
 */
export function surfaceProfile(r: number, bezelFrac: number, type: SurfaceType): number {
  const clampedR = Math.max(0, Math.min(1.0, r));

  const bezelStart = 1.0 - Math.min(0.9, Math.max(0.05, bezelFrac));

  switch (type) {
    case 'convex-circle': {
      if (clampedR <= bezelStart) return 1.0;
      const t = (clampedR - bezelStart) / (1.0 - bezelStart);
      return Math.sqrt(Math.max(0, 1.0 - t * t));
    }

    case 'convex-squircle': {
      // Superellipse profile (Kube / Apple squircle style): h(t) = (1 - t²)^(1/4)
      if (clampedR <= bezelStart) return 1.0;
      const t = (clampedR - bezelStart) / (1.0 - bezelStart);
      return Math.pow(Math.max(0, 1.0 - t * t), 0.25);
    }

    case 'concave': {
      // Inward bowl depression profile (EXTENSION)
      if (clampedR <= bezelStart) {
        const s = clampedR / bezelStart;
        return 1.0 - Math.sqrt(Math.max(0, 1.0 - s * s)) * 0.65;
      }
      const t = (clampedR - bezelStart) / (1.0 - bezelStart);
      return smoothstep(0, 1, 1.0 - t);
    }

    case 'lip': {
      // Convex rim bulge + concave center (EXTENSION)
      if (clampedR <= bezelStart) {
        const s = clampedR / bezelStart;
        return 1.0 - 0.25 * smootherstep(0, 1, s);
      }
      const t = (clampedR - bezelStart) / (1.0 - bezelStart);
      const bulge = 4.0 * t * (1.0 - t);
      return (1.0 - t) + 0.35 * bulge;
    }

    case 'mixed': {
      // Hybrid blending (EXTENSION)
      const squircle = surfaceProfile(clampedR, bezelFrac, 'convex-squircle');
      const concave = surfaceProfile(clampedR, bezelFrac, 'concave');
      const blend = smootherstep(0, 1, clampedR);
      return (1.0 - blend) * concave + blend * squircle;
    }

    default:
      return Math.max(0, 1.0 - clampedR);
  }
}

// ── 3. Surface Derivative & Normal ───────────────────────────────────────────

/**
 * Raw derivative vs Numerically Regularized Derivative:
 * Raw derivative of squircle profile (1 - t²)^0.25 approaches -infinity as t -> 1.
 * To avoid numerical singularity in finite precision, we apply a smooth regularization clamp.
 */
export function calcSurfaceSlope(
  r: number,
  bezelFrac: number,
  type: SurfaceType,
  eps = 1e-4
): number {
  const h0 = surfaceProfile(r, bezelFrac, type);
  const h1 = surfaceProfile(r + eps, bezelFrac, type);
  const rawSlope = (h1 - h0) / eps;

  // Numerically regularized slope: bound to [-60..60] to prevent div-by-zero
  return Math.max(-60, Math.min(60, rawSlope));
}

/**
 * Calculates unit 3D surface normal vector N at radial distance r and angle theta
 * Guaranteed: length(N) == 1.0
 */
export function calcSurfaceNormal(
  r: number,
  angleRad: number,
  bezelFrac: number,
  type: SurfaceType
): Vector3 {
  const slope = calcSurfaceSlope(r, bezelFrac, type);
  const mag = Math.sqrt(slope * slope + 1.0);

  // Outward normal vector components
  const nx = (-slope / mag) * Math.cos(angleRad);
  const ny = (-slope / mag) * Math.sin(angleRad);
  const nz = 1.0 / mag;

  return { x: nx, y: ny, z: nz };
}

// ── 4. Snell's Law Vector Refraction ──────────────────────────────────────────

/**
 * Computes vector refraction according to Snell's Law:
 *   n1 * sin(θ1) = n2 * sin(θ2)
 *
 * Vector equation:
 *   R = (n1/n2) * I + ((n1/n2) * cos(θ1) - cos(θ2)) * N
 *
 * Guaranteed: length(R) == 1.0 when tir is false.
 */
export function refractRay(
  incident: Vector3,
  normal: Vector3,
  n1: number,
  n2: number
): RefractionRayResult {
  const eta = n1 / n2;

  // cos(θ1) = - (I · N)
  const cosTheta1 = -(incident.x * normal.x + incident.y * normal.y + incident.z * normal.z);

  const N = cosTheta1 < 0
    ? { x: -normal.x, y: -normal.y, z: -normal.z }
    : normal;
  const c1 = Math.abs(cosTheta1);

  // k = 1 - eta² * (1 - c1²)
  const k = 1.0 - eta * eta * (1.0 - c1 * c1);

  // Total Internal Reflection (TIR) check
  if (k < 0) {
    return { refracted: null, tir: true, cosTheta1: c1, cosTheta2: 0 };
  }

  const c2 = Math.sqrt(k);
  const scale = eta * c1 - c2;

  const R: Vector3 = {
    x: eta * incident.x + scale * N.x,
    y: eta * incident.y + scale * N.y,
    z: eta * incident.z + scale * N.z,
  };

  return { refracted: R, tir: false, cosTheta1: c1, cosTheta2: c2 };
}

// ── 5. Fresnel Specular Highlight (Schlick Approximation - EXTENSION) ──────

export function fresnelSchlick(cosTheta: number, ior: number): number {
  const clampedCos = Math.max(0, Math.min(1, cosTheta));
  const f0 = Math.pow((1.0 - ior) / (1.0 + ior), 2);
  return f0 + (1.0 - f0) * Math.pow(1.0 - clampedCos, 5);
}

// ── 6. 1D Radial Refraction Precomputation (Kube Core Half-Slice) ───────────

export interface RefractionOptions {
  surfaceType: SurfaceType;
  refractiveIndex: number;
  bezelWidth: number;
  thickness: number;
  numSamples?: number;
}

/**
 * Computes 1D radial refraction field across numSamples radial steps.
 * This precalculated 1D slice is mapped radially onto the 2D canvas (Kube core optimization).
 */
export function computeRefractionField(opts: RefractionOptions): RefractionField {
  const {
    surfaceType,
    refractiveIndex: n2,
    bezelWidth,
    thickness,
    numSamples = 127,
  } = opts;

  const n1 = 1.0; // Air
  const rawDisplacements = new Float32Array(numSamples);
  const fresnelHighlights = new Float32Array(numSamples);
  let maxDisp = 0;

  const incident: Vector3 = { x: 0, y: 0, z: -1 };

  for (let i = 0; i < numSamples; i++) {
    const r = i / (numSamples - 1);

    const normal = calcSurfaceNormal(r, 0, bezelWidth, surfaceType);
    const fresnel = fresnelSchlick(normal.z, n2);
    fresnelHighlights[i] = fresnel;

    const result = refractRay(incident, normal, n1, n2);

    if (result.tir || !result.refracted) {
      rawDisplacements[i] = 0;
      continue;
    }

    // Screen displacement vector is lateral deviation of refracted ray scaled by thickness
    // Δx = (Rx / -Rz) * thickness
    const rz = Math.abs(result.refracted.z) > 1e-4 ? result.refracted.z : -1e-4;
    const dispX = (result.refracted.x / -rz) * thickness;

    // Smooth Hermite edge fade (r in [0.85..1.0]) to ensure derivative d(disp)/dr > -1.0
    // Prevents SVG feDisplacementMap fold-back mirror artifacts at the outer rim boundary
    const tEdge = Math.max(0, Math.min(1, (1.0 - r) / 0.15));
    const edgeFade = tEdge * tEdge * (3.0 - 2.0 * tEdge);

    rawDisplacements[i] = dispX * edgeFade;
    const absDisp = Math.abs(dispX);
    if (absDisp > maxDisp) maxDisp = absDisp;
  }

  // Normalize displacements to [-1..1]
  const normalizedDisplacements = new Float32Array(numSamples);
  if (maxDisp > 0) {
    for (let i = 0; i < numSamples; i++) {
      normalizedDisplacements[i] = rawDisplacements[i] / maxDisp;
    }
  }

  return {
    normalizedDisplacements,
    maximumDisplacement: maxDisp,
    numSamples,
    fresnelHighlights,
  };
}
