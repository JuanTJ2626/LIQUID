/**
 * core/index.ts
 *
 * Barrel export del core reutilizable de Liquid Glass.
 *
 * Para usar en otro proyecto, copiar:
 *   • Esta carpeta core/
 *   • ../physics.ts
 *   • ../displacement.ts
 *   • ../svgFilters.tsx
 *
 * Sin dependencias externas fuera de React.
 */

export { useLiquidGlassMaps, type UseLiquidGlassMapsOptions, type LiquidGlassMaps } from './useLiquidGlassMaps';
export { useDraggable, type UseDraggableOptions, type UseDraggableReturn, type DragState } from './useDraggable';
export { LiquidGlassSurface, type LiquidGlassSurfaceProps } from './LiquidGlassSurface';
