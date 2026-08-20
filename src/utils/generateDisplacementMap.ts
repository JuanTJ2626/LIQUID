/**
 * generateDisplacementMap.ts
 *
 * Canvas-based displacement map generator for the Liquid Glass effect.
 *
 * What this module produces:
 * ──────────────────────────
 * A PNG image (as Data URL) where each pixel encodes a 2D displacement vector:
 *   • R channel → horizontal (X) displacement  — 128 = neutral, 0 = max left, 255 = max right
 *   • G channel → vertical (Y) displacement    — 128 = neutral, 0 = max up,   255 = max down
 *   • B channel → 128 (unused, fixed neutral)
 *   • A channel → 255 (fully opaque)
 *
 * The SVG <feDisplacementMap> primitive reads this image and shifts each pixel
 * of the source graphic by (R - 128) * scale and (G - 128) * scale pixels.
 *
 * Symmetry optimization:
 * ──────────────────────
 * Because the surface is radially symmetric, we only need to compute
 * the displacement at each radial distance once (from the 1D field),
 * then rotate that value around the center to fill the full 2D canvas.
 * This matches the "half-slice" approach described in the reference article.
 *
 * Rectangle support:
 * ──────────────────
 * For rounded rectangles (squircle shapes), we stretch the central region
 * horizontally/vertically so the circular displacement profile maps onto
 * a rectangle outline. Points inside the "safe zone" use the corner radius
 * distance, while points in the flat stretch use the perpendicular edge distance.
 */

import { type RefractionField } from './liquidGlassMath';

/** Output from the displacement map generator */
export interface DisplacementMapResult {
  /** Data URL of the generated PNG displacement map */
  dataUrl: string;
  /** The raw maximum displacement in pixels — use as feDisplacementMap scale */
  maximumDisplacement: number;
  /** Canvas width */
  width: number;
  /** Canvas height */
  height: number;
}

export interface GenerateMapOptions {
  /** Output canvas width in pixels */
  width: number;
  /** Output canvas height in pixels */
  height: number;
  /**
   * Corner radius in pixels. If width !== height this produces a rounded rectangle.
   * If width === height and borderRadius >= width/2 it's a full circle.
   */
  borderRadius: number;
  /** The refraction field computed by liquidGlassMath.computeRefractionField() */
  refractionField: RefractionField;
  /**
   * Physical pixel scale: the maximum displacement in pixels
   * (i.e. bezelWidth * min(width, height) / 2 in real pixels).
   * This is used to set the effective radius of the bevel in canvas space.
   */
  bezelPixelWidth: number;
}

/**
 * Given a point (px, py) in canvas space and the element dimensions,
 * compute the "effective radial distance" from the glass boundary.
 *
 * Returns:
 *   { dist: number [0..1], angle: number [0..2π] }
 *
 * For circles: dist is the Euclidean distance from center, normalized to [0..1].
 * For rounded rectangles: dist is based on distance from the nearest rounded
 * corner center or flat edge, normalized so that the inner boundary = 0 and
 * outer boundary (element edge) = 1.
 *
 * The `angle` is the direction FROM the nearest boundary point TOWARD
 * the center of the element (i.e. the direction the displacement pushes).
 */
function getEffectiveRadialCoords(
  px: number,
  py: number,
  width: number,
  height: number,
  borderRadius: number,
): { dist: number; angle: number } {
  const cx = width / 2;
  const cy = height / 2;

  // Clamp borderRadius to meaningful range
  const r = Math.min(borderRadius, Math.min(width, height) / 2);

  // For a rounded rectangle, we compute the "signed distance" from the
  // rounded-rect boundary, which tells us how far inside/outside the shape we are.
  // We use the standard SDF (Signed Distance Field) formula for rounded rectangles.
  const dx = Math.abs(px - cx) - (cx - r);
  const dy = Math.abs(py - cy) - (cy - r);

  // Distance from the rounded-rect boundary (positive = outside, negative = inside)
  const distFromEdge = Math.sqrt(Math.max(dx, 0) ** 2 + Math.max(dy, 0) ** 2)
    + Math.min(Math.max(dx, dy), 0) - r;

  // The "inward" displacement direction at this point:
  // For each pixel inside the glass, the displacement vector points
  // from the closest boundary point inward toward the center.
  // We approximate this as the gradient of the SDF.
  const eps = 0.5;
  const dxGrad = (Math.abs(px - cx + eps) - Math.abs(px - cx - eps)) / (2 * eps);
  const dyGrad = (Math.abs(py - cy + eps) - Math.abs(py - cy - eps)) / (2 * eps);

  const gradMag = Math.sqrt(dxGrad * dxGrad + dyGrad * dyGrad);
  const angle = gradMag > 0 ? Math.atan2(dyGrad / gradMag, dxGrad / gradMag) : 0;

  // Convert signed distance to normalized [0..1] where:
  //   1.0 = at the outer edge of the element
  //   0.0 = at the inner boundary of the bevel (center of glass)
  // Pixels outside the element (distFromEdge > 0) get dist > 1 → no displacement.
  const halfMin = Math.min(width, height) / 2;
  const dist = 1 + distFromEdge / halfMin;

  return { dist: Math.max(0, dist), angle };
}

