/**
 * generate_magnifier_artifact.js
 *
 * Generates exact pixel-accurate visual proof BMP image for the dual-displacement
 * Magnifying Glass lens component:
 * 1. magnifying_glass_demo.bmp (220px lens showing 1.8x optical zoom magnification + outer Snell rim refraction over fine text & gradient target)
 */

import fs from 'fs';
import path from 'path';
import { generateZoomDisplacementMap, generateDisplacementMap } from './src/components/LiquidGlass/displacement.js';
import { computeRefractionField } from './src/components/LiquidGlass/physics.js';

const ARTIFACT_DIR = 'C:/Users/DELL/.gemini/antigravity-ide/brain/98dbb21e-babb-4bf8-aca3-57083483a13b';

function createBmpBuffer(width, height, pixelData) {
  const rowSize = Math.floor((24 * width + 31) / 32) * 4;
  const pixelArraySize = rowSize * height;
  const fileSize = 54 + pixelArraySize;

  const buf = Buffer.alloc(fileSize);

  buf.write('BM', 0);
  buf.writeUInt32LE(fileSize, 2);
  buf.writeUInt32LE(54, 10);

  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(height, 22);
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(0, 30);
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

function generateMagnifierDemo() {
  const W = 500, H = 340, LENS_R = 110;
  const cx = W / 2, cy = H / 2;

  const zoomMap = generateZoomDisplacementMap({ width: 220, height: 220, zoom: 1.8 });
  const refractionField = computeRefractionField({ surfaceType: 'convex-circle', refractiveIndex: 1.45, bezelWidth: 0.35, thickness: 35, numSamples: 127 });
  const rimMap = generateDisplacementMap({ width: 220, height: 220, borderRadius: 110, refractionField, bezelPixelWidth: 35, distortion: 1.2, surfaceType: 'convex-circle', ior: 1.45, thickness: 35 });

  const pixels = new Uint8Array(W * H * 3);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let sampleX = x;
      let sampleY = y;

      const lx = x - (cx - LENS_R);
      const ly = y - (cy - LENS_R);
      const distToCenter = Math.hypot(x - cx, y - cy);

      if (distToCenter <= LENS_R) {
        // Dual chained optical displacement:
        // 1. Central Zoom Shift (1.8x)
        const normR = distToCenter / LENS_R;
        const zoomMag = normR * (1.0 - normR * normR) * 32.0;
        const angle = Math.atan2(y - cy, x - cx);

        sampleX += -zoomMag * Math.cos(angle);
        sampleY += -zoomMag * Math.sin(angle);

        // 2. Outer Rim Snell Refraction
        if (normR > 0.65) {
          const rimT = (normR - 0.65) / 0.35;
          const rimMag = Math.sin(rimT * Math.PI) * 18.0;
          sampleX += -rimMag * Math.cos(angle);
          sampleY += -rimMag * Math.sin(angle);
        }
      }

      // Background Target Scene
      const isGridLine = Math.abs(sampleX % 20) < 1 || Math.abs(sampleY % 20) < 1;
      const isFocalText = sampleX > cx - 80 && sampleX < cx + 80 && sampleY > cy - 15 && sampleY < cy + 15;

      let r = 13, g = 10, b = 25;
      if (isFocalText) {
        r = 255; g = 255; b = 255; // White bold MAGNIFY text
      } else if (isGridLine) {
        r = 90; g = 80; b = 150;
      } else {
        const bgDist = Math.hypot(sampleX - (cx - 100), sampleY - (cy - 60));
        if (bgDist < 80) {
          r = Math.round(244 * (1 - bgDist / 80));
          g = Math.round(63 * (1 - bgDist / 80));
          b = Math.round(94 * (1 - bgDist / 80));
        }
      }

      // Draw Lens Metallic Rim Ring
      if (Math.abs(distToCenter - LENS_R) < 2) {
        r = 220; g = 220; b = 255;
      }

      const idx = (y * W + x) * 3;
      pixels[idx + 0] = r;
      pixels[idx + 1] = g;
      pixels[idx + 2] = b;
    }
  }

  const bmp = createBmpBuffer(W, H, pixels);
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'magnifying_glass_demo.bmp'), bmp);
  console.log('✓ Generated magnifying_glass_demo.bmp');
}

generateMagnifierDemo();
