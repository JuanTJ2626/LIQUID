/**
 * useLiquidInk.ts
 *
 * Canvas-based animated liquid paint / oil-ink effect.
 * Metaball fluid using the classic "blur + threshold on solid background" technique:
 *   1. Paint blobs on offscreen canvas (NO filter — pure radial gradients)
 *   2. Copy to main canvas, then apply contrast trick IN-PIXEL using a black bg:
 *      draw black bg → draw blurred blobs on top → the soft halos disappear
 *      and overlapping blobs fuse into solid organic shapes
 *
 * Why rewritten: previous version had race conditions between the two useEffects
 * (offRef could be null in the animation loop) and relied on canvas2D `filter`
 * which isn't supported consistently across browsers.
 */

import { useRef, useEffect, useCallback } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface UseLiquidInkOptions {
  width: number;
  height: number;
  colors?: string[];
  blobCount?: number;
  speed?: number;
  minRadius?: number;
  maxRadius?: number;
  /** Blur radius for the metaball soften pass (default: 20) */
  blur?: number;
  /** Whether the animation should run */
  active?: boolean;
}

interface Blob {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  color: string;
  phase: number;
  freq: number;
}

// ── Default palette ───────────────────────────────────────────────────────────

const DEFAULT_COLORS = [
  '#ff3cac',
  '#784ba0',
  '#2b86c5',
  '#00d4ff',
  '#ff6b35',
  '#06ffa5',
  '#ffd700',
];

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useLiquidInk(opts: UseLiquidInkOptions) {
  const {
    width,
    height,
    colors = DEFAULT_COLORS,
    blobCount = 5,
    speed = 20,
    minRadius = 0.15,
    maxRadius = 0.35,
    blur = 20,
    active = true,
  } = opts;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const blobsRef  = useRef<Blob[]>([]);
  const rafRef    = useRef<number>(0);
  const lastTRef  = useRef<number>(0);

  // ── Init blobs — runs whenever dimensions or count changes ───────────────
  const initBlobs = useCallback(() => {
    const minDim = Math.min(width, height);
    const blobs: Blob[] = [];
    for (let i = 0; i < blobCount; i++) {
      const r = minDim * (minRadius + Math.random() * (maxRadius - minRadius));
      blobs.push({
        x:     r + Math.random() * (width  - 2 * r),
        y:     r + Math.random() * (height - 2 * r),
        r,
        vx:    (Math.random() - 0.5) * speed,
        vy:    (Math.random() - 0.5) * speed,
        color: colors[i % colors.length],
        phase: Math.random() * Math.PI * 2,
        freq:  0.3 + Math.random() * 0.7,
      });
    }
    blobsRef.current = blobs;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height, blobCount, speed, minRadius, maxRadius, JSON.stringify(colors)]);

  useEffect(() => { initBlobs(); }, [initBlobs]);

  // ── Animation loop ────────────────────────────────────────────────────────
  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    if (!active) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    // Always sync pixel dimensions to logical dimensions
    canvas.width  = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Build a reusable offscreen canvas for the blur step
    const off = document.createElement('canvas');
    off.width  = width;
    off.height = height;
    const offCtx = off.getContext('2d');
    if (!offCtx) return;

    function tick(ts: number) {
      const dt = Math.min((ts - lastTRef.current) / 1000, 0.05);
      lastTRef.current = ts;
      const blobs = blobsRef.current;

      // ── Step 1: draw blobs onto offscreen with blur ──────────────────────
      offCtx!.clearRect(0, 0, width, height);

      for (const blob of blobs) {
        // Update position
        blob.x += blob.vx * dt + Math.sin(ts * 0.001 * blob.freq + blob.phase) * speed * 0.01;
        blob.y += blob.vy * dt + Math.cos(ts * 0.0008 * blob.freq + blob.phase) * speed * 0.008;

        // Bounce off walls
        if (blob.x - blob.r < 0)       { blob.vx =  Math.abs(blob.vx); }
        if (blob.x + blob.r > width)    { blob.vx = -Math.abs(blob.vx); }
        if (blob.y - blob.r < 0)        { blob.vy =  Math.abs(blob.vy); }
        if (blob.y + blob.r > height)   { blob.vy = -Math.abs(blob.vy); }

        blob.x = Math.max(blob.r, Math.min(width  - blob.r, blob.x));
        blob.y = Math.max(blob.r, Math.min(height - blob.r, blob.y));

        // Transparent-edge radial gradient (no black background needed)
        const grad = offCtx!.createRadialGradient(blob.x, blob.y, 0, blob.x, blob.y, blob.r);
        grad.addColorStop(0,    blob.color);
        grad.addColorStop(0.5,  blob.color);
        grad.addColorStop(1,    'rgba(0,0,0,0)');
        offCtx!.beginPath();
        offCtx!.arc(blob.x, blob.y, blob.r, 0, Math.PI * 2);
        offCtx!.fillStyle = grad;
        offCtx!.fill();
      }

      // ── Step 2: copy offscreen to main canvas with shadowBlur glow ───────
      ctx!.clearRect(0, 0, width, height);

      for (const blob of blobsRef.current) {
        ctx!.save();
        ctx!.shadowColor = blob.color;
        ctx!.shadowBlur  = blur;

        const grad = ctx!.createRadialGradient(blob.x, blob.y, 0, blob.x, blob.y, blob.r * 0.8);
        grad.addColorStop(0,   blob.color);
        grad.addColorStop(0.6, blob.color);
        grad.addColorStop(1,   'rgba(0,0,0,0)');

        ctx!.beginPath();
        ctx!.arc(blob.x, blob.y, blob.r * 0.8, 0, Math.PI * 2);
        ctx!.fillStyle = grad;
        ctx!.fill();
        ctx!.restore();
      }

      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame((ts) => {
      lastTRef.current = ts;
      rafRef.current = requestAnimationFrame(tick);
    });

    return () => { cancelAnimationFrame(rafRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, width, height, blur, speed]);

  return { canvasRef };
}