/**
 * Samples the normalized displacement magnitude for a given radial distance.
 *
 * The refractionField contains discrete samples at evenly spaced radii.
 * We interpolate linearly between adjacent samples for a smooth result.
 */
function sampleDisplacement(field: RefractionField, r: number): number {
  const { normalizedDisplacements, numSamples } = field;

  // r=0 → center (index 0), r=1 → edge (index numSamples-1)
  const idx = r * (numSamples - 1);
  const i0 = Math.floor(idx);
  const i1 = Math.min(i0 + 1, numSamples - 1);
  const t = idx - i0;

  // Linear interpolation between adjacent samples
  return normalizedDisplacements[i0] * (1 - t) + normalizedDisplacements[i1] * t;
}

/**
 * Main displacement map generator.
 *
 * Renders a canvas where each pixel's R/G channels encode the 2D
 * refraction displacement vector at that position.
 *
 * Returns a Data URL suitable for use in <feImage href="...">.
 */
export function generateDisplacementMap(opts: GenerateMapOptions): DisplacementMapResult {
  const { width, height, borderRadius, refractionField, bezelPixelWidth } = opts;

  // Create an offscreen canvas
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('generateDisplacementMap: Could not get 2D canvas context');
  }

  const imageData = ctx.createImageData(width, height);
  const data = imageData.data;

  const cx = width / 2;
  const cy = height / 2;

  // The "effective radius" of the full glass element (to the outer boundary)
  const halfMin = Math.min(width, height) / 2;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixelIdx = (y * width + x) * 4;

      // ── Compute normalized radial distance + displacement direction ──────────
      const { dist, angle } = getEffectiveRadialCoords(x, y, width, height, borderRadius);

      // Pixels outside the element boundary get neutral (no displacement)
      if (dist > 1.0) {
        data[pixelIdx]     = 128; // R: neutral X
        data[pixelIdx + 1] = 128; // G: neutral Y
        data[pixelIdx + 2] = 128; // B: unused
        data[pixelIdx + 3] = 0;   // A: transparent (outside glass)
        continue;
      }

      // ── Sample the 1D refraction field at this radial distance ───────────────
      const normalizedDisp = sampleDisplacement(refractionField, dist);

      // ── Decompose displacement into X/Y using the surface angle ──────────────
      // The displacement magnitude is normalizedDisp * maximumDisplacement (pixels).
      // We scale it by the bevel width to get canvas-space pixel offsets.
      const dispMagnitude = normalizedDisp * bezelPixelWidth;

      // Direction: angle points away from the nearest boundary (outward normal direction).
      // The displacement is INWARD for convex glass (light bends toward center at edges).
      const dispX = -dispMagnitude * Math.cos(angle);
      const dispY = -dispMagnitude * Math.sin(angle);

      // ── Encode to R/G channels ────────────────────────────────────────────────
      // feDisplacementMap maps: pixel_offset = (channel_value / 255 * scale) - (scale / 2)
      // So for our encoding: channel_value = (dispX / bezelPixelWidth + 0.5) * 255
      // Clamped to [0..255].
      //
      // 128 = no displacement (neutral)
      // 0   = maximum displacement in negative direction
      // 255 = maximum displacement in positive direction
      const rVal = Math.round(Math.max(0, Math.min(255, 128 + (dispX / bezelPixelWidth) * 127)));
      const gVal = Math.round(Math.max(0, Math.min(255, 128 + (dispY / bezelPixelWidth) * 127)));

      data[pixelIdx]     = rVal; // R → X displacement
      data[pixelIdx + 1] = gVal; // G → Y displacement
      data[pixelIdx + 2] = 128;  // B → unused (neutral)
      data[pixelIdx + 3] = 255;  // A → fully opaque (inside glass)

      // Debug: draw a subtle height-mapped visualization (commented out)
      // const h = 1 - dist; // height at this pixel
      // data[pixelIdx + 2] = Math.round(h * 255);
    }
  }

  ctx.putImageData(imageData, 0, 0);

  // Add specular highlight gradient on top
  // A soft radial glow on the upper-left simulates the glass rim light
  const specGrad = ctx.createRadialGradient(
    cx * 0.6, cy * 0.4, 0,        // Inner: upper-left offset
    cx, cy, Math.max(cx, cy),     // Outer: full extent
  );
  specGrad.addColorStop(0, 'rgba(255,255,255,0.18)');
  specGrad.addColorStop(0.35, 'rgba(255,255,255,0.07)');
  specGrad.addColorStop(1, 'rgba(255,255,255,0)');

  ctx.globalCompositeOperation = 'screen'; // Additive blend for the highlight
  ctx.fillStyle = specGrad;

  // Clip to rounded rect shape before drawing specular highlight
  ctx.beginPath();
  const r = Math.min(borderRadius, halfMin);
  ctx.roundRect(0, 0, width, height, r);
  ctx.fill();

  ctx.globalCompositeOperation = 'source-over'; // Restore

  return {
    dataUrl: canvas.toDataURL('image/png'),
    maximumDisplacement: refractionField.maximumDisplacement,
    width,
    height,
  };
}

