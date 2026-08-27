/**
 * LiquidGlassLeftSidebar.tsx
 *
 * Sidebar izquierdo arrastreable que se expande al hacer hover.
 * - Colapsado: solo iconos (60px ancho)
 * - Expandido: iconos + labels (200px ancho)
 *
 * Construido sobre el core reutilizable:
 *   • useLiquidGlassMaps  → física óptica + displacement maps
 *   • useDraggable        → drag fluido con bounce elástico
 *   • LiquidGlassSurface  → superficie glass visual pura
 */

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useLiquidGlassMaps } from '../LiquidGlass/core/useLiquidGlassMaps';
import { useDraggable } from '../LiquidGlass/core/useDraggable';
import { LiquidGlassSurface } from '../LiquidGlass/core/LiquidGlassSurface';
import { GlassTintControls, tintFromHueIntensity } from './GlassTintControls';

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface SidebarItem {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
}

// ── Items por defecto ─────────────────────────────────────────────────────────

const defaultItems: SidebarItem[] = [
  {
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
    label: 'Home', active: true,
  },
  {
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
    label: 'Lens',
  },
  {
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
    label: 'Showcase',
  },
  {
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>,
    label: 'Optics',
  },
  {
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
    label: 'Specs',
  },
  {
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
    label: 'About',
  },
];

// ── Constantes ────────────────────────────────────────────────────────────────

const COLLAPSED_W = 60;
const EXPANDED_W  = 200;
const HEIGHT      = 400;
const BORDER_RADIUS = 24;

// ── Componente ────────────────────────────────────────────────────────────────

export interface LiquidGlassLeftSidebarProps {
  items?: SidebarItem[];
}

export const LiquidGlassLeftSidebar: React.FC<LiquidGlassLeftSidebarProps> = ({
  items = defaultItems,
}) => {
  const [hovered, setHovered] = useState(false);
  const [tintHue,       setTintHue]       = useState(220);   // azul por defecto
  const [tintIntensity, setTintIntensity] = useState(45);    // 45% intensidad

  const tint = tintFromHueIntensity(tintHue, tintIntensity);

  // Maps generados para el tamaño expandido (el más grande)
  const maps = useLiquidGlassMaps({
    width:          EXPANDED_W,
    height:         HEIGHT,
    borderRadius:   BORDER_RADIUS,
    zoom:           1.5,
    bezelThickness: 22,
    ior:            1.45,
    distortion:     0.45,
  });

  // Drag — ignorar clicks en botones para que no inicien el drag
  const drag = useDraggable({
    ignoreSelector:   'button',
    dragScale:        1.03,
    hoverScale:       1.0,  // el sidebar no hace hover scale (solo cambia de ancho)
    releaseOvershoot: 1.04,
  });

  const { state } = drag;
  const currentW = hovered ? EXPANDED_W : COLLAPSED_W;

  if (typeof document === 'undefined') return null;

  return createPortal(
    <>
    <LiquidGlassSurface
      maps={maps}
      isDragging={state.isDragging}
      isHovered={hovered}
      motionEnergy={state.motionEnergy}
      style={{
        position:    'fixed',
        top:         '50%',
        left:        24 + state.x,
        transform:   `translateY(calc(-50% + ${state.y}px)) scale(${state.isDragging ? 1.03 : 1})`,
        zIndex:      99999,
        width:       currentW,
        height:      HEIGHT,
        borderRadius: BORDER_RADIUS,
        overflow:    'hidden',
        isolation:   'isolate',
        cursor:      state.isDragging ? 'grabbing' : 'grab',
        touchAction: 'none',
        userSelect:  'none',
        transition:  state.isDragging
          ? 'transform 0.05s ease-out, width 0.35s cubic-bezier(0.16,1,0.3,1)'
          : 'width 0.35s cubic-bezier(0.16,1,0.3,1), transform 0.25s cubic-bezier(0.34,1.56,0.64,1)',
      }}
      onPointerDown={drag.pointerHandlers.onPointerDown}
      onPointerMove={drag.pointerHandlers.onPointerMove}
      onPointerUp={drag.pointerHandlers.onPointerUp}
      onPointerCancel={drag.pointerHandlers.onPointerCancel}
      onPointerEnter={() => { setHovered(true); drag.pointerHandlers.onPointerEnter(); }}
      onPointerLeave={() => { setHovered(false); drag.pointerHandlers.onPointerLeave(); }}
    >
      {/* Tinte de color controlado por sliders */}
      <div style={{
        position:      'absolute',
        inset:         0,
        borderRadius:  BORDER_RADIUS,
        pointerEvents: 'none',
        zIndex:        1,
        background:    `linear-gradient(to top, ${tint.rgba} 0%, transparent 70%)`,
      }} />

      {/* Contenido — ancho fijo para que la animación de width no comprima el texto */}
      <div style={{
        position:        'relative',
        zIndex:          2,
        height:          '100%',
        display:         'flex',
        flexDirection:   'column',
        justifyContent:  'center',
        gap:             4,
        padding:         '20px 0',
        width:           EXPANDED_W,
      }}>
        {items.map((item, idx) => (
          <button
            key={idx}
            onClick={item.onClick}
            title={item.label}
            style={{
              display:      'flex',
              alignItems:   'center',
              gap:          14,
              background:   item.active ? 'rgba(255,255,255,0.12)' : 'transparent',
              border:       'none',
              borderRadius: 14,
              color:        item.active ? '#fff' : 'rgba(255,255,255,0.6)',
              cursor:       'pointer',
              fontSize:     '0.82rem',
              fontWeight:   700,
              letterSpacing:'0.06em',
              padding:      '10px 18px',
              textAlign:    'left',
              width:        '100%',
              flexShrink:   0,
              transition:   'background 0.2s ease, color 0.2s ease',
              whiteSpace:   'nowrap',
            }}
          >
            <span style={{ opacity: 0.85, flexShrink: 0, display: 'flex' }}>
              {item.icon}
            </span>
            <span style={{
              opacity:       hovered ? 1 : 0,
              transform:     hovered ? 'translateX(0)' : 'translateX(-8px)',
              transition:    'opacity 0.25s ease, transform 0.25s ease',
              pointerEvents: 'none',
            }}>
              {item.label}
            </span>
          </button>
        ))}
      </div>
    </LiquidGlassSurface>
    <GlassTintControls
      hue={tintHue}
      intensity={tintIntensity}
      onHueChange={setTintHue}
      onIntensityChange={setTintIntensity}
    />
    </>,
    document.body
  );
};

export default LiquidGlassLeftSidebar;
