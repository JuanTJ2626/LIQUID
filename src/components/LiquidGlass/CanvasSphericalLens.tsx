import React, { useEffect, useRef, useState, useCallback } from 'react';

interface CanvasSphericalLensProps {
  lensWidth?: number;
  lensHeight?: number;
  zoomLevel?: number;
  refractionLevel?: number;
}

export const CanvasSphericalLens: React.FC<CanvasSphericalLensProps> = ({
  lensWidth = 280,
  lensHeight = 180,
  zoomLevel = 1.6,
  refractionLevel: initialRefraction = 1.0,
}) => {
  const sourceCanvasRef = useRef<HTMLCanvasElement>(null);
  const lensCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  
  const [refractionLevel, setRefractionLevel] = useState(initialRefraction);
  
  // ── Estado de drag (igual que otros componentes) ──
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  
  // Centro de la lupa en coordenadas de pantalla
  const lensCenterRef = useRef({ x: 0, y: 0 });
  
  const animationFrameRef = useRef<number>();
  const captureTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const captureInProgressRef = useRef(false);
  const capturePendingRef = useRef(false);

  // ── Handlers de drag ──
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
    dragRef.current = { startX: e.clientX, startY: e.clientY, originX: pos.x, originY: pos.y };
  }, [pos]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const newX = dragRef.current.originX + (e.clientX - dragRef.current.startX);
    const newY = dragRef.current.originY + (e.clientY - dragRef.current.startY);
    setPos({ x: newX, y: newY });
  }, []);

  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
    dragRef.current = null;
  }, []);

  useEffect(() => {
    const sourceCanvas = sourceCanvasRef.current;
    const lensCanvas = lensCanvasRef.current;
    if (!sourceCanvas || !lensCanvas) return;

    const sourceCtx = sourceCanvas.getContext('2d', { 
      willReadFrequently: true,
      alpha: false, // Optimización: no necesitamos alpha en source
    });
    const lensCtx = lensCanvas.getContext('2d', { alpha: true });
    if (!sourceCtx || !lensCtx) return;

    // Crear offscreen canvas
    if (!offscreenCanvasRef.current) {
      offscreenCanvasRef.current = document.createElement('canvas');
    }
    const offscreenCanvas = offscreenCanvasRef.current;
    const offscreenCtx = offscreenCanvas.getContext('2d', { alpha: true });
    if (!offscreenCtx) return;

    const LENS_RX = lensWidth / 2;
    const LENS_RY = lensHeight / 2;

    // Resize canvases
    const resizeCanvases = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = window.innerWidth;
      const h = window.innerHeight;

      // Lens canvas
      lensCanvas.width = lensWidth * dpr;
      lensCanvas.height = lensHeight * dpr;
      lensCanvas.style.width = `${lensWidth}px`;
      lensCanvas.style.height = `${lensHeight}px`;
      lensCtx.scale(dpr, dpr);

      // Source canvas
      sourceCanvas.width = w * dpr;
      sourceCanvas.height = h * dpr;
      sourceCanvas.style.width = `${w}px`;
      sourceCanvas.style.height = `${h}px`;
      sourceCtx.scale(dpr, dpr);

      // Offscreen canvas
      offscreenCanvas.width = lensWidth;
      offscreenCanvas.height = lensHeight;
    };

    // Render source canvas (captura del DOM real usando html2canvas)
    const renderSourceCanvas = async () => {
      if (captureInProgressRef.current) {
        capturePendingRef.current = true;
        return;
      }

      captureInProgressRef.current = true;
      try {
        // Importar html2canvas dinámicamente
        const html2canvas = (await import('html2canvas')).default;
        
        // Capturar todo el body (toda la página)
        const canvas = await html2canvas(document.body, {
          width: window.innerWidth,
          height: window.innerHeight,
          x: window.scrollX,
          y: window.scrollY,
          scrollX: 0,
          scrollY: 0,
          windowWidth: window.innerWidth,
          windowHeight: window.innerHeight,
          useCORS: true,
          allowTaint: false, // Optimización: más estricto pero más rápido
          backgroundColor: '#0a0a0f',
          scale: 0.5,
          logging: false,
          removeContainer: true, // Optimización: limpiar el contenedor temporal
          // Ignorar los canvas de la lupa para evitar recursión
          ignoreElements: (element) => {
            return element === sourceCanvas || 
                   element === lensCanvas || 
                   element === containerRef.current ||
                   element.getAttribute('data-lens-ignore') === 'true';
          },
        });

        // Dibujar el resultado capturado en nuestro sourceCanvas
        const w = window.innerWidth;
        const h = window.innerHeight;
        sourceCtx.clearRect(0, 0, sourceCanvas.width, sourceCanvas.height);
        sourceCtx.drawImage(canvas, 0, 0, w, h);
      } catch (error) {
        console.error('[CanvasSphericalLens] Error capturing DOM:', error);
        // Fallback: fondo negro
        const w = window.innerWidth;
        const h = window.innerHeight;
        sourceCtx.fillStyle = '#0a0a0f';
        sourceCtx.fillRect(0, 0, w, h);
      } finally {
        captureInProgressRef.current = false;
        if (capturePendingRef.current) {
          capturePendingRef.current = false;
          void renderSourceCanvas();
        }
      }
    };

    // Apply spherical distortion (con FIXES de compatibilidad Safari)
    const applySphericalDistortion = () => {
      const dpr = window.devicePixelRatio || 1;
      const width = lensWidth;
      const height = lensHeight;

      // Calcular el centro de la lupa en coordenadas de pantalla
      const sourceCenterX = lensCenterRef.current.x * dpr;
      const sourceCenterY = lensCenterRef.current.y * dpr;

      const magFactor = 0.60;
      const cropWidth = lensWidth * dpr * magFactor;
      const cropHeight = lensHeight * dpr * magFactor;

      const startX = sourceCenterX - cropWidth / 2;
      const startY = sourceCenterY - cropHeight / 2;

      // ── FIX 1: SANITIZAR COORDENADAS PARA Safari ──
      // Safari no soporta valores flotantes o negativos en getImageData
      let safeStartX = Math.max(0, Math.floor(startX));
      let safeStartY = Math.max(0, Math.floor(startY));
      
      // Asegurar que el ancho/alto no sobrepase los bordes
      let safeCropW = Math.min(sourceCanvas.width - safeStartX, Math.floor(cropWidth));
      let safeCropH = Math.min(sourceCanvas.height - safeStartY, Math.floor(cropHeight));

      // Validar que las dimensiones sean positivas antes de llamar getImageData
      if (safeCropW <= 0 || safeCropH <= 0) {
        // No hay nada que extraer, renderizar transparente
        const emptyData = lensCtx.createImageData(width, height);
        return emptyData;
      }

      const srcData = sourceCtx.getImageData(safeStartX, safeStartY, safeCropW, safeCropH);
      const dstData = lensCtx.createImageData(width, height);

      const srcPixels = srcData.data;
      const dstPixels = dstData.data;

      const w = safeCropW;
      const h = safeCropH;
      const rx = cropWidth / 2;
      const ry = cropHeight / 2;

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const dstIdx = (y * width + x) * 4;

          const srcXScaled = (x / width) * cropWidth;
          const srcYScaled = (y / height) * cropHeight;

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

          // ── FIX 2: SANITIZAR ÍNDICES DE MUESTREO ──
          const srcX = Math.floor(rx + (srcXScaled - rx) * sampleDist);
          const srcY = Math.floor(ry + (srcYScaled - ry) * sampleDist);

          // Validar bounds con los límites reales extraídos
          if (srcX >= 0 && srcX < w && srcY >= 0 && srcY < h) {
            const srcIdx = (srcY * w + srcX) * 4;
            
            // ── FIX 3: VALIDAR QUE srcIdx esté dentro del buffer ──
            if (srcIdx >= 0 && srcIdx + 3 < srcPixels.length) {
              dstPixels[dstIdx] = srcPixels[srcIdx];
              dstPixels[dstIdx + 1] = srcPixels[srcIdx + 1];
              dstPixels[dstIdx + 2] = srcPixels[srcIdx + 2];
              dstPixels[dstIdx + 3] = 255;
            } else {
              // Out of buffer bounds: negro
              dstPixels[dstIdx] = 0;
              dstPixels[dstIdx + 1] = 0;
              dstPixels[dstIdx + 2] = 0;
              dstPixels[dstIdx + 3] = 255;
            }
          } else {
            // Out of bounds: transparente
            dstPixels[dstIdx] = 0;
            dstPixels[dstIdx + 1] = 0;
            dstPixels[dstIdx + 2] = 0;
            dstPixels[dstIdx + 3] = 0;
          }
        }
      }

      return dstData;
    };

    // Render loop con throttling
    let lastRenderTime = 0;
    const targetFPS = 60;
    const frameInterval = 1000 / targetFPS;

    const render = (currentTime: number = 0) => {
      // Throttle: solo renderizar si ha pasado suficiente tiempo
      const deltaTime = currentTime - lastRenderTime;
      
      if (deltaTime < frameInterval) {
        animationFrameRef.current = requestAnimationFrame(render);
        return;
      }
      
      lastRenderTime = currentTime;

      const lensData = applySphericalDistortion();
      offscreenCtx.putImageData(lensData, 0, 0);

      lensCtx.clearRect(0, 0, lensCanvas.width, lensCanvas.height);

      const w = lensWidth;
      const h = lensHeight;
      const r = h / 2;

      lensCtx.save();
      lensCtx.beginPath();
      lensCtx.roundRect(0, 0, w, h, r);
      lensCtx.clip();

      lensCtx.drawImage(offscreenCanvas, 0, 0, offscreenCanvas.width, offscreenCanvas.height, 0, 0, w, h);
      lensCtx.restore();

      // Sombra radial interior
      lensCtx.save();
      const shadowGrad = lensCtx.createRadialGradient(LENS_RX, LENS_RY, LENS_RY * 0.3, LENS_RX, LENS_RY, LENS_RX);
      shadowGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
      shadowGrad.addColorStop(0.65, 'rgba(0, 0, 0, 0.25)');
      shadowGrad.addColorStop(1, 'rgba(0, 0, 0, 0.70)');

      lensCtx.beginPath();
      lensCtx.roundRect(0, 0, w, h, r);
      lensCtx.fillStyle = shadowGrad;
      lensCtx.fill();
      lensCtx.restore();

      // Bisel especular
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
    };

    const handleResize = () => {
      resizeCanvases();
      scheduleCapture();
    };

    const handleScroll = () => {
      scheduleCapture();
    };

    const scheduleCapture = () => {
      if (captureTimeoutRef.current) {
        clearTimeout(captureTimeoutRef.current);
      }
      captureTimeoutRef.current = setTimeout(() => {
        void renderSourceCanvas();
      }, 250);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setRefractionLevel((prev) => Math.min(2.5, prev + 0.1));
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setRefractionLevel((prev) => Math.max(0, prev - 0.1));
      } else if (e.key === 'r' || e.key === 'R') {
        // Tecla 'R' para refrescar la captura
        e.preventDefault();
        renderSourceCanvas();
      }
    };

    // Initialize
    resizeCanvases();

    // Posición inicial centrada en pantalla
    const initialX = window.innerWidth / 2;
    const initialY = window.innerHeight / 2;
    lensCenterRef.current = { x: initialX, y: initialY };

    sourceCtx.fillStyle = '#0a0a0f';
    sourceCtx.fillRect(0, 0, window.innerWidth, window.innerHeight);
    render();
    void renderSourceCanvas();

    // Recapturar el DOM cada 3 segundos (optimizado de 2 a 3 para mejor rendimiento)
    const captureInterval = setInterval(() => {
      void renderSourceCanvas();
    }, 3000);

    // Add event listeners
    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      clearInterval(captureInterval);
      if (captureTimeoutRef.current) {
        clearTimeout(captureTimeoutRef.current);
      }
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [lensWidth, lensHeight, zoomLevel, refractionLevel]);

  // Actualizar el centro de la lupa cuando se arrastra
  useEffect(() => {
    // Calcular la posición del centro basado en la posición del contenedor
    const centerX = window.innerWidth / 2 + pos.x;
    const centerY = window.innerHeight / 2 + pos.y;
    lensCenterRef.current = { x: centerX, y: centerY };
  }, [pos]);

  const borderRadiusStyle = `${lensHeight / 2}px`;

  return (
    <>
      {/* Source canvas (oculto) */}
      <canvas
        ref={sourceCanvasRef}
        data-lens-ignore="true"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          pointerEvents: 'none',
          opacity: 0,
          zIndex: 1,
        }}
      />

      {/* Contenedor draggable */}
      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        data-lens-ignore="true"
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px)) scale(${isDragging ? 1.03 : 1})`,
          zIndex: 99998,
          width: lensWidth,
          height: lensHeight,
          borderRadius: borderRadiusStyle,
          cursor: isDragging ? 'grabbing' : 'grab',
          touchAction: 'none',
          userSelect: 'none',
          transition: isDragging
            ? 'transform 0.05s ease-out'
            : 'transform 0.25s cubic-bezier(0.34,1.56,0.64,1)',
        }}
      >
        {/* Lens canvas (visible) */}
        <canvas
          ref={lensCanvasRef}
          data-lens-ignore="true"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            pointerEvents: 'none',
            width: '100%',
            height: '100%',
          }}
        />
      </div>

      {/* Info overlay */}
      <div
        data-lens-ignore="true"
        style={{
          position: 'fixed',
          bottom: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          color: 'rgba(255,255,255,0.3)',
          font: '11px/1.6 monospace',
          textAlign: 'center',
          pointerEvents: 'none',
          letterSpacing: '0.08em',
          zIndex: 500,
        }}
      >
        Liquid Glass Capsule Lens &nbsp;|&nbsp; {lensWidth}×{lensHeight}px &nbsp;|&nbsp; Elliptic refraction &nbsp;|&nbsp; 60 FPS
        <br />
        <span style={{ opacity: 0.6, fontSize: 10 }}>
          REFRACTION: {refractionLevel.toFixed(2)} &nbsp; (↑↓ to adjust · R to refresh)
        </span>
      </div>
    </>
  );
};

export default CanvasSphericalLens;
