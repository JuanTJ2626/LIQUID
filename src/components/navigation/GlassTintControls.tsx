/**
 * GlassTintControls.tsx
 *
 * Panel flotante con dos sliders:
 *   • Hue    — rueda de color 0–360
 *   • Intensity — qué tan opaco es el tinte 0–100%
 *
 * Renderiza en un portal sobre todo lo demás.
 * Exporta también el hook useTintColor para que los componentes
 * consuman el color generado.
 */

import React, { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';

// ── Hook público ──────────────────────────────────────────────────────────────

export interface TintColor {
  /** CSS rgba string listo para usar como background */
  rgba: string;
  hue: number;
  intensity: number;
}

export function tintFromHueIntensity(hue: number, intensity: number): TintColor {
  // intensity 0–100 → alpha 0–0.7
  const alpha = (intensity / 100) * 0.7;
  return {
    rgba: `hsla(${hue}, 85%, 58%, ${alpha.toFixed(3)})`,
    hue,
    intensity,
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

interface GlassTintControlsProps {
  hue:         number;
  intensity:   number;
  onHueChange:       (v: number) => void;
  onIntensityChange: (v: number) => void;
}

export const GlassTintControls: React.FC<GlassTintControlsProps> = ({
  hue, intensity, onHueChange, onIntensityChange,
}) => {
  if (typeof document === 'undefined') return null;

  const previewColor = `hsla(${hue}, 85%, 58%, 0.75)`;

  return createPortal(
    <div style={{
      position:     'fixed',
      bottom:       32,
      right:        32,
      zIndex:       99999,
      background:   'rgba(15,15,20,0.78)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      borderRadius: 18,
      padding:      '16px 20px',
      boxShadow:    '0 8px 32px rgba(0,0,0,0.45), inset 0 0 0 0.5px rgba(255,255,255,0.12)',
      minWidth:     220,
      userSelect:   'none',
    }}>
      {/* Header */}
      <div style={{
        display:        'flex',
        alignItems:     'center',
        gap:            10,
        marginBottom:   14,
      }}>
        {/* Color preview dot */}
        <div style={{
          width:        14,
          height:       14,
          borderRadius: '50%',
          background:   previewColor,
          boxShadow:    `0 0 8px ${previewColor}`,
          flexShrink:   0,
        }} />
        <span style={{
          fontSize:      '0.72rem',
          fontWeight:    700,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color:         'rgba(255,255,255,0.6)',
        }}>
          Glass Tint
        </span>
      </div>

      {/* Hue slider */}
      <label style={{ display: 'block', marginBottom: 12 }}>
        <div style={{
          display:        'flex',
          justifyContent: 'space-between',
          marginBottom:   6,
        }}>
          <span style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>Color</span>
          <span style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.35)' }}>{hue}°</span>
        </div>
        {/* Rainbow track */}
        <div style={{ position: 'relative' }}>
          <div style={{
            position:     'absolute',
            inset:        0,
            borderRadius: 4,
            background:   'linear-gradient(to right, hsl(0,85%,58%), hsl(30,85%,58%), hsl(60,85%,58%), hsl(120,85%,58%), hsl(180,85%,58%), hsl(240,85%,58%), hsl(300,85%,58%), hsl(360,85%,58%))',
            pointerEvents:'none',
          }} />
          <input
            type="range"
            min={0}
            max={360}
            value={hue}
            onChange={e => onHueChange(Number(e.target.value))}
            style={{
              position:   'relative',
              width:      '100%',
              height:     8,
              appearance: 'none',
              WebkitAppearance: 'none',
              background: 'transparent',
              cursor:     'pointer',
              outline:    'none',
              border:     'none',
              margin:     0,
              padding:    0,
            }}
          />
        </div>
      </label>

      {/* Intensity slider */}
      <label style={{ display: 'block' }}>
        <div style={{
          display:        'flex',
          justifyContent: 'space-between',
          marginBottom:   6,
        }}>
          <span style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>Intensidad</span>
          <span style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.35)' }}>{intensity}%</span>
        </div>
        <div style={{ position: 'relative' }}>
          <div style={{
            position:     'absolute',
            inset:        0,
            borderRadius: 4,
            background:   `linear-gradient(to right, transparent, hsla(${hue},85%,58%,0.85))`,
            pointerEvents:'none',
          }} />
          <input
            type="range"
            min={0}
            max={100}
            value={intensity}
            onChange={e => onIntensityChange(Number(e.target.value))}
            style={{
              position:   'relative',
              width:      '100%',
              height:     8,
              appearance: 'none',
              WebkitAppearance: 'none',
              background: 'transparent',
              cursor:     'pointer',
              outline:    'none',
              border:     'none',
              margin:     0,
              padding:    0,
            }}
          />
        </div>
      </label>

      <style>{`
        input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: #fff;
          box-shadow: 0 1px 4px rgba(0,0,0,0.5);
          cursor: pointer;
          margin-top: -3px;
        }
        input[type=range]::-moz-range-thumb {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: #fff;
          box-shadow: 0 1px 4px rgba(0,0,0,0.5);
          cursor: pointer;
          border: none;
        }
        input[type=range]::-webkit-slider-runnable-track {
          height: 8px;
          border-radius: 4px;
        }
      `}</style>
    </div>,
    document.body
  );
};
