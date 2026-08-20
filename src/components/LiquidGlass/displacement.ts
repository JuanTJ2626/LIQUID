/**
 * displacement.ts
 *
 * Canvas-based R/G displacement map & specular highlight rasterizer.
 * Encodes 2D displacement vectors directly into image channels:
 *   • R channel → X displacement (128 neutral, 0 max left, 255 max right)
 *   • G channel → Y displacement (128 neutral, 0 max up, 255 max down)
 *   • B channel → 128 neutral
 *   • A channel → 255 fully opaque (prevents alpha premultiplication artifacts)
 *
 * Mode Separation:
 * • Kube Core: Uses 1D precomputed radial refraction field mapped to 2D vector field.
 * • Extension Layer: Micro-cell perturbation active ONLY when enableCellDisplacement = true and pixelSize > 1.
 */

import { type RefractionField, type SurfaceType } from './physics';

export interface DisplacementMapResult {
  dataUrl: string;
  maximumDisplacement: number;
  width: number;
  height: number;
  cacheKey: string;
}

export interface GenerateMapOptions {
  width: number;
  height: number;
  borderRadius: number;
  refractionField: RefractionField;
  bezelPixelWidth: number;
  distortion: number;
  pixelSize?: number;
  enableCellDisplacement?: boolean;
  surfaceType: SurfaceType;
  ior: number;
  thickness: number;
  dpr?: number;
}

export interface SpecularMapOptions {
  width: number;
  height: number;
  borderRadius: number;
  opacity: number;
  lightAngle: number;
  saturation: number;
  enableFresnel?: boolean;
}

// ── Global Texture Cache ─────────────────────────────────────────────────────

interface CacheEntry {
  result: DisplacementMapResult;
  timestamp: number;
}

const displacementCache = new Map<string, CacheEntry>();
const MAX_CACHE_SIZE = 50;

function getCacheKey(opts: GenerateMapOptions): string {
  const dpr = opts.dpr || 1;
  const cell = opts.enableCellDisplacement ? (opts.pixelSize || 0) : 0;
  return `${opts.width}x${opts.height}_r${Math.round(opts.borderRadius)}_b${opts.bezelPixelWidth.toFixed(1)}_d${opts.distortion.toFixed(2)}_p${cell}_s${opts.surfaceType}_n${opts.ior.toFixed(2)}_t${opts.thickness.toFixed(1)}_dpr${dpr}`;
}

function cleanupCache() {
  if (displacementCache.size > MAX_CACHE_SIZE) {
    const entries = Array.from(displacementCache.entries());
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
    for (let i = 0; i < 10 && i < entries.length; i++) {
      displacementCache.delete(entries[i][0]);
    }
  }
}

// ── True Rounded-Box 2D SDF & Continuous Gradient Coordinates ────────────────

/**
 * Per-pixel Euclidean Signed Distance (SDF) and continuous 360-degree outward-normal angle
 * for a rounded rectangle, using the Inigo Quilez 2D Box SDF.
 *
 * HOW dist IS CALCULATED:
 *   sdist = IQ rounded-box SDF (negative inside, 0 at boundary, positive outside)
 *   dist  = max(0, 1 + sdist / bezelSpan)
 *   where bezelSpan = min(halfW, halfH) * 0.5  (constant pixel depth across full perimeter)
 *   → dist=0 at center / flat interior, dist=1 exactly at boundary, dist>1 outside
 *   The same bezelSpan applies on all 4 sides AND all corners because it is measured in
 *   pixels along the SDF gradient — NOT as a fraction of width or height separately.
 *   This guarantees uniform bevel pixel-width even on 400×80px narrow rectangles.
 *
 * HOW angle IS CALCULATED:
 *   IQ Box SDF analytical gradient, provably continuous at every region boundary:
 *   • Corner (dx>0 AND dy>0): n = normalize(dx,dy) * sign(relX, relY)
 *     At dy→0⁺: n → (sign(relX), 0) — same as lateral edge below. ✓ Continuous.
 *   • Lateral edge (dx>0, dy≤0): n = (sign(relX), 0)
 *   • Top/bottom edge (dy>0, dx≤0): n = (0, sign(relY))
 *     At dx→0⁺: corner n → (0, sign(relY)) — same. ✓ Continuous.
 *   • Interior (dx≤0, dy≤0): radial fallback (not rendered — dist=0, disp=0)
 */
