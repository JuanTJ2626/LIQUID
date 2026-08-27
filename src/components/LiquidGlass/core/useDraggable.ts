/**
 * useDraggable.ts
 *
 * Hook genérico de drag con bounce elástico al soltar.
 * Funciona para cualquier elemento — lupa, card, sidebar, tooltip, etc.
 *
 * USO BÁSICO:
 *   const drag = useDraggable()
 *   <div {...drag.pointerHandlers} style={drag.style}>...</div>
 *
 * USO CON POSICIÓN INICIAL:
 *   const drag = useDraggable({ initialX: 100, initialY: 200 })
 *
 * USO CON FILTRO (ej: ignorar clicks en botones hijos):
 *   const drag = useDraggable({ ignoreSelector: 'button' })
 *
 * El estado drag.state expone todo para que el componente padre
 * pueda reaccionar (isDragging, isHovered, motionEnergy, etc.)
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import type React from 'react';

export interface UseDraggableOptions {
  /** Posición X inicial (default: 0) */
  initialX?: number;
  /** Posición Y inicial (default: 0) */
  initialY?: number;
  /**
   * Selector CSS de elementos hijos que NO deben iniciar el drag.
   * Ejemplo: 'button' para ignorar clicks en botones.
   */
  ignoreSelector?: string;
  /**
   * Scale al estar arrastrando (default: 1.12)
   */
  dragScale?: number;
  /**
   * Scale al hacer hover (default: 1.08)
   */
  hoverScale?: number;
  /**
   * Overshoot mínimo al soltar (default: 1.06).
   * El overshoot real escala con la velocidad de lanzamiento.
   */
  releaseOvershoot?: number;
  /**
   * Cubic-bezier para el bounce (default: elástico)
   */
  elasticEasing?: string;
}

export interface DragState {
  /** Posición X actual del elemento */
  x: number;
  /** Posición Y actual del elemento */
  y: number;
  /** True mientras se arrastra */
  isDragging: boolean;
  /** True mientras el cursor está encima */
  isHovered: boolean;
  /** True en los ms post-soltar (bounce animando) */
  isReleasing: boolean;
  /** Scale de rebote durante isReleasing */
  releaseScale: number;
  /** Energía de movimiento [0..1] — útil para box-shadow dinámico */
  motionEnergy: number;
  /** Distorsión de bend mientras se arrastra (rotate, skewX, skewY) */
  bend: { rotate: number; skewX: number; skewY: number };
  /** Posición relativa del cursor dentro del elemento [0..100]% — útil para reflejos */
  lightPosition: { x: number; y: number };
}

export interface UseDraggableReturn {
  /** Estado completo del drag */
  state: DragState;
  /** Handlers de pointer — spread directamente en el div */
  pointerHandlers: {
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
    onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void;
    onPointerCancel: (e: React.PointerEvent<HTMLDivElement>) => void;
    onPointerEnter: () => void;
    onPointerLeave: () => void;
  };
  /**
   * Calcula el string de transform CSS listo para usar.
   * mode 'fixed': posiciona con translate(-50%,-50%) desde left/top absolute.
   * mode 'offset': posiciona con translate(calc(-50% + x), calc(-50% + y)).
   */
  getTransform: (mode?: 'fixed' | 'offset') => string;
  /**
   * Calcula la transition CSS según el estado actual.
   * Usa el cubic-bezier elástico en hover y release.
   */
  getTransition: () => string;
}

