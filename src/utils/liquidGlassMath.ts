/**
 * liquidGlassMath.ts
 *
 * Physical refraction math engine for the Liquid Glass SVG effect.
 * Based on Snell's Law of refraction: n1 * sin(θ1) = n2 * sin(θ2)
 *
 * Architecture:
 * 1. A surface height function h(r) maps radial distance [0..1] → height [0..1].
 * 2. We numerically differentiate h(r) to get the surface slope (normal).
 * 3. We apply Snell's Law at each point to compute the refracted ray direction.
 * 4. The difference between incident and refracted ray gives a displacement vector.
 * 5. We sample 127 radial positions and normalize by the maximum displacement,
 *    producing a compact float32 array usable as a displacement map lookup table.
 */

// ── Surface type definitions ──────────────────────────────────────────────────

export type SurfaceType = 'convex-circle' | 'convex-squircle' | 'concave' | 'lip';

/**
 * Smoothstep: cubic Hermite interpolation on [0..1].
 * Used to create smooth transitions in surface profiles.
 */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Smootherstep: Ken Perlin's quintic variant.
 * Produces zero first AND second derivatives at edges — ideal for blending
 * convex and concave surface profiles without visible seams.
 */
function smootherstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/**
 * Surface height functions.
 * Each takes a normalized radial distance r ∈ [0..1] (0 = center, 1 = edge)
 * and returns a height value h ∈ [0..1] (1 = tallest point outward).
 *
 * The "bezel fraction" controls what portion of the radius is the flat lens
 * body vs. the curved rim bevel.
 */
const surfaceFunctions: Record<SurfaceType, (r: number, bezelFrac: number) => number> = {
  /**
   * Convex circle: smooth circular dome.
   * Center is highest; height falls off as sqrt(1 - r²) (hemisphere profile).
   */
  'convex-circle': (r, bezelFrac) => {
    if (r > 1) return 0;
    // Flat center + hemispherical bevel
    const bezelStart = 1 - bezelFrac;
    if (r <= bezelStart) return 1;
    const t = (r - bezelStart) / bezelFrac;
    // Hemisphere profile on the bevel
    return Math.sqrt(Math.max(0, 1 - t * t));
  },

  /**
   * Convex squircle: Apple-style superellipse profile.
   * Uses a power-4 distance metric (squircle) for the falloff, giving
   * straighter sides and softer corners than a pure circle.
   */
  'convex-squircle': (r, bezelFrac) => {
    if (r > 1) return 0;
    const bezelStart = 1 - bezelFrac;
    if (r <= bezelStart) return 1;
    const t = (r - bezelStart) / bezelFrac;
    // Superellipse falloff: (1 - t^2)^(1/4) gives that characteristic Apple squircle shape
    return Math.pow(Math.max(0, 1 - t * t), 0.25);
  },

  /**
   * Concave: bowl-shaped inward surface.
   * Creates a depression effect — center is lowest, edges curve up.
   */
  'concave': (r, bezelFrac) => {
    if (r > 1) return 0;
    const bezelStart = 1 - bezelFrac;
    if (r <= bezelStart) {
      // Center area: inverted hemisphere (concave bowl)
      const s = r / bezelStart;
      return 1 - Math.sqrt(Math.max(0, 1 - s * s)) * 0.7;
    }
    // Bevel rim curves back up to edge
    const t = (r - bezelStart) / bezelFrac;
    return smoothstep(0, 1, 1 - t);
  },

  /**
   * Lip: hybrid convex-concave "meniscus" surface.
   * Edge bulges outward while center dips slightly inward.
   * Mimics the physical shape of liquid glass droplet lips.
   * Uses smootherstep blending for zero-derivative transitions.
   */
  'lip': (r, bezelFrac) => {
    if (r > 1) return 0;
    const bezelStart = 1 - bezelFrac;
    if (r <= bezelStart) {
      // Gently concave center
      const s = r / bezelStart;
      return 1 - 0.3 * smootherstep(0, 1, s);
    }
    // Convex bulge on the rim
    const t = (r - bezelStart) / bezelFrac;
    // Rises then falls: peak at t≈0.5
    const bulge = 4 * t * (1 - t);
    const base = 1 - t;
    return base + 0.4 * bulge;
  },
};

// ── Snell's Law refraction engine ─────────────────────────────────────────────

/**
 * Options for computing the refraction field.
 */
export interface RefractionOptions {
  /** Surface profile type */
  surfaceType: SurfaceType;
  /** Refractive index of the glass medium (1.0 = air, 1.5 = glass, ~1.3 = water) */
  refractiveIndex: number;
  /** Width of the bevel rim as a fraction of radius [0..1] */
  bezelWidth: number;
  /** Number of radial samples (127 matches the article's reference implementation) */
  numSamples?: number;
}

/**
 * Computed refraction field: a normalized float array + scaling factor.
 */