export function getEffectiveRadialCoords(
  px: number,
  py: number,
  width: number,
  height: number,
  borderRadius: number
): { dist: number; angle: number } {
  const cx = width / 2;
  const cy = height / 2;
  const r = Math.min(borderRadius, Math.min(cx, cy));

  const relX = px - cx;
  const relY = py - cy;

  // IQ SDF components: positive when pixel is in the corner arc zone
  const dx = Math.abs(relX) - (cx - r);  // > 0 = pixel is past the straight-edge zone in X
  const dy = Math.abs(relY) - (cy - r);  // > 0 = pixel is past the straight-edge zone in Y

  // ── DISTANCE ─────────────────────────────────────────────────────────────────
  // Signed Euclidean distance to boundary: negative inside, 0 at rim, positive outside
  const sdist = Math.sqrt(Math.max(dx, 0) ** 2 + Math.max(dy, 0) ** 2)
    + Math.min(Math.max(dx, dy), 0)
    - r;

  // Constant pixel bevel span: same depth (in pixels) on every edge and corner
  const bezelSpan = Math.min(cx, cy) * 0.5;

  // Normalized distance: 0 = center/interior, 1 = outer boundary, >1 = outside
  const dist = sdist > 0
    ? 1.01                                   // outside glass
    : Math.max(0, 1.0 + sdist / bezelSpan); // [0..1] across bevel

  // ── ANGLE via central-difference numerical gradient of the IQ SDF ─────────────────────
  // Replaces the previous if/else region classification (corner/edge/interior)
  // which had 1-pixel seams at region boundaries.
  //
  // Technique: f(p) = IQ rounded-box SDF.  \u2207f = outward unit normal.
  // Central differences: \u2207f_x ≈ (f(p+\u03b5,y) - f(p-\u03b5,y)) / 2\u03b5
  // This is C\u221e everywhere (no branches) and matches the analytical result in
  // the limit \u03b5 \u2192 0.
  //
  // Inspired by the "avoid region classification" approach used by deepika-builds/liquid-glass,
  // applied to our physically-correct IQ SDF instead of their linear gradient approach.
  const EPS = 0.5; // half-pixel; enough precision, avoids sub-pixel aliasing

  function sdf(qx: number, qy: number): number {
    const dxi = Math.abs(qx) - (cx - r);
    const dyi = Math.abs(qy) - (cy - r);
    return Math.sqrt(Math.max(dxi, 0) ** 2 + Math.max(dyi, 0) ** 2)
      + Math.min(Math.max(dxi, dyi), 0)
      - r;
  }

  const gx = sdf(relX + EPS, relY) - sdf(relX - EPS, relY); // unnormalized X gradient
  const gy = sdf(relX, relY + EPS) - sdf(relX, relY - EPS); // unnormalized Y gradient
  const glen = Math.sqrt(gx * gx + gy * gy) || 1;           // ||\u2207f|| \u2248 1 by Eikonal, but clamp
  const nx = gx / glen;
  const ny = gy / glen;

  const angle = Math.atan2(ny, nx);

  return { dist, angle };
}

function sampleDisplacement(field: RefractionField, r: number): number {
  const { normalizedDisplacements, numSamples } = field;
  const idx = Math.max(0, Math.min(1, r)) * (numSamples - 1);
  const i0 = Math.floor(idx);
  const i1 = Math.min(i0 + 1, numSamples - 1);
  const t = idx - i0;
  return normalizedDisplacements[i0] * (1.0 - t) + normalizedDisplacements[i1] * t;
}

const JACOBIAN_LIMIT = 0.9;

/** Walk center → rim and cap |ΔdispPx| / dr so the 1D profile cannot fold. */
function clampDisplacementJacobian(
  normalizedDisplacements: Float32Array,
  bezelPixelWidth: number,
  distortion: number,
  bezelSpan: number
): Float32Array {
  const n = normalizedDisplacements.length;
  const dispPx = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    dispPx[i] = normalizedDisplacements[i] * bezelPixelWidth * distortion;
  }

  const dr = bezelSpan / Math.max(1, n - 1);
  const maxDelta = JACOBIAN_LIMIT * dr;

  for (let i = 0; i < n - 1; i++) {
    const delta = dispPx[i + 1] - dispPx[i];
    if (Math.abs(delta) / dr > JACOBIAN_LIMIT) {
      dispPx[i + 1] = dispPx[i] + Math.sign(delta) * maxDelta;
    }
  }

  return dispPx;
}

function sampleClampedDispPx(dispPx: Float32Array, r: number): number {
  const n = dispPx.length;
  const idx = Math.max(0, Math.min(1, r)) * (n - 1);
  const i0 = Math.floor(idx);
  const i1 = Math.min(i0 + 1, n - 1);
  const t = idx - i0;
  return dispPx[i0] * (1.0 - t) + dispPx[i1] * t;
}

