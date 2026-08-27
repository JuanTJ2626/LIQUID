/**
 * LiquidGlassSidebarStandalone.tsx
 *
 * 1 SOLO ARCHIVO — Copia esto + rana.png a /public a cualquier proyecto React/Vite.
 * Contiene todo el motor óptico físico (Ley de Snell + lupa de zoom) idéntico al
 * LiquidGlassSidebar del proyecto pagina awward.
 *
 * Dependencias: solo React + react-dom (createPortal).
 */

import React, { useState, useRef, useEffect, useId, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';

// ============================================================================
// 1. MOTOR DE FÍSICA ÓPTICA — PORT EXACTO DE physics.ts + displacement.ts
//    (surfaceProfile, calcSurfaceNormal, refractRay, computeRefractionField,
//     generateZoomDisplacementMap, generateDisplacementMap)
// ============================================================================

type SurfaceType = 'convex-circle' | 'convex-squircle';

interface Vector3 { x: number; y: number; z: number; }

interface RefractionField {
  normalizedDisplacements: Float32Array;
  maximumDisplacement: number;
  numSamples: number;
  fresnelHighlights: Float32Array;
}

// ── Surface Profile ──────────────────────────────────────────────────────────

function surfaceProfile(r: number, bezelFrac: number, type: SurfaceType): number {
  const clampedR = Math.max(0, Math.min(1.0, r));
  const bezelStart = 1.0 - Math.min(0.9, Math.max(0.05, bezelFrac));

  if (type === 'convex-squircle') {
    if (clampedR <= bezelStart) return 1.0;
    const t = (clampedR - bezelStart) / (1.0 - bezelStart);
    return Math.pow(Math.max(0, 1.0 - t * t), 0.25);
  }
  // 'convex-circle' (default)
  if (clampedR <= bezelStart) return 1.0;
  const t = (clampedR - bezelStart) / (1.0 - bezelStart);
  return Math.sqrt(Math.max(0, 1.0 - t * t));
}

function calcSurfaceSlope(r: number, bezelFrac: number, type: SurfaceType, eps = 1e-4): number {
  const h0 = surfaceProfile(r, bezelFrac, type);
  const h1 = surfaceProfile(r + eps, bezelFrac, type);
  return Math.max(-60, Math.min(60, (h1 - h0) / eps));
}

function calcSurfaceNormal(r: number, angleRad: number, bezelFrac: number, type: SurfaceType): Vector3 {
  const slope = calcSurfaceSlope(r, bezelFrac, type);
  const mag = Math.sqrt(slope * slope + 1.0);
  return {
    x: (-slope / mag) * Math.cos(angleRad),
    y: (-slope / mag) * Math.sin(angleRad),
    z: 1.0 / mag,
  };
}

// ── Snell's Law Vector Refraction ────────────────────────────────────────────

function refractRay(incident: Vector3, normal: Vector3, n1: number, n2: number) {
  const eta = n1 / n2;
  const cosTheta1 = -(incident.x * normal.x + incident.y * normal.y + incident.z * normal.z);
  const N = cosTheta1 < 0 ? { x: -normal.x, y: -normal.y, z: -normal.z } : normal;
  const c1 = Math.abs(cosTheta1);
  const k = 1.0 - eta * eta * (1.0 - c1 * c1);
  if (k < 0) return { refracted: null, tir: true };
  const c2 = Math.sqrt(k);
  const scale = eta * c1 - c2;
  return {
    refracted: {
      x: eta * incident.x + scale * N.x,
      y: eta * incident.y + scale * N.y,
      z: eta * incident.z + scale * N.z,
    },
    tir: false,
  };
}

function fresnelSchlick(cosTheta: number, ior: number): number {
  const c = Math.max(0, Math.min(1, cosTheta));
  const f0 = Math.pow((1.0 - ior) / (1.0 + ior), 2);
  return f0 + (1.0 - f0) * Math.pow(1.0 - c, 5);
}

// ── 1D Radial Refraction Precomputation (port exacto de computeRefractionField) ─

function computeRefractionField(opts: {
  surfaceType: SurfaceType;
  refractiveIndex: number;
  bezelWidth: number;
  thickness: number;
  numSamples?: number;
}): RefractionField {
  const { surfaceType, refractiveIndex: n2, bezelWidth, thickness, numSamples = 127 } = opts;
  const n1 = 1.0;
  const rawDisplacements = new Float32Array(numSamples);
  const fresnelHighlights = new Float32Array(numSamples);
  let maxDisp = 0;
  const incident: Vector3 = { x: 0, y: 0, z: -1 };

  for (let i = 0; i < numSamples; i++) {
    const r = i / (numSamples - 1);
    const normal = calcSurfaceNormal(r, 0, bezelWidth, surfaceType);
    fresnelHighlights[i] = fresnelSchlick(normal.z, n2);

    const result = refractRay(incident, normal, n1, n2);
    if (result.tir || !result.refracted) { rawDisplacements[i] = 0; continue; }

    const rz = Math.abs(result.refracted.z) > 1e-4 ? result.refracted.z : -1e-4;
    const dispX = (result.refracted.x / -rz) * thickness;
    const tEdge = Math.max(0, Math.min(1, (1.0 - r) / 0.15));
    const edgeFade = tEdge * tEdge * (3.0 - 2.0 * tEdge);
    rawDisplacements[i] = dispX * edgeFade;
    if (Math.abs(dispX) > maxDisp) maxDisp = Math.abs(dispX);
  }

  const normalizedDisplacements = new Float32Array(numSamples);
  if (maxDisp > 0) {
    for (let i = 0; i < numSamples; i++) normalizedDisplacements[i] = rawDisplacements[i] / maxDisp;
  }
  return { normalizedDisplacements, maximumDisplacement: maxDisp, numSamples, fresnelHighlights };
}

// ── IQ Rounded-Box SDF + Gradient (port exacto de getEffectiveRadialCoords) ──

function getEffectiveRadialCoords(px: number, py: number, width: number, height: number, borderRadius: number) {
  const cx = width / 2;
  const cy = height / 2;
  const r = Math.min(borderRadius, Math.min(cx, cy));
  const relX = px - cx;
  const relY = py - cy;

  const dx = Math.abs(relX) - (cx - r);
  const dy = Math.abs(relY) - (cy - r);

  const sdist = Math.sqrt(Math.max(dx, 0) ** 2 + Math.max(dy, 0) ** 2)
    + Math.min(Math.max(dx, dy), 0)
    - r;

  const bezelSpan = Math.min(cx, cy) * 0.5;
  const dist = sdist > 0 ? 1.01 : Math.max(0, 1.0 + sdist / bezelSpan);

  const EPS = 0.5;
  function sdf(qx: number, qy: number): number {
    const dxi = Math.abs(qx) - (cx - r);
    const dyi = Math.abs(qy) - (cy - r);
    return Math.sqrt(Math.max(dxi, 0) ** 2 + Math.max(dyi, 0) ** 2) + Math.min(Math.max(dxi, dyi), 0) - r;
  }
  const gx = sdf(relX + EPS, relY) - sdf(relX - EPS, relY);
  const gy = sdf(relX, relY + EPS) - sdf(relX, relY - EPS);
  const glen = Math.sqrt(gx * gx + gy * gy) || 1;
  const angle = Math.atan2(gy / glen, gx / glen);

  return { dist, angle };
}

// ── Jacobian Clamp ───────────────────────────────────────────────────────────

function clampDisplacementJacobian(
  normalizedDisplacements: Float32Array,
  bezelPixelWidth: number,
  distortion: number,
  bezelSpan: number,
): Float32Array {
  const JACOBIAN_LIMIT = 0.9;
  const n = normalizedDisplacements.length;
  const dispPx = new Float32Array(n);
  for (let i = 0; i < n; i++) dispPx[i] = normalizedDisplacements[i] * bezelPixelWidth * distortion;
  const dr = bezelSpan / Math.max(1, n - 1);
  const maxDelta = JACOBIAN_LIMIT * dr;
  for (let i = 0; i < n - 1; i++) {
    const delta = dispPx[i + 1] - dispPx[i];
    if (Math.abs(delta) / dr > JACOBIAN_LIMIT) {
      dispPx[i + 1] = dispPx[i] + Math.sign(delta) * maxDelta;
    }
  }
  return dispPx;
}

function sampleClampedDispPx(dispPx: Float32Array, r: number): number {
  const n = dispPx.length;
  const idx = Math.max(0, Math.min(1, r)) * (n - 1);
  const i0 = Math.floor(idx);
  const i1 = Math.min(i0 + 1, n - 1);
  return dispPx[i0] * (1.0 - (idx - i0)) + dispPx[i1] * (idx - i0);
}

// ── generateDisplacementMap (rim Snell — port exacto) ───────────────────────

function generateDisplacementMap(opts: {
  width: number; height: number; borderRadius: number;
  refractionField: RefractionField;
  bezelPixelWidth: number; distortion: number;
  surfaceType: SurfaceType; ior: number; thickness: number;
}): { dataUrl: string; maximumDisplacement: number } {
  const { width, height, borderRadius, refractionField, bezelPixelWidth, distortion } = opts;

  if (typeof document === 'undefined') return { dataUrl: '', maximumDisplacement: 1 };
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { dataUrl: '', maximumDisplacement: 1 };

  const imageData = ctx.createImageData(width, height);
  const data = imageData.data;

  let peakNormalized = 0;
  const profile = refractionField.normalizedDisplacements;
  for (let i = 0; i < profile.length; i++) {
    const abs = Math.abs(profile[i]);
    if (abs > peakNormalized) peakNormalized = abs;
  }

  const realMaxDisp = Math.max(bezelPixelWidth, peakNormalized * bezelPixelWidth * distortion) || 1;
  const bezelSpan = Math.min(width, height) * 0.25;
  const clampedDispPx = clampDisplacementJacobian(refractionField.normalizedDisplacements, bezelPixelWidth, distortion, bezelSpan);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixelIdx = (y * width + x) * 4;
      const { dist, angle } = getEffectiveRadialCoords(x, y, width, height, borderRadius);

      if (dist > 1.0) {
        data[pixelIdx] = 128; data[pixelIdx + 1] = 128; data[pixelIdx + 2] = 128; data[pixelIdx + 3] = 255;
        continue;
      }

      const dispMagnitude = sampleClampedDispPx(clampedDispPx, dist);
      const dispX = -dispMagnitude * Math.cos(angle);
      const dispY = -dispMagnitude * Math.sin(angle);

      data[pixelIdx]     = Math.round(Math.max(0, Math.min(255, 128 + (dispX / realMaxDisp) * 127)));
      data[pixelIdx + 1] = Math.round(Math.max(0, Math.min(255, 128 + (dispY / realMaxDisp) * 127)));
      data[pixelIdx + 2] = 128;
      data[pixelIdx + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return { dataUrl: canvas.toDataURL('image/png'), maximumDisplacement: realMaxDisp };
}

// ── generateZoomDisplacementMap (lupa interior — port exacto) ────────────────

function generateZoomDisplacementMap(opts: {
  width: number; height: number; zoom: number; borderRadius?: number;
}): { dataUrl: string; maximumDisplacement: number } {
  const { width, height, zoom } = opts;
  if (typeof document === 'undefined') return { dataUrl: '', maximumDisplacement: 1 };

  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(cx, cy);
  const zoomFactor = Math.max(1.0, zoom);
  const maxZoomShiftPx = 0.385 * radius * (1.0 - 1.0 / zoomFactor);

  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { dataUrl: '', maximumDisplacement: 1 };

  const imageData = ctx.createImageData(width, height);
  const data = imageData.data;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const relX = x - cx;
      const relY = y - cy;
      const normRadius = Math.hypot(relX / cx, relY / cy);

      if (normRadius >= 1.0) {
        data[idx] = 128; data[idx + 1] = 128; data[idx + 2] = 128; data[idx + 3] = 255;
        continue;
      }

      const factor = (1.0 / zoomFactor - 1.0) * (1.0 - normRadius * normRadius);
      const dispX = relX * factor;
      const dispY = relY * factor;

      const maxDenom = maxZoomShiftPx || 1;
      data[idx]     = Math.round(Math.max(0, Math.min(255, 128 + (dispX / maxDenom) * 127)));
      data[idx + 1] = Math.round(Math.max(0, Math.min(255, 128 + (dispY / maxDenom) * 127)));
      data[idx + 2] = 128;
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return { dataUrl: canvas.toDataURL('image/png'), maximumDisplacement: maxZoomShiftPx };
}

// ── Detección de soporte SVG backdrop-filter ─────────────────────────────────

function detectSvgBackdropSupport(): boolean {
  if (typeof window === 'undefined') return false;
  const isChromium = 'chrome' in window || /Chrome|Chromium|Edg|OPR|Brave/i.test(navigator.userAgent);
  const isFirefox = /Firefox/i.test(navigator.userAgent);
  const isSafari = /Safari/i.test(navigator.userAgent) && !/Chrome|Chromium|Edg/i.test(navigator.userAgent);
  return Boolean(isChromium && !isFirefox && !isSafari);
}

function getGlassFallbackStyle(): React.CSSProperties {
  return {
    backdropFilter: 'blur(14px) saturate(160%) contrast(108%)',
    WebkitBackdropFilter: 'blur(14px) saturate(160%) contrast(108%)',
    background: 'linear-gradient(112deg, rgba(255,255,255,0.10), rgba(255,255,255,0.025) 42%, rgba(16,24,38,0.08))',
    border: '1px solid rgba(255, 255, 255, 0.30)',
  };
}

// ============================================================================
// 2. FLUID CURSOR TRAIL + SHOCKWAVE CANVAS (internal)
// ============================================================================

interface _Point { x: number; y: number; time: number; }
interface _Ripple { x: number; y: number; time: number; maxRadius: number; }

const FluidTrailCanvas: React.FC<{ color?: string; fadeDuration?: number; blurPx?: number; maxRadius?: number }> = ({
  color = '#0066ff', fadeDuration = 1000, blurPx = 20, maxRadius = 48,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pointsRef = useRef<_Point[]>([]);
  const ripplesRef = useRef<_Ripple[]>([]);
  const animRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    const updateSize = () => {
      const rect = parent.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
    };
    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(parent);

    const onMove = (e: PointerEvent) => {
      const rect = parent.getBoundingClientRect();
      const x = e.clientX - rect.left, y = e.clientY - rect.top;
      if (x >= -50 && x <= rect.width + 50 && y >= -50 && y <= rect.height + 50)
        pointsRef.current.push({ x, y, time: performance.now() });
    };
    const onDown = (e: PointerEvent) => {
      const rect = parent.getBoundingClientRect();
      const x = e.clientX - rect.left, y = e.clientY - rect.top;
      if (x >= 0 && x <= rect.width && y >= 0 && y <= rect.height)
        ripplesRef.current.push({ x, y, time: performance.now(), maxRadius: Math.max(120, Math.min(rect.width, rect.height) * 0.75) });
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onDown, { passive: true });

    let ri = 0, gi = 102, bi = 255;
    if (color.startsWith('#') && color.length === 7) {
      ri = parseInt(color.slice(1, 3), 16);
      gi = parseInt(color.slice(3, 5), 16);
      bi = parseInt(color.slice(5, 7), 16);
    }

    const render = () => {
      const now = performance.now();
      const rect = parent.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);
      pointsRef.current = pointsRef.current.filter(p => now - p.time <= fadeDuration);
      ripplesRef.current = ripplesRef.current.filter(r => now - r.time <= 850);

      for (const rip of ripplesRef.current) {
        const p = Math.min(1, (now - rip.time) / 850), life = 1 - p;
        const radius = rip.maxRadius * (1 - Math.pow(1 - p, 2.2));
        const sw = 20 * Math.pow(life, 0.7) + 2;
        ctx.globalCompositeOperation = 'source-over';
        ctx.beginPath(); ctx.arc(rip.x, rip.y, radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${ri},${gi},${bi},${life * 0.85})`; ctx.lineWidth = sw; ctx.stroke();
        ctx.globalCompositeOperation = 'lighter';
        ctx.beginPath(); ctx.arc(rip.x, rip.y, radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(147,197,253,${life * 0.95})`; ctx.lineWidth = sw * 0.45; ctx.stroke();
      }

      const pts = pointsRef.current;
      if (pts.length >= 2) {
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.globalCompositeOperation = 'source-over';
        for (let i = 0; i < pts.length - 1; i++) {
          const p1 = pts[i], p2 = pts[i + 1];
          const life = Math.max(0, 1 - (now - p2.time) / fadeDuration);
          ctx.beginPath(); ctx.moveTo(p1.x, p1.y);
          if (i < pts.length - 2) { const p3 = pts[i + 2]; ctx.quadraticCurveTo(p2.x, p2.y, (p2.x + p3.x) / 2, (p2.y + p3.y) / 2); }
          else ctx.lineTo(p2.x, p2.y);
          ctx.strokeStyle = `rgba(${ri},${gi},${bi},${Math.pow(life, 0.85)})`; ctx.lineWidth = maxRadius * Math.pow(life, 0.7) + 6; ctx.stroke();
        }
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < pts.length - 1; i++) {
          const p1 = pts[i], p2 = pts[i + 1];
          const life = Math.max(0, 1 - (now - p2.time) / fadeDuration);
          ctx.beginPath(); ctx.moveTo(p1.x, p1.y);
          if (i < pts.length - 2) { const p3 = pts[i + 2]; ctx.quadraticCurveTo(p2.x, p2.y, (p2.x + p3.x) / 2, (p2.y + p3.y) / 2); }
          else ctx.lineTo(p2.x, p2.y);
          ctx.strokeStyle = `rgba(96,165,250,${Math.pow(life, 0.7) * 0.95})`; ctx.lineWidth = maxRadius * 0.45 * Math.pow(life, 0.75) + 3; ctx.stroke();
        }
      }

      animRef.current = requestAnimationFrame(render);
    };
    animRef.current = requestAnimationFrame(render);

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown);
      ro.disconnect();
    };
  }, [color, fadeDuration, maxRadius]);

  return (
    <canvas
      ref={canvasRef}
      style={{ filter: `blur(${blurPx}px)` }}
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  );
};

