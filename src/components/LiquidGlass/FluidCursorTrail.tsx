import React, { useEffect, useRef } from 'react';

interface Point {
  x: number;
  y: number;
  time: number;
}

interface Ripple {
  x: number;
  y: number;
  time: number;
  maxRadius: number;
}

export interface FluidCursorTrailProps {
  /** Trail color in Hex or RGB format (default: '#0066ff' / Apple Liquid Blue) */
  color?: string;
  /** Duration in milliseconds for the trail to completely fade out (default: 1000ms) */
  fadeDuration?: number;
  /** CSS Blur pixel intensity (default: 22px for liquid refraction glow) */
  blurPx?: number;
  /** Max line thickness in pixels near the cursor (default: 45px) */
  maxRadius?: number;
  /** Additional CSS classes for styling or positioning */
  className?: string;
}

export const FluidCursorTrail: React.FC<FluidCursorTrailProps> = ({
  color = '#0066ff',
  fadeDuration = 1000,
  blurPx = 22,
  maxRadius = 45,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pointsRef = useRef<Point[]>([]);
  const ripplesRef = useRef<Ripple[]>([]);
  const animFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const parent = canvas.parentElement;
    if (!parent) return;

    const updateSize = () => {
      const rect = parent.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
    };

    updateSize();

    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(parent);

    const handlePointerMove = (e: PointerEvent) => {
      const rect = parent.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      if (x >= -50 && x <= rect.width + 50 && y >= -50 && y <= rect.height + 50) {
        pointsRef.current.push({
          x,
          y,
          time: performance.now(),
        });
      }
    };

    // Capa 1: Liquid Shockwave on Pointer Down (Click)
    const handlePointerDown = (e: PointerEvent) => {
      const rect = parent.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      if (x >= 0 && x <= rect.width && y >= 0 && y <= rect.height) {
        ripplesRef.current.push({
          x,
          y,
          time: performance.now(),
          maxRadius: Math.max(120, Math.min(rect.width, rect.height) * 0.75),
        });
      }
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('pointerdown', handlePointerDown, { passive: true });

    const render = () => {
      const now = performance.now();
      const rect = parent.getBoundingClientRect();

      ctx.clearRect(0, 0, rect.width, rect.height);

      // Clean up expired points & ripples
      pointsRef.current = pointsRef.current.filter(
        (p) => now - p.time <= fadeDuration
      );
      ripplesRef.current = ripplesRef.current.filter(
        (r) => now - r.time <= 850
      );

      const points = pointsRef.current;
      const ripples = ripplesRef.current;

      let r = 0, g = 102, b = 255;
      if (color.startsWith('#')) {
        const hex = color.replace('#', '');
        if (hex.length === 6) {
          r = parseInt(hex.substring(0, 2), 16);
          g = parseInt(hex.substring(2, 4), 16);
          b = parseInt(hex.substring(4, 6), 16);
        }
      }

      // ── RENDER SHOCKWAVE RIPPLES ──────────────────────────────────────────
      for (const rip of ripples) {
        const elapsed = now - rip.time;
        const progress = Math.min(1, elapsed / 850);
        const life = 1 - progress;

        // Quad out expansion curve
        const currentRadius = rip.maxRadius * (1 - Math.pow(1 - progress, 2.2));
        const strokeWidth = 20 * Math.pow(life, 0.7) + 2;

        // Outer blue ring
        ctx.globalCompositeOperation = 'source-over';
        ctx.beginPath();
        ctx.arc(rip.x, rip.y, currentRadius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${life * 0.85})`;
        ctx.lineWidth = strokeWidth;
        ctx.stroke();

        // Inner electric cyan core shockwave ring
        ctx.globalCompositeOperation = 'lighter';
        ctx.beginPath();
        ctx.arc(rip.x, rip.y, currentRadius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(147, 197, 253, ${life * 0.95})`;
        ctx.lineWidth = strokeWidth * 0.45;
        ctx.stroke();
      }

      // ── RENDER FLUID CURSOR TRAIL ──────────────────────────────────────────
      if (points.length >= 2) {
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // PASS 1: Thick vivid blue outer glow aura
        ctx.globalCompositeOperation = 'source-over';
        for (let i = 0; i < points.length - 1; i++) {
          const p1 = points[i];
          const p2 = points[i + 1];
          const life = Math.max(0, 1 - (now - p2.time) / fadeDuration);

          const opacity = Math.pow(life, 0.85);
          const strokeWidth = maxRadius * Math.pow(life, 0.7) + 6;

          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          if (i < points.length - 2) {
            const p3 = points[i + 2];
            ctx.quadraticCurveTo(p2.x, p2.y, (p2.x + p3.x) / 2, (p2.y + p3.y) / 2);
          } else {
            ctx.lineTo(p2.x, p2.y);
          }

          ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${opacity})`;
          ctx.lineWidth = strokeWidth;
          ctx.stroke();
        }

        // PASS 2: Super intense electric cyan/white core light beam
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < points.length - 1; i++) {
          const p1 = points[i];
          const p2 = points[i + 1];
          const life = Math.max(0, 1 - (now - p2.time) / fadeDuration);

          const opacity = Math.pow(life, 0.7);
          const strokeWidth = (maxRadius * 0.45) * Math.pow(life, 0.75) + 3;

          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          if (i < points.length - 2) {
            const p3 = points[i + 2];
            ctx.quadraticCurveTo(p2.x, p2.y, (p2.x + p3.x) / 2, (p2.y + p3.y) / 2);
          } else {
            ctx.lineTo(p2.x, p2.y);
          }

          ctx.strokeStyle = `rgba(96, 165, 250, ${opacity * 0.95})`;
          ctx.lineWidth = strokeWidth;
          ctx.stroke();
        }
      }

      animFrameRef.current = requestAnimationFrame(render);
    };

    animFrameRef.current = requestAnimationFrame(render);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerdown', handlePointerDown);
      resizeObserver.disconnect();
    };
  }, [color, fadeDuration, maxRadius]);

  return (
    <canvas
      ref={canvasRef}
      style={{ filter: `blur(${blurPx}px)` }}
      className={`pointer-events-none absolute inset-0 h-full w-full opacity-100 ${className}`}
    />
  );
};

export default FluidCursorTrail;