export interface RefractionField {
  /**
   * Array of normalized displacement magnitudes at each radial distance.
   * Index i corresponds to r = i / (numSamples - 1).
   * Values are in [-1..1] (0 = no displacement).
   */
  normalizedDisplacements: Float32Array;
  /**
   * The maximum raw displacement magnitude (before normalization).
   * Use this as the `scale` parameter in <feDisplacementMap> to get
   * pixel-accurate displacement from the normalized map.
   */
  maximumDisplacement: number;
  /** Number of samples in normalizedDisplacements */
  numSamples: number;
}

/**
 * Computes the refraction displacement field for a given surface profile.
 *
 * Math walkthrough for each radial sample r:
 *
 * 1. Evaluate surface height h(r) and h(r+ε) to get slope = dh/dr.
 * 2. The surface outward normal is (-slope, 1) normalized → (nx, ny).
 * 3. Incident ray: vertical downward = (0, -1) in object space.
 * 4. cos(θ₁) = dot(incident_reversed, normal) = ny (component along normal).
 * 5. sin(θ₁) = sqrt(1 - cos²θ₁).
 * 6. Snell: sin(θ₂) = (n1/n2) * sin(θ₁).
 * 7. If sin(θ₂) > 1: total internal reflection → treat as no displacement.
 * 8. Refracted ray direction via vector form of Snell's Law:
 *    refracted = (n1/n2)*incident + (n1/n2*cosθ₁ - cosθ₂)*normal
 * 9. Displacement = refracted.x - incident.x (lateral shift of the ray).
 */
export function computeRefractionField(opts: RefractionOptions): RefractionField {
  const {
    surfaceType,
    refractiveIndex: n2,
    bezelWidth,
    numSamples = 127,
  } = opts;

  const n1 = 1.0; // Air (incident medium)
  const nRatio = n1 / n2;
  const surfaceFn = surfaceFunctions[surfaceType];
  const epsilon = 1e-4; // Small step for numerical derivative

  const rawDisplacements = new Float32Array(numSamples);
  let maxDisp = 0;

  for (let i = 0; i < numSamples; i++) {
    // Normalized radial distance from center [0..1]
    const r = i / (numSamples - 1);

    // ── Step 1: Surface height and slope ──────────────────────────────────────
    const h0 = surfaceFn(r, bezelWidth);
    const h1 = surfaceFn(r + epsilon, bezelWidth);
    const slope = (h1 - h0) / epsilon; // dh/dr (radial derivative)

    // ── Step 2: Outward surface normal ────────────────────────────────────────
    // In 2D cross-section: surface tangent is (1, slope), so normal is (-slope, 1)
    // We normalize it to unit length.
    const normalMag = Math.sqrt(slope * slope + 1);
    const nx = -slope / normalMag;
    const ny = 1 / normalMag;

    // ── Step 3: Incident ray (vertical, downward) ─────────────────────────────
    const ix = 0;
    const iy = -1; // Pointing downward into the surface

    // ── Step 4: cos(θ₁) = dot(-incident, normal) ─────────────────────────────
    // -incident = (0, 1), dot with (nx, ny) = ny
    const cosTheta1 = -ix * nx + (-iy) * ny; // = ny

    // ── Step 5: sin(θ₁) ───────────────────────────────────────────────────────
    const sinTheta1 = Math.sqrt(Math.max(0, 1 - cosTheta1 * cosTheta1));

    // ── Step 6: Snell's Law: sin(θ₂) = (n1/n2) * sin(θ₁) ────────────────────
    const sinTheta2 = nRatio * sinTheta1;

    // ── Step 7: Check for total internal reflection ───────────────────────────
    if (sinTheta2 >= 1) {
      rawDisplacements[i] = 0; // TIR: no transmission
      continue;
    }

    const cosTheta2 = Math.sqrt(1 - sinTheta2 * sinTheta2);

    // ── Step 8: Refracted ray (vector form of Snell's Law) ────────────────────
    // refracted = nRatio * incident + (nRatio * cosθ₁ - cosθ₂) * normal
    const refractedX = nRatio * ix + (nRatio * cosTheta1 - cosTheta2) * nx;
    // const refractedY = nRatio * iy + (nRatio * cosTheta1 - cosTheta2) * ny;

    // ── Step 9: Lateral displacement ──────────────────────────────────────────
    // How much does the ray shift horizontally from the incident position?
    const displacement = refractedX - ix; // = refractedX (since ix = 0)
    rawDisplacements[i] = displacement;

    const absDisp = Math.abs(displacement);
    if (absDisp > maxDisp) maxDisp = absDisp;
  }

  // ── Normalization ──────────────────────────────────────────────────────────
  // Scale all displacements to [-1..1] range.
  // The actual pixel displacement will be restored via feDisplacementMap's scale attribute.
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
  };
}
