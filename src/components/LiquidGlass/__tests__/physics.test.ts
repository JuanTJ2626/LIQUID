/**
 * physics.test.ts
 *
 * Formal Vitest spec for Liquid Glass mathematical physics formulas.
 */

import { describe, it, expect } from 'vitest';
import {
  surfaceProfile,
  calcSurfaceNormal,
  refractRay,
  fresnelSchlick,
  type SurfaceType,
  type Vector3,
} from '../physics';

describe('Liquid Glass Physics Engine Formulas', () => {
  it('correctly calculates convex and concave profile height boundaries', () => {
    const convexProfiles: SurfaceType[] = ['convex-circle', 'convex-squircle', 'lip'];
    for (const prof of convexProfiles) {
      expect(surfaceProfile(0, 0.25, prof)).toBeCloseTo(1.0, 3);
      expect(surfaceProfile(1.0, 0.25, prof)).toBeCloseTo(0.0, 3);
    }
    expect(surfaceProfile(0, 0.25, 'concave')).toBeCloseTo(0.35, 3);
  });

  it('guarantees surface normal unit length ||N|| == 1.0 across all profiles', () => {
    const allProfiles: SurfaceType[] = ['convex-circle', 'convex-squircle', 'concave', 'lip', 'mixed'];
    for (const prof of allProfiles) {
      for (let r = 0; r <= 1.0; r += 0.2) {
        const N = calcSurfaceNormal(r, Math.PI / 4, 0.25, prof);
        const len = Math.hypot(N.x, N.y, N.z);
        expect(len).toBeCloseTo(1.0, 4);
        expect(N.z).toBeGreaterThan(0);
      }
    }
  });

  it('verifies center normal at r=0 is exactly vertical (0, 0, 1)', () => {
    const N = calcSurfaceNormal(0, 0, 0.25, 'convex-squircle');
    expect(N.x).toBeCloseTo(0, 4);
    expect(N.y).toBeCloseTo(0, 4);
    expect(N.z).toBeCloseTo(1.0, 4);
  });

  it('verifies Snell\'s Law exact balance n1 * sin(θ1) == n2 * sin(θ2)', () => {
    const incident: Vector3 = { x: 0, y: 0, z: -1 };
    const slantedNormal: Vector3 = { x: 0.5, y: 0, z: Math.sqrt(0.75) };
    const res = refractRay(incident, slantedNormal, 1.0, 1.45);

    expect(res.tir).toBe(false);
    expect(res.refracted).not.toBeNull();

    if (res.refracted) {
      const rLen = Math.hypot(res.refracted.x, res.refracted.y, res.refracted.z);
      expect(rLen).toBeCloseTo(1.0, 4);

      const sinTheta1 = Math.sqrt(1 - res.cosTheta1 ** 2);
      const sinTheta2 = Math.sqrt(1 - res.cosTheta2 ** 2);
      expect(1.0 * sinTheta1).toBeCloseTo(1.45 * sinTheta2, 4);
    }
  });

  it('verifies Snell\'s Law when ior = 1.0 (no deflection)', () => {
    const incident: Vector3 = { x: 0, y: 0, z: -1 };
    const slantedNormal: Vector3 = { x: 0.5, y: 0, z: Math.sqrt(0.75) };
    const res = refractRay(incident, slantedNormal, 1.0, 1.0);

    expect(res.refracted?.x).toBeCloseTo(incident.x, 4);
    expect(res.refracted?.z).toBeCloseTo(incident.z, 4);
  });

  it('verifies Fresnel Schlick formula at normal and grazing incidence', () => {
    const fNormal = fresnelSchlick(1.0, 1.45);
    const fGrazing = fresnelSchlick(0.0, 1.45);
    const expectedF0 = Math.pow((1.0 - 1.45) / (1.0 + 1.45), 2);

    expect(fNormal).toBeCloseTo(expectedF0, 4);
    expect(fGrazing).toBeCloseTo(1.0, 4);
  });

  it('verifies radial vector symmetry along X and Y axes', () => {
    const nLeft = calcSurfaceNormal(0.5, Math.PI, 0.25, 'convex-circle');
    const nRight = calcSurfaceNormal(0.5, 0, 0.25, 'convex-circle');
    expect(nLeft.x + nRight.x).toBeCloseTo(0, 4);

    const nTop = calcSurfaceNormal(0.5, Math.PI / 2, 0.25, 'convex-circle');
    const nBottom = calcSurfaceNormal(0.5, (3 * Math.PI) / 2, 0.25, 'convex-circle');
    expect(nTop.y + nBottom.y).toBeCloseTo(0, 4);
  });
});
