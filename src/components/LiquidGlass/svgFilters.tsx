/**
 * svgFilters.tsx
 *
 * SVG filter pipeline definitions for Liquid Glass displacement & specular bloom,
 * plus client capability detector for SVG backdrop-filter support.
 */

import React from 'react';

/**
 * Detects whether the current browser supports SVG filter references
 * inside CSS backdrop-filter property. Supported natively in Chromium.
 */
export function detectSvgBackdropSupport(): boolean {
  if (typeof window === 'undefined') return false;

  const isChromium =
    'chrome' in window ||
    /Chrome|Chromium|Edg|OPR|Brave/i.test(navigator.userAgent);

  const isFirefox = /Firefox/i.test(navigator.userAgent);
  const isSafari =
    /Safari/i.test(navigator.userAgent) && !/Chrome|Chromium|Edg/i.test(navigator.userAgent);

  return Boolean(isChromium && !isFirefox && !isSafari);
}

export interface LiquidGlassSvgDefsProps {
  filterId: string;
  specularId: string;
  dispMapUrl: string;
  specMapUrl?: string;
  feScale: number;
  padXPercent?: number;
  padYPercent?: number;
}

export const LiquidGlassSvgDefs: React.FC<LiquidGlassSvgDefsProps> = ({
  filterId,
  specularId,
  dispMapUrl,
  specMapUrl,
  feScale,
  padXPercent = 30,
  padYPercent = 30,
}) => {
  if (!dispMapUrl) return null;

  return (
    <svg
      aria-hidden="true"
      style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', pointerEvents: 'none' }}
    >
      <defs>
        {/* Dynamic padding filter bounds to prevent clipping on extreme displacement */}
        <filter
          id={filterId}
          x={`-${padXPercent}%`}
          y={`-${padYPercent}%`}
          width={`${100 + 2 * padXPercent}%`}
          height={`${100 + 2 * padYPercent}%`}
          colorInterpolationFilters="sRGB"
        >
          {/*
            feImage specifies x="0" y="0" width="100%" height="100%"
            so the displacement texture aligns 1:1 with element coordinates.
          */}
          <feImage
            href={dispMapUrl}
            xlinkHref={dispMapUrl}
            x="0"
            y="0"
            width="100%"
            height="100%"
            result="dispMap"
            preserveAspectRatio="none"
          />

          {/* Core SVG displacement primitive mapping R->X and G->Y */}
          <feDisplacementMap
            in="SourceGraphic"
            in2="dispMap"
            scale={feScale}
            xChannelSelector="R"
            yChannelSelector="G"
            result="distorted"
          />

          {/* Color saturation boost */}
          <feColorMatrix
            in="distorted"
            type="saturate"
            values="1.2"
            result="saturated"
          />

          {/* Blend directional specular highlight via screen mode */}
          {specMapUrl && (
            <>
              <feImage
                href={specMapUrl}
                xlinkHref={specMapUrl}
                x="0"
                y="0"
                width="100%"
                height="100%"
                result="specMap"
                preserveAspectRatio="none"
              />
              <feBlend
                in="saturated"
                in2="specMap"
                mode="screen"
                result="withSpecular"
              />
            </>
          )}

          {/* Composite atop to maintain crisp boundaries */}
          <feComposite
            in={specMapUrl ? 'withSpecular' : 'saturated'}
            in2="SourceGraphic"
            operator="atop"
          />
        </filter>

        {/* Standalone Specular Overlay Filter */}
        {specMapUrl && (
          <filter id={specularId} x="0" y="0" width="100%" height="100%">
            <feImage
              href={specMapUrl}
              xlinkHref={specMapUrl}
              x="0"
              y="0"
              width="100%"
              height="100%"
              result="specOnly"
              preserveAspectRatio="none"
            />
            <feComposite in="specOnly" in2="SourceGraphic" operator="over" />
          </filter>
        )}
      </defs>
    </svg>
  );
};

// ── Magnifying Glass Chained Filter Pipeline (Zoom Map + Rim Snell Map) ─────────

export interface LiquidGlassMagnifierSvgDefsProps {
  filterId: string;
  zoomMapUrl: string;
  rimMapUrl: string;
  specMapUrl?: string;
  zoomScale: number;
  rimScale: number;
  padXPercent?: number;
  padYPercent?: number;
}

export const LiquidGlassMagnifierSvgDefs: React.FC<LiquidGlassMagnifierSvgDefsProps> = ({
  filterId,
  zoomMapUrl,
  rimMapUrl,
  specMapUrl,
  zoomScale,
  rimScale,
  padXPercent = 10,
  padYPercent = 10,
}) => {
  if (!zoomMapUrl || !rimMapUrl) return null;

  return (
    <svg
      aria-hidden="true"
      style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', pointerEvents: 'none' }}
    >
      <defs>
        <filter
          id={filterId}
          x={`-${padXPercent}%`}
          y={`-${padYPercent}%`}
          width={`${100 + 2 * padXPercent}%`}
          height={`${100 + 2 * padYPercent}%`}
          filterUnits="objectBoundingBox"
          primitiveUnits="objectBoundingBox"
          colorInterpolationFilters="sRGB"
        >
          {/*
            EXPERIMENT: primitiveUnits=objectBoundingBox so feImage 0..1
            covers the lens box, not the padded filter region / 0×0 SVG viewport.
            scale is still in px from MagnifyingGlass — in this mode it is
            bbox-relative (will look stronger). Isolated alignment test only.
          */}
          <feImage
            href={zoomMapUrl}
            xlinkHref={zoomMapUrl}
            x="0" y="0" width="1" height="1"
            result="zoomMap"
            preserveAspectRatio="none"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="zoomMap"
            scale={zoomScale}
            xChannelSelector="R"
            yChannelSelector="G"
            result="zoomedGraphic"
          />
          {/* 2. Rim Snell Refraction Map */}
          <feImage
            href={rimMapUrl}
            xlinkHref={rimMapUrl}
            x="0" y="0" width="1" height="1"
            result="rimMap"
            preserveAspectRatio="none"
          />
          <feDisplacementMap
            in="zoomedGraphic"
            in2="rimMap"
            scale={rimScale}
            xChannelSelector="R"
            yChannelSelector="G"
            result="distortedGraphic"
          />

          {/* 3. Subtle Color Saturation Accent */}
          <feColorMatrix
            in="distortedGraphic"
            type="saturate"
            values="1.08"
            result="saturated"
          />

          {/* 4. Optional Specular Highlight Blend */}
          {specMapUrl && (
            <>
              <feImage
                href={specMapUrl}
                xlinkHref={specMapUrl}
                x="0" y="0" width="1" height="1"
                result="specMap"
                preserveAspectRatio="none"
              />
              <feBlend
                in="saturated"
                in2="specMap"
                mode="screen"
                result="withSpecular"
              />
            </>
          )}

          {/* 5. Final Composite to keep crisp bounds */}
          <feComposite
            in={specMapUrl ? 'withSpecular' : 'saturated'}
            in2="SourceGraphic"
            operator="atop"
          />
        </filter>
      </defs>
    </svg>
  );
};

