import React, { useState, useEffect } from 'react';
import LoadingDebugModal from './LoadingDebugModal';

/**
 * Debug trigger for loading screens - shows in development
 * Triggered by Ctrl+Shift+L or floating button
 */
const LoadingDebugTrigger: React.FC = () => {
  const [showModal, setShowModal] = useState(false);
  const [showButton, setShowButton] = useState(false);

  // Keyboard shortcut: Ctrl+Shift+L
  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'l') {
        event.preventDefault();
        setShowModal(true);
      }
      // Toggle floating button with Ctrl+Shift+D (for "Debug")
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        setShowButton(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);

  // Show button by default in development
  useEffect(() => {
    // Only show in development mode
    if (process.env.NODE_ENV === 'development') {
      setShowButton(true);
    }
  }, []);

  const floatingButtonStyle = {
    position: 'fixed' as const,
    bottom: '20px',
    right: '20px',
    width: '50px',
    height: '50px',
    borderRadius: '50%',
    background: 'linear-gradient(45deg, #0078d4, #106ebe)',
    border: 'none',
    color: 'white',
    fontSize: '18px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 4px 12px rgba(0, 120, 212, 0.3)',
    zIndex: 1500,
    transition: 'all 0.2s ease',
    fontWeight: 'bold',
  };

  // Only render in development
  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  return (
    <>
      {showButton && (
        <button
          style={floatingButtonStyle}
          onClick={() => setShowModal(true)}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'scale(1.1)';
            e.currentTarget.style.boxShadow = '0 6px 16px rgba(0, 120, 212, 0.4)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 120, 212, 0.3)';
          }}
          title="Loading Screens Debug (Ctrl+Shift+L)"
        >
          ⏳
        </button>
      )}
      
      <LoadingDebugModal 
        isOpen={showModal} 
        onClose={() => setShowModal(false)} 
      />
    </>
  );
};

export default LoadingDebugTrigger;