import React, { useEffect, useState } from 'react';
import LiquidGlassNavbar from './navigation/LiquidGlassNavbar';
import { LiquidGlassSidebar } from './navigation/LiquidGlassSidebar';
import { LiquidGlassLeftSidebar } from './navigation/LiquidGlassLeftSidebar';
import { LiquidGlassSection } from './sections/LiquidGlassSection';
import { LiquidGlassTestLab } from './LiquidGlass/LiquidGlassTestLab';

export const GSAPMasterpieceSite: React.FC = () => {
  const [showLab, setShowLab] = useState(false);

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
      {/* Navbar draggable */}
      <LiquidGlassNavbar />

      {/* Sidebar derecho — siempre visible y draggable */}
      <LiquidGlassSidebar />

      {/* Sidebar izquierdo — se expande con hover */}
      <LiquidGlassLeftSidebar />

      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 20px' }}>
        <LiquidGlassSection />
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
