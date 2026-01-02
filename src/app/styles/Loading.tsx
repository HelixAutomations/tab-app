// Modern loading screen with clean design inspired by communications dashboard
// src/components/Loading.tsx

import React, { useEffect, useState } from 'react';
import { colours } from './colours';
import { useTheme } from '../functionality/ThemeContext';
import AppLoadingScreen from '../../components/states/AppLoadingScreen';

interface LoadingProps {
  /**
   * Optional status message to render beneath the logo.
   */
  readonly message?: string;
  /**
   * Additional rotating detail messages providing contextual progress.
   */
  readonly detailMessages?: readonly string[];
  /**
   * Overrides dark mode detection when supplied (useful before theme context is ready).
   */
  readonly isDarkMode?: boolean;
  /**
   * Loading stage for more sophisticated progress indication
   */
  readonly stage?: 'initializing' | 'authenticating' | 'loading-data' | 'finalizing';
  /**
   * Progress percentage (0-100)
   */
  readonly progress?: number;
}

/**
 * Branded loading screen with modern design and progress indication
 */
const Loading: React.FC<LoadingProps> = ({
  message = 'Helix Hub',
  detailMessages,
  isDarkMode,
  stage = 'loading-data',
  progress = 65,
}) => {
  const { isDarkMode: themeDarkMode } = useTheme();
  const [currentDetailIndex, setCurrentDetailIndex] = useState(0);
  const [computedProgress, setComputedProgress] = useState(progress);
  const [isPaused, setIsPaused] = useState(false);
  
  // Demo mode: spacebar to pause/unpause for design inspection
  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      if (event.code === 'Space' && !event.ctrlKey && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        setIsPaused(prev => !prev);
      }
    };
    
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);
  
  // Cycle through detail messages
  useEffect(() => {
    if (!detailMessages || detailMessages.length <= 1 || isPaused) return;
    
    const interval = setInterval(() => {
      setCurrentDetailIndex(prev => (prev + 1) % detailMessages.length);
    }, 2000);
    
    return () => clearInterval(interval);
  }, [detailMessages, isPaused]);
  
  // Simulate progress increase for better UX
  useEffect(() => {
    if (isPaused) return;
    
    const timer = setTimeout(() => {
      setComputedProgress(prev => Math.min(100, prev + 15));
    }, 500);
    
    return () => clearTimeout(timer);
  }, [progress, isPaused]);
  
  const effectiveIsDarkMode = isDarkMode ?? themeDarkMode;
  const currentDetail = detailMessages?.[currentDetailIndex];
  const subMessage = currentDetail || 'Connecting to Helix systems...';

  return (
    <>
      <AppLoadingScreen
        stage={stage}
        progress={computedProgress}
        message={message}
        subMessage={subMessage}
        isPaused={isPaused}
      />
      {isPaused && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          background: 'rgba(0, 0, 0, 0.8)',
          color: 'white',
          padding: '8px 12px',
          borderRadius: '4px',
          fontSize: '12px',
          fontFamily: 'monospace',
          zIndex: 1001
        }}>
          DEMO PAUSED - Press SPACE to resume
        </div>
      )}
    </>
  );
};

export default Loading;
