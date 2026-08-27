/**
 * CursorTrail.tsx
 *
 * Canvas que renderiza un trazo azul fluido siguiendo el cursor.
 * Debe montarse DEBAJO del glass layer para que el backdropFilter
 * del vidrio deforme/refracte el trail.
 *
 * Técnica:
 *   - Guarda los últimos N puntos del cursor con timestamp
 *   - Cada frame dibuja líneas entre puntos usando lineWidth decreciente
 *   - La opacidad de cada segmento cae según su edad (fade en 1 segundo)
 *   - shadowBlur da el efecto de glow fluido
 */

import React, { useRef, useEffect, useCallback } from 'react';

interface Point {
  x: number;
  y: number;
  t: number; // timestamp ms
}

export interface CursorTrailProps {
  /** Color base del trail (default: #2563eb) */
  color?: string;
  /** Máximo ancho del trazo en px (default: 18) */
  maxWidth?: number;
  /** Blur glow en px (default: 32) */
  blur?: number;
  /** Duración del fade en ms (default: 900) */
  duration?: number;
  /** Cuántos puntos guardar (default: 80) */
  maxPoints?: number;
  /** Ancho del canvas en px */
  width: number;
  /** Alto del canvas en px */
  height: number;
  /** Offset X del canvas relativo al viewport (para convertir coords del mouse) */
  offsetX?: number;
  /** Offset Y del canvas relativo al viewport */
  offsetY?: number;
}

export const CursorTrail: React.FC<CursorTrailProps> = ({
  color    = '#2563eb',
  maxWidth = 18,
  blur     = 32,
  duration = 900,
  maxPoints = 80,
  width,
  height,
  offsetX = 0,
  offsetY = 0,
}) => {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const pointsRef  = useRef<Point[]>([]);
  const rafRef     = useRef<number>(0);

  // ── Mouse / pointer tracking ───────────────────────────────────────────────
  const handleMove = useCallback((e: MouseEvent) => {
    pointsRef.current.push({
      x: e.clientX - offsetX,
      y: e.clientY - offsetY,
      t: performance.now(),
    });
    // Keep only maxPoints most recent
    if (pointsRef.current.length > maxPoints) {
      pointsRef.current = pointsRef.current.slice(-maxPoints);
    }
  }, [offsetX, offsetY, maxPoints]);

  // ── Animation loop ─────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width  = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Parse hex color to rgb once
    const hex = color.startsWith('#') ? color : '#2563eb';
    const r   = parseInt(hex.slice(1, 3), 16);
    const g   = parseInt(hex.slice(3, 5), 16);
    const b   = parseInt(hex.slice(5, 7), 16);

    function draw() {
      const now    = performance.now();
      const pts    = pointsRef.current;

      ctx!.clearRect(0, 0, width, height);

      if (pts.length < 2) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      // Remove points older than duration
      pointsRef.current = pts.filter(p => now - p.t < duration + 100);
      const visible = pointsRef.current;

      if (visible.length < 2) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      // Draw segments from oldest to newest
      for (let i = 1; i < visible.length; i++) {
        const prev = visible[i - 1];
        const curr = visible[i];
        const age  = now - curr.t;                        // ms
        const life = Math.max(0, 1 - age / duration);     // 1 → 0

        if (life <= 0) continue;

        // Width tapers from maxWidth at head to 2px at tail
        const progress  = i / visible.length;             // 0 → 1 (tail → head)
        const lineWidth = 2 + (maxWidth - 2) * progress * life;

        ctx!.save();
        ctx!.lineCap    = 'round';
        ctx!.lineJoin   = 'round';
        ctx!.lineWidth  = lineWidth;
        ctx!.shadowBlur  = blur * life;
        ctx!.shadowColor = `rgba(${r},${g},${b},${life})`;
        ctx!.strokeStyle = `rgba(${r},${g},${b},${life * 0.9})`;

        ctx!.beginPath();
        ctx!.moveTo(prev.x, prev.y);
        ctx!.lineTo(curr.x, curr.y);
        ctx!.stroke();
        ctx!.restore();
      }

      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);

    return () => { cancelAnimationFrame(rafRef.current); };
  }, [width, height, color, maxWidth, blur, duration]);

  // ── Attach global mouse listener ───────────────────────────────────────────
  useEffect(() => {
    window.addEventListener('mousemove', handleMove);
    return () => { window.removeEventListener('mousemove', handleMove); };
  }, [handleMove]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{
        position:      'absolute',
        inset:         0,
        width:         '100%',
        height:        '100%',
        pointerEvents: 'none',
        zIndex:        0,   // debajo del glass layer (zIndex no set / natural)
        borderRadius:  'inherit',
      }}
    />
  );
};

export default CursorTrail;
