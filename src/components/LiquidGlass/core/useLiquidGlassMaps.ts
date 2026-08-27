/**
 * useLiquidGlassMaps.ts
 *
 * Hook reutilizable que genera los displacement maps del efecto liquid glass.
 * Encapsula toda la lógica de física óptica + canvas rasterization.
 *
 * Memoizado por parámetros — NO por posición, así que no re-renderiza
 * durante el drag. Solo recalcula cuando cambian las propiedades ópticas.
 *
 * USO BÁSICO:
 *   const maps = useLiquidGlassMaps({ width: 280, height: 180 })
 *
 * USO CON LUPA (zoom + rim):
 *   const maps = useLiquidGlassMaps({ width, height, zoom: 1.5, bezelThickness: 22 })
 *
 * USO SIMPLE (solo rim, sin zoom):
 *   const maps = useLiquidGlassMaps({ width, height, zoom: 1 })
 */

import { useMemo, useId } from 'react';
import { computeRefractionField } from '../physics';
import { generateDisplacementMap, generateZoomDisplacementMap, generateSpecularMap } from '../displacement';

export interface UseLiquidGlassMapsOptions {
  /** Ancho del elemento en px */
  width: number;
  /** Alto del elemento en px */
  height: number;
  /** Radio de esquinas en px (default: min(width,height)/2) */
  borderRadius?: number;
  /** Factor de zoom óptico interior [1..2.5] (default: 1 = sin zoom) */
  zoom?: number;
  /** Distorsión esférica inward [0..1] (default: 0) */
  inwardDistortion?: number;
  /** Grosor del bisel exterior en px (default: 28) */
  bezelThickness?: number;
  /** Índice de refracción del vidrio [1.0..2.4] (default: 1.45) */
  ior?: number;
  /** Escala de distorsión del rim [0.1..3.0] (default: 0.45) */
  distortion?: number;
  /** Opacidad del highlight especular [0..1] (default: 0.85) */
  specularOpacity?: number;
  /** Ángulo de luz para el especular en grados (default: 315) */
  specularAngle?: number;
}

export interface LiquidGlassMaps {
  /** Unique SVG filter ID — usar como backdropFilter: `url(#${filterId})` */
  filterId: string;
  /** Data URL del zoom displacement map (interior magnification) */
  zoomMapUrl: string;
  /** Data URL del rim displacement map (Snell's Law refraction) */
  rimMapUrl: string;
  /** Data URL del specular highlight map */
  specMapUrl: string;
  /** Scale value para feDisplacementMap del zoom */
  zoomScale: number;
  /** Scale value para feDisplacementMap del rim */
  rimScale: number;
  /** Padding % para el filtro SVG (evita clipping) */
  padPercent: number;
  /** Ancho efectivo usado para los maps */
  width: number;
  /** Alto efectivo usado para los maps */
  height: number;
  /** Border radius normalizado (string CSS) */
  borderRadiusCss: string;
}

export function useLiquidGlassMaps(opts: UseLiquidGlassMapsOptions): LiquidGlassMaps {
  const {
    width,
    height,
    borderRadius,
    zoom = 1,
    inwardDistortion = 0,
    bezelThickness = 28,
    ior = 1.45,
    distortion = 0.45,
    specularOpacity = 0.85,
    specularAngle = 315,
  } = opts;

  const actualBR = borderRadius ?? Math.min(width, height) / 2;
  const borderRadiusCss = actualBR >= 9000 ? '9999px' : `${actualBR}px`;

  // Resolución de los canvas — 1.5x el tamaño visual, clampeado a 512px
  const MAP_W = Math.min(512, Math.max(128, Math.round(width * 1.5)));
  const MAP_H = Math.min(512, Math.max(128, Math.round(height * 1.5)));
  const mapBR = (actualBR / Math.min(width, height)) * Math.min(MAP_W, MAP_H);

  // ID único para el filtro SVG — estable entre renders
  const rawId = useId();
  const filterId = `lg-filter-${rawId.replace(/[^a-zA-Z0-9]/g, '')}`;

  const maps = useMemo(() => {
    if (typeof document === 'undefined') {
      return {
        zoomMapUrl: '', rimMapUrl: '', specMapUrl: '',
        zoomScale: 1, rimScale: 1, padPercent: 15,
      };
    }

    // ── Zoom map (magnification interior) ─────────────────────────────────
    const zoomResult = generateZoomDisplacementMap({
      width: MAP_W,
      height: MAP_H,
      zoom,
      borderRadius: mapBR,
      sphericalCropFactor: zoom <= 1.02 ? undefined : Math.min(1, Math.max(0.5, 1 - (zoom - 1) * 0.25)),
      sphericalRefraction: inwardDistortion,
    });

    // ── Rim map (Snell's Law outer bevel) ──────────────────────────────────
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
      bezelPixelWidth: (bezelThickness / Math.min(width, height)) * Math.min(MAP_W, MAP_H),
      distortion,
      surfaceType: 'convex-circle',
      ior,
      thickness: bezelThickness,
    });

    // ── Specular map (highlight direccional) ──────────────────────────────
    const specUrl = generateSpecularMap({
      width: MAP_W,
      height: MAP_H,
      borderRadius: mapBR,
      opacity: specularOpacity,
      lightAngle: specularAngle,
      saturation: 0,
    });

    // ── Escalas CSS para feDisplacementMap ────────────────────────────────
    // Valores en píxeles de canvas (MAP_W×MAP_H escala 1.5×).
    // LiquidGlassMagnifierSvgDefs usa filterUnits="userSpaceOnUse" con
    // las dimensiones reales del elemento (width×height), por lo que estos
    // valores se usan directamente como píxeles de desplazamiento.
    const computedZoomScale = zoom <= 1.02 && inwardDistortion <= 0
      ? 0
      : Math.max(1, zoomResult.maximumDisplacement);
    const computedRimScale = Math.max(1, rimResult.maximumDisplacement);

    const bboxSpan = (width + height) / 2;
    const padPercent = Math.min(80, Math.max(15,
      ((computedZoomScale / 2 + computedRimScale / 2) / bboxSpan) * 100 + 10
    ));

    return {
      zoomMapUrl: zoomResult.dataUrl,
      rimMapUrl: rimResult.dataUrl,
      specMapUrl: specUrl,
      zoomScale: computedZoomScale,
      rimScale: computedRimScale,
      padPercent,
    };
  }, [MAP_W, MAP_H, mapBR, zoom, inwardDistortion, bezelThickness, ior, distortion, specularOpacity, specularAngle, width, height]);

  return {
    filterId,
    ...maps,
    width,
    height,
    borderRadiusCss,
  };
}
