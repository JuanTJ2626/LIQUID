import React, { useEffect, useState } from 'react';
import LiquidGlassNavbar from './navigation/LiquidGlassNavbar';
import { LiquidGlassSidebar } from './navigation/LiquidGlassSidebar';
import { LiquidGlassLeftSidebar } from './navigation/LiquidGlassLeftSidebar';
import { LiquidGlassSection } from './sections/LiquidGlassSection';
import { LiquidGlassTestLab } from './LiquidGlass/LiquidGlassTestLab';
import { CanvasSphericalLens } from './LiquidGlass/CanvasSphericalLens';

export const GSAPMasterpieceSite: React.FC = () => {
  const [showLab, setShowLab] = useState(false);
  // Estado individual para cada elemento liquid glass
  const [showNavbar, setShowNavbar] = useState(false);
  const [showRightSidebar, setShowRightSidebar] = useState(false);
  const [showLeftSidebar, setShowLeftSidebar] = useState(false);
  const [showCanvasLens, setShowCanvasLens] = useState(false);
  const [showMagnifyingGlass, setShowMagnifyingGlass] = useState(false);

  useEffect(() => {
    setShowLab(new URLSearchParams(window.location.search).has('lab'));
  }, []);

  return (
    <div
      style={{
        background: '#0a0a0f',
        color: '#ffffff',
        fontFamily: "'Outfit', sans-serif",
        minHeight: '100vh',
        paddingTop: 100,
        overflow: 'hidden',
      }}
    >
      {/* Mostrar cada elemento según su estado individual */}
      {showNavbar && <LiquidGlassNavbar />}
      {showRightSidebar && <LiquidGlassSidebar />}
      {showLeftSidebar && <LiquidGlassLeftSidebar />}
      {showCanvasLens && (
        <CanvasSphericalLens 
          lensWidth={280}
          lensHeight={180}
          zoomLevel={1.6}
          refractionLevel={1.0}
        />
      )}

      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 20px' }}>
        <LiquidGlassSection 
          showNavbar={showNavbar}
          showRightSidebar={showRightSidebar}
          showLeftSidebar={showLeftSidebar}
          showCanvasLens={showCanvasLens}
          showMagnifyingGlass={showMagnifyingGlass}
          onToggleNavbar={() => setShowNavbar(!showNavbar)}
          onToggleRightSidebar={() => setShowRightSidebar(!showRightSidebar)}
          onToggleLeftSidebar={() => setShowLeftSidebar(!showLeftSidebar)}
          onToggleCanvasLens={() => setShowCanvasLens(!showCanvasLens)}
          onToggleMagnifyingGlass={() => setShowMagnifyingGlass(!showMagnifyingGlass)}
        />
        {showLab && (
          <div style={{ marginTop: 48 }}>
            <LiquidGlassTestLab />
          </div>
        )}
      </main>
    </div>
  );
};

export default GSAPMasterpieceSite;
