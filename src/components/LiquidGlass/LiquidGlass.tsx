/**
 * LiquidGlass.tsx
 *
 * Core React component implementing Kube's physical Liquid Glass optical engine.
 * Renders realistic Snell's Law light refraction using SVG feDisplacementMap + feBlend specular highlights.
 *
 * Modes:
 * • mode="kube"     → 100% Pure Kube Physical Refraction (No cell perturbation, no Fresnel extensions)
 * • mode="enhanced" → Kube Physics + Schlick Fresnel + Micro-cell perturbation + rAF mouse light lerp
 * • mode="fallback" → CSS frosted glass fallback for unsupported platforms
 */

import React, { useId, useMemo, useEffect, useState, useRef, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { computeRefractionField, type SurfaceType } from './physics';
import { generateDisplacementMap, generateSpecularMap } from './displacement';
import { detectSvgBackdropSupport, LiquidGlassSvgDefs } from './svgFilters';
import { DebugOverlay } from './DebugOverlay';

export interface LiquidGlassProps {
  /** Mode: 'kube' (pure physical Kube core) | 'enhanced' (with extensions) | 'fallback' */
  mode?: 'kube' | 'enhanced' | 'fallback';
  /** Width of glass element in pixels */
  width: number;
  /** Height of glass element in pixels */
  height: number;
  /** Corner radius in pixels. Default: 28 */
  borderRadius?: number;
  /** Surface height profile curve. Default: 'convex-squircle' */
  surfaceType?: SurfaceType;
  /** Bevel width fraction [0.05..0.5]. Default: 0.28 */
  bezelWidth?: number;
  /** Glass thickness magnitude [1..100]. Default: 35 */
  thickness?: number;
  /** Refractive Index (n2). Glass = 1.45-1.5, Water = 1.33, Diamond = 2.4. Default: 1.45 */
  ior?: number;
  /** Global displacement scale multiplier. Default: 1.2 */
  distortion?: number;
  /** Cell grid pixel size for micro-surface texture [1..32]. Default: 8 */
  pixelSize?: number;
  /** Enable micro-cell perturbation (Extension layer). Default: false in kube mode */
  enableCellDisplacement?: boolean;
  /** Enable Schlick Fresnel specular bloom (Extension layer). Default: false in kube mode */
  enableFresnel?: boolean;
  /** Specular highlight opacity [0..1]. Default: 0.6 */
  specularOpacity?: number;
  /** Specular color saturation [0..1]. Default: 0 (pure white) */
  specularSaturation?: number;
  /** Base light source angle in degrees. Default: 315 (top-left) */
  specularAngle?: number;
  /** Background blur in pixels. Default: 2 */
  blur?: number;
  /** Force SVG displacement mode regardless of capability detection */
  forceSvgFilter?: boolean;
  /** Enable mouse hover light & tilt interaction. Default: true */
  interactive?: boolean;
  /** Enable developer optics inspection HUD overlay. Default: false */
  debug?: boolean;
  /** Additional CSS class names */
  className?: string;
  /** Additional inline CSS styles */
  style?: CSSProperties;
  /** Content rendered over the glass surface */
  children?: React.ReactNode;
  'data-testid'?: string;
}

const MAP_RESOLUTION = 256;

export const LiquidGlass: React.FC<LiquidGlassProps> = ({
  mode = 'enhanced',
  width: initialWidth,
  height: initialHeight,
  borderRadius = 28,
  surfaceType = 'convex-squircle',
  bezelWidth = 0.28,
  thickness = 35,
  ior = 1.45,
  distortion = 1.2,
  pixelSize = 8,
  enableCellDisplacement: userCellDisp,
  enableFresnel: userFresnel,
  specularOpacity = 0.6,
  specularSaturation = 0,
  specularAngle = 315,
  blur = 2,
  forceSvgFilter = false,
  interactive = true,
  debug = false,
  className,
  style,
  children,
  'data-testid': testId,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Pure Kube Core Mode Configuration Isolation
  const isKubeCore = mode === 'kube';
  const effectiveCellDisp = isKubeCore ? false : (userCellDisp ?? (pixelSize > 1));
  const effectiveFresnel = isKubeCore ? false : (userFresnel ?? true);
  const effectivePixelSize = isKubeCore ? 0 : pixelSize;
  const effectiveSurfaceType: SurfaceType = isKubeCore ? 'convex-squircle' : surfaceType;

  // Responsive dimensions with rAF Throttled ResizeObserver
  const [dimensions, setDimensions] = useState({ width: initialWidth, height: initialHeight });
  useEffect(() => {
    setDimensions({ width: initialWidth, height: initialHeight });
  }, [initialWidth, initialHeight]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;

    let resizeFrameId: number | null = null;

    const observer = new ResizeObserver((entries) => {
      if (resizeFrameId) cancelAnimationFrame(resizeFrameId);
      resizeFrameId = requestAnimationFrame(() => {
        for (const entry of entries) {
          if (entry.contentRect) {
            const w = Math.round(entry.contentRect.width);
            const h = Math.round(entry.contentRect.height);
            if (w > 0 && h > 0) {
              setDimensions((prev) => (prev.width === w && prev.height === h ? prev : { width: w, height: h }));
            }
          }
        }
      });
    });

    observer.observe(el);
    return () => {
      if (resizeFrameId) cancelAnimationFrame(resizeFrameId);
      observer.disconnect();
    };
  }, []);

  const width = dimensions.width;
  const height = dimensions.height;

  // SVG Unique Filter IDs
  const rawId = useId();
  const filterId = `lg-phys-filter-${rawId.replace(/[^a-zA-Z0-9]/g, '')}`;
  const specularId = `lg-phys-spec-${rawId.replace(/[^a-zA-Z0-9]/g, '')}`;

  // Capability detection
  const [hasSvgBackdrop, setHasSvgBackdrop] = useState(false);
  useEffect(() => {
    setHasSvgBackdrop(forceSvgFilter || detectSvgBackdropSupport());
  }, [forceSvgFilter]);

  // Check prefers-reduced-motion
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mediaQuery.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  // ── Physics Refraction & Map Generation (Memoized Cache + Timer) ──────────
  const { dispMapUrl, specMapUrl, maxDisp, mapGenTimeMs } = useMemo(() => {
    if (typeof document === 'undefined') {
      return { dispMapUrl: '', specMapUrl: '', maxDisp: 1, mapGenTimeMs: 0 };
    }

    const startTime = performance.now();
    const effectiveDPR = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2);

    // 1. Compute Snell's Law Refraction Field
    const refractionField = computeRefractionField({
      surfaceType: effectiveSurfaceType,
      refractiveIndex: ior,
      bezelWidth,
      thickness,
      numSamples: 127,
    });

    // 2. Scale bezel width & corner radius to canvas resolution
    const bezelPixelWidth = Math.min(MAP_RESOLUTION, MAP_RESOLUTION * (width / height)) * bezelWidth * 0.5;
    const scaledRadius = (borderRadius / Math.min(width, height)) * (MAP_RESOLUTION / 2);

    // 3. Generate R/G Displacement Map
    let dispResult;
    try {
      dispResult = generateDisplacementMap({
        width: MAP_RESOLUTION,
        height: Math.round(MAP_RESOLUTION * (height / width)),
        borderRadius: scaledRadius,
        refractionField,
        bezelPixelWidth,
        distortion,
        pixelSize: effectivePixelSize,
        enableCellDisplacement: effectiveCellDisp,
        surfaceType: effectiveSurfaceType,
        ior,
        thickness,
        dpr: effectiveDPR,
      });
    } catch {
      return { dispMapUrl: '', specMapUrl: '', maxDisp: 1, mapGenTimeMs: 0 };
    }

    // 4. Generate Directional Specular Map
    const specUrl = generateSpecularMap({
      width: MAP_RESOLUTION,
      height: Math.round(MAP_RESOLUTION * (height / width)),
      borderRadius: scaledRadius,
      opacity: specularOpacity,
      lightAngle: specularAngle,
      saturation: isKubeCore ? 0 : specularSaturation,
      enableFresnel: effectiveFresnel,
    });

    const mapGenTimeMs = performance.now() - startTime;

    return {
      dispMapUrl: dispResult.dataUrl,
      specMapUrl: specUrl,
      maxDisp: dispResult.maximumDisplacement,
      mapGenTimeMs,
    };
  }, [
    width,
    height,
    borderRadius,
    effectiveSurfaceType,
    bezelWidth,
    thickness,
    ior,
    distortion,
    effectivePixelSize,
    effectiveCellDisp,
    effectiveFresnel,
    specularOpacity,
    specularSaturation,
    specularAngle,
    isKubeCore,
  ]);

  // ── Mouse Interaction via rAF Lerp ───────────────────────────────────────
  const [mousePos, setMousePos] = useState({ x: width / 2, y: height / 2 });
  const [dynAngle, setDynAngle] = useState(specularAngle);
  const targetPos = useRef({ x: width / 2, y: height / 2 });
  const currentPos = useRef({ x: width / 2, y: height / 2 });
  const animFrameRef = useRef<number | null>(null);

  useEffect(() => {
    // Frozen static angle if prefers-reduced-motion is active
    if (!interactive || reducedMotion) {
      setDynAngle(specularAngle);
      return;
    }

    const animate = () => {
      currentPos.current.x += (targetPos.current.x - currentPos.current.x) * 0.12;
      currentPos.current.y += (targetPos.current.y - currentPos.current.y) * 0.12;

      const dx = currentPos.current.x - width / 2;
      const dy = currentPos.current.y - height / 2;
      const angleRad = Math.atan2(dy, dx);
      const angleDeg = (angleRad * 180) / Math.PI;

      setMousePos({ x: currentPos.current.x, y: currentPos.current.y });
      setDynAngle(specularAngle + angleDeg * 0.15);

      animFrameRef.current = requestAnimationFrame(animate);
    };

    animFrameRef.current = requestAnimationFrame(animate);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [interactive, reducedMotion, specularAngle, width, height]);

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive || reducedMotion) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    targetPos.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const handlePointerLeave = () => {
    if (!interactive || reducedMotion) return;
    targetPos.current = { x: width / 2, y: height / 2 };
  };

  // Encoding unit is realMaxDisp (returned as maxDisp). SVG shifts by scale*(channel-0.5),
  // i.e. ±scale/2, so feScale = 2 * maxDisp restores 1:1 pixel displacement.
  const feScale = Math.max(1, 2 * maxDisp);
  const borderRadiusCss = `${borderRadius}px`;

  // Compute dynamic filter region padding based on max pixel shift and element dimensions
  const maxPixelShift = feScale * 0.5;
  const padXPercent = Math.max(30, Math.ceil((maxPixelShift / Math.max(1, width)) * 100 + 10));
  const padYPercent = Math.max(30, Math.ceil((maxPixelShift / Math.max(1, height)) * 100 + 10));

  const isSvgActive = mode !== 'fallback' && hasSvgBackdrop;

  const backdropStyle: CSSProperties = isSvgActive && dispMapUrl
    ? blur > 0
      ? {
          backdropFilter: `url(#${filterId}) blur(${blur}px)`,
          WebkitBackdropFilter: `url(#${filterId}) blur(${blur}px)`,
        }
      : {
          backdropFilter: `url(#${filterId})`,
          WebkitBackdropFilter: `url(#${filterId})`,
        }
    : {
        backdropFilter: `blur(${Math.max(8, blur)}px)`,
        WebkitBackdropFilter: `blur(${Math.max(8, blur)}px)`,
        background: 'rgba(255, 255, 255, 0.12)',
      };

  const wrapperStyle: CSSProperties = {
    position: 'relative',
    width: `${width}px`,
    height: `${height}px`,
    borderRadius: borderRadiusCss,
    overflow: 'hidden',
    isolation: 'isolate',
    ...style,
  };

  return (
    <div
      ref={containerRef}
      className={className}
      style={wrapperStyle}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      data-testid={testId}
    >
      {/* Hidden SVG Filter Pipeline (Mounted at root body level to bypass stacking context isolation) */}
      {isSvgActive && typeof document !== 'undefined' && createPortal(
        <LiquidGlassSvgDefs
          filterId={filterId}
          specularId={specularId}
          dispMapUrl={dispMapUrl}
          specMapUrl={specMapUrl}
          feScale={feScale}
          padXPercent={padXPercent}
          padYPercent={padYPercent}
        />,
        document.body
      )}

      {/* Glass Surface Backdrop Filter Layer */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: borderRadiusCss,
          ...backdropStyle,
          boxShadow: [
            'inset 0 0 0 0.5px rgba(255, 255, 255, 0.4)',
            'inset 0 1px 0 rgba(255, 255, 255, 0.6)',
            '0 16px 48px rgba(0, 0, 0, 0.28)',
            '0 1px 0 rgba(255, 255, 255, 0.15)',
          ].join(', '),
          background: isSvgActive
            ? 'rgba(255, 255, 255, 0.03)'
            : 'rgba(255, 255, 255, 0.12)',
          transition: reducedMotion ? 'none' : 'box-shadow 0.3s ease',
        }}
      />

      {/* Foreground Content */}
      {children && (
        <div
          style={{
            position: 'relative',
            zIndex: 1,
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {children}
        </div>
      )}

      {/* Developer Optics Debug Overlay Panel */}
      {debug && (
        <DebugOverlay
          dispMapUrl={dispMapUrl}
          surfaceType={effectiveSurfaceType}
          bezelWidth={bezelWidth}
          refractiveIndex={ior}
          thickness={thickness}
          pixelSize={effectivePixelSize}
          specularAngle={dynAngle}
          mouseX={mousePos.x}
          mouseY={mousePos.y}
          width={width}
          height={height}
          mapGenTimeMs={mapGenTimeMs}
          mode={mode}
        />
      )}
    </div>
  );
};

export default LiquidGlass;
