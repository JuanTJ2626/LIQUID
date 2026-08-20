/**
 * LiquidGlassTestLab.tsx
 *
 * Interactive visual laboratory for testing and verifying Liquid Glass refraction.
 * Compares Original Unfiltered Background vs Kube Core vs Enhanced vs Fallback across
 * 5 distinct test targets:
 *   1. Alignment Grid
 *   2. Fine Typography
 *   3. Concentric Circles
 *   4. RGB Gradients
 *   5. Photographic Orbs Scene
 */

import React, { useState } from 'react';
import { LiquidGlass } from './LiquidGlass';
import { type SurfaceType } from './physics';
import { runPhysicsTests } from './physicsRunner';

export const LiquidGlassTestLab: React.FC = () => {
  const [engineMode, setEngineMode] = useState<'kube' | 'enhanced' | 'fallback' | 'original'>('kube');
  const [activeTarget, setActiveTarget] = useState<'grid' | 'text' | 'circles' | 'gradient' | 'photo'>('grid');
  const [surfaceType, setSurfaceType] = useState<SurfaceType>('convex-squircle');
  const [thickness, setThickness] = useState(35);
  const [ior, setIor] = useState(1.45);
  const [bezelWidth, setBezelWidth] = useState(0.28);
  const [distortion, setDistortion] = useState(1.2);
  const [pixelSize, setPixelSize] = useState(0);
  const [enableFresnel, setEnableFresnel] = useState(false);
  const [blur, setBlur] = useState(2);
  const [debug, setDebug] = useState(false);

  // Unit Test Log Modal
  const [testLogs, setTestLogs] = useState<string[] | null>(null);

  const runTests = () => {
    const res = runPhysicsTests();
    setTestLogs(res.log);
  };

  const isKubeMode = engineMode === 'kube';

  return (
    <div style={{ background: '#090a12', color: '#fff', padding: '32px 24px', borderRadius: 24, border: '1px solid rgba(255,255,255,0.12)', maxWidth: 1100, margin: '0 auto' }}>
      {/* Header & Unit Test Trigger */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: '#ec4899' }}>
            Liquid Glass Visual Test Laboratory
          </h3>
          <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)' }}>
            Compare Kube Core vs Enhanced vs Fallback across optical test targets
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={runTests}
            style={{ padding: '8px 16px', borderRadius: 100, fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', background: '#7c3aed', border: 'none', color: '#fff' }}
          >
            ▶ Run Physics Unit Tests
          </button>
          <button
            onClick={() => setDebug(!debug)}
            style={{ padding: '8px 16px', borderRadius: 100, fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', background: debug ? '#ec4899' : 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff' }}
          >
            {debug ? 'HUD Debug ON' : 'Enable HUD Debug'}
          </button>
        </div>
      </div>

      {/* Engine Mode Selector */}
      <div style={{ background: 'rgba(255,255,255,0.04)', padding: 14, borderRadius: 16, border: '1px solid rgba(255,255,255,0.1)', marginBottom: 24 }}>
        <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>
          Select Engine Mode
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {[
            { id: 'kube', label: '100% Kube Core (Pure Refraction)', color: '#7c3aed' },
            { id: 'enhanced', label: 'Enhanced (Kube + Fresnel + Cell Grid)', color: '#ec4899' },
            { id: 'fallback', label: 'Fallback (CSS Frosted Glass)', color: '#38bdf8' },
            { id: 'original', label: 'Original Background (No Glass)', color: '#6b7280' },
          ].map((m) => (
            <button
              key={m.id}
              onClick={() => {
                setEngineMode(m.id as any);
                if (m.id === 'kube') {
                  setPixelSize(0);
                  setEnableFresnel(false);
                }
              }}
              style={{
                padding: '8px 16px',
                borderRadius: 100,
                fontSize: '0.8rem',
                fontWeight: 700,
                cursor: 'pointer',
                background: engineMode === m.id ? m.color : 'transparent',
                border: `1.5px solid ${m.color}`,
                color: '#fff',
                transition: 'all 0.2s',
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Target Selector Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { id: 'grid', label: '1. Alignment Grid' },
          { id: 'text', label: '2. Fine Typography' },
          { id: 'circles', label: '3. Concentric Circles' },
          { id: 'gradient', label: '4. RGB Gradients' },
          { id: 'photo', label: '5. Photographic Orbs' },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTarget(t.id as any)}
            style={{
              padding: '6px 14px',
              borderRadius: 100,
              fontSize: '0.75rem',
              fontWeight: 700,
              cursor: 'pointer',
              background: activeTarget === t.id ? 'rgba(255,255,255,0.15)' : 'transparent',
              border: `1px solid ${activeTarget === t.id ? '#fff' : 'rgba(255,255,255,0.15)'}`,
              color: '#fff',
              transition: 'all 0.2s',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Parameter Sliders */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, background: 'rgba(0,0,0,0.3)', padding: 16, borderRadius: 16, marginBottom: 24 }}>
        <div>
          <label style={{ fontSize: '0.7rem', textTransform: 'uppercase', opacity: 0.5, display: 'block', marginBottom: 4 }}>Surface Profile</label>
          <select
            value={surfaceType}
            disabled={isKubeMode}
            onChange={(e) => setSurfaceType(e.target.value as SurfaceType)}
            style={{ width: '100%', padding: '6px 10px', borderRadius: 8, background: '#181926', color: '#fff', border: '1px solid #444', fontSize: '0.8rem', fontWeight: 600 }}
          >
            <option value="convex-squircle">Convex Squircle (Kube)</option>
            <option value="convex-circle">Convex Circle</option>
            <option value="concave">Concave Bowl</option>
            <option value="lip">Meniscus Lip</option>
            <option value="mixed">Mixed Hybrid</option>
          </select>
        </div>

        <div>
          <label style={{ fontSize: '0.7rem', textTransform: 'uppercase', opacity: 0.5, display: 'block', marginBottom: 4 }}>Thickness ({thickness}px)</label>
          <input type="range" min={5} max={90} value={thickness} onChange={(e) => setThickness(Number(e.target.value))} style={{ width: '100%', accentColor: '#ec4899' }} />
        </div>

        <div>
          <label style={{ fontSize: '0.7rem', textTransform: 'uppercase', opacity: 0.5, display: 'block', marginBottom: 4 }}>Refractive Index n₂ ({ior.toFixed(2)})</label>
          <input type="range" min={1.0} max={2.4} step={0.05} value={ior} onChange={(e) => setIor(Number(e.target.value))} style={{ width: '100%', accentColor: '#7c3aed' }} />
        </div>

        <div>
          <label style={{ fontSize: '0.7rem', textTransform: 'uppercase', opacity: 0.5, display: 'block', marginBottom: 4 }}>Distortion Scale ({distortion.toFixed(1)})</label>
          <input type="range" min={0.2} max={3.0} step={0.1} value={distortion} onChange={(e) => setDistortion(Number(e.target.value))} style={{ width: '100%', accentColor: '#ec4899' }} />
        </div>

        <div>
          <label style={{ fontSize: '0.7rem', textTransform: 'uppercase', opacity: 0.5, display: 'block', marginBottom: 4 }}>
            Micro-Cell Grid ({isKubeMode ? 'OFF (Kube Core)' : (pixelSize === 0 ? 'Disabled' : `${pixelSize}px`)})
          </label>
          <input
            type="range" min={0} max={24} value={pixelSize}
            disabled={isKubeMode}
            onChange={(e) => setPixelSize(Number(e.target.value))}
            style={{ width: '100%', accentColor: '#38bdf8' }}
          />
        </div>
      </div>

      {/* Main Comparison Stage */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: 450,
          borderRadius: 20,
          overflow: 'hidden',
          border: '1px solid rgba(255,255,255,0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0d0e17',
        }}
      >
        {/* Background Target 1: Geometric Alignment Grid */}
        {activeTarget === 'grid' && (
          <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,0.18) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.18) 1px, transparent 1px)', backgroundSize: '24px 24px' }}>
            <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 2, background: '#ec4899', opacity: 0.8 }} />
            <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 2, background: '#38bdf8', opacity: 0.8 }} />
          </div>
        )}

        {/* Background Target 2: Fine Typography */}
        {activeTarget === 'text' && (
          <div style={{ position: 'absolute', inset: 0, padding: 40, overflow: 'hidden', userSelect: 'none', color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace', fontSize: '14px', lineHeight: 1.6 }}>
            {Array.from({ length: 14 }).map((_, i) => (
              <div key={i}>SNELL LAW REFRACTION VECTOR OPTICS N1 SIN THETA1 = N2 SIN THETA2 GLASS MEDIUM DISPLACEMENT MAP {i}</div>
            ))}
          </div>
        )}

        {/* Background Target 3: Concentric Circles */}
        {activeTarget === 'circles' && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  width: (i + 1) * 60,
                  height: (i + 1) * 60,
                  borderRadius: '50%',
                  border: `2px ${i % 2 === 0 ? 'solid' : 'dashed'} ${i % 2 === 0 ? '#ec4899' : '#38bdf8'}`,
                  opacity: 0.5,
                }}
              />
            ))}
          </div>
        )}

        {/* Background Target 4: RGB Gradients */}
        {activeTarget === 'gradient' && (
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(45deg, #ff0055, #7600ff, #00d4ff, #00ff66)' }} />
        )}

        {/* Background Target 5: Photographic Orbs */}
        {activeTarget === 'photo' && (
          <div style={{ position: 'absolute', inset: 0 }}>
            <div style={{ position: 'absolute', width: 240, height: 240, borderRadius: '50%', background: 'radial-gradient(circle, #ec4899, #7c3aed)', filter: 'blur(30px)', top: '10%', left: '15%' }} />
            <div style={{ position: 'absolute', width: 210, height: 210, borderRadius: '50%', background: 'radial-gradient(circle, #06b6d4, #3b82f6)', filter: 'blur(30px)', bottom: '10%', right: '15%' }} />
          </div>
        )}

        {/* Overlaid Liquid Glass Component (Skip if Original mode selected) */}
        {engineMode !== 'original' && (
          <LiquidGlass
            mode={engineMode === 'kube' ? 'kube' : engineMode === 'fallback' ? 'fallback' : 'enhanced'}
            width={360}
            height={240}
            borderRadius={32}
            surfaceType={surfaceType}
            bezelWidth={bezelWidth}
            thickness={thickness}
            ior={ior}
            distortion={distortion}
            pixelSize={pixelSize}
            enableCellDisplacement={!isKubeMode && pixelSize > 1}
            enableFresnel={!isKubeMode && enableFresnel}
            blur={blur}
            forceSvgFilter={engineMode !== 'fallback'}
            interactive={true}
            debug={debug}
            data-testid="liquid-glass-lab-panel"
            style={{ zIndex: 10 }}
          >
            <div style={{ textAlign: 'center', padding: 20 }}>
              <div style={{ fontSize: '0.65rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.6)', marginBottom: 4 }}>
                MODE: {engineMode.toUpperCase()}
              </div>
              <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#fff' }}>
                Physical Liquid Glass
              </div>
            </div>
          </LiquidGlass>
        )}
      </div>

      {/* Unit Test Results Modal */}
      {testLogs && (
        <div style={{ marginTop: 24, background: '#050508', border: '1px solid #7c3aed', padding: 16, borderRadius: 12, fontFamily: 'monospace', fontSize: '11px', maxHeight: 220, overflow: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, borderBottom: '1px solid #333', paddingBottom: 4 }}>
            <span style={{ color: '#ec4899', fontWeight: 700 }}>MATH PHYSICS TEST SUITE LOGS</span>
            <button onClick={() => setTestLogs(null)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>✕ Close</button>
          </div>
          {testLogs.map((l, idx) => (
            <div key={idx} style={{ color: l.includes('✓') ? '#10b981' : l.includes('✗') ? '#f43f5e' : '#aaa' }}>{l}</div>
          ))}
        </div>
      )}
    </div>
  );
};
