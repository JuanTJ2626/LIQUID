/**
 * GlassCard.tsx
 *
 * Card de vidrio líquido arrastreable.
 * Ejemplo de cómo crear un nuevo componente glass desde cero
 * usando únicamente el core — sin copiar lógica de física.
 *
 * TOTAL: ~40 líneas de lógica real.
 *
 * Para copiar a otro proyecto:
 *   1. Llevar la carpeta core/ + physics.ts + displacement.ts + svgFilters.tsx
 *   2. Copiar este archivo
 *   3. Listo.
 */

import React, { type CSSProperties } from 'react';
import { useLiquidGlassMaps } from './core/useLiquidGlassMaps';
import { useDraggable } from './core/useDraggable';
import { LiquidGlassSurface } from './core/LiquidGlassSurface';

export interface GlassCardProps {
  /** Ancho de la card en px (default: 320) */
  width?: number;
  /** Alto de la card en px (default: 200) */
  height?: number;
  /** Radio de esquinas en px (default: 28) */
  borderRadius?: number;
  /** Si true, la card es arrastreable (default: true) */
  draggable?: boolean;
  /** Posición inicial */
  initialPosition?: { x: number; y: number };
  /** Estilos extra */
  style?: CSSProperties;
  /** Contenido de la card */
  children?: React.ReactNode;
}

export const GlassCard: React.FC<GlassCardProps> = ({
  width = 320,
  height = 200,
  borderRadius = 28,
  draggable = true,
  initialPosition,
  style,
  children,
}) => {
  const maps = useLiquidGlassMaps({
    width,
    height,
    borderRadius,
    zoom:           1,       // sin zoom interior — solo efecto rim
    bezelThickness: 24,
    ior:            1.45,
    distortion:     0.4,
    specularOpacity: 0.7,
  });

  const drag = useDraggable({
    initialX:         initialPosition?.x ?? 0,
    initialY:         initialPosition?.y ?? 0,
    dragScale:        1.04,
    hoverScale:       1.02,
    releaseOvershoot: 1.05,
  });

  const { state } = drag;

  return (
    <LiquidGlassSurface
      maps={maps}
      isDragging={state.isDragging}
      isHovered={state.isHovered}
      motionEnergy={state.motionEnergy}
      lightPosition={state.lightPosition}
      style={{
        position:    'absolute',
        left:        '50%',
        top:         '50%',
        transform:   drag.getTransform('offset'),
        cursor:      draggable ? (state.isDragging ? 'grabbing' : 'grab') : 'default',
        touchAction: 'none',
        userSelect:  'none',
        transition:  drag.getTransition(),
        ...style,
      }}
      {...(draggable ? drag.pointerHandlers : {})}
    >
      {/* Contenido de la card */}
      <div style={{
        position: 'relative',
        zIndex:   1,
        padding:  '24px 28px',
        color:    'rgba(255,255,255,0.9)',
        height:   '100%',
        display:  'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}>
        {children}
      </div>
    </LiquidGlassSurface>
  );
};

export default GlassCard;
