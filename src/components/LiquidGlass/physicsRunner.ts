/**
 * physicsRunner.ts
 *
 * Standalone UI test runner for LiquidGlassTestLab.
 * Free of Node/Vitest imports so it can be safely bundled into Vite browser code.
 */

import {
  surfaceProfile,
  calcSurfaceNormal,
  refractRay,
  fresnelSchlick,
  type SurfaceType,
  type Vector3,
} from './physics';

export function runPhysicsTests(): { passed: boolean; log: string[] } {
  const log: string[] = [];
  let passed = true;

  const assert = (condition: boolean, msg: string) => {
    if (condition) {
      log.push(`✓ PASS: ${msg}`);
    } else {
      log.push(`✗ FAIL: ${msg}`);
      passed = false;
    }
  };

  log.push('=== RUNNING LIQUID GLASS PHYSICS MATHEMATICAL TEST SUITE ===');

  const convexProfiles: SurfaceType[] = ['convex-circle', 'convex-squircle', 'lip'];
  for (const prof of convexProfiles) {
    const hCenter = surfaceProfile(0, 0.25, prof);
    const hEdge = surfaceProfile(1.0, 0.25, prof);
    assert(Math.abs(hCenter - 1.0) < 1e-3, `Convex Profile [${prof}] center h(0) == 1.0`);
    assert(Math.abs(hEdge - 0.0) < 1e-3, `Profile [${prof}] outer edge h(1.0) == 0.0`);
  }

  const hConcaveCenter = surfaceProfile(0, 0.25, 'concave');
  assert(Math.abs(hConcaveCenter - 0.35) < 1e-3, `Concave Bowl center h(0) == 0.35 depression`);

  const allProfiles: SurfaceType[] = ['convex-circle', 'convex-squircle', 'concave', 'lip', 'mixed'];
  for (const prof of allProfiles) {
    for (let r = 0; r <= 1.0; r += 0.2) {
      const normal = calcSurfaceNormal(r, Math.PI / 4, 0.25, prof);
      const len = Math.hypot(normal.x, normal.y, normal.z);
      assert(Math.abs(len - 1.0) < 1e-4, `Profile [${prof}] normal length ||N|| == 1.0 at r=${r.toFixed(1)}`);
      assert(normal.z > 0, `Profile [${prof}] normal z-component N_z > 0 at r=${r.toFixed(1)}`);
    }
  }

  const centerNormal = calcSurfaceNormal(0, 0, 0.25, 'convex-squircle');
  assert(Math.abs(centerNormal.x) < 1e-4 && Math.abs(centerNormal.y) < 1e-4 && Math.abs(centerNormal.z - 1.0) < 1e-4,
    `Center normal at r=0 is vertical (0, 0, 1)`
  );

  const incident: Vector3 = { x: 0, y: 0, z: -1 };
  const slantedNormal: Vector3 = { x: 0.5, y: 0, z: Math.sqrt(0.75) };
  const refraction = refractRay(incident, slantedNormal, 1.0, 1.45);
  assert(!refraction.tir && refraction.refracted !== null, `No TIR for air->glass (ior=1.45)`);
  if (refraction.refracted) {
    const rLen = Math.hypot(refraction.refracted.x, refraction.refracted.y, refraction.refracted.z);
    assert(Math.abs(rLen - 1.0) < 1e-4, `Refracted ray ||R|| == 1.0`);
    const sinTheta1 = Math.sqrt(1 - refraction.cosTheta1 ** 2);
    const sinTheta2 = Math.sqrt(1 - refraction.cosTheta2 ** 2);
    assert(Math.abs(1.0 * sinTheta1 - 1.45 * sinTheta2) < 1e-4, `Snell's Law exact balance n1*sinθ1 == n2*sinθ2`);
  }

  const fNormal = fresnelSchlick(1.0, 1.45);
  const fGrazing = fresnelSchlick(0.0, 1.45);
  const expectedF0 = Math.pow((1.0 - 1.45) / (1.0 + 1.45), 2);
  assert(Math.abs(fNormal - expectedF0) < 1e-4, `Fresnel at normal incidence == F0`);
  assert(Math.abs(fGrazing - 1.0) < 1e-4, `Fresnel at grazing incidence == 1.0`);

  const nLeft = calcSurfaceNormal(0.5, Math.PI, 0.25, 'convex-circle');
  const nRight = calcSurfaceNormal(0.5, 0, 0.25, 'convex-circle');
  assert(Math.abs(nLeft.x + nRight.x) < 1e-4, `Radial normal symmetry along X: N_left.x == -N_right.x`);

  log.push(`=== TEST SUITE COMPLETE: ${passed ? 'ALL PASSED' : 'SOME FAILED'} ===`);
  return { passed, log };
}
