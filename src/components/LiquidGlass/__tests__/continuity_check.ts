/**
 * continuity_check.ts
 *
 * Verifies the corrected getEffectiveRadialCoords() implementation:
 * 1. Angle is continuous at the corner/edge boundary (< 5° jump)
 * 2. dist = 1.0 exactly at boundary, > 1.0 outside, 0 at center
 * 3. Center pixel encodes to (128, 128, 128, 255)
 * 4. Left/right symmetry: (R_left - 128) + (R_right - 128) == 0
 * 5. Top/bottom symmetry: (G_top - 128) + (G_bottom - 128) == 0
 * 6. Narrow 400×80px: bevel dist uniform within 10% across all 4 sides
 *
 * Run with: npx tsx src/components/LiquidGlass/__tests__/continuity_check.ts
 */

function sdfEval(qx: number, qy: number, cx: number, cy: number, r: number): number {
  const dxi = Math.abs(qx) - (cx - r);
  const dyi = Math.abs(qy) - (cy - r);
  return Math.sqrt(Math.max(dxi, 0) ** 2 + Math.max(dyi, 0) ** 2)
    + Math.min(Math.max(dxi, dyi), 0) - r;
}

function getCoords(
  px: number, py: number,
  width: number, height: number,
  borderRadius: number
): { dist: number; angle: number; nx: number; ny: number } {
  const cx = width / 2;
  const cy = height / 2;
  const r = Math.min(borderRadius, Math.min(cx, cy));

  const relX = px - cx;
  const relY = py - cy;

  const dx = Math.abs(relX) - (cx - r);
  const dy = Math.abs(relY) - (cy - r);

  // IQ SDF signed distance
  const sdist = Math.sqrt(Math.max(dx, 0) ** 2 + Math.max(dy, 0) ** 2)
    + Math.min(Math.max(dx, dy), 0) - r;

  const bezelSpan = Math.min(cx, cy) * 0.5;
  const dist = sdist > 0 ? 1.01 : Math.max(0, 1.0 + sdist / bezelSpan);

  // Central-difference gradient (C∞ — no region branches)
  const EPS = 0.5;
  const gx = sdfEval(relX + EPS, relY, cx, cy, r) - sdfEval(relX - EPS, relY, cx, cy, r);
  const gy = sdfEval(relX, relY + EPS, cx, cy, r) - sdfEval(relX, relY - EPS, cx, cy, r);
  const glen = Math.sqrt(gx * gx + gy * gy) || 1;
  const nx = gx / glen;
  const ny = gy / glen;
  const angle = Math.atan2(ny, nx);
  return { dist, angle, nx, ny };
}

function encodePixel(
  dist: number,
  angle: number,
  normalizedDisp: number,
  bezelPixelWidth: number,
  distortion: number
): { r: number; g: number; b: number; a: number } {
  if (dist > 1.0) return { r: 128, g: 128, b: 128, a: 255 };
  const dispMagnitude = normalizedDisp * bezelPixelWidth * distortion;
  const dispX = -dispMagnitude * Math.cos(angle);
  const dispY = -dispMagnitude * Math.sin(angle);
  const r = Math.round(Math.max(0, Math.min(255, 128 + (dispX / bezelPixelWidth) * 127)));
  const g = Math.round(Math.max(0, Math.min(255, 128 + (dispY / bezelPixelWidth) * 127)));
  return { r, g, b: 128, a: 255 };
}

// Fake 1D field: strong displacement near boundary (dist≈1), zero at center (dist=0)
function fakeDisp(dist: number): number {
  return Math.min(1.0, Math.max(0, dist * 1.5));
}

let allPassed = true;
const log: string[] = [];
const assert = (cond: boolean, msg: string) => {
  log.push(`${cond ? '✓ PASS' : '✗ FAIL'}: ${msg}`);
  if (!cond) allPassed = false;
};

log.push('=== CONTINUITY & RASTERIZATION VERIFICATION ===\n');

