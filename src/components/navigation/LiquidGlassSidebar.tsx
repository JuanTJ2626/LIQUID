import React, { useId, useMemo, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { computeRefractionField } from '../LiquidGlass/physics';
import { generateDisplacementMap, generateZoomDisplacementMap } from '../LiquidGlass/displacement';
import { detectSvgBackdropSupport, getGlassFallbackStyle, LiquidGlassMagnifierSvgDefs } from '../LiquidGlass/svgFilters';

interface SidebarItem {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
}

interface LiquidGlassSidebarProps {
  items?: SidebarItem[];
}

const defaultItems: SidebarItem[] = [
  {
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>,
    label: 'Lens', active: true,
  },
  {
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>,
    label: 'Home',
  },
  {
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>,
    label: 'Showcase',
  },
  {
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>,
    label: 'Specs',
  },
  {
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14" /></svg>,
    label: 'Optics',
  },
];

export const LiquidGlassSidebar: React.FC<LiquidGlassSidebarProps> = ({
  items = defaultItems,
}) => {
  const rawId = useId();
  const filterId = `lg-sidebar-filter-${rawId.replace(/[^a-zA-Z0-9]/g, '')}`;

  // ── Drag — igual que MagnifyingGlass ───────────────────────────────────────
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
    dragRef.current = { startX: e.clientX, startY: e.clientY, originX: pos.x, originY: pos.y };
  }, [pos]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
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

  const actualWidth  = 220;
  const actualHeight = 480;
  const borderRadiusStyle = '28px';

  const MAP_W = Math.min(512, Math.max(128, Math.round(actualWidth  * 1.5)));
  const MAP_H = Math.min(512, Math.max(128, Math.round(actualHeight * 1.5)));
  const mapBR = (28 / Math.min(actualWidth, actualHeight)) * Math.min(MAP_W, MAP_H);
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
      zoomMapUrl: zoomResult.dataUrl, rimMapUrl: rimResult.dataUrl,
      zoomScale:  computedZoomScale / bboxSpan,
      rimScale:   computedRimScale  / bboxSpan,
      padPercent: pad,
    };
  }, []);

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

      {/* Panel — siempre visible, draggable */}
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{
          position:    'fixed',
          top:         '50%',
          right:       24 - pos.x,
          transform:   `translateY(calc(-50% + ${pos.y}px)) scale(${isDragging ? 1.03 : 1})`,
          zIndex:      99999,
          width:       actualWidth,
          height:      actualHeight,
          borderRadius: borderRadiusStyle,
          cursor:      isDragging ? 'grabbing' : 'grab',
          touchAction: 'none',
          userSelect:  'none',
          transition:  isDragging
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
          boxShadow: isDragging
            ? '0 24px 60px rgba(0,0,0,0.5), inset 0 0 0 0.5px rgba(255,255,255,0.35)'
            : '0 8px 28px rgba(0,0,0,0.28), inset 0 0 0 0.5px rgba(255,255,255,0.25)',
          pointerEvents:        'none',
          transition:           'box-shadow 0.2s ease',
        }} />

        {/* Contenido */}
        <div style={{
          position: 'relative', height: '100%',
          display: 'flex', flexDirection: 'column', gap: 6, padding: '28px 20px',
        }}>
          {/* Header */}
          <div style={{ marginBottom: 20 }}>
            <span style={{
              fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.22em',
              textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)',
            }}>Menu</span>
          </div>

          {/* Items */}
          {items.map((item, idx) => (
            <button key={idx} onClick={item.onClick} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              background: item.active ? 'rgba(255,255,255,0.12)' : 'transparent',
              border: 'none', borderRadius: 14,
              color: item.active ? '#fff' : 'rgba(255,255,255,0.6)',
              cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700,
              letterSpacing: '0.06em', padding: '10px 14px',
              textAlign: 'left', width: '100%',
              transition: 'background 0.2s ease, color 0.2s ease',
            }}>
              <span style={{ opacity: 0.85, flexShrink: 0 }}>{item.icon}</span>
              {item.label}
            </button>
          ))}

          {/* Footer */}
          <div style={{
            marginTop: 'auto', paddingTop: 20,
            borderTop: '1px solid rgba(255,255,255,0.08)',
            fontSize: '0.62rem', letterSpacing: '0.18em',
            textTransform: 'uppercase', color: 'rgba(255,255,255,0.2)',
            textAlign: 'center',
          }}>
            Liquid Glass · v1
          </div>
        </div>
      </div>
    </>,
    document.body
  );
};

export default LiquidGlassSidebar;