// ============================================================================
// 3. LIQUID GLASS SIDEBAR STANDALONE — 1 ARCHIVO, 0 DEPENDENCIAS EXTRA
// ============================================================================

export interface SidebarItem {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
}

export interface LiquidGlassSidebarStandaloneProps {
  items?: SidebarItem[];
  trailColor?: string;
  onSelect?: (label: string) => void;
}

const defaultItems: SidebarItem[] = [
  { icon: (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>), label: 'Lens', active: true },
  { icon: (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>), label: 'Home' },
  { icon: (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>), label: 'Showcase' },
  { icon: (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>), label: 'Specs' },
  { icon: (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>), label: 'Optics' },
];

export const LiquidGlassSidebarStandalone: React.FC<LiquidGlassSidebarStandaloneProps> = ({
  items = defaultItems,
  trailColor = '#0066ff',
  onSelect,
}) => {
  const rawId = useId();
  const filterId = `lg-sb-standalone-${rawId.replace(/[^a-zA-Z0-9]/g, '')}`;

  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [tintHue, setTintHue] = useState(220);
  const [tintIntensity, setTintIntensity] = useState(45);
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);

  const tintColor = `hsla(${tintHue}, 85%, 58%, ${(tintIntensity / 100) * 0.65})`;

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('input')) return;
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

  // ── Idéntico a LiquidGlassSidebar.tsx ─────────────────────────────────────
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

    // Zoom map — idéntico a LiquidGlassSidebar
    const zoomResult = generateZoomDisplacementMap({ width: MAP_W, height: MAP_H, zoom, borderRadius: mapBR });

    // Refraction field — idéntico a LiquidGlassSidebar
    const refractionField = computeRefractionField({
      surfaceType: 'convex-circle',
      refractiveIndex: ior,
      bezelWidth: 0.35,
      thickness: bezelThickness,
      numSamples: 127,
    });

    // Rim displacement map — idéntico a LiquidGlassSidebar
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
      zoomMapUrl: zoomResult.dataUrl,
      rimMapUrl:  rimResult.dataUrl,
      zoomScale:  computedZoomScale / bboxSpan,
      rimScale:   computedRimScale  / bboxSpan,
      padPercent: pad,
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (typeof document === 'undefined') return null;

  const supportsSvgBackdrop = detectSvgBackdropSupport();

  return createPortal(
    <>
      {/* SVG filter defs en document.body para evitar aislamiento de stacking context */}
      <svg aria-hidden="true" style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        <defs>
          <filter
            id={filterId}
            x={`-${padPercent}%`} y={`-${padPercent}%`}
            width={`${100 + 2 * padPercent}%`} height={`${100 + 2 * padPercent}%`}
            colorInterpolationFilters="sRGB"
          >
            {/* 1. Zoom map — lupa magnificante */}
            <feImage href={zoomMapUrl} xlinkHref={zoomMapUrl} x="0" y="0" width="100%" height="100%" result="zoomMap" preserveAspectRatio="none" />
            <feDisplacementMap in="SourceGraphic" in2="zoomMap" scale={zoomScale} xChannelSelector="R" yChannelSelector="G" result="zoomedGraphic" />
            {/* 2. Rim map — bisel Ley de Snell */}
            <feImage href={rimMapUrl} xlinkHref={rimMapUrl} x="0" y="0" width="100%" height="100%" result="rimMap" preserveAspectRatio="none" />
            <feDisplacementMap in="zoomedGraphic" in2="rimMap" scale={rimScale} xChannelSelector="R" yChannelSelector="G" result="distortedGraphic" />
            {/* 3. Saturación de color */}
            <feColorMatrix in="distortedGraphic" type="saturate" values="1.08" result="saturated" />
            <feColorMatrix in="saturated" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0" />
          </filter>
        </defs>
      </svg>

      {/* Panel principal — draggable */}
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
          overflow:    'hidden',
          transition:  isDragging
            ? 'transform 0.05s ease-out'
            : 'transform 0.25s cubic-bezier(0.34,1.56,0.64,1)',
        }}
      >
        {/* Estela de cursor azul (debajo del vidrio para que se refracte) */}
        <FluidTrailCanvas color={trailColor} blurPx={20} maxRadius={48} fadeDuration={1000} />

        {/* Capa de vidrio — backdropFilter referencia el filtro SVG */}
        <div style={{
          position:    'absolute', inset: 0,
          borderRadius: borderRadiusStyle, overflow: 'hidden',
          ...(supportsSvgBackdrop ? {
            backdropFilter:       `url(#${filterId})`,
            WebkitBackdropFilter: `url(#${filterId})`,
            background:           'transparent',
            border:               'none',
          } : getGlassFallbackStyle()),
          boxShadow:   isDragging
            ? '0 24px 60px rgba(0,0,0,0.5), inset 0 0 0 0.5px rgba(255,255,255,0.35)'
            : '0 8px 28px rgba(0,0,0,0.28), inset 0 0 0 0.5px rgba(255,255,255,0.25)',
          pointerEvents: 'none',
          transition:  'box-shadow 0.2s ease',
        }} />

        {/* Tinte de color */}
        <div style={{
          position:    'absolute', inset: 0, borderRadius: borderRadiusStyle,
          pointerEvents: 'none',
          background:  `linear-gradient(to top, ${tintColor} 0%, transparent 65%)`,
          boxShadow:   `inset 0 -1.5px 0 hsla(${tintHue},90%,62%,${tintIntensity / 100})`,
        }} />

        {/* Contenido del sidebar */}
        <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', gap: 6, padding: '28px 20px' }}>
          <div style={{ marginBottom: 20 }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)' }}>Menu</span>
          </div>

          {items.map((item, idx) => (
            <button key={idx} onClick={() => { item.onClick?.(); onSelect?.(item.label); }} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              background:    item.active ? 'rgba(255,255,255,0.12)' : 'transparent',
              border:        'none', borderRadius: 14,
              color:         item.active ? '#fff' : 'rgba(255,255,255,0.6)',
              cursor:        'pointer', fontSize: '0.82rem', fontWeight: 700,
              letterSpacing: '0.06em', padding: '10px 14px',
              textAlign:     'left', width: '100%',
              transition:    'background 0.2s ease, color 0.2s ease',
            }}>
              <span style={{ opacity: 0.85, flexShrink: 0 }}>{item.icon}</span>
              {item.label}
            </button>
          ))}

          <div style={{
            marginTop: 'auto', paddingTop: 20,
            borderTop: '1px solid rgba(255,255,255,0.08)',
            fontSize: '0.62rem', letterSpacing: '0.18em',
            textTransform: 'uppercase', color: 'rgba(255,255,255,0.15)', textAlign: 'center',
          }}>Liquid Glass · v1</div>
        </div>
      </div>

      {/* Panel de control de tinte */}
      <style>{`
        .lg-slider::-webkit-slider-thumb{-webkit-appearance:none;width:12px;height:12px;border-radius:50%;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,0.6);cursor:pointer;}
        .lg-slider::-moz-range-thumb{width:12px;height:12px;border-radius:50%;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,0.6);cursor:pointer;border:none;}
      `}</style>
      <div style={{
        position: 'fixed', top: '50%',
        right: 24 - pos.x + actualWidth + 12,
        transform: `translateY(calc(-50% + ${pos.y}px))`,
        zIndex: 99999, display: 'flex', flexDirection: 'column', gap: 14,
        background: 'rgba(10,10,18,0.72)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
        borderRadius: 16, padding: '14px 16px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.35), inset 0 0 0 0.5px rgba(255,255,255,0.1)', minWidth: 160,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: `hsl(${tintHue},85%,58%)`, boxShadow: `0 0 7px hsla(${tintHue},85%,58%,0.9)`, flexShrink: 0 }} />
          <span style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.35)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Glass Tint</span>
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
            <span style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Color</span>
            <span style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.25)' }}>{tintHue}°</span>
          </div>
          <div style={{ position: 'relative', height: 8 }}>
            <div style={{ position: 'absolute', inset: 0, borderRadius: 4, background: 'linear-gradient(to right,hsl(0,85%,58%),hsl(60,85%,58%),hsl(120,85%,58%),hsl(180,85%,58%),hsl(240,85%,58%),hsl(300,85%,58%),hsl(360,85%,58%))', pointerEvents: 'none' }} />
            <input className="lg-slider" type="range" min={0} max={360} value={tintHue} onChange={e => setTintHue(Number(e.target.value))}
              style={{ position: 'relative', width: '100%', height: 8, appearance: 'none', WebkitAppearance: 'none', background: 'transparent', cursor: 'pointer', outline: 'none', border: 'none', margin: 0, padding: 0 }} />
          </div>
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
            <span style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Intensidad</span>
            <span style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.25)' }}>{tintIntensity}%</span>
          </div>
          <div style={{ position: 'relative', height: 8 }}>
            <div style={{ position: 'absolute', inset: 0, borderRadius: 4, background: `linear-gradient(to right,transparent,hsla(${tintHue},85%,58%,0.9))`, pointerEvents: 'none' }} />
            <input className="lg-slider" type="range" min={0} max={100} value={tintIntensity} onChange={e => setTintIntensity(Number(e.target.value))}
              style={{ position: 'relative', width: '100%', height: 8, appearance: 'none', WebkitAppearance: 'none', background: 'transparent', cursor: 'pointer', outline: 'none', border: 'none', margin: 0, padding: 0 }} />
          </div>
        </div>
      </div>
    </>,
    document.body
  );
};

export default LiquidGlassSidebarStandalone;