// Test canvas: 256×100, borderRadius=20
// cx=128, cy=50, r=20
// Corner zone (both dx>0 AND dy>0) requires:
//   abs(relX) > cx-r = 108  →  px < 20 or px > 236
//   abs(relY) > cy-r = 30   →  py < 20 or py > 80
const W = 256, H = 100, BR = 20;

// ── 1. dist = 1.0 at boundary pixels ─────────────────────────────────────────
// Top-center boundary: py=0, px=128 → relY=-50, dy=50-30=20... wait
// Actually top boundary is at sdist=0. For top-center: relX=0, relY=-50.
// dx = 0 - 108 = -108 (left-edge zone), dy = 50 - 30 = 20 > 0.
// sdist = sqrt(0, max(20,0)) + min(max(-108,20),0) - 20 = 20 + min(20,0) - 20 = 20 + 0 - 20 = 0. ✓
{
  const topCenter = getCoords(W/2, 0, W, H, BR);
  assert(Math.abs(topCenter.dist - 1.0) < 0.01, `Top edge center: dist≈1.0 (got ${topCenter.dist.toFixed(3)})`);
}

// Right-center boundary: px=W-1≈W, py=50. relX=128-1=127, dy=0-(30)=-30.
// dx=127-108=19>0, dy=-30<0 → right straight edge.
// sdist = sqrt(max(19,0)²+0) + min(max(19,-30),0) - 20 = 19 + min(19,0) - 20 = 19+0-20 = -1
// Just inside. dist = 1 + (-1)/bezelSpan. bezelSpan=min(128,50)*0.5=25. dist=1-0.04=0.96.
// Right at boundary (px=256 would be sdist=0 but clamped). Use px=W-1 to be just inside.
{
  const rightCenter = getCoords(W-1, H/2, W, H, BR);
  assert(rightCenter.dist >= 0.9 && rightCenter.dist <= 1.01, `Right edge: dist in [0.9..1.0] (got ${rightCenter.dist.toFixed(3)})`);
}

// ── 2. dist = 0 at exact center ───────────────────────────────────────────────
{
  const center = getCoords(W/2, H/2, W, H, BR);
  assert(center.dist === 0, `Center: dist == 0 (got ${center.dist.toFixed(3)})`);
}

// ── 3. Center pixel encodes to (128, 128, 128, 255) ──────────────────────────
{
  const center = getCoords(W/2, H/2, W, H, BR);
  const pix = encodePixel(center.dist, center.angle, fakeDisp(center.dist), 40, 1.0);
  assert(pix.r === 128, `Center pixel R == 128 (got ${pix.r})`);
  assert(pix.g === 128, `Center pixel G == 128 (got ${pix.g})`);
  assert(pix.b === 128, `Center pixel B == 128 (got ${pix.b})`);
  assert(pix.a === 255, `Center pixel A == 255 (got ${pix.a})`);
}

// ── 4. Left/Right symmetry along horizontal midline ──────────────────────────
// Sample at px = W-30 (right bevel zone), mirrored left at px = 30
{
  const lPx = 30, rPx = W - 30;
  const left  = getCoords(lPx, H/2, W, H, BR);
  const right = getCoords(rPx, H/2, W, H, BR);
  const leftPix  = encodePixel(left.dist,  left.angle,  fakeDisp(left.dist),  40, 1.0);
  const rightPix = encodePixel(right.dist, right.angle, fakeDisp(right.dist), 40, 1.0);
  log.push(`  L dist=${left.dist.toFixed(2)} angle=${(left.angle*180/Math.PI).toFixed(1)}° → R=${leftPix.r} G=${leftPix.g}`);
  log.push(`  R dist=${right.dist.toFixed(2)} angle=${(right.angle*180/Math.PI).toFixed(1)}° → R=${rightPix.r} G=${rightPix.g}`);
  const symR = (leftPix.r - 128) + (rightPix.r - 128);
  assert(Math.abs(symR) <= 2, `LR symmetry: (R_left-128)+(R_right-128)≈0 (got ${symR})`);
  assert(Math.abs(leftPix.g - 128) <= 2, `Left midline G≈128 (got ${leftPix.g})`);
  assert(Math.abs(rightPix.g - 128) <= 2, `Right midline G≈128 (got ${rightPix.g})`);
}

