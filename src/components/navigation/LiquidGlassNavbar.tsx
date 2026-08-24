import React, { useState, useId, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { computeRefractionField } from '../LiquidGlass/physics';
import { generateDisplacementMap, generateZoomDisplacementMap } from '../LiquidGlass/displacement';
import { detectSvgBackdropSupport, getGlassFallbackStyle, LiquidGlassMagnifierSvgDefs } from '../LiquidGlass/svgFilters';

interface LiquidGlassNavbarProps {
  onMenuClick?: () => void;
}

export const LiquidGlassNavbar: React.FC<LiquidGlassNavbarProps> = ({ onMenuClick }) => {
  const [activeTab, setActiveTab] = useState('Optics');

  // ── Drag state — igual que MagnifyingGlass ──────────────────────────────────
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLElement>) => {
    // Solo drag desde la barra en sí, no desde los botones
    if ((e.target as HTMLElement).closest('button, nav')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
    dragRef.current = { startX: e.clientX, startY: e.clientY, originX: pos.x, originY: pos.y };
  }, [pos]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (!dragRef.current) return;
    setPos({
      x: dragRef.current.originX + (e.clientX - dragRef.current.startX),
      y: dragRef.current.originY + (e.clientY - dragRef.current.startY),
    });
  }, []);

  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
    dragRef.current = null;
  }, []);

  const rawId = useId();
  const filterId = `lg-nav-filter-${rawId.replace(/[^a-zA-Z0-9]/g, '')}`;

  const actualWidth  = 960;
  const actualHeight = 58;
  const borderRadiusStyle = '9999px';

  const MAP_W = Math.min(512, Math.max(128, Math.round(actualWidth  * 1.5)));
  const MAP_H = Math.min(512, Math.max(128, Math.round(actualHeight * 1.5)));
  const mapBR = 9999;
  const zoom = 1.5; const bezelThickness = 22; const ior = 1.45; const distortion = 0.45;

  const { zoomMapUrl, rimMapUrl, zoomScale, rimScale, padPercent } = useMemo(() => {
    if (typeof document === 'undefined')
      return { zoomMapUrl: '', rimMapUrl: '', zoomScale: 1, rimScale: 1, padPercent: 15 };

    const zoomResult = generateZoomDisplacementMap({ width: MAP_W, height: MAP_H, zoom, borderRadius: mapBR });

    const refractionField = computeRefractionField({
      surfaceType: 'convex-circle', refractiveIndex: ior,
      bezelWidth: 0.35, thickness: bezelThickness, numSamples: 127,
    });

    const rimResult = generateDisplacementMap({
      width: MAP_W, height: MAP_H, borderRadius: mapBR, refractionField,
      bezelPixelWidth: (bezelThickness / Math.min(actualWidth, actualHeight)) * Math.min(MAP_W, MAP_H),
      distortion, surfaceType: 'convex-circle', ior, thickness: bezelThickness,
    });

    const computedZoomScale = zoom <= 1.02 ? 0 : Math.max(2, 2.0 * zoomResult.maximumDisplacement);
    const computedRimScale  = Math.max(2, 2.0 * rimResult.maximumDisplacement);
    const bboxSpan = (actualWidth + actualHeight) / 2;
    const pad = Math.min(80, Math.max(15, ((computedZoomScale / 2 + computedRimScale / 2) / bboxSpan) * 100 + 10));

    return {
      zoomMapUrl:  zoomResult.dataUrl,
      rimMapUrl:   rimResult.dataUrl,
      zoomScale:   computedZoomScale / bboxSpan,
      rimScale:    computedRimScale  / bboxSpan,
      padPercent:  pad,
    };
  }, []);

  const navItems = ['Optics', 'Refraction', 'Snell Law', 'Specs', 'Showcase'];

  if (typeof document === 'undefined') return null;

  const supportsSvgBackdrop = detectSvgBackdropSupport();

  return createPortal(
    <>
      <LiquidGlassMagnifierSvgDefs
        filterId={filterId}
        zoomMapUrl={zoomMapUrl}
        rimMapUrl={rimMapUrl}
        specMapUrl=""
        zoomScale={zoomScale}
        rimScale={rimScale}
        padXPercent={padPercent}
        padYPercent={padPercent}
      />

      <header
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{
          position:      'fixed',
          top:           20 + pos.y,
          left:          `calc(50% + ${pos.x}px)`,
          transform:     `translateX(-50%) scale(${isDragging ? 1.02 : 1})`,
          zIndex:        9998,
          width:         'calc(100% - 48px)',
          maxWidth:      actualWidth,
          height:        actualHeight,
          borderRadius:  borderRadiusStyle,
          cursor:        isDragging ? 'grabbing' : 'grab',
          touchAction:   'none',
          userSelect:    'none',
          pointerEvents: 'auto',
          display:       'flex',
          alignItems:    'center',
          justifyContent:'space-between',
          padding:       '0 20px',
          transition:    isDragging
            ? 'transform 0.05s ease-out'
            : 'transform 0.25s cubic-bezier(0.34,1.56,0.64,1)',
        }}
      >
        {/* Capa de vidrio */}
        <div style={{
          position:             'absolute', inset: 0,
          borderRadius:         borderRadiusStyle, overflow: 'hidden',
          ...(supportsSvgBackdrop ? {
            backdropFilter: `url(#${filterId})`,
            WebkitBackdropFilter: `url(#${filterId})`,
            background: 'transparent',
            border: 'none',
          } : getGlassFallbackStyle()),
          boxShadow:            isDragging
            ? '0 20px 50px rgba(0,0,0,0.45), inset 0 0 0 0.5px rgba(255,255,255,0.35)'
            : '0 8px 28px rgba(0,0,0,0.28), inset 0 0 0 0.5px rgba(255,255,255,0.25)',
          pointerEvents:        'none',
          transition:           'box-shadow 0.2s ease',
        }} />

        {/* Logo */}
        <span style={{
          position: 'relative', fontSize: '0.85rem', fontWeight: 800,
          letterSpacing: '0.18em', textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.92)', userSelect: 'none',
        }}>
          LiquidGL
        </span>

        {/* Nav tabs */}
        <nav style={{ position: 'relative', display: 'flex', gap: 4 }}>
          {navItems.map(item => (
            <button key={item} onClick={() => setActiveTab(item)} style={{
              background:    activeTab === item ? 'rgba(255,255,255,0.15)' : 'transparent',
              border:        'none', borderRadius: 9999,
              color:         activeTab === item ? '#fff' : 'rgba(255,255,255,0.55)',
              cursor:        'pointer', fontSize: '0.75rem', fontWeight: 700,
              letterSpacing: '0.08em', padding: '6px 14px', transition: 'all 0.2s ease',
            }}>
              {item}
            </button>
          ))}
        </nav>

        {/* Hamburger */}
        <button onClick={onMenuClick} aria-label="Open menu" style={{
          position: 'relative', background: 'transparent', border: 'none',
          borderRadius: 9999, color: 'rgba(255,255,255,0.85)', cursor: 'pointer',
          width: 36, height: 36, display: 'flex', alignItems: 'center',
          justifyContent: 'center', flexDirection: 'column', gap: 4, padding: 0, flexShrink: 0,
        }}>
          {[0, 1, 2].map(i => (
            <span key={i} style={{
              display: 'block', width: 16, height: 1.5,
              borderRadius: 2, background: 'rgba(255,255,255,0.85)',
            }} />
          ))}
        </button>
      </header>
    </>,
    document.body
  );
};

export default LiquidGlassNavbar;
