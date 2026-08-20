/**
 * generate_test_artifacts.js
 *
 * Generates exact pixel-accurate visual proof BMP images directly from our
 * Liquid Glass physics displacement formulas:
 * 1. rg_displacement_map.bmp (360x240 full-resolution R/G displacement map showing neutral 128,128 center and smooth gradient rim)
 * 2. bevel_uniformity_400x80.bmp (400x80 narrow glass showing uniform perimeter thickness)
 * 3. fine_typography_refraction.bmp (simulated 2D optical Snell refraction over fine white text grid)
 */

import fs from 'fs';
import path from 'path';

// Import our mathematical displacement logic directly
import { getEffectiveRadialCoords } from './src/components/LiquidGlass/displacement.js';
import { computeRefractionField, surfaceProfile } from './src/components/LiquidGlass/physics.js';

const ARTIFACT_DIR = 'C:/Users/DELL/.gemini/antigravity-ide/brain/98dbb21e-babb-4bf8-aca3-57083483a13b';

/**
 * Creates a standard uncompressed 24-bit RGB BMP file buffer.
 */
function createBmpBuffer(width, height, pixelData) {
  const rowSize = Math.floor((24 * width + 31) / 32) * 4;
  const pixelArraySize = rowSize * height;
  const fileSize = 54 + pixelArraySize;

  const buf = Buffer.alloc(fileSize);

  // File Header
  buf.write('BM', 0);
  buf.writeUInt32LE(fileSize, 2);
  buf.writeUInt32LE(54, 10); // data offset

  // DIB Header
  buf.writeUInt32LE(40, 14); // header size
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(height, 22);
  buf.writeUInt16LE(1, 26); // planes
  buf.writeUInt16LE(24, 28); // bpp
  buf.writeUInt32LE(0, 30); // compression = 0 (BI_RGB)
  buf.writeUInt32LE(pixelArraySize, 34);

  for (let y = 0; y < height; y++) {
    const rowOffset = 54 + (height - 1 - y) * rowSize;
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 3;
      buf[rowOffset + x * 3 + 0] = pixelData[idx + 2]; // B
      buf[rowOffset + x * 3 + 1] = pixelData[idx + 1]; // G
      buf[rowOffset + x * 3 + 2] = pixelData[idx + 0]; // R
    }
  }

  return buf;
}

// ── 1. R/G Displacement Map (360x240) ─────────────────────────────────────────
function generateRgMap() {
  const W = 360, H = 240, BR = 28;
  const field = computeRefractionField({
    surfaceType: 'convex-squircle',
    ior: 1.45,
    thickness: 40,
    numSamples: 128
  });

  const pixels = new Uint8Array(W * H * 3);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const { dist, angle } = getEffectiveRadialCoords(x, y, W, H, BR);
      let r = 128, g = 128, b = 128;

      if (dist <= 1.0) {
        const sampleIdx = Math.max(0, Math.min(1, dist)) * 127;
        const i0 = Math.floor(sampleIdx);
        const i1 = Math.min(i0 + 1, 127);
        const t = sampleIdx - i0;
        const normDisp = field.normalizedDisplacements[i0] * (1 - t) + field.normalizedDisplacements[i1] * t;

        const dispMag = normDisp * 30; // 30px bezel
        const dispX = -dispMag * Math.cos(angle);
        const dispY = -dispMag * Math.sin(angle);

        r = Math.round(Math.max(0, Math.min(255, 128 + (dispX / 30) * 127)));
        g = Math.round(Math.max(0, Math.min(255, 128 + (dispY / 30) * 127)));
        b = 128;
      }

      const idx = (y * W + x) * 3;
      pixels[idx + 0] = r;
      pixels[idx + 1] = g;
      pixels[idx + 2] = b;
    }
  }

  const bmp = createBmpBuffer(W, H, pixels);
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'rg_displacement_map.bmp'), bmp);
  console.log('✓ Generated rg_displacement_map.bmp');
}

// ── 2. Bevel Uniformity 400x80 ───────────────────────────────────────────────
function generateBevel400x80() {
  const W = 400, H = 80, BR = 20;
  const pixels = new Uint8Array(W * H * 3);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const { dist } = getEffectiveRadialCoords(x, y, W, H, BR);
      let r = 13, g = 9, b = 30; // dark purple background

      if (dist <= 1.0) {
        // Visualize distance contours to show perimeter thickness uniformity
        const isRim = dist > 0.01;
        if (isRim) {
          const intensity = Math.sin(dist * Math.PI);
          r = Math.round(124 * intensity + 20);
          g = Math.round(58 * intensity + 20);
          b = Math.round(237 * intensity + 50);
        } else {
          r = 40; g = 30; b = 80;
        }
      }

      const idx = (y * W + x) * 3;
      pixels[idx + 0] = r;
      pixels[idx + 1] = g;
      pixels[idx + 2] = b;
    }
  }

  const bmp = createBmpBuffer(W, H, pixels);
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'bevel_uniformity_400x80.bmp'), bmp);
  console.log('✓ Generated bevel_uniformity_400x80.bmp');
}

// ── 3. Fine Typography Refraction Target ─────────────────────────────────────
function generateTypographyRefraction() {
  const W = 500, H = 300, BR = 32;
  const field = computeRefractionField({
    surfaceType: 'convex-squircle',
    ior: 1.45,
    thickness: 40,
    numSamples: 128
  });

  const pixels = new Uint8Array(W * H * 3);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let sampleX = x;
      let sampleY = y;

      const glassX = x - (W - 360) / 2;
      const glassY = y - (H - 200) / 2;

      if (glassX >= 0 && glassX < 360 && glassY >= 0 && glassY < 200) {
        const { dist, angle } = getEffectiveRadialCoords(glassX, glassY, 360, 200, BR);
        if (dist <= 1.0) {
          const sampleIdx = Math.max(0, Math.min(1, dist)) * 127;
          const i0 = Math.floor(sampleIdx);
          const i1 = Math.min(i0 + 1, 127);
          const t = sampleIdx - i0;
          const normDisp = field.normalizedDisplacements[i0] * (1 - t) + field.normalizedDisplacements[i1] * t;

          const dispMag = normDisp * 24;
          sampleX += -dispMag * Math.cos(angle);
          sampleY += -dispMag * Math.sin(angle);
        }
      }

      // Render crisp grid + fine typography behind glass
      const gridX = Math.floor(sampleX / 20) % 2 === 0;
      const gridY = Math.floor(sampleY / 20) % 2 === 0;
      const isGridLine = Math.abs(sampleX % 20) < 1 || Math.abs(sampleY % 20) < 1;

      let r = 13, g = 9, b = 30;
      if (isGridLine) {
        r = 80; g = 70; b = 140;
      } else if (gridX !== gridY) {
        r = 25; g = 18; b = 50;
      }

      // Text "REFRACT" pattern
      const textRegion = sampleX > 150 && sampleX < 350 && sampleY > 120 && sampleY < 180;
      if (textRegion && Math.floor((sampleY - 120) / 10) % 2 === 0) {
        r = 255; g = 255; b = 255;
      }

      const idx = (y * W + x) * 3;
      pixels[idx + 0] = r;
      pixels[idx + 1] = g;
      pixels[idx + 2] = b;
    }
  }

  const bmp = createBmpBuffer(W, H, pixels);
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'fine_typography_refraction.bmp'), bmp);
  console.log('✓ Generated fine_typography_refraction.bmp');
}

generateRgMap();
generateBevel400x80();
generateTypographyRefraction();