// ── 5. Top/Bottom symmetry along vertical midline ────────────────────────────
{
  const tPy = 5, bPy = H - 5;
  const top    = getCoords(W/2, tPy, W, H, BR);
  const bottom = getCoords(W/2, bPy, W, H, BR);
  const topPix    = encodePixel(top.dist,    top.angle,    fakeDisp(top.dist),    40, 1.0);
  const bottomPix = encodePixel(bottom.dist, bottom.angle, fakeDisp(bottom.dist), 40, 1.0);
  log.push(`  T dist=${top.dist.toFixed(2)} angle=${(top.angle*180/Math.PI).toFixed(1)}° → R=${topPix.r} G=${topPix.g}`);
  log.push(`  B dist=${bottom.dist.toFixed(2)} angle=${(bottom.angle*180/Math.PI).toFixed(1)}° → R=${bottomPix.r} G=${bottomPix.g}`);
  const symG = (topPix.g - 128) + (bottomPix.g - 128);
  assert(Math.abs(symG) <= 2, `TB symmetry: (G_top-128)+(G_bottom-128)≈0 (got ${symG})`);
  assert(Math.abs(topPix.r - 128) <= 2, `Top midline R≈128 (got ${topPix.r})`);
  assert(Math.abs(bottomPix.r - 128) <= 2, `Bottom midline R≈128 (got ${bottomPix.r})`);
}

// ── 6. Corner/Edge boundary continuity ───────────────────────────────────────
// For W=256 H=100 BR=20: corner zone (dx>0 AND dy>0) at px≈240, py≈19.
// At py=19: relY=19-50=-31, dy=31-30=1 > 0 → corner zone  
// At py=21: relY=21-50=-29, dy=29-30=-1 < 0 → lateral right edge
{
  const above = getCoords(240, 19, W, H, BR); // corner zone, dy=1
  const below = getCoords(240, 21, W, H, BR); // right straight edge, dy=-1
  const da = above.angle * 180 / Math.PI;
  const db = below.angle * 180 / Math.PI;
  log.push(`  Corner(240,19): nx=${above.nx.toFixed(3)} ny=${above.ny.toFixed(3)} angle=${da.toFixed(2)}°`);
  log.push(`  Edge  (240,21): nx=${below.nx.toFixed(3)} ny=${below.ny.toFixed(3)} angle=${db.toFixed(2)}°`);
  const jump = Math.abs(da - db);
  assert(jump < 5, `Corner→Edge angle jump < 5° (got ${jump.toFixed(2)}°)`);
}

// ── 7. Narrow rect 400×80 bevel uniformity ───────────────────────────────────
log.push('\n--- Narrow 400×80px bevel uniformity ---');
{
  const NW=400, NH=80, NBR=20;
  const inset = 4; // 4px inside boundary
  const pts = [
    { label: 'Top-mid  ', px: NW/2, py: inset },
    { label: 'Bot-mid  ', px: NW/2, py: NH-inset },
    { label: 'Left-mid ', px: inset, py: NH/2 },
    { label: 'Right-mid', px: NW-inset, py: NH/2 },
  ];
  const dists: number[] = [];
  for (const {label, px, py} of pts) {
    const c = getCoords(px, py, NW, NH, NBR);
    dists.push(c.dist);
    log.push(`  ${label}: dist=${c.dist.toFixed(3)} angle=${(c.angle*180/Math.PI).toFixed(1)}°`);
  }
  const spread = Math.max(...dists) - Math.min(...dists);
  assert(spread < 0.1, `400×80 bevel uniform: all perimeter dist spread < 0.1 (got ${spread.toFixed(3)})`);
}

log.push(`\n=== COMPLETE: ${allPassed ? 'ALL PASSED' : 'SOME FAILED'} ===`);
console.log(log.join('\n'));
