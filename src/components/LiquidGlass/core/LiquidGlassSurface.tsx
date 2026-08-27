/**
 * LiquidGlassSurface.tsx
 *
 * Componente de superficie glass pura — SOLO el efecto visual.
 * No sabe nada de drag, posición, ni lógica de negocio.
 * Recibe los maps ya generados por useLiquidGlassMaps y los renderiza.
 *
 * ARQUITECTURA DE CAPAS:
 *   div contenedor (posición + transform — controlado por el padre via style)
 *   └── div glass (backdropFilter SVG + gradientes + sombras) — absolute inset 0
 *   └── children (contenido encima del vidrio)
 *
 * USO BÁSICO:
 *   const maps = useLiquidGlassMaps({ width: 200, height: 200 })
 *   <LiquidGlassSurface maps={maps}>
 *     <p>Contenido</p>
 *   </LiquidGlassSurface>
 */

import React, { useEffect, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { LiquidGlassMagnifierSvgDefs } from '../svgFilters';
import { detectSvgBackdropSupport, getGlassFallbackStyle } from '../svgFilters';
import type { LiquidGlassMaps } from './useLiquidGlassMaps';
import { useLiquidInk } from './useLiquidInk';

// ── Inject orbit glow keyframes once ─────────────────────────────────────────
const ORBIT_STYLE_ID = 'liquid-glass-orbit-style';

function injectOrbitStyle() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(ORBIT_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = ORBIT_STYLE_ID;
  style.textContent = `
    @keyframes lg-orbit {
      from { transform: rotate(0deg); }
      to   { transform: rotate(360deg); }
    }
    @keyframes lg-orbit-slow {
      from { transform: rotate(0deg); }
      to   { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);
}

export interface LiquidGlassSurfaceProps {
  /** Maps generados por useLiquidGlassMaps */
  maps: LiquidGlassMaps;
  /** True si se está arrastrando — intensifica sombras */
  isDragging?: boolean;
  /** True si el cursor está encima — aumenta brillo del borde */
  isHovered?: boolean;
  /** Energía de movimiento [0..1] — escala sombras dinámicamente */
  motionEnergy?: number;
  /** Posición de la luz para el reflejo especular [0..100]% */
  lightPosition?: { x: number; y: number };
  /** Si true, amplifica el zoom scale (efecto de presión) */
  isPressed?: boolean;
  /**
   * Activa el glow orbitante alrededor del borde.
   * Puedes pasar `true` para usar defaults o un objeto para personalizar.
   */
  orbitGlow?: boolean | {
    /** Color del glow — acepta cualquier CSS color */
    color?: string;
    /** Duración de una vuelta completa en segundos (default: 4) */
    duration?: number;
    /** Grosor del halo en px (default: 2) */
    thickness?: number;
    /** Opacidad del glow [0..1] (default: 0.85) */
    opacity?: number;
  };
  /**
   * Pintura líquida animada dentro del vidrio (metabolas de color).
   * `true` → palette y parámetros por defecto.
   * Objeto → personalización completa.
   */
  liquidInk?: boolean | {
    /** Colores CSS para los blobs (default: paleta vibrante) */
    colors?: string[];
    /** Cantidad de blobs (default: 6) */
    blobCount?: number;
    /** Velocidad de deriva en px/s (default: 22) */
    speed?: number;
    /** Blur en px para el efecto suave (default: 18) */
    blur?: number;
    /** Contrast para el merge metaball (default: 9) */
    contrast?: number;
    /** Opacidad de la capa [0..1] (default: 0.45) */
    opacity?: number;
    /** mix-blend-mode CSS (default: 'screen') */
    blendMode?: CSSProperties['mixBlendMode'];
  };
  /** CSS class extra para el contenedor */
  className?: string;
  /**
   * Estilos del contenedor exterior.
   * Aquí van position, left, top, transform, zIndex, cursor, etc.
   * El width y height del contenedor se toman de maps.width/height
   * pero pueden sobreescribirse aquí si es necesario.
   */
  style?: CSSProperties;
  /** Contenido sobre la superficie */
  children?: React.ReactNode;
  /** Ref del contenedor exterior */
  containerRef?: React.Ref<HTMLDivElement>;
  // Pointer event handlers — pasados explícitamente para máxima claridad
  onPointerDown?:   (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerMove?:   (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerUp?:     (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerCancel?: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerEnter?:  () => void;
  onPointerLeave?:  () => void;
  'aria-label'?: string;
}

export const LiquidGlassSurface: React.FC<LiquidGlassSurfaceProps> = ({
  maps,
  isDragging = false,
  isHovered = false,
  motionEnergy = 0,
  lightPosition = { x: 24, y: 14 },
  isPressed = false,
  orbitGlow = false,
  liquidInk = false,
  className,
  style,
  children,
  containerRef,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onPointerEnter,
  onPointerLeave,
  'aria-label': ariaLabel,
}) => {
  // Inject keyframes once on mount
  useEffect(() => { injectOrbitStyle(); }, []);

  const {
    filterId, zoomMapUrl, rimMapUrl, specMapUrl,
    zoomScale, rimScale, padPercent,
    width, height, borderRadiusCss,
  } = maps;

  // ── Liquid ink config ────────────────────────────────────────────────────
  const inkEnabled   = !!liquidInk;
  const inkCfg       = liquidInk && typeof liquidInk === 'object' ? liquidInk : {};
  const inkOpacity   = inkCfg.opacity   ?? 0.75;
  const inkBlendMode = inkCfg.blendMode ?? 'lighten';

  // useLiquidInk is always called (Rules of Hooks) — active flag controls the loop
  const ink = useLiquidInk({
    width,
    height,
    colors:    inkCfg.colors,
    blobCount: inkCfg.blobCount,
    speed:     inkCfg.speed,
    blur:      inkCfg.blur,
    contrast:  inkCfg.contrast,
    active:    inkEnabled,
  });

  // ── Orbit glow config ───────────────────────────────────────────────────
  const orbitEnabled = !!orbitGlow;
  const orbitCfg = orbitGlow && typeof orbitGlow === 'object' ? orbitGlow : {};
  const orbitColor     = orbitCfg.color     ?? 'rgba(255, 255, 255, 0.9)';
  const orbitDuration  = orbitCfg.duration  ?? 4;
  const orbitThickness = orbitCfg.thickness ?? 2;
  const orbitOpacity   = orbitCfg.opacity   ?? 0.85;

  // ── Orbit glow layer styles ──────────────────────────────────────────────
  // Technique: an isolated wrapper contains the spinning conic-gradient arc.
  // A child div with mix-blend-mode:destination-out punches a transparent hole
  // in the center, leaving only the thin border-strip visible as orbiting light.
  const orbitWrapStyle: CSSProperties = {
    position:     'absolute',
    inset:        0,
    borderRadius: borderRadiusCss,
    pointerEvents:'none',
    zIndex:       2,
    opacity:      orbitOpacity,
    isolation:    'isolate',
    overflow:     'hidden',
  };

  const orbitSpinStyle: CSSProperties = {
    position:      'absolute',
    top:           '50%',
    left:          '50%',
    width:         '200%',
    paddingBottom: '200%',
    marginTop:     '-100%',
    marginLeft:    '-100%',
    background:    `conic-gradient(from 0deg, transparent 0%, transparent 55%, ${orbitColor} 78%, ${orbitColor} 84%, transparent 96%, transparent 100%)`,
    animation:     `lg-orbit ${orbitDuration}s linear infinite`,
    borderRadius:  '50%',
  };

  // This div uses destination-out blend to erase the interior,
  // leaving only the outer ring from the conic-gradient.
  const orbitMaskStyle: CSSProperties = {
    position:      'absolute',
    inset:         orbitThickness,
    borderRadius:  borderRadiusCss,
    background:    'rgba(0,0,0,1)',
    mixBlendMode:  'destination-out' as CSSProperties['mixBlendMode'],
    zIndex:        3,
    pointerEvents: 'none',
  };

  const supportsSvg = detectSvgBackdropSupport();

  // ── Box-shadow reactivo al estado ────────────────────────────────────────
  const boxShadow = isDragging
    ? `0 24px ${60 + motionEnergy * 18}px rgba(0,0,0,0.5), inset 0 0 0 ${1 + motionEnergy}px rgba(255,255,255,${0.45 + motionEnergy * 0.16}), inset 0 2px ${8 + motionEnergy * 5}px rgba(255,255,255,0.55), inset 0 -2px 6px rgba(0,0,0,0.2)`
    : isHovered
      ? `0 14px ${38 + motionEnergy * 10}px rgba(0,0,0,0.34), inset 0 0 0 ${0.5 + motionEnergy * 0.5}px rgba(255,255,255,${0.38 + motionEnergy * 0.08}), inset 0 1px ${3 + motionEnergy * 2}px rgba(255,255,255,0.22), inset 0 -1px 5px rgba(0,0,0,0.06)`
      : '0 8px 28px rgba(0,0,0,0.24), inset 0 0 0 0.5px rgba(255,255,255,0.55), inset 0 1px 4px rgba(255,255,255,0.65), inset 0 -1px 4px rgba(0,0,0,0.08)';

  // ── Reflejo especular que sigue el cursor ────────────────────────────────
  const specularHighlight = `radial-gradient(circle 28% at ${lightPosition.x}% ${lightPosition.y}%, rgba(255,255,255,${isHovered ? 0.06 : 0.08}), transparent 70%)`;

  // ── Estilo base del contenedor ───────────────────────────────────────────
  // IMPORTANTE: NO ponemos isolation ni overflow aquí — el padre los controla.
  // Solo width/height/borderRadius como base, el padre pisa todo via `style`.
  const containerStyle: CSSProperties = {
    width:        `${width}px`,
    height:       `${height}px`,
    borderRadius: borderRadiusCss,
    // El padre pisa con sus valores de posición/transform/overflow/isolation:
    ...style,
  };

  // ── Estilo de la capa glass (backdrop filter + gradientes) ───────────────
  const glassLayerStyle: CSSProperties = {
    position:     'absolute',
    inset:        0,
    borderRadius: borderRadiusCss,
    overflow:     'hidden',
    pointerEvents:'none',
    transition:   'box-shadow 0.32s cubic-bezier(0.22, 1, 0.36, 1)',
    boxShadow,
    // SVG backdrop filter activo
    ...(supportsSvg && zoomMapUrl
      ? {
          backdropFilter:       `url(#${filterId})`,
          WebkitBackdropFilter: `url(#${filterId})`,
          background: [
            specularHighlight,
            'radial-gradient(ellipse 62% 78% at 50% 50%, transparent 42%, rgba(255,255,255,0.025) 72%, rgba(0,0,0,0.12) 100%)',
            'radial-gradient(ellipse 70% 115% at 18% 0%, rgba(255,255,255,0.10), transparent 48%)',
            'linear-gradient(112deg, rgba(255,255,255,0.035), rgba(255,255,255,0.008) 42%, rgba(16,24,38,0.025))',
          ].join(', '),
        }
      // Fallback CSS frosted glass
      : getGlassFallbackStyle()
    ),
  };

  return (
    <>
      {/* SVG filter pipeline — en document.body para evitar problemas de stacking context */}
      {typeof document !== 'undefined' && createPortal(
        <LiquidGlassMagnifierSvgDefs
          filterId={filterId}
          width={width}
          height={height}
          zoomMapUrl={zoomMapUrl}
          rimMapUrl={rimMapUrl}
          specMapUrl={specMapUrl}
          zoomScale={zoomScale * (isPressed ? 2 : 1)}
          rimScale={rimScale}
          padXPercent={padPercent}
          padYPercent={padPercent}
        />,
        document.body
      )}

      {/* Contenedor exterior — position/transform controlados por el padre */}
      <div
        ref={containerRef}
        className={className}
        aria-label={ariaLabel}
        style={containerStyle}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
      >
        {/* Capa de vidrio — absolute inset 0, no intercepta eventos */}
        <div style={glassLayerStyle} />

        {/* Liquid ink paint — animated color blobs visible through the frosted glass */}
        {inkEnabled && (
          <canvas
            ref={ink.canvasRef}
            width={width}
            height={height}
            style={{
              position:      'absolute',
              inset:         0,
              width:         '100%',
              height:        '100%',
              borderRadius:  borderRadiusCss,
              pointerEvents: 'none',
              zIndex:        1,
              opacity:       inkOpacity,
              mixBlendMode:  inkBlendMode,
            }}
          />
        )}

        {/* Orbiting glow — sits just above the glass layer, under content */}
        {orbitEnabled && (
          <div style={orbitWrapStyle}>
            {/* Spinning conic-gradient arc */}
            <div style={orbitSpinStyle} />
            {/* Black mask covers the interior — only the thin border strip remains */}
            <div style={orbitMaskStyle} />
          </div>
        )}

        {/* Contenido encima del vidrio */}
        {children}
      </div>
    </>
  );
};

export default LiquidGlassSurface;
