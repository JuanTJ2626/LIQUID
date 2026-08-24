/**
 * MagnifyingGlass.tsx
 *
 * Physical Liquid Glass Magnifying Lens Component inspired directly by Kube:
 * https://kube.io/blog/liquid-glass-css-svg#magnifying-glass
 *
 * Key Architecture:
 * 1. Dual Chained SVG Displacement Maps:
 *    • Map 1: Spherical/parabolic interior optical magnification zoom displacement
 *    • Map 2: Outer rim Snell's Law vector refraction (convex-circle profile)
 * 2. Performance Memoization: Displacement textures depend ONLY on size/zoom/ior,
 *    NOT on drag position (x, y) — zero texture re-rasterization during drag!
 * 3. Fluid Pointer Drag: Native pointer capture with dynamic elevation shadow & scale.
 */

import React, { useState, useId, useMemo, useRef, useCallback, useEffect, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { computeRefractionField } from './physics';
import { generateDisplacementMap, generateZoomDisplacementMap, generateSpecularMap } from './displacement';
import { LiquidGlassMagnifierSvgDefs } from './svgFilters';

export interface MagnifyingGlassProps {
  /** Size (diameter) of circular lens if width/height not specified (default: 220) */
  size?: number;

  /** Custom width of lens in pixels (e.g. 240 for capsule) */
  width?: number;

  /** Custom height of lens in pixels (e.g. 150 for capsule) */
  height?: number;

  /** Custom corner radius in pixels (default: 9999 for capsule pill shape) */
  borderRadius?: number;

  /** If true, lens floats freely across the ENTIRE webpage (fixed viewport positioning via Portal) */
  fixed?: boolean;

  /** Optical magnification zoom factor, e.g. 1.25x - 2.5x (default: 1.5) */
  zoom?: number;

  /** Inward spherical distortion strength [0..1] */
  inwardDistortion?: number;

  /** Outer rim bevel thickness in pixels (default: 35) */
  bezelThickness?: number;

  /** Refractive index n2 of glass rim (default: 1.45) */
  ior?: number;

  /** Initial position relative to container or viewport { x, y } */
  initialPosition?: { x: number; y: number };

  /** Specular light highlight opacity [0..1] (default: 0.85) */
  specularOpacity?: number;

  /** Specular light highlight saturation [0..1] (default: 0) */
  specularSaturation?: number;

  /** Distortion level / Refraction scale [0.1..3.0] (default: 0.45) */
  distortion?: number;

  /** Light angle for specular highlight in degrees (default: 315) */
  specularAngle?: number;

  /** Custom CSS class name */
  className?: string;

  /** Custom styling override */
  style?: CSSProperties;

  /** Optional children rendered on top of the lens surface */
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
  specularSaturation = 0,
  distortion = 0.45,
  specularAngle = 315,
  className = '',
  style = {},
  children,
}) => {
  const actualWidth = width ?? size;
  const actualHeight = height ?? size;
  const actualBR = borderRadius ?? Math.min(actualWidth, actualHeight) / 2;
  const borderRadiusStyle = actualBR >= 9000 ? '9999px' : `${actualBR}px`;

  const defaultPos = initialPosition ?? (fixed
    ? { x: typeof window !== 'undefined' ? window.innerWidth / 2 : 600, y: typeof window !== 'undefined' ? window.innerHeight / 2 : 300 }
    : { x: 0, y: 0 });

  const containerRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(defaultPos);
  const [isDragging, setIsDragging] = useState(false);
  const [isPressed, setIsPressed] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [clickScale, setClickScale] = useState(1);
  const [motionEnergy, setMotionEnergy] = useState(0);
  const [isSettling, setIsSettling] = useState(false);
  const [bend, setBend] = useState({ rotate: 0, skewX: 0, skewY: 0 });
  const [lightPosition, setLightPosition] = useState({ x: 24, y: 14 });
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number; lastX: number; lastY: number; velocityX: number; velocityY: number } | null>(null);
  const settleFrameRef = useRef<number | null>(null);
  const clickScaleTimeoutRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (settleFrameRef.current !== null) cancelAnimationFrame(settleFrameRef.current);
    if (clickScaleTimeoutRef.current !== null) window.clearTimeout(clickScaleTimeoutRef.current);
  }, []);

  // SVG Unique Filter ID
  const rawId = useId();
  const filterId = `lg-mag-filter-${rawId.replace(/[^a-zA-Z0-9]/g, '')}`;

  // ── 1. Texture Map Generation (Memoized on parameters — NOT on pos!) ──────
  const MAP_W = Math.min(512, Math.max(128, Math.round(actualWidth * 1.5)));
  const MAP_H = Math.min(512, Math.max(128, Math.round(actualHeight * 1.5)));
  const mapBR = (actualBR / Math.min(actualWidth, actualHeight)) * Math.min(MAP_W, MAP_H);

  const { zoomMapUrl, rimMapUrl, specMapUrl, zoomScale, rimScale, padPercent } = useMemo(() => {
    if (typeof document === 'undefined') {
      return { zoomMapUrl: '', rimMapUrl: '', specMapUrl: '', zoomScale: 1, rimScale: 1, padPercent: 15 };
    }

    const zoomResult = generateZoomDisplacementMap({
      width: MAP_W,
      height: MAP_H,
      zoom,
      borderRadius: mapBR,
      sphericalCropFactor: Math.min(1, Math.max(0.5, 1 - (zoom - 1) * 0.25 - (isDragging ? 0.01 : 0))),
      sphericalRefraction: inwardDistortion,
    });

    const refractionField = computeRefractionField({
      surfaceType: 'convex-circle',
      refractiveIndex: ior,
      bezelWidth: 0.35,
      thickness: bezelThickness,
      numSamples: 127,
    });

    const rimResult = generateDisplacementMap({
      width: MAP_W,
      height: MAP_H,
      borderRadius: mapBR,
      refractionField,
      bezelPixelWidth: (bezelThickness / Math.min(actualWidth, actualHeight)) * Math.min(MAP_W, MAP_H),
      distortion: distortion,
      surfaceType: 'convex-circle',
      ior,
      thickness: bezelThickness,
    });

    const specUrl = generateSpecularMap({
      width: MAP_W,
      height: MAP_H,
      borderRadius: mapBR,
      opacity: specularOpacity,
      lightAngle: specularAngle,
      saturation: 0,
    });

    // Interior zoom expands glyphs to fill the lens (1st screenshot).
    // The frog/capsule look is rim refraction only — disable zoom when ~1×.
    const computedZoomScale = zoom <= 1.02 && inwardDistortion <= 0
      ? 0
      : Math.max(1, zoomResult.maximumDisplacement);
    const computedRimScale  = Math.max(1, rimResult.maximumDisplacement);

    const bboxSpan = (actualWidth + actualHeight) / 2;
    const zoomMaxCss = computedZoomScale / 2;
    const rimMaxCss = computedRimScale / 2;
    const padPercent = Math.min(80, Math.max(15, ((zoomMaxCss + rimMaxCss) / bboxSpan) * 100 + 10));

    return {
      zoomMapUrl: zoomResult.dataUrl,
      rimMapUrl: rimResult.dataUrl,
      specMapUrl: specUrl,
      zoomScale: computedZoomScale,
      rimScale: computedRimScale,
      padPercent,
    };
  }, [actualWidth, actualHeight, actualBR, zoom, inwardDistortion, bezelThickness, ior, specularOpacity, distortion, specularAngle, MAP_W, MAP_H, mapBR, isDragging]);

  // ── 2. Fluid Drag Handlers ──────────────────────────────────────────────────
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
    setIsPressed(true);
    setIsSettling(false);
    if (settleFrameRef.current !== null) cancelAnimationFrame(settleFrameRef.current);
    if (clickScaleTimeoutRef.current !== null) window.clearTimeout(clickScaleTimeoutRef.current);
    setClickScale(1);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: pos.x,
      originY: pos.y,
      lastX: e.clientX,
      lastY: e.clientY,
      velocityX: 0,
      velocityY: 0,
    };
  }, [pos]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const lensRect = e.currentTarget.getBoundingClientRect();
    setLightPosition({
      x: Math.max(0, Math.min(100, ((e.clientX - lensRect.left) / lensRect.width) * 100)),
      y: Math.max(0, Math.min(100, ((e.clientY - lensRect.top) / lensRect.height) * 100)),
    });
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    const frameDx = e.clientX - dragRef.current.lastX;
    const frameDy = e.clientY - dragRef.current.lastY;
    const frameSpeed = Math.min(1, Math.hypot(frameDx, frameDy) / 24);
    dragRef.current.lastX = e.clientX;
    dragRef.current.lastY = e.clientY;
    dragRef.current.velocityX = frameDx;
    dragRef.current.velocityY = frameDy;
    setMotionEnergy(frameSpeed);
    const bendStrength = Math.min(1, Math.hypot(frameDx, frameDy) / 18);
    setPos({
      x: dragRef.current.originX + dx,
      y: dragRef.current.originY + dy,
    });
    setBend({
      rotate: Math.max(-3.5, Math.min(3.5, frameDx * 0.12)),
      skewX: Math.max(-5, Math.min(5, frameDx * 0.3 * bendStrength)),
      skewY: Math.max(-3, Math.min(3, frameDy * 0.18 * bendStrength)),
    });
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    setIsDragging(false);
    setIsPressed(false);
    setMotionEnergy(0);
    const releaseVelocity = dragRef.current
      ? { x: dragRef.current.velocityX * 1.8, y: dragRef.current.velocityY * 1.8 }
      : { x: 0, y: 0 };

    if (Math.hypot(releaseVelocity.x, releaseVelocity.y) < 0.2) {
      setIsSettling(false);
      setBend({ rotate: 0, skewX: 0, skewY: 0 });
      setClickScale(1.08);
      clickScaleTimeoutRef.current = window.setTimeout(() => setClickScale(1), 150);
      dragRef.current = null;
      return;
    }

    setIsSettling(true);
    const maxX = fixed && typeof window !== 'undefined' ? window.innerWidth - actualWidth / 2 : Number.POSITIVE_INFINITY;
    const minX = fixed ? actualWidth / 2 : Number.NEGATIVE_INFINITY;
    const maxY = fixed && typeof window !== 'undefined' ? window.innerHeight - actualHeight / 2 : Number.POSITIVE_INFINITY;
    const minY = fixed ? actualHeight / 2 : Number.NEGATIVE_INFINITY;

    const settle = () => {
      releaseVelocity.x *= 0.92;
      releaseVelocity.y *= 0.92;
      setPos((current) => {
        let nextX = current.x + releaseVelocity.x;
        let nextY = current.y + releaseVelocity.y;
        if (nextX < minX || nextX > maxX) releaseVelocity.x *= -0.58;
        if (nextY < minY || nextY > maxY) releaseVelocity.y *= -0.58;
        nextX = Math.max(minX, Math.min(maxX, nextX));
        nextY = Math.max(minY, Math.min(maxY, nextY));
        return { x: nextX, y: nextY };
      });
      setBend((current) => ({
        rotate: current.rotate * 0.78 + releaseVelocity.x * 0.025,
        skewX: current.skewX * 0.78 + releaseVelocity.x * 0.05,
        skewY: current.skewY * 0.78 + releaseVelocity.y * 0.03,
      }));
      if (Math.hypot(releaseVelocity.x, releaseVelocity.y) > 0.08) {
        settleFrameRef.current = requestAnimationFrame(settle);
      } else {
        settleFrameRef.current = null;
        setIsSettling(false);
        setBend({ rotate: 0, skewX: 0, skewY: 0 });
      }
    };

    settleFrameRef.current = requestAnimationFrame(settle);
    dragRef.current = null;
  }, [actualHeight, actualWidth, fixed]);

  const lensElement = (
    <div
      ref={containerRef}
      className={`magnifying-glass-lens ${className}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerEnter={() => setIsHovered(true)}
      onPointerLeave={() => setIsHovered(false)}
      aria-label="Liquid Glass precision lens"
      style={{
        position: fixed ? 'fixed' : 'absolute',
        left: fixed ? `${pos.x}px` : '50%',
        top: fixed ? `${pos.y}px` : '50%',
        width: `${actualWidth}px`,
        height: `${actualHeight}px`,
        borderRadius: borderRadiusStyle,
        overflow: 'hidden',
        isolation: 'isolate',
        transform: fixed
          ? `translate(-50%, -50%) rotate(${bend.rotate}deg) skew(${bend.skewX}deg, ${bend.skewY}deg) scale(${isDragging ? (isPressed ? 0.96 : 1.04) : clickScale})`
          : `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px)) rotate(${bend.rotate}deg) skew(${bend.skewX}deg, ${bend.skewY}deg) scale(${isDragging ? (isPressed ? 0.96 : 1.04) : clickScale})`,
        cursor: isDragging ? 'grabbing' : 'grab',
        touchAction: 'none',
        userSelect: 'none',
        zIndex: fixed ? 99999 : 50,
        transition: isDragging || isSettling ? 'none' : 'transform 0.55s cubic-bezier(0.22, 1, 0.36, 1)',
        ...style,
      }}
    >
      {/* Optical Glass Lens Element — 100% Crystal Clear */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: borderRadiusStyle,
          overflow: 'hidden',
          backdropFilter: `url(#${filterId})`,
          WebkitBackdropFilter: `url(#${filterId})`,
          background: [
            `radial-gradient(circle 28% at ${lightPosition.x}% ${lightPosition.y}%, rgba(255,255,255,${isHovered ? 0.15 : 0.08}), transparent 70%)`,
            'radial-gradient(ellipse 62% 78% at 50% 50%, transparent 42%, rgba(255,255,255,0.025) 72%, rgba(0,0,0,0.12) 100%)',
            'radial-gradient(ellipse 70% 115% at 18% 0%, rgba(255,255,255,0.10), transparent 48%)',
            'linear-gradient(112deg, rgba(255,255,255,0.035), rgba(255,255,255,0.008) 42%, rgba(16,24,38,0.025))',
          ].join(', '),
          boxShadow: isDragging
            ? `0 24px ${60 + motionEnergy * 18}px rgba(0, 0, 0, 0.5), inset 0 0 0 ${1 + motionEnergy}px rgba(255, 255, 255, ${0.45 + motionEnergy * 0.16}), inset 0 2px ${8 + motionEnergy * 5}px rgba(255, 255, 255, 0.55), inset 0 -2px 6px rgba(0, 0, 0, 0.2)`
            : isHovered
              ? `0 14px ${38 + motionEnergy * 10}px rgba(0, 0, 0, 0.34), inset 0 0 0 ${1 + motionEnergy}px rgba(255, 255, 255, ${0.68 + motionEnergy * 0.12}), inset 0 1px ${6 + motionEnergy * 4}px rgba(255, 255, 255, 0.78), inset 0 -1px 5px rgba(0, 0, 0, 0.1)`
              : '0 8px 28px rgba(0, 0, 0, 0.24), inset 0 0 0 0.5px rgba(255, 255, 255, 0.55), inset 0 1px 4px rgba(255, 255, 255, 0.65), inset 0 -1px 4px rgba(0, 0, 0, 0.08)',
          filter: `saturate(${1.02 + motionEnergy * 0.08}) contrast(${1.01 + motionEnergy * 0.03})`,
          transition: 'box-shadow 0.32s cubic-bezier(0.22, 1, 0.36, 1), filter 0.32s ease',
        }}
      />

      {/* Optional Lens Content */}
      {children}
    </div>
  );

  return (
    <>
      {/* Mounted at document.body level outside isolated stacking contexts */}
      {typeof document !== 'undefined' && createPortal(
        <LiquidGlassMagnifierSvgDefs
          filterId={filterId}
          width={actualWidth}
          height={actualHeight}
          zoomMapUrl={zoomMapUrl}
          rimMapUrl={rimMapUrl}
          specMapUrl={specMapUrl}
          zoomScale={zoomScale}
          rimScale={rimScale}
          padXPercent={padPercent}
          padYPercent={padPercent}
        />,
        document.body
      )}

      {/* If fixed=true, portal the lens to document.body so it floats over entire page */}
      {fixed && typeof document !== 'undefined'
        ? createPortal(lensElement, document.body)
        : lensElement}
    </>
  );
};

export default MagnifyingGlass;
