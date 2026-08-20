/**
 * DebugOverlay.tsx
 *
 * Interactive developer debug panel for Liquid Glass physical engine.
 * Displays real-time inspection of:
 *   1. R/G Displacement Texture Map
 *   2. Parametric Surface Height Profile Graph h(r) & Slope dh/dr
 *   3. Surface Normal Vectors & Cell Grid (pixelSize)
 *   4. Mouse vector influence, light source angle, and map generation performance
 */

import React, { useEffect, useRef } from 'react';
import { surfaceProfile, calcSurfaceSlope, type SurfaceType } from './physics';

export interface DebugOverlayProps {
  dispMapUrl: string;
  surfaceType: SurfaceType;
  bezelWidth: number;
  refractiveIndex: number;
  thickness: number;
  pixelSize: number;
  specularAngle: number;
  mouseX: number;
  mouseY: number;
  width: number;
  height: number;
  mapGenTimeMs?: number;
  mode?: 'kube' | 'enhanced' | 'fallback';
}

export const DebugOverlay: React.FC<DebugOverlayProps> = ({
  dispMapUrl,
  surfaceType,
  bezelWidth,
  refractiveIndex,
  thickness,
  pixelSize,
  specularAngle,
  mouseX,
  mouseY,
  width,
  height,
  mapGenTimeMs = 0,
  mode = 'enhanced',
}) => {
  const profileCanvasRef = useRef<HTMLCanvasElement>(null);

  // Draw 2D Height Profile Graph h(r) and slope dh/dr
  useEffect(() => {
    const canvas = profileCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    // Background grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 20) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += 20) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Bevel start marker
    const bezelStart = 1.0 - bezelWidth;
    const bezelX = bezelStart * w;
    ctx.strokeStyle = '#ec4899';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(bezelX, 0);
    ctx.lineTo(bezelX, h);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw Height Curve h(r)
    ctx.strokeStyle = '#38bdf8'; // Cyan line
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= w; i++) {
      const r = i / w;
      const heightVal = surfaceProfile(r, bezelWidth, surfaceType);
      const y = h - heightVal * (h - 12) - 6;
      if (i === 0) ctx.moveTo(i, y);
      else ctx.lineTo(i, y);
    }
    ctx.stroke();

    // Draw Slope Curve dh/dr (dotted magenta)
    ctx.strokeStyle = '#f43f5e';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i <= w; i++) {
      const r = i / w;
      const slope = calcSurfaceSlope(r, bezelWidth, surfaceType);
      const normalizedSlope = Math.max(-2, Math.min(2, slope));
      const y = h / 2 - (normalizedSlope / 2) * (h / 2 - 6);
      if (i === 0) ctx.moveTo(i, y);
      else ctx.lineTo(i, y);
    }
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '10px monospace';
    ctx.fillText(`h(r) profile: ${surfaceType}`, 8, 14);
    ctx.fillStyle = '#ec4899';
    ctx.fillText(`bezel: ${(bezelWidth * 100).toFixed(0)}%`, bezelX + 4, h - 8);
  }, [surfaceType, bezelWidth]);

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 99,
        background: 'rgba(10, 10, 18, 0.84)',
        backdropFilter: 'blur(8px)',
        border: '1.5px dashed #ec4899',
        borderRadius: 16,
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        color: '#fff',
        fontFamily: 'monospace',
        fontSize: '11px',
        overflow: 'auto',
      }}
    >
      {/* Header Badge */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ background: mode === 'kube' ? '#7c3aed' : '#ec4899', color: '#fff', padding: '2px 6px', borderRadius: 4, fontWeight: 800, fontSize: '10px' }}>
            MODE: {mode.toUpperCase()}
          </span>
          <span style={{ opacity: 0.6 }}>
            {width}x{height}px · n₂={refractiveIndex.toFixed(2)} · t={thickness}px
          </span>
        </div>
        <span style={{ color: '#10b981', fontWeight: 700 }}>
          Gen: {mapGenTimeMs.toFixed(2)}ms
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, flex: 1 }}>
        {/* Panel 1: R/G Displacement Texture Preview */}
        <div style={{ background: 'rgba(255,255,255,0.05)', padding: 8, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ color: '#38bdf8', marginBottom: 6, fontWeight: 700 }}>
            1. R/G Displacement Map
          </div>
          {dispMapUrl ? (
            <img
              src={dispMapUrl}
              alt="Displacement Map Texture"
              style={{ width: '100%', height: 105, objectFit: 'contain', background: '#808080', borderRadius: 6, border: '1px solid #444' }}
            />
          ) : (
            <div style={{ height: 105, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}>
              Generating...
            </div>
          )}
          <div style={{ fontSize: '9px', opacity: 0.5, marginTop: 4 }}>
            R: X shift · G: Y shift · A: 255 opaque
          </div>
        </div>

        {/* Panel 2: Surface Height Profile Graph h(r) */}
        <div style={{ background: 'rgba(255,255,255,0.05)', padding: 8, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ color: '#ec4899', marginBottom: 6, fontWeight: 700 }}>
            2. Height Profile & Slope
          </div>
          <canvas
            ref={profileCanvasRef}
            width={180}
            height={105}
            style={{ width: '100%', height: 105, background: '#090a10', borderRadius: 6, border: '1px solid #333' }}
          />
          <div style={{ fontSize: '9px', opacity: 0.5, marginTop: 4 }}>
            Cyan: h(r) · Magenta: dh/dr · Dotted: Bevel
          </div>
        </div>
      </div>

      {/* Telemetry Footer */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, background: 'rgba(0,0,0,0.3)', padding: 8, borderRadius: 6 }}>
        <div>
          <span style={{ opacity: 0.5 }}>Profile: </span>
          <span style={{ color: '#f43f5e', fontWeight: 700 }}>{surfaceType}</span>
        </div>
        <div>
          <span style={{ opacity: 0.5 }}>Cell Size: </span>
          <span style={{ color: '#38bdf8', fontWeight: 700 }}>{pixelSize === 0 ? 'OFF' : `${pixelSize}px`}</span>
        </div>
        <div>
          <span style={{ opacity: 0.5 }}>Light Angle: </span>
          <span style={{ color: '#f59e0b', fontWeight: 700 }}>{specularAngle.toFixed(0)}°</span>
        </div>
        <div>
          <span style={{ opacity: 0.5 }}>Pointer: </span>
          <span style={{ color: '#10b981', fontWeight: 700 }}>{mouseX.toFixed(0)}, {mouseY.toFixed(0)}</span>
        </div>
      </div>
    </div>
  );
};
