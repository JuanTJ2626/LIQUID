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

import React, { useState, useId, useMemo, useRef, useCallback, type CSSProperties } from 'react';
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
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);

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
      saturation: specularSaturation,
    });

    // Interior zoom expands glyphs to fill the lens (1st screenshot).
    // The frog/capsule look is rim refraction only — disable zoom when ~1×.
    const computedZoomScale = zoom <= 1.02 && inwardDistortion <= 0
      ? 0
      : Math.max(2, 2.0 * zoomResult.maximumDisplacement);
    const computedRimScale  = Math.max(2, 2.0 * rimResult.maximumDisplacement);

    const bboxSpan = (actualWidth + actualHeight) / 2;
    const zoomScaleFrac = computedZoomScale / bboxSpan;
    const rimScaleFrac = computedRimScale / bboxSpan;

    const zoomMaxCss = computedZoomScale / 2;
    const rimMaxCss = computedRimScale / 2;
    const padPercent = Math.min(80, Math.max(15, ((zoomMaxCss + rimMaxCss) / bboxSpan) * 100 + 10));

    return {
      zoomMapUrl: zoomResult.dataUrl,
      rimMapUrl: rimResult.dataUrl,
      specMapUrl: specUrl,
      zoomScale: zoomScaleFrac,
      rimScale: rimScaleFrac,
      padPercent,
    };
  }, [actualWidth, actualHeight, actualBR, zoom, inwardDistortion, bezelThickness, ior, specularOpacity, specularSaturation, distortion, specularAngle, MAP_W, MAP_H, mapBR, isDragging]);

  // ── 2. Fluid Drag Handlers ──────────────────────────────────────────────────
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: pos.x,
      originY: pos.y,
    };
  }, [pos]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setPos({
      x: dragRef.current.originX + dx,
      y: dragRef.current.originY + dy,
    });
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    setIsDragging(false);
    dragRef.current = null;
  }, []);

  const lensElement = (
    <div
      ref={containerRef}
      className={`magnifying-glass-lens ${className}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
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
          ? `translate(-50%, -50%) scale(${isDragging ? 1.05 : 1.0})`
          : `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px)) scale(${isDragging ? 1.05 : 1.0})`,
        cursor: isDragging ? 'grabbing' : 'grab',
        touchAction: 'none',
        userSelect: 'none',
        zIndex: fixed ? 99999 : 50,
        transition: isDragging ? 'transform 0.05s ease-out' : 'transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)',
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
          background: 'rgba(255, 255, 255, 0.12)',
          boxShadow: isDragging
            ? '0 24px 60px rgba(0, 0, 0, 0.5), inset 0 0 0 1px rgba(255, 255, 255, 0.45), inset 0 2px 8px rgba(255, 255, 255, 0.55), inset 0 -2px 6px rgba(0, 0, 0, 0.2)'
            : '0 8px 28px rgba(0, 0, 0, 0.24), inset 0 0 0 0.5px rgba(255, 255, 255, 0.55), inset 0 1px 4px rgba(255, 255, 255, 0.65), inset 0 -1px 4px rgba(0, 0, 0, 0.08)',
          transition: 'box-shadow 0.2s ease',
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