export function useDraggable(opts: UseDraggableOptions = {}): UseDraggableReturn {
  const {
    initialX = 0,
    initialY = 0,
    ignoreSelector,
    dragScale = 1.12,
    hoverScale = 1.08,
    releaseOvershoot = 1.06,
    elasticEasing = 'cubic-bezier(0.175, 0.885, 0.32, 1.275)',
  } = opts;

  const [pos, setPos] = useState({ x: initialX, y: initialY });
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isReleasing, setIsReleasing] = useState(false);
  const [releaseScale, setReleaseScale] = useState(1);
  const [clickScale, setClickScale] = useState(1);
  const [motionEnergy, setMotionEnergy] = useState(0);
  const [bend, setBend] = useState({ rotate: 0, skewX: 0, skewY: 0 });
  const [lightPosition, setLightPosition] = useState({ x: 24, y: 14 });

  const dragRef = useRef<{
    startX: number; startY: number;
    originX: number; originY: number;
    lastX: number; lastY: number;
    velocityX: number; velocityY: number;
  } | null>(null);

  const clickScaleTimerRef = useRef<number | null>(null);
  const releaseTimerRef = useRef<number | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (clickScaleTimerRef.current !== null) window.clearTimeout(clickScaleTimerRef.current);
      if (releaseTimerRef.current !== null) window.clearTimeout(releaseTimerRef.current);
    };
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Ignorar si el click fue en un elemento hijo con el selector dado
    if (ignoreSelector && (e.target as HTMLElement).closest(ignoreSelector)) return;

    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
    setIsReleasing(false);
    if (clickScaleTimerRef.current !== null) window.clearTimeout(clickScaleTimerRef.current);
    setClickScale(1);

    dragRef.current = {
      startX: e.clientX, startY: e.clientY,
      originX: pos.x, originY: pos.y,
      lastX: e.clientX, lastY: e.clientY,
      velocityX: 0, velocityY: 0,
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos.x, pos.y, ignoreSelector]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Actualizar posición del cursor para efecto de luz
    const rect = e.currentTarget.getBoundingClientRect();
    setLightPosition({
      x: Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100)),
      y: Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100)),
    });

    if (!dragRef.current) return;

    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    const frameDx = e.clientX - dragRef.current.lastX;
    const frameDy = e.clientY - dragRef.current.lastY;

    dragRef.current.lastX = e.clientX;
    dragRef.current.lastY = e.clientY;
    dragRef.current.velocityX = frameDx;
    dragRef.current.velocityY = frameDy;

    const frameSpeed = Math.min(1, Math.hypot(frameDx, frameDy) / 24);
    setMotionEnergy(frameSpeed);

    setPos({
      x: dragRef.current.originX + dx,
      y: dragRef.current.originY + dy,
    });

    const bendStrength = Math.min(1, Math.hypot(frameDx, frameDy) / 18);
    setBend({
      rotate: Math.max(-3.5, Math.min(3.5, frameDx * 0.12)),
      skewX:  Math.max(-5, Math.min(5, frameDx * 0.3 * bendStrength)),
      skewY:  Math.max(-3, Math.min(3, frameDy * 0.18 * bendStrength)),
    });
  }, []);

  const handlePointerUp = useCallback((_e: React.PointerEvent<HTMLDivElement>) => {
    setIsDragging(false);
    setMotionEnergy(0);
    setBend({ rotate: 0, skewX: 0, skewY: 0 });

    const velocity = dragRef.current
      ? { x: dragRef.current.velocityX * 1.8, y: dragRef.current.velocityY * 1.8 }
      : { x: 0, y: 0 };
    dragRef.current = null;

    const speed = Math.hypot(velocity.x, velocity.y);

    // Bounce elástico al soltar: overshoot proporcional a la velocidad
    const overshoot = Math.min(releaseOvershoot + 0.08, releaseOvershoot + speed * 0.003);
    setIsReleasing(true);
    setReleaseScale(overshoot);

    if (releaseTimerRef.current !== null) window.clearTimeout(releaseTimerRef.current);
    releaseTimerRef.current = window.setTimeout(() => {
      setReleaseScale(1);
      releaseTimerRef.current = window.setTimeout(() => {
        setIsReleasing(false);
      }, 500);
    }, 60);

    // Click suave (sin arrastre real) → pequeño pop
    if (speed < 0.2) {
      setClickScale(1.03);
      clickScaleTimerRef.current = window.setTimeout(() => setClickScale(1), 150);
    }
  }, [releaseOvershoot]);

  // ── Helpers de estilo ──────────────────────────────────────────────────────

  const currentScale = isDragging
    ? dragScale
    : isReleasing
      ? releaseScale
      : isHovered
        ? hoverScale
        : clickScale;

  const getTransform = useCallback((mode: 'fixed' | 'offset' = 'fixed'): string => {
    const { rotate, skewX, skewY } = bend;
    const bendStr = isDragging
      ? ` rotate(${rotate}deg) skewX(${skewX}deg) skewY(${skewY}deg)`
      : '';

    if (mode === 'fixed') {
      return `translate(-50%, -50%) scale(${currentScale})${bendStr}`;
    }
    return `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px)) scale(${currentScale})${bendStr}`;
  }, [isDragging, currentScale, bend, pos]);

  const getTransition = useCallback((): string => {
    if (isDragging) return 'none';
    if (isReleasing) return `transform 0.5s ${elasticEasing}`;
    return `transform 0.4s ${elasticEasing}`;
  }, [isDragging, isReleasing, elasticEasing]);

  return {
    state: {
      x: pos.x,
      y: pos.y,
      isDragging,
      isHovered,
      isReleasing,
      releaseScale,
      motionEnergy,
      bend,
      lightPosition,
    },
    pointerHandlers: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onPointerCancel: handlePointerUp,
      onPointerEnter: () => setIsHovered(true),
      onPointerLeave: () => setIsHovered(false),
    },
    getTransform,
    getTransition,
  };
}
