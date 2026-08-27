/**
 * index.ts
 * Barrel export del módulo Liquid Glass.
 *
 * ── CORE (copiar a cualquier proyecto) ──────────────────────────────────────
 * Los tres exports del core son todo lo que necesitás para crear
 * nuevos componentes glass desde cero.
 */

// Core reutilizable — hooks + componente de superficie
export { useLiquidGlassMaps, type UseLiquidGlassMapsOptions, type LiquidGlassMaps } from './core/useLiquidGlassMaps';
export { useDraggable, type UseDraggableOptions, type UseDraggableReturn, type DragState } from './core/useDraggable';
export { LiquidGlassSurface, type LiquidGlassSurfaceProps } from './core/LiquidGlassSurface';

// ── COMPONENTES LISTOS PARA USAR ─────────────────────────────────────────────
export { LiquidGlass, type LiquidGlassProps } from './LiquidGlass';
export { MagnifyingGlass, type MagnifyingGlassProps } from './MagnifyingGlass';
export { GlassCard, type GlassCardProps } from './GlassCard';

// ── MOTOR FÍSICO (bajo nivel) ────────────────────────────────────────────────
export {
  type SurfaceType,
  type RefractionField,
  computeRefractionField,
  surfaceProfile,
  refractRay,
  fresnelSchlick,
  calcSurfaceNormal,
} from './physics';
export { generateDisplacementMap, generateSpecularMap, type DisplacementMapResult } from './displacement';
export { detectSvgBackdropSupport, LiquidGlassSvgDefs } from './svgFilters';

// ── UTILIDADES / DEBUG ───────────────────────────────────────────────────────
export { DebugOverlay } from './DebugOverlay';
export { LiquidGlassTestLab } from './LiquidGlassTestLab';
export { runPhysicsTests } from './physicsRunner';
export { default } from './LiquidGlass';
