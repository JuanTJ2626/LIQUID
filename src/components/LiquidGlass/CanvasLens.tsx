import React, { useEffect, useRef, useState, useCallback } from 'react';

interface CanvasLensProps {
  width?: number;
  height?: number;
  refractionLevel?: number;
  isDragging?: boolean;
  position?: { x: number; y: number };
}

export const CanvasLens: React.FC<CanvasLensProps> = ({
  width = 280,
  height = 180,
  refractionLevel = 1.0,
  isDragging = false,
  position = { x: 0, y: 0 },
}) => {
  const sourceCanvasRef = useRef<HTMLCanvasElement>(null);
  const lensCanvasRef = useRef<HTMLCanvasElement>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number>();
  const mouseRef = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  const sourceMouseRef = useRef({ x: 0, y: 0 });

  const LENS_WIDTH = width;
  const LENS_HEIGHT = height;
  const LENS_RX = LENS_WIDTH / 2;
  const LENS_RY = LENS_HEIGHT / 2;

  // Actualizar coordenadas del mouse
  const updateMouseCoordinates = useCallback((clientX: number, clientY: number) => {
    if (!sourceCanvasRef.current) return;

    const rect = sourceCanvasRef.current.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    mouseRef.current.x = clientX;
    mouseRef.current.y = clientY;

    sourceMouseRef.current.x = (clientX - rect.left) * dpr;
    sourceMouseRef.current.y = (clientY - rect.top) * dpr;
  }, []);

  // Renderizar source canvas (captura del DOM)
  const renderSourceCanvas = useCallback(() => {
    const canvas = sourceCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = window.innerWidth;
    const h = window.innerHeight;
    const cx = w / 2;
    const cy = h / 2;

    // Fondo negro
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);

    // Cuadrícula
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Texto
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 70px Georgia, serif';
    ctx.fillText('OPTICS STUDY', cx, cy - 80);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = '400 24px Georgia, serif';
    ctx.fillText('LIQUID GLASS LENS', cx, cy - 20);

    ctx.fillStyle = '#CCCCCC';
    ctx.font = '400 14px Georgia, serif';
    ctx.fillText('Canvas-based spherical fisheye distortion.', cx, cy + 40);
    ctx.fillText('Direct ImageData manipulation at 60 FPS.', cx, cy + 60);
    ctx.fillText('No SVG filters — pure JavaScript rendering.', cx, cy + 80);

    ctx.fillStyle = '#666666';
    ctx.font = '400 11px monospace';
    ctx.fillText('CANVAS 2D · FISHEYE · IMAGEDATA · REQUESTANIMATIONFRAME', cx, cy + 120);
    ctx.fillText('drawImage · getImageData · putImageData · Math.sin(r×π/2)', cx, cy + 135);
  }, []);

  // Aplicar distorsión esférica
  const applySphericalDistortion = useCallback(() => {
    const sourceCanvas = sourceCanvasRef.current;
    const lensCanvas = lensCanvasRef.current;
    if (!sourceCanvas || !lensCanvas) return null;

    const sourceCtx = sourceCanvas.getContext('2d', { willReadFrequently: true });
    const lensCtx = lensCanvas.getContext('2d', { alpha: true });
    if (!sourceCtx || !lensCtx) return null;

    const dpr = window.devicePixelRatio || 1;

    const sourceCenterX = sourceMouseRef.current.x;
    const sourceCenterY = sourceMouseRef.current.y;

    const magFactor = 0.60;
    const cropWidth = LENS_WIDTH * dpr * magFactor;
    const cropHeight = LENS_HEIGHT * dpr * magFactor;

    const startX = sourceCenterX - cropWidth / 2;
    const startY = sourceCenterY - cropHeight / 2;

    const clampedStartX = Math.max(0, Math.floor(startX));
    const clampedStartY = Math.max(0, Math.floor(startY));
    const extractW = Math.min(sourceCanvas.width - clampedStartX, Math.ceil(cropWidth));
    const extractH = Math.min(sourceCanvas.height - clampedStartY, Math.ceil(cropHeight));

    const srcData = sourceCtx.getImageData(clampedStartX, clampedStartY, extractW, extractH);
    const dstData = lensCtx.createImageData(LENS_WIDTH, LENS_HEIGHT);

    const srcPixels = srcData.data;
    const dstPixels = dstData.data;

    const w = extractW;
    const h = extractH;
    const rx = cropWidth / 2;
    const ry = cropHeight / 2;

    for (let y = 0; y < LENS_HEIGHT; y++) {
      for (let x = 0; x < LENS_WIDTH; x++) {
        const dstIdx = (y * LENS_WIDTH + x) * 4;

        const srcXScaled = (x / LENS_WIDTH) * cropWidth;
        const srcYScaled = (y / LENS_HEIGHT) * cropHeight;

        const nx = (srcXScaled - rx) / rx;
        const ny = (srcYScaled - ry) / ry;
        const rNorm = Math.sqrt(nx * nx + ny * ny);

        if (rNorm > 1.0) {
          dstPixels[dstIdx] = 0;
          dstPixels[dstIdx + 1] = 0;
          dstPixels[dstIdx + 2] = 0;
          dstPixels[dstIdx + 3] = 0;
          continue;
        }

        const edgeThreshold = 0.40;
        let displacement = 0;

        if (rNorm > edgeThreshold) {
          const t = (rNorm - edgeThreshold) / (1.0 - edgeThreshold);
          displacement = Math.pow(t, 2.5) * 0.45 * refractionLevel;
        }

        const sampleDist = 1.0 - displacement;

        const srcX = Math.floor(rx + (srcXScaled - rx) * sampleDist);
        const srcY = Math.floor(ry + (srcYScaled - ry) * sampleDist);

        if (srcX >= 0 && srcX < w && srcY >= 0 && srcY < h) {
          const srcIdx = (srcY * w + srcX) * 4;
          dstPixels[dstIdx] = srcPixels[srcIdx];
          dstPixels[dstIdx + 1] = srcPixels[srcIdx + 1];
          dstPixels[dstIdx + 2] = srcPixels[srcIdx + 2];
          dstPixels[dstIdx + 3] = 255;
        } else {
          dstPixels[dstIdx] = 0;
          dstPixels[dstIdx + 1] = 0;
          dstPixels[dstIdx + 2] = 0;
          dstPixels[dstIdx + 3] = 0;
        }
      }
    }

    return dstData;
  }, [LENS_WIDTH, LENS_HEIGHT, refractionLevel]);

  // Render loop
  const render = useCallback(() => {
    const lensCanvas = lensCanvasRef.current;
    const offscreenCanvas = offscreenCanvasRef.current;
    if (!lensCanvas || !offscreenCanvas) return;

    const lensCtx = lensCanvas.getContext('2d', { alpha: true });
    const offscreenCtx = offscreenCanvas.getContext('2d');
    if (!lensCtx || !offscreenCtx) return;

    const lensData = applySphericalDistortion();
    if (!lensData) return;

    offscreenCtx.putImageData(lensData, 0, 0);

    lensCtx.clearRect(0, 0, lensCanvas.width, lensCanvas.height);

    const w = LENS_WIDTH;
    const h = LENS_HEIGHT;
    const r = h / 2;

    lensCtx.save();
    lensCtx.beginPath();
    lensCtx.roundRect(0, 0, w, h, r);
    lensCtx.clip();

    lensCtx.drawImage(offscreenCanvas, 0, 0, w, h, 0, 0, w, h);

    lensCtx.restore();

    // Sombra radial interior
    lensCtx.save();
    const shadowGrad = lensCtx.createRadialGradient(
      LENS_RX, LENS_RY, LENS_RY * 0.3,
      LENS_RX, LENS_RY, LENS_RX
    );
    shadowGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    shadowGrad.addColorStop(0.65, 'rgba(0, 0, 0, 0.25)');
    shadowGrad.addColorStop(1, 'rgba(0, 0, 0, 0.70)');

    lensCtx.beginPath();
    lensCtx.roundRect(0, 0, w, h, r);
    lensCtx.fillStyle = shadowGrad;
    lensCtx.fill();
    lensCtx.restore();

    // Bisel exterior
    lensCtx.save();
    lensCtx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    lensCtx.shadowBlur = 22;
    lensCtx.shadowOffsetX = 0;
    lensCtx.shadowOffsetY = 9;

    lensCtx.beginPath();
    lensCtx.roundRect(0, 0, w, h, r);
    lensCtx.lineWidth = 1.5;
    lensCtx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    lensCtx.stroke();
    lensCtx.restore();

    // Reflejo especular
    const grad = lensCtx.createRadialGradient(
      w * 0.25, h * 0.22, 0,
      LENS_RX, LENS_RY, Math.min(LENS_RX, LENS_RY) * 0.8
    );
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.18)');
    grad.addColorStop(0.35, 'rgba(255, 255, 255, 0.06)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');

    lensCtx.save();
    lensCtx.beginPath();
    lensCtx.roundRect(0, 0, w, h, r);
    lensCtx.clip();
    lensCtx.fillStyle = grad;
    lensCtx.fillRect(0, 0, w, h);
    lensCtx.restore();

    animationFrameRef.current = requestAnimationFrame(render);
  }, [applySphericalDistortion, LENS_WIDTH, LENS_HEIGHT, LENS_RX, LENS_RY]);

  // Setup canvases
  useEffect(() => {
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;

    // Source canvas
    const sourceCanvas = sourceCanvasRef.current;
    if (sourceCanvas) {
      sourceCanvas.width = w * dpr;
      sourceCanvas.height = h * dpr;
      sourceCanvas.style.width = `${w}px`;
      sourceCanvas.style.height = `${h}px`;
      const sourceCtx = sourceCanvas.getContext('2d');
      if (sourceCtx) {
        sourceCtx.scale(dpr, dpr);
      }
    }

    // Lens canvas
    const lensCanvas = lensCanvasRef.current;
    if (lensCanvas) {
      lensCanvas.width = LENS_WIDTH * dpr;
      lensCanvas.height = LENS_HEIGHT * dpr;
      lensCanvas.style.width = `${LENS_WIDTH}px`;
      lensCanvas.style.height = `${LENS_HEIGHT}px`;
      const lensCtx = lensCanvas.getContext('2d');
      if (lensCtx) {
        lensCtx.scale(dpr, dpr);
      }
    }

    // Offscreen canvas
    if (!offscreenCanvasRef.current) {
      offscreenCanvasRef.current = document.createElement('canvas');
    }
    offscreenCanvasRef.current.width = LENS_WIDTH;
    offscreenCanvasRef.current.height = LENS_HEIGHT;

    // Inicializar mouse en el centro
    updateMouseCoordinates(w / 2, h / 2);

    // Renderizar
    document.fonts.ready.then(() => {
      renderSourceCanvas();
      render();
    }).catch(() => {
      setTimeout(() => {
        renderSourceCanvas();
        render();
      }, 100);
    });

    const handleResize = () => {
      const newW = window.innerWidth;
      const newH = window.innerHeight;
      if (sourceCanvas) {
        sourceCanvas.width = newW * dpr;
        sourceCanvas.height = newH * dpr;
        sourceCanvas.style.width = `${newW}px`;
        sourceCanvas.style.height = `${newH}px`;
        const ctx = sourceCanvas.getContext('2d');
        if (ctx) ctx.scale(dpr, dpr);
      }
      renderSourceCanvas();
      updateMouseCoordinates(mouseRef.current.x, mouseRef.current.y);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [LENS_WIDTH, LENS_HEIGHT, renderSourceCanvas, render, updateMouseCoordinates]);

  // Actualizar coordenadas cuando se mueve el mouse
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      updateMouseCoordinates(e.clientX, e.clientY);
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [updateMouseCoordinates]);

  return (
    <>
      {/* Source canvas (oculto) */}
      <canvas
        ref={sourceCanvasRef}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          pointerEvents: 'none',
          opacity: 0,
          zIndex: 1,
        }}
      />

      {/* Lens canvas (visible) */}
      <canvas
        ref={lensCanvasRef}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          pointerEvents: 'none',
          zIndex: 1000,
          transform: `translate(${mouseRef.current.x - LENS_RX + position.x}px, ${mouseRef.current.y - LENS_RY + position.y}px) scale(${isDragging ? 1.03 : 1})`,
          transition: isDragging ? 'transform 0.05s ease-out' : 'transform 0.25s cubic-bezier(0.34,1.56,0.64,1)',
        }}
      />
    </>
  );
};
