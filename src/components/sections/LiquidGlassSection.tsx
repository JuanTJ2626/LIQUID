import React, { useState } from 'react';
import { MagnifyingGlass } from '../LiquidGlass/index';

function Slider({
  label, value, min, max, step = 1, accent = '#60a5fa', onChange,
}: {
  label: string; value: number; min: number; max: number; step?: number; accent?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: '0.78rem', fontWeight: 600, color: 'rgba(255,255,255,0.8)' }}>
      <span style={{ width: 160, flexShrink: 0, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ accentColor: accent, flex: 1, cursor: 'pointer' }} />
      <span style={{ width: 48, textAlign: 'right', color: accent, fontVariantNumeric: 'tabular-nums' }}>
        {!Number.isInteger(value) ? value.toFixed(2) : value}
      </span>
    </div>
  );
}

function SectionLabel({ text, accent }: { text: string; accent: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
      <div style={{ width: 32, height: 2, background: accent }} />
      <span style={{ fontSize: '0.68rem', letterSpacing: '0.24em', textTransform: 'uppercase', color: accent, fontWeight: 800 }}>{text}</span>
    </div>
  );
}

// Rompe el max-width del padre y ocupa 100vw
const fullBleed: React.CSSProperties = {
  width: '100vw',
  position: 'relative',
  left: '50%',
  right: '50%',
  marginLeft: '-50vw',
  marginRight: '-50vw',
};

const IMGS = [
  {
    src: 'https://images.unsplash.com/photo-1546182990-dffeafbe841d?w=1800&q=85',
    label: 'FAUNA', accent: '#34d399',
    title: 'Nature up close',
    desc: 'Macro photography pushes the lens to its physical limits — every pixel counts.',
  },
  {
    src: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1800&q=85',
    label: 'LANDSCAPE', accent: '#60a5fa',
    title: 'Mountain light',
    desc: 'Golden-hour gradients create the perfect high-contrast backdrop for refraction.',
  },
  {
    src: 'https://images.unsplash.com/photo-1462275646964-a0e3386b89fa?w=1800&q=85',
    label: 'ARCHITECTURE', accent: '#f472b6',
    title: 'Glass & steel',
    desc: 'Geometric repetition amplifies the displacement — straight lines visibly bend.',
  },
  {
    src: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=1800&q=85',
    label: 'PORTRAIT', accent: '#fb923c',
    title: 'Human texture',
    desc: 'Skin tones and sharp detail reveal the subtle chromatic bloom of the lens rim.',
  },
];

const TRIPLET = [
  'https://images.unsplash.com/photo-1523712999610-f77fbcfc3843?w=900&q=85',
  'https://images.unsplash.com/photo-1444703686981-a3abbc4d4fe3?w=900&q=85',
  'https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=900&q=85',
];

