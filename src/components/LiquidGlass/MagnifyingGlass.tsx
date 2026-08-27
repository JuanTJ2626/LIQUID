/**
 * MagnifyingGlass.tsx
 *
 * Lupa de vidrio líquido arrastreable.
 * Construida sobre el core reutilizable:
 *   • useLiquidGlassMaps  → física óptica + displacement maps
 *   • useDraggable        → drag fluido con bounce elástico
 *   • LiquidGlassSurface  → superficie glass visual pura
 *
 * Para hacer otra lupa en otro proyecto:
 *   1. Copiar la carpeta core/ + physics.ts + displacement.ts + svgFilters.tsx
 *   2. Copiar este archivo
 *   3. Listo — sin dependencias externas fuera de React.
 */

import React, { useState, useRef, useCallback, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useLiquidGlassMaps } from './core/useLiquidGlassMaps';
import { useDraggable } from './core/useDraggable';
import { LiquidGlassSurface } from './core/LiquidGlassSurface';

export interface MagnifyingGlassProps {
  /** Diámetro si no se especifica width/height (default: 220) */
  size?: number;
  /** Ancho en px */
  width?: number;
  /** Alto en px */
  height?: number;
  /** Radio de esquinas en px (default: 9999 = cápsula) */
  borderRadius?: number;
  /** Si true, flota sobre toda la página (fixed + portal) */
  fixed?: boolean;
  /** Zoom óptico interior [1..2.5] (default: 1.35) */
  zoom?: number;
  /** Distorsión esférica inward [0..1] (default: 0.25) */
  inwardDistortion?: number;
  /** Grosor del bisel exterior en px (default: 35) */
  bezelThickness?: number;
  /** Índice de refracción [1.0..2.4] (default: 1.45) */
  ior?: number;
  /** Posición inicial { x, y } */
  initialPosition?: { x: number; y: number };
  /** Opacidad del highlight especular [0..1] (default: 0.85) */
  specularOpacity?: number;
  /** Distorsión del rim [0.1..3.0] (default: 0.45) */
  distortion?: number;
  /** Ángulo de luz especular en grados (default: 315) */
  specularAngle?: number;
  /** CSS class extra */
  className?: string;
  /** Estilos extra */
  style?: CSSProperties;
  /** Contenido sobre la lupa */
  children?: React.ReactNode;
}

export const MagnifyingGlass: React.FC<MagnifyingGlassProps> = ({
  size = 220,
  width,
  height,
  borderRadius,
  fixed = false,
  zoom = 1.35,
  inwardDistortion = 0.25,
  bezelThickness = 35,
  ior = 1.45,
  initialPosition,
  specularOpacity = 0.85,
  distortion = 0.45,
  specularAngle = 315,
  className = '',
  style = {},
  children,
}) => {
  const actualWidth  = width  ?? size;
  const actualHeight = height ?? size;

  const defaultPos = initialPosition ?? (fixed
    ? { x: typeof window !== 'undefined' ? window.innerWidth  / 2 : 600,
        y: typeof window !== 'undefined' ? window.innerHeight / 2 : 300 }
    : { x: 0, y: 0 });

  // ── Estado extra específico de la lupa ────────────────────────────────────
  // (isPressed amplifica el zoom scale — efecto de "presionar el cristal")
  const [isPressed, setIsPressed] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Core hooks ────────────────────────────────────────────────────────────
  const maps = useLiquidGlassMaps({
    width: actualWidth,
    height: actualHeight,
    borderRadius,
    zoom,
    inwardDistortion,
    bezelThickness,
    ior,
    distortion,
    specularOpacity,
    specularAngle,
  });

  const drag = useDraggable({
    initialX: defaultPos.x,
    initialY: defaultPos.y,
    dragScale:  1.12,
    hoverScale: 1.08,
    releaseOvershoot: 1.06,
  });

  // Sincronizar isPressed con el estado de drag
  const originalPointerDown = drag.pointerHandlers.onPointerDown;
  const originalPointerUp   = drag.pointerHandlers.onPointerUp;

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    setIsPressed(true);
    originalPointerDown(e);
  }, [originalPointerDown]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    setIsPressed(false);
    originalPointerUp(e);
  }, [originalPointerUp]);

  const handlePointerCancel = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    setIsPressed(false);
    drag.pointerHandlers.onPointerCancel(e);
  }, [drag.pointerHandlers]);

  const { state } = drag;

  // ── Elemento de la lupa ───────────────────────────────────────────────────
  const lensElement = (
    <LiquidGlassSurface
      maps={maps}
      isDragging={state.isDragging}
      isHovered={state.isHovered}
      motionEnergy={state.motionEnergy}
      lightPosition={state.lightPosition}
      isPressed={isPressed}
      containerRef={containerRef}
      className={`magnifying-glass-lens ${className}`}
      aria-label="Liquid Glass precision lens"
      style={{
        position: fixed ? 'fixed' : 'absolute',
        left:     fixed ? `${state.x}px` : '50%',
        top:      fixed ? `${state.y}px` : '50%',
        transform: fixed
          ? drag.getTransform('fixed')
          : drag.getTransform('offset'),
        overflow:    'hidden',
        isolation:   'isolate',
        cursor:      state.isDragging ? 'grabbing' : 'grab',
        touchAction: 'none',
        userSelect:  'none',
        zIndex:      fixed ? 99999 : 50,
        transition:  drag.getTransition(),
        ...style,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={drag.pointerHandlers.onPointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onPointerEnter={drag.pointerHandlers.onPointerEnter}
      onPointerLeave={drag.pointerHandlers.onPointerLeave}
    >
      {children}
    </LiquidGlassSurface>
  );

  if (typeof document === 'undefined') return null;

  return fixed
    ? createPortal(lensElement, document.body)
    : lensElement;
};

export default MagnifyingGlass;
