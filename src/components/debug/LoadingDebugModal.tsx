import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Loading from '../../app/styles/Loading';
import LoadingState from '../states/LoadingState';
import AppLoadingScreen from '../states/AppLoadingScreen';
import { useTheme } from '../../app/functionality/ThemeContext';

interface LoadingDebugModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type LoadingType = 
  | 'main-loading'
  | 'app-loading-initializing'
  | 'app-loading-authenticating'
  | 'app-loading-loading-data'
  | 'app-loading-finalizing'
  | 'loading-state-sm'
  | 'loading-state-md'
  | 'loading-state-lg'
  | 'loading-state-inline'
  | 'loading-state-fullscreen'
  | null;

const LoadingDebugModal: React.FC<LoadingDebugModalProps> = ({ isOpen, onClose }) => {
  const [activeLoading, setActiveLoading] = useState<LoadingType>(null);
  const [customMessage, setCustomMessage] = useState('Helix Hub');
  const [customSubMessage, setCustomSubMessage] = useState('Connecting to Helix systems...');
  const [customProgress, setCustomProgress] = useState(65);
  const [showAllDesigns, setShowAllDesigns] = useState(false);
  const { isDarkMode } = useTheme();

  // Close with Escape key
  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (showAllDesigns) {
          setShowAllDesigns(false);
        } else if (activeLoading) {
          setActiveLoading(null);
        } else {
          onClose();
        }
      }
    };

    if (isOpen) {
      window.addEventListener('keydown', handleKeyPress);
      return () => window.removeEventListener('keydown', handleKeyPress);
    }
  }, [isOpen, activeLoading, showAllDesigns, onClose]);

  if (!isOpen) return null;

  const renderActiveLoading = () => {
    switch (activeLoading) {
      case 'main-loading':
        return (
          <Loading
            message={customMessage}
            detailMessages={[customSubMessage, 'Syncing data...', 'Almost ready...']}
            stage="loading-data"
            progress={customProgress}
          />
        );
      case 'app-loading-initializing':
        return (
          <AppLoadingScreen
            stage="initializing"
            progress={25}
            message={customMessage}
            subMessage={customSubMessage}
          />
        );
      case 'app-loading-authenticating':
        return (
          <AppLoadingScreen
            stage="authenticating"
            progress={45}
            message={customMessage}
            subMessage={customSubMessage}
          />
        );
      case 'app-loading-loading-data':
        return (
          <AppLoadingScreen
            stage="loading-data"
            progress={customProgress}
            message={customMessage}
            subMessage={customSubMessage}
          />
        );
      case 'app-loading-finalizing':
        return (
          <AppLoadingScreen
            stage="finalizing"
            progress={90}
            message={customMessage}
            subMessage={customSubMessage}
          />
        );
      case 'loading-state-sm':
        return (
          <div style={{ padding: '20px', background: isDarkMode ? '#1a1a1a' : '#ffffff', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <LoadingState message="Small loading..." size="sm" />
          </div>
        );
      case 'loading-state-md':
        return (
          <div style={{ padding: '20px', background: isDarkMode ? '#1a1a1a' : '#ffffff', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <LoadingState message="Medium loading..." size="md" />
          </div>
        );
      case 'loading-state-lg':
        return (
          <div style={{ padding: '20px', background: isDarkMode ? '#1a1a1a' : '#ffffff', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <LoadingState message="Large loading..." size="lg" />
          </div>
        );
      case 'loading-state-inline':
        return (
          <div style={{ padding: '20px', background: isDarkMode ? '#1a1a1a' : '#ffffff', minHeight: '100vh' }}>
            <h2>Inline Loading Example</h2>
            <p>Here's some content with <LoadingState message="Loading..." size="sm" inline={true} /> inline loading.</p>
            <p>Another paragraph with more content.</p>
          </div>
        );
      case 'loading-state-fullscreen':
        return (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: isDarkMode ? '#1a1a1a' : '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <LoadingState message="Full screen loading..." size="lg" />
          </div>
        );
      default:
        return null;
    }
  };

  const renderAllDesigns = () => {
    const gridStyle = {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))',
      gap: '24px',
      padding: '24px',
      background: isDarkMode ? '#1a1a1a' : '#ffffff',
      minHeight: '100vh',
      overflow: 'auto',
      maxWidth: '100vw',
    };

    const cardStyle = {
      background: isDarkMode ? '#2d2d2d' : '#f8f8f8',
      border: `1px solid ${isDarkMode ? '#404040' : '#e1e1e1'}`,
      borderRadius: '8px',
      padding: '20px',
      height: '300px',
      display: 'flex',
      flexDirection: 'column' as const,
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative' as const,
      overflow: 'hidden',
    };

    const titleStyle = {
      position: 'absolute' as const,
      top: '8px',
      left: '12px',
      fontSize: '11px',
      fontWeight: 'bold',
      color: isDarkMode ? '#ffffff' : '#000000',
      background: isDarkMode ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.95)',
      padding: '4px 8px',
      borderRadius: '4px',
      zIndex: 10,
      maxWidth: 'calc(100% - 24px)',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    };

    return (
      <div style={gridStyle}>
        {/* Main Loading */}
        <div style={cardStyle}>
          <div style={titleStyle}>1. Main Loading</div>
          <div style={{ transform: 'scale(0.7)', transformOrigin: 'center' }}>
            <Loading
              message={customMessage}
              detailMessages={[customSubMessage, 'Syncing data...', 'Almost ready...']}
              stage="loading-data"
              progress={customProgress}
            />
          </div>
        </div>

        {/* App Loading - Initializing */}
        <div style={cardStyle}>
          <div style={titleStyle}>2. App Loading - Initializing</div>
          <div style={{ transform: 'scale(0.8)', transformOrigin: 'center' }}>
            <AppLoadingScreen
              stage="initializing"
              progress={25}
              message={customMessage}
              subMessage={customSubMessage}
            />
          </div>
        </div>

        {/* App Loading - Authenticating */}
        <div style={cardStyle}>
          <div style={titleStyle}>3. App Loading - Authenticating</div>
          <div style={{ transform: 'scale(0.8)', transformOrigin: 'center' }}>
            <AppLoadingScreen
              stage="authenticating"
              progress={45}
              message={customMessage}
              subMessage={customSubMessage}
            />
          </div>
        </div>

        {/* App Loading - Loading Data */}
        <div style={cardStyle}>
          <div style={titleStyle}>4. App Loading - Loading Data</div>
          <div style={{ transform: 'scale(0.8)', transformOrigin: 'center' }}>
            <AppLoadingScreen
              stage="loading-data"
              progress={customProgress}
              message={customMessage}
              subMessage={customSubMessage}
            />
          </div>
        </div>

        {/* App Loading - Finalizing */}
        <div style={cardStyle}>
          <div style={titleStyle}>5. App Loading - Finalizing</div>
          <div style={{ transform: 'scale(0.8)', transformOrigin: 'center' }}>
            <AppLoadingScreen
              stage="finalizing"
              progress={90}
              message={customMessage}
              subMessage={customSubMessage}
            />
          </div>
        </div>

        {/* Loading State - Small */}
        <div style={cardStyle}>
          <div style={titleStyle}>6. Loading State - Small</div>
          <LoadingState message="Small loading..." size="sm" />
        </div>

        {/* Loading State - Medium */}
        <div style={cardStyle}>
          <div style={titleStyle}>7. Loading State - Medium</div>
          <LoadingState message="Medium loading..." size="md" />
        </div>

        {/* Loading State - Large */}
        <div style={cardStyle}>
          <div style={titleStyle}>8. Loading State - Large</div>
          <LoadingState message="Large loading..." size="lg" />
        </div>

        {/* Loading State - Inline Example */}
        <div style={cardStyle}>
          <div style={titleStyle}>9. Loading State - Inline</div>
          <div style={{ textAlign: 'center', color: isDarkMode ? '#ffffff' : '#000000', fontSize: '14px' }}>
            <p>Content with <LoadingState message="Loading..." size="sm" inline={true} /> inline loading.</p>
            <p>Another paragraph.</p>
          </div>
        </div>
      </div>
    );
  };

  const modalOverlay = {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.8)',
    zIndex: 2000,
    overflowY: 'auto' as const,
  };

  const modalContent = {
    background: isDarkMode ? '#2d2d2d' : '#ffffff',
    border: `1px solid ${isDarkMode ? '#404040' : '#e1e1e1'}`,
    borderRadius: '8px',
    padding: '20px',
    maxWidth: '500px',
    width: '90%',
    maxHeight: '70vh',
    overflow: 'auto',
    color: isDarkMode ? '#ffffff' : '#000000',
    boxSizing: 'border-box' as const,
    position: 'absolute' as const,
    top: '15vh',
    left: '50%',
    transform: 'translateX(-50%)',
    boxShadow: '0 10px 30px rgba(0, 0, 0, 0.3)',
  };

  const buttonStyle = {
    background: isDarkMode ? '#404040' : '#f0f0f0',
    border: `1px solid ${isDarkMode ? '#555555' : '#cccccc'}`,
    borderRadius: '4px',
    padding: '8px 12px',
    margin: '4px',
    cursor: 'pointer',
    color: isDarkMode ? '#ffffff' : '#000000',
    fontSize: '13px',
  };

  const inputStyle = {
    background: isDarkMode ? '#404040' : '#ffffff',
    border: `1px solid ${isDarkMode ? '#555555' : '#cccccc'}`,
    borderRadius: '4px',
    padding: '6px 8px',
    margin: '4px 0',
    color: isDarkMode ? '#ffffff' : '#000000',
    width: '100%',
    fontSize: '13px',
  };

  if (showAllDesigns) {
    return createPortal(
      <div>
        {renderAllDesigns()}
        <div style={{
          position: 'fixed',
          top: '10px',
          left: '10px',
          background: 'rgba(0, 0, 0, 0.9)',
          color: 'white',
          padding: '8px 12px',
          borderRadius: '4px',
          fontSize: '12px',
          fontFamily: 'monospace',
          zIndex: 2001
        }}>
          ALL DESIGNS VIEW - ESC to close
        </div>
        <div style={{
          position: 'fixed',
          top: '10px',
          right: '10px',
          zIndex: 2001
        }}>
          <button 
            onClick={() => setShowAllDesigns(false)}
            style={{
              background: '#404040',
              border: '1px solid #555555',
              borderRadius: '4px',
              padding: '8px 12px',
              cursor: 'pointer',
              color: 'white',
              fontSize: '13px',
              marginRight: '8px'
            }}
          >
            Individual View
          </button>
          <button 
            onClick={onClose}
            style={{
              background: '#ff4444',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              padding: '8px 12px',
              cursor: 'pointer',
              fontSize: '13px'
            }}
          >
            ✕ Close
          </button>
        </div>
      </div>,
      document.body
    );
  }

  if (activeLoading) {
    return createPortal(
      <div>
        {renderActiveLoading()}
        <div style={{
          position: 'fixed',
          top: '10px',
          left: '10px',
          background: 'rgba(0, 0, 0, 0.9)',
          color: 'white',
          padding: '8px 12px',
          borderRadius: '4px',
          fontSize: '12px',
          fontFamily: 'monospace',
          zIndex: 2001
        }}>
          {activeLoading.toUpperCase()} - ESC to close, SPACE to pause
        </div>
      </div>,
      document.body
    );
  }

  return createPortal(
    <div style={modalOverlay} onClick={onClose}>
      <div style={modalContent} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ margin: 0 }}>Loading Screens Debug</h3>
          <button 
            onClick={onClose}
            style={{ ...buttonStyle, background: '#ff4444', color: 'white', border: 'none' }}
          >
            ✕
          </button>
        </div>

        <div style={{ marginBottom: '20px', textAlign: 'center' }}>
          <button 
            style={{
              ...buttonStyle,
              background: '#0078d4',
              color: 'white',
              border: 'none',
              fontSize: '14px',
              fontWeight: 'bold',
              padding: '12px 24px',
              boxShadow: '0 2px 8px rgba(0, 120, 212, 0.3)'
            }}
            onClick={() => setShowAllDesigns(true)}
          >
            🎨 View All Designs in One Grid
          </button>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <h4 style={{ marginBottom: '8px' }}>Customization</h4>
          <div>
            <label style={{ fontSize: '12px', display: 'block' }}>Message:</label>
            <input
              type="text"
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={{ fontSize: '12px', display: 'block' }}>Sub Message:</label>
            <input
              type="text"
              value={customSubMessage}
              onChange={(e) => setCustomSubMessage(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={{ fontSize: '12px', display: 'block' }}>Progress ({customProgress}%):</label>
            <input
              type="range"
              min="0"
              max="100"
              value={customProgress}
              onChange={(e) => setCustomProgress(parseInt(e.target.value))}
              style={{ ...inputStyle, height: '20px' }}
            />
          </div>
        </div>

        <div>
          <h4 style={{ marginBottom: '8px' }}>Main Loading Components</h4>
          <button style={buttonStyle} onClick={() => setActiveLoading('main-loading')}>
            Main Loading (with details)
          </button>
          <br />

          <h4 style={{ marginBottom: '8px', marginTop: '16px' }}>App Loading Screen Stages</h4>
          <button style={buttonStyle} onClick={() => setActiveLoading('app-loading-initializing')}>
            Initializing (25%)
          </button>
          <button style={buttonStyle} onClick={() => setActiveLoading('app-loading-authenticating')}>
            Authenticating (45%)
          </button>
          <button style={buttonStyle} onClick={() => setActiveLoading('app-loading-loading-data')}>
            Loading Data (custom %)
          </button>
          <button style={buttonStyle} onClick={() => setActiveLoading('app-loading-finalizing')}>
            Finalizing (90%)
          </button>
          <br />

          <h4 style={{ marginBottom: '8px', marginTop: '16px' }}>Loading State Variants</h4>
          <button style={buttonStyle} onClick={() => setActiveLoading('loading-state-sm')}>
            Small Block
          </button>
          <button style={buttonStyle} onClick={() => setActiveLoading('loading-state-md')}>
            Medium Block
          </button>
          <button style={buttonStyle} onClick={() => setActiveLoading('loading-state-lg')}>
            Large Block
          </button>
          <button style={buttonStyle} onClick={() => setActiveLoading('loading-state-inline')}>
            Inline
          </button>
          <button style={buttonStyle} onClick={() => setActiveLoading('loading-state-fullscreen')}>
            Full Screen
          </button>
        </div>

        <div style={{ marginTop: '20px', fontSize: '12px', opacity: 0.7 }}>
          <p>• Press <strong>SPACE</strong> to pause animations in any loading screen</p>
          <p>• Press <strong>ESC</strong> to close loading screen or this modal</p>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default LoadingDebugModal;