// ── Displacement Map Generation ──────────────────────────────────────────────

export function generateDisplacementMap(opts: GenerateMapOptions): DisplacementMapResult {
  const cacheKey = getCacheKey(opts);
  const cached = displacementCache.get(cacheKey);
  if (cached) {
    cached.timestamp = Date.now();
    return cached.result;
  }

  const {
    width,
    height,
    borderRadius,
    refractionField,
    bezelPixelWidth,
    distortion,
    pixelSize = 0,
    enableCellDisplacement = false,
  } = opts;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('generateDisplacementMap: Canvas 2D context unavailable');
  }

  const imageData = ctx.createImageData(width, height);
  const data = imageData.data;

  const useCellPerturb = Boolean(enableCellDisplacement && pixelSize > 1);
  const effectivePixelSize = Math.max(1, Math.round(pixelSize));

  // Peak of the sampled 1D profile — not refractionField.maximumDisplacement,
  // which is max(|dispX|) before the Hermite edge fade (see computeRefractionField).
  let peakNormalized = 0;
  const profile = refractionField.normalizedDisplacements;
  for (let i = 0; i < profile.length; i++) {
    const abs = Math.abs(profile[i]);
    if (abs > peakNormalized) peakNormalized = abs;
  }
  // Micro-cell perturb multiplies by up to (1 + 0.12)
  if (useCellPerturb) peakNormalized *= 1.12;

  const realMaxDisp = Math.max(bezelPixelWidth, peakNormalized * bezelPixelWidth * distortion) || 1;

  // Same bezelSpan as getEffectiveRadialCoords: 127 samples span this many map pixels.
  const bezelSpan = Math.min(width, height) * 0.25;
  const clampedDispPx = clampDisplacementJacobian(
    refractionField.normalizedDisplacements,
    bezelPixelWidth,
    distortion,
    bezelSpan
  );

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixelIdx = (y * width + x) * 4;

      const { dist, angle } = getEffectiveRadialCoords(x, y, width, height, borderRadius);

      // Outside glass boundary -> neutral displacement (128, 128, 128, 255)
      if (dist > 1.0) {
        data[pixelIdx]     = 128; // R neutral
        data[pixelIdx + 1] = 128; // G neutral
        data[pixelIdx + 2] = 128; // B neutral
        data[pixelIdx + 3] = 255; // A fully opaque
        continue;
      }

      // Jacobian-clamped 1D profile (px). sampleDisplacement() is unchanged.
      let dispMagnitude = sampleClampedDispPx(clampedDispPx, dist);

      // Extension: Micro-Cell Perturb (Only if enableCellDisplacement is true)
      if (useCellPerturb) {
        const cellX = Math.floor(x / effectivePixelSize) * effectivePixelSize + effectivePixelSize / 2;
        const cellY = Math.floor(y / effectivePixelSize) * effectivePixelSize + effectivePixelSize / 2;
        const dxCell = (x - cellX) / (effectivePixelSize / 2);
        const dyCell = (y - cellY) / (effectivePixelSize / 2);

        const cellDist = Math.sqrt(dxCell * dxCell + dyCell * dyCell);
        const cellPerturb = Math.sin(cellDist * Math.PI) * 0.12;

        dispMagnitude *= (1.0 + cellPerturb);
      }

      // Inward displacement vector direction
      const dispX = -dispMagnitude * Math.cos(angle);
      const dispY = -dispMagnitude * Math.sin(angle);

      // Encode against the reachable peak in pixels (same unit as feDisplacementMap scale)
      const rVal = Math.round(Math.max(0, Math.min(255, 128 + (dispX / realMaxDisp) * 127)));
      const gVal = Math.round(Math.max(0, Math.min(255, 128 + (dispY / realMaxDisp) * 127)));

      data[pixelIdx]     = rVal; // R: X shift
      data[pixelIdx + 1] = gVal; // G: Y shift
      data[pixelIdx + 2] = 128;  // B: Neutral
      data[pixelIdx + 3] = 255;  // A: Fully opaque
    }
  }

  ctx.putImageData(imageData, 0, 0);

  const result: DisplacementMapResult = {
    dataUrl: canvas.toDataURL('image/png'),
    maximumDisplacement: realMaxDisp,
    width,
    height,
    cacheKey,
  };

  displacementCache.set(cacheKey, { result, timestamp: Date.now() });
  cleanupCache();

  return result;
}

// ── Zoom Displacement Map Generation (Magnifying Lens Interior) ───────────────

export interface ZoomMapOptions {
  width: number;
  height: number;
  zoom: number;
  borderRadius?: number;
}

