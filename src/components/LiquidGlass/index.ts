/**
 * index.ts
 * Barrel export for Liquid Glass physical optical engine.
 */

export { LiquidGlass, type LiquidGlassProps } from './LiquidGlass';
export { type SurfaceType, type RefractionField, computeRefractionField, surfaceProfile, refractRay, fresnelSchlick, calcSurfaceNormal } from './physics';
export { generateDisplacementMap, generateSpecularMap, type DisplacementMapResult } from './displacement';
export { detectSvgBackdropSupport, LiquidGlassSvgDefs } from './svgFilters';
export { DebugOverlay } from './DebugOverlay';
export { LiquidGlassTestLab } from './LiquidGlassTestLab';
export { MagnifyingGlass, type MagnifyingGlassProps } from './MagnifyingGlass';
export { runPhysicsTests } from './physicsRunner';
export { default } from './LiquidGlass';