/**
 * Generates a separate specular highlight image for the glass rim.
 *
 * This is a separate canvas used in a second <feImage> + <feBlend> pass
 * in the SVG filter, so the specular brightness can be controlled independently
 * without modifying the displacement map.
 *
 * The highlight is a directional gradient that simulates a point light source
 * illuminating the curved glass surface from a given angle.
 */
export function generateSpecularMap(opts: {
  width: number;
  height: number;
  borderRadius: number;
  opacity: number;
  /** Light angle in degrees (0 = right, 90 = bottom, 180 = left, 270 = top) */
  lightAngle: number;
  /** Color saturation boost for iridescent tinting (0 = white light, 1 = colored) */
  saturation: number;
}): string {
  const { width, height, borderRadius, opacity, lightAngle, saturation } = opts;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const cx = width / 2;
  const cy = height / 2;
  const r = Math.min(borderRadius, Math.min(cx, cy));

  // Light direction vector from angle
  const lightRad = (lightAngle * Math.PI) / 180;
  const lx = Math.cos(lightRad);
  const ly = Math.sin(lightRad);

  // Primary specular highlight: radial gradient offset in light direction
  const highlightX = cx - lx * cx * 0.4;
  const highlightY = cy - ly * cy * 0.4;
  const grad = ctx.createRadialGradient(
    highlightX, highlightY, 0,
    cx, cy, Math.max(cx, cy),
  );

  if (saturation > 0.1) {
    // Iridescent/prismatic tinting — cycle hue across the highlight
    grad.addColorStop(0, `hsla(${lightAngle + 30}, 80%, 95%, ${opacity})`);
    grad.addColorStop(0.2, `hsla(${lightAngle + 180}, 60%, 85%, ${opacity * 0.6})`);
    grad.addColorStop(0.5, `rgba(255,255,255,${opacity * 0.2})`);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
  } else {
    // Clean white highlight
    grad.addColorStop(0, `rgba(255,255,255,${opacity})`);
    grad.addColorStop(0.4, `rgba(255,255,255,${opacity * 0.3})`);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
  }

  // Clip to element shape and fill
  ctx.beginPath();
  ctx.roundRect(0, 0, width, height, r);
  ctx.clip();
  ctx.fillStyle = grad;
  ctx.fill();

  // Rim highlight: thin bright edge on the light-facing side
  const rimGrad = ctx.createLinearGradient(
    cx + lx * cx * 0.8, cy + ly * cy * 0.8,
    cx - lx * cx * 0.5, cy - ly * cy * 0.5,
  );
  rimGrad.addColorStop(0, `rgba(255,255,255,${opacity * 0.7})`);
  rimGrad.addColorStop(0.05, `rgba(255,255,255,${opacity * 0.15})`);
  rimGrad.addColorStop(1, 'rgba(255,255,255,0)');

  ctx.fillStyle = rimGrad;
  ctx.fill();

  return canvas.toDataURL('image/png');
}