export function generateZoomDisplacementMap(opts: ZoomMapOptions): DisplacementMapResult {
  const { width, height, zoom, borderRadius } = opts;
  const br = borderRadius ?? Math.min(width, height) / 2;
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(cx, cy);

  const zoomFactor = Math.max(1.0, zoom);
  // Max displacement of f(r) = r * (1 - 1/Z) * (1 - r^2/R^2) occurs at r = R / sqrt(3)
  // f(r_max) = R * (2 / (3 * sqrt(3))) * (1 - 1/Z) ≈ 0.385 * radius * (1 - 1/Z)
  const maxZoomShiftPx = 0.385 * radius * (1.0 - 1.0 / zoomFactor);
  const cacheKey = `zoom_${width}x${height}_z${zoom.toFixed(2)}_r${br}`;

  if (typeof document === 'undefined') {
    return {
      dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      maximumDisplacement: maxZoomShiftPx,
      width,
      height,
      cacheKey,
    };
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('generateZoomDisplacementMap: Canvas 2D context unavailable');

  const imageData = ctx.createImageData(width, height);
  const data = imageData.data;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const relX = x - cx;
      const relY = y - cy;

      // Smooth normalized elliptical/capsule radius: 0 at center, 1 at rim
      const normRadius = Math.hypot(relX / cx, relY / cy);

      if (normRadius >= 1.0) {
        data[idx]     = 128;
        data[idx + 1] = 128;
        data[idx + 2] = 128;
        data[idx + 3] = 255;
        continue;
      }

      // Smooth parabolic magnification field: 100% crisp, uniform, and unsquished
      const factor = (1.0 / zoomFactor - 1.0) * (1.0 - normRadius * normRadius);
      const dispX = relX * factor;
      const dispY = relY * factor;

      const maxDenom = maxZoomShiftPx || 1;
      const rVal = Math.round(Math.max(0, Math.min(255, 128 + (dispX / maxDenom) * 127)));
      const gVal = Math.round(Math.max(0, Math.min(255, 128 + (dispY / maxDenom) * 127)));

      data[idx]     = rVal;
      data[idx + 1] = gVal;
      data[idx + 2] = 128;
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);

  return {
    dataUrl: canvas.toDataURL('image/png'),
    maximumDisplacement: maxZoomShiftPx,
    width,
    height,
    cacheKey: `zoom_${width}x${height}_z${zoom.toFixed(2)}`,
  };
}

// ── Specular Map Generation ──────────────────────────────────────────────────

export function generateSpecularMap(opts: SpecularMapOptions): string {
  const { width, height, borderRadius, opacity, lightAngle, saturation, enableFresnel = true } = opts;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const cx = width / 2;
  const cy = height / 2;
  const r = Math.min(borderRadius, Math.min(cx, cy));

  const lightRad = (lightAngle * Math.PI) / 180;
  const lx = Math.cos(lightRad);
  const ly = Math.sin(lightRad);

  const highlightX = cx - lx * cx * 0.45;
  const highlightY = cy - ly * cy * 0.45;

  const grad = ctx.createRadialGradient(
    highlightX, highlightY, 0,
    cx, cy, Math.max(cx, cy)
  );

  const effectiveOpacity = enableFresnel ? opacity : opacity * 0.8;

  if (saturation > 0.1 && enableFresnel) {
    grad.addColorStop(0, `hsla(${lightAngle + 30}, 85%, 95%, ${effectiveOpacity})`);
    grad.addColorStop(0.25, `hsla(${lightAngle + 180}, 65%, 85%, ${effectiveOpacity * 0.6})`);
    grad.addColorStop(0.6, `rgba(255,255,255,${effectiveOpacity * 0.2})`);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
  } else {
    grad.addColorStop(0, `rgba(255,255,255,${effectiveOpacity})`);
    grad.addColorStop(0.35, `rgba(255,255,255,${effectiveOpacity * 0.35})`);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
  }

  ctx.beginPath();
  ctx.roundRect(0, 0, width, height, r);
  ctx.clip();

  ctx.fillStyle = grad;
  ctx.fill();

  const rimGrad = ctx.createLinearGradient(
    cx + lx * cx * 0.85, cy + ly * cy * 0.85,
    cx - lx * cx * 0.5, cy - ly * cy * 0.5
  );
  rimGrad.addColorStop(0, `rgba(255,255,255,${effectiveOpacity * 0.75})`);
  rimGrad.addColorStop(0.08, `rgba(255,255,255,${effectiveOpacity * 0.15})`);
  rimGrad.addColorStop(1, 'rgba(255,255,255,0)');

  ctx.fillStyle = rimGrad;
  ctx.fill();

  return canvas.toDataURL('image/png');
}
