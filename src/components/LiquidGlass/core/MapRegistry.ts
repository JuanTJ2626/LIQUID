/**
 * MapRegistry.ts
 *
 * Singleton global que cachea los displacement maps (data URLs).
 * Múltiples componentes del mismo tamaño/configuración comparten los mismos
 * canvas rasterizados, pero cada uno tiene su propio filterId y control.
 *
 * ANTES:  5 cards 300×200 → 15 canvas (3 por card)
 * AHORA:  5 cards 300×200 → 3 canvas compartidos + 5 filtros SVG únicos
 */

import { computeRefractionField } from '../physics';
import { generateDisplacementMap, generateZoomDisplacementMap, generateSpecularMap } from '../displacement';

interface MapCacheEntry {
  zoomMapUrl: string;
  rimMapUrl: string;
  specMapUrl: string;
  zoomScale: number;
  rimScale: number;
  padPercent: number;
  timestamp: number;
}

interface MapGenerationOptions {
  width: number;
  height: number;
  borderRadius: number;
  zoom: number;
  inwardDistortion: number;
  bezelThickness: number;
  ior: number;
  distortion: number;
  specularOpacity: number;
  specularAngle: number;
}

class DisplacementMapRegistry {
  private cache = new Map<string, MapCacheEntry>();
  private readonly MAX_CACHE_SIZE = 30; // reducido de 50 — más agresivo
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

  /**
   * Genera una key única basada en los parámetros de generación.
   * Dos componentes con la misma key comparten los mismos maps.
   */
  private getCacheKey(opts: MapGenerationOptions): string {
    const {
      width, height, borderRadius, zoom, inwardDistortion,
      bezelThickness, ior, distortion, specularOpacity, specularAngle,
    } = opts;

    // Redondear para tolerar diferencias mínimas (300.1 ≈ 300)
    const w = Math.round(width);
    const h = Math.round(height);
    const br = Math.round(borderRadius);
    const z = zoom.toFixed(2);
    const iw = inwardDistortion.toFixed(2);
    const bt = Math.round(bezelThickness);
    const i = ior.toFixed(2);
    const d = distortion.toFixed(2);
    const so = specularOpacity.toFixed(2);
    const sa = Math.round(specularAngle);

    return `${w}x${h}_r${br}_z${z}_iw${iw}_bt${bt}_ior${i}_d${d}_so${so}_sa${sa}`;
  }

  /**
   * Limpia entradas antiguas del cache cuando supera el tamaño máximo.
   */
  private cleanupCache(): void {
    if (this.cache.size <= this.MAX_CACHE_SIZE) return;

    const now = Date.now();
    const entries = Array.from(this.cache.entries());

    // Ordenar por timestamp ascendente (más viejas primero)
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);

    // Eliminar las 10 más viejas
    for (let i = 0; i < 10 && i < entries.length; i++) {
      this.cache.delete(entries[i][0]);
    }
  }

  /**
   * Obtiene o genera los displacement maps para una configuración dada.
   * Si ya existen en cache, los retorna inmediatamente sin regenerar canvas.
   */
  getOrCreateMaps(opts: MapGenerationOptions): Omit<MapCacheEntry, 'timestamp'> {
    const key = this.getCacheKey(opts);
    const cached = this.cache.get(key);

    // Cache hit — retornar inmediatamente
    if (cached) {
      const age = Date.now() - cached.timestamp;
      
      // Si es muy viejo, regenerar (los data URLs pueden quedar inválidos)
      if (age > this.CACHE_TTL_MS) {
        this.cache.delete(key);
      } else {
        cached.timestamp = Date.now(); // actualizar timestamp (LRU)
        const { timestamp, ...data } = cached;
        return data;
      }
    }

    // Cache miss — generar maps
    if (typeof document === 'undefined') {
      return {
        zoomMapUrl: '', rimMapUrl: '', specMapUrl: '',
        zoomScale: 1, rimScale: 1, padPercent: 15,
      };
    }

    const { width, height, borderRadius, zoom, inwardDistortion, bezelThickness, ior, distortion, specularOpacity, specularAngle } = opts;

    const actualBR = borderRadius;
    const MAP_W = Math.min(512, Math.max(128, Math.round(width * 1.5)));
    const MAP_H = Math.min(512, Math.max(128, Math.round(height * 1.5)));
    const mapBR = (actualBR / Math.min(width, height)) * Math.min(MAP_W, MAP_H);

    // Zoom map
    const zoomResult = generateZoomDisplacementMap({
      width: MAP_W,
      height: MAP_H,
      zoom,
      borderRadius: mapBR,
      sphericalCropFactor: zoom <= 1.02 ? undefined : Math.min(1, Math.max(0.5, 1 - (zoom - 1) * 0.25)),
      sphericalRefraction: inwardDistortion,
    });

    // Rim map
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

    // Specular map
    const specUrl = generateSpecularMap({
      width: MAP_W,
      height: MAP_H,
      borderRadius: mapBR,
      opacity: specularOpacity,
      lightAngle: specularAngle,
      saturation: 0,
    });

    // Scales
    const computedZoomScale = zoom <= 1.02 && inwardDistortion <= 0
      ? 0
      : Math.max(1, zoomResult.maximumDisplacement);
    const computedRimScale = Math.max(1, rimResult.maximumDisplacement);

    const bboxSpan = (width + height) / 2;
    const padPercent = Math.min(80, Math.max(15,
      ((computedZoomScale / 2 + computedRimScale / 2) / bboxSpan) * 100 + 10
    ));

    const result: MapCacheEntry = {
      zoomMapUrl: zoomResult.dataUrl,
      rimMapUrl: rimResult.dataUrl,
      specMapUrl: specUrl,
      zoomScale: computedZoomScale,
      rimScale: computedRimScale,
      padPercent,
      timestamp: Date.now(),
    };

    this.cache.set(key, result);
    this.cleanupCache();

    const { timestamp, ...data } = result;
    return data;
  }

  /**
   * Limpia completamente el cache (útil para hot reload en dev).
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Retorna estadísticas del cache.
   */
  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.MAX_CACHE_SIZE,
      keys: Array.from(this.cache.keys()),
    };
  }
}

// Singleton global
export const mapRegistry = new DisplacementMapRegistry();

// Expose en window para debugging en dev
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  (window as any).__liquidGlassMapRegistry = mapRegistry;
}