export const LiquidGlassSection: React.FC<{
  showNavbar?: boolean;
  showRightSidebar?: boolean;
  showLeftSidebar?: boolean;
  showMagnifyingGlass?: boolean;
  onToggleNavbar?: () => void;
  onToggleRightSidebar?: () => void;
  onToggleLeftSidebar?: () => void;
  onToggleMagnifyingGlass?: () => void;
}> = ({ 
  showNavbar = false,
  showRightSidebar = false,
  showLeftSidebar = false,
  showMagnifyingGlass = false,
  onToggleNavbar,
  onToggleRightSidebar,
  onToggleLeftSidebar,
  onToggleMagnifyingGlass,
}) => {
  const [specularOpacity, setSpecularOpacity] = useState(0.85);
  const [distortion, setDistortion] = useState(0.6);
  const [zoom, setZoom] = useState(1);
  const [inwardDistortion, setInwardDistortion] = useState(0.25);

  // Componente para un toggle individual
  const ToggleButton = ({ 
    label, 
    sublabel, 
    checked, 
    onChange, 
    color = '#10b981' 
  }: { 
    label: string; 
    sublabel: string; 
    checked: boolean; 
    onChange: () => void; 
    color?: string;
  }) => (
    <label style={{ 
      display: 'flex', 
      alignItems: 'center', 
      gap: 12,
      cursor: 'pointer',
      userSelect: 'none',
      padding: '12px 16px',
      background: checked ? 'rgba(255,255,255,0.03)' : 'transparent',
      borderRadius: 12,
      border: `1px solid ${checked ? color : 'rgba(255,255,255,0.06)'}`,
      transition: 'all 0.3s ease',
    }}>
      <input 
        type="checkbox" 
        checked={checked}
        onChange={onChange}
        style={{
          width: 44,
          height: 24,
          appearance: 'none',
          background: checked ? color : 'rgba(255,255,255,0.08)',
          borderRadius: 9999,
          position: 'relative',
          cursor: 'pointer',
          transition: 'background 0.3s ease',
          border: '2px solid rgba(255,255,255,0.05)',
          flexShrink: 0,
        }}
      />
      <style>
        {`
          input[type="checkbox"]::before {
            content: '';
            position: absolute;
            width: 16px;
            height: 16px;
            border-radius: 50%;
            background: white;
            top: 2px;
            left: 2px;
            transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
            box-shadow: 0 2px 6px rgba(0,0,0,0.2);
          }
          input[type="checkbox"]:checked::before {
            transform: translateX(20px);
          }
        `}
      </style>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ 
          fontSize: '0.8rem', 
          fontWeight: 700, 
          color: checked ? color : 'rgba(255,255,255,0.7)',
          letterSpacing: '0.06em',
          transition: 'color 0.3s ease',
        }}>
          {checked ? '● ' : '○ '}{label}
        </span>
        <span style={{ 
          fontSize: '0.65rem', 
          fontWeight: 600, 
          color: 'rgba(255,255,255,0.35)',
          letterSpacing: '0.06em',
        }}>
          {sublabel}
        </span>
      </div>
    </label>
  );

  return (
    <section id="liquid-glass" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

      {/* ── 1. Showcase principal ─────────────────────────────────────────────── */}
      <div style={{ padding: '20px 0 60px' }}>
        <div style={{
          position: 'relative', width: '100%', borderRadius: 24, overflow: 'hidden',
          background: '#060608', border: '1px solid rgba(255,255,255,0.1)',
          boxShadow: '0 30px 90px rgba(0,0,0,0.7)', padding: '44px',
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40, alignItems: 'center',
        }}>
          <div style={{ paddingRight: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{ width: 28, height: 2, background: '#ef4444' }} />
              <span style={{ fontSize: '0.72rem', letterSpacing: '0.22em', textTransform: 'uppercase', color: '#ef4444', fontWeight: 800 }}>OPTICS STUDY</span>
            </div>
            <h3 style={{ fontSize: 'clamp(2.2rem,3.5vw,3.2rem)', fontWeight: 800, color: '#fff', lineHeight: 1.08, letterSpacing: '-0.03em', margin: '0 0 24px 0' }}>
              Liquid Glass—<br />Precision Lens
            </h3>
            <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.92rem', lineHeight: 1.65, margin: '0 0 16px 0' }}>
              Drag the capsule to bend the page. A compact SVG displacement rig that refracts whatever sits beneath it.
            </p>
            <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.92rem', lineHeight: 1.65, margin: '0 0 24px 0' }}>
              Sweep across strong edges — high contrast makes the bend snap.
            </p>

            {/* Toggles individuales para cada elemento Liquid Glass */}
            <div style={{ marginTop: 32, paddingTop: 24, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ 
                fontSize: '0.68rem', 
                letterSpacing: '0.20em', 
                textTransform: 'uppercase', 
                color: 'rgba(255,255,255,0.4)', 
                fontWeight: 800,
                marginBottom: 16,
              }}>
                LIQUID GLASS ELEMENTS
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {onToggleNavbar && (
                  <ToggleButton 
                    label="NAVBAR"
                    sublabel="Top draggable bar"
                    checked={showNavbar}
                    onChange={onToggleNavbar}
                    color="#3b82f6"
                  />
                )}
                {onToggleRightSidebar && (
                  <ToggleButton 
                    label="RIGHT PANEL"
                    sublabel="Menu sidebar"
                    checked={showRightSidebar}
                    onChange={onToggleRightSidebar}
                    color="#8b5cf6"
                  />
                )}
                {onToggleLeftSidebar && (
                  <ToggleButton 
                    label="LEFT PANEL"
                    sublabel="Info sidebar"
                    checked={showLeftSidebar}
                    onChange={onToggleLeftSidebar}
                    color="#ec4899"
                  />
                )}
                {onToggleMagnifyingGlass && (
                  <ToggleButton 
                    label="MAGNIFIER"
                    sublabel="SVG magnifying glass"
                    checked={showMagnifyingGlass}
                    onChange={onToggleMagnifyingGlass}
                    color="#f59e0b"
                  />
                )}
              </div>

              <p style={{ 
                color: 'rgba(255,255,255,0.45)', 
                fontSize: '0.7rem', 
                lineHeight: 1.6, 
                margin: '16px 0 0 0',
                fontStyle: 'italic',
                textAlign: 'center',
              }}>
                Toggle each element individually to explore Liquid Glass UI
              </p>
            </div>
          </div>
          <div style={{ position: 'relative', width: '100%', height: 420, borderRadius: 16, overflow: 'hidden', background: '#121216', boxShadow: '0 12px 40px rgba(0,0,0,0.5)' }}>
            <img src="/rana.png" alt="Frog" style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }} />
            {showMagnifyingGlass && (
              <MagnifyingGlass
                fixed={true} width={280} height={180} borderRadius={9999}
                zoom={zoom} bezelThickness={22} ior={1.45}
                inwardDistortion={inwardDistortion}
                specularOpacity={specularOpacity}
                distortion={distortion} specularAngle={315}
              />
            )}
          </div>
        </div>
        <div style={{ marginTop: 36, padding: '0 8px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontSize: '0.68rem', letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', fontWeight: 700, marginBottom: 4 }}>PARAMETERS</div>
          <Slider label="SPECULAR OPACITY" value={specularOpacity} min={0} max={1} step={0.01} onChange={setSpecularOpacity} />
          <Slider label="BUBBLE ZOOM" value={zoom} min={0} max={2} step={0.01} onChange={setZoom} />
          <Slider label="INWARD DISTORTION" value={inwardDistortion} min={0} max={1} step={0.01} onChange={setInwardDistortion} />
          <Slider label="REFRACTION LEVEL" value={distortion} min={0.1} max={3.0} step={0.1} onChange={setDistortion} />
        </div>
      </div>

      {/* ── 2. Full-bleed 2 columnas ─────────────────────────────────────────── */}
      <div style={{ ...fullBleed, marginBottom: 0 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', height: '70vh', minHeight: 480 }}>
          {IMGS.slice(0, 2).map((img, i) => (
            <div key={i} style={{ position: 'relative', overflow: 'hidden' }}>
              <img src={img.src} alt={img.label} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.72) 0%, transparent 55%)', pointerEvents: 'none' }} />
              <div style={{ position: 'absolute', bottom: 36, left: 44 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <div style={{ width: 22, height: 2, background: img.accent }} />
                  <span style={{ fontSize: '0.65rem', letterSpacing: '0.22em', textTransform: 'uppercase', color: img.accent, fontWeight: 800 }}>{img.label}</span>
                </div>
                <h4 style={{ color: '#fff', fontSize: 'clamp(1.4rem,2.5vw,2rem)', fontWeight: 800, margin: '0 0 8px 0', letterSpacing: '-0.02em' }}>{img.title}</h4>
                <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.85rem', lineHeight: 1.55, margin: 0, maxWidth: 320 }}>{img.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── 3. Panorámica full-bleed con texto ───────────────────────────────── */}
      <div style={{ ...fullBleed }}>
        <div style={{ position: 'relative', height: '80vh', minHeight: 520, overflow: 'hidden' }}>
          <img src={IMGS[1].src} alt="Landscape" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, rgba(0,0,0,0.65) 0%, transparent 55%)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', top: '50%', left: '8vw', transform: 'translateY(-50%)' }}>
            <h2 style={{ color: '#fff', fontSize: 'clamp(2.5rem,6vw,5rem)', fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1.0, margin: 0 }}>
              Light bends.<br />Glass<br />remembers.
            </h2>
          </div>
        </div>
      </div>

      {/* ── 4. Grid 3 columnas full-bleed ────────────────────────────────────── */}
      <div style={{ ...fullBleed }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', height: '55vh', minHeight: 360 }}>
          {TRIPLET.map((src, i) => (
            <div key={i} style={{ position: 'relative', overflow: 'hidden' }}>
              <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            </div>
          ))}
        </div>
      </div>

      {/* ── 5. Portrait full-bleed + texto flotante ───────────────────────────── */}
      <div style={{ ...fullBleed }}>
        <div style={{ position: 'relative', height: '85vh', minHeight: 560, overflow: 'hidden' }}>
          <img src={IMGS[3].src} alt="Portrait" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', objectPosition: 'top' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, rgba(0,0,0,0.7) 0%, transparent 55%)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', top: '50%', left: '7vw', transform: 'translateY(-50%)', maxWidth: 480 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <div style={{ width: 28, height: 2, background: '#fb923c' }} />
              <span style={{ fontSize: '0.68rem', letterSpacing: '0.22em', textTransform: 'uppercase', color: '#fb923c', fontWeight: 800 }}>PORTRAIT</span>
            </div>
            <h3 style={{ fontSize: 'clamp(2rem,4.5vw,3.8rem)', fontWeight: 800, color: '#fff', lineHeight: 1.05, letterSpacing: '-0.03em', margin: '0 0 24px 0' }}>
              Every pixel<br />tells a story.
            </h3>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.95rem', lineHeight: 1.7, margin: '0 0 28px 0' }}>
              The liquid glass lens transforms. Drag it over high-contrast regions and watch the displacement field react.
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {['IOR 1.45', 'SNELL LAW', 'SVG FILTER'].map(tag => (
                <span key={tag} style={{ padding: '6px 16px', borderRadius: 9999, border: '1px solid rgba(255,255,255,0.2)', fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase' }}>{tag}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── 6. Architecture full-bleed ───────────────────────────────────────── */}
      <div style={{ ...fullBleed, marginBottom: 0 }}>
        <div style={{ position: 'relative', height: '75vh', minHeight: 480, overflow: 'hidden' }}>
          <img src={IMGS[2].src} alt="Architecture" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, transparent 40%, rgba(0,0,0,0.6) 100%)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', bottom: 48, right: '7vw', textAlign: 'right' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, marginBottom: 12 }}>
              <span style={{ fontSize: '0.68rem', letterSpacing: '0.22em', textTransform: 'uppercase', color: '#f472b6', fontWeight: 800 }}>ARCHITECTURE</span>
              <div style={{ width: 28, height: 2, background: '#f472b6' }} />
            </div>
            <h4 style={{ color: '#fff', fontSize: 'clamp(1.8rem,3.5vw,3rem)', fontWeight: 800, margin: '0 0 10px 0', letterSpacing: '-0.03em' }}>{IMGS[2].title}</h4>
            <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.88rem', lineHeight: 1.6, margin: 0, maxWidth: 400, marginLeft: 'auto' }}>{IMGS[2].desc}</p>
          </div>
        </div>
      </div>

    </section>
  );
};

export default LiquidGlassSection;
