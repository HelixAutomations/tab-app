import React, { useEffect, useState } from 'react';
import { useTheme } from '../../app/functionality/ThemeContext';
import { colours } from '../../app/styles/colours';

interface AppLoadingScreenProps {
  stage?: 'initializing' | 'authenticating' | 'loading-data' | 'finalizing';
  progress?: number;
  message?: string;
  subMessage?: string;
  isPaused?: boolean;
}

/**
 * Sophisticated app loading screen with animated stages
 */
const AppLoadingScreen: React.FC<AppLoadingScreenProps> = ({
  stage = 'initializing',
  progress = 0,
  message = 'Helix Hub Starting',
  subMessage = 'Preparing your workspace',
  isPaused = false
}) => {
  const { isDarkMode } = useTheme();
  const [animatedProgress, setAnimatedProgress] = useState(0);
  const [microProcessIndex, setMicroProcessIndex] = useState(0);
  
  // Clean three-process progression with variable timing
  const microProcesses = [
    { text: 'Connecting', duration: 1800 },
    { text: 'Loading workspace', duration: 2200 },
    { text: 'Ready', duration: 1500 }
  ];
  
  // Current progress state
  const completedCount = Math.min(microProcessIndex + 1, 3);
  const currentProcess = microProcesses[microProcessIndex] || microProcesses[0];
  
  // Stage-specific messaging
  const getStageMessage = () => {
    switch (stage) {
      case 'initializing':
        return 'Initialising Helix Hub';
      case 'authenticating':  
        return 'Authenticating session';
      case 'loading-data':
        return 'Loading workspace data';
      case 'finalizing':
        return 'Finalising setup';
      default:
        return message || 'Loading Helix Hub';
    }
  };
  
  const getStageSubMessage = () => {
    // Dynamic sub-message based on micro-process progression
    const processMessages: Record<string, string[]> = {
      'initializing': ['Setting up environment', 'Configuring resources', 'Ready to proceed'],
      'authenticating': ['Verifying credentials', 'Validating session', 'Authentication complete'],
      'loading-data': ['Connecting to services', 'Syncing latest updates', 'Data loaded successfully'],
      'finalizing': ['Composing interface', 'Initialising components', 'Almost ready']
    };

    const messages = processMessages[stage] || [subMessage, 'Loading...', 'Complete'];
    return messages[microProcessIndex] || messages[0];
  };
  
  // Animate progress bar
  useEffect(() => {
    if (isPaused) return;
    
    const timer = setTimeout(() => {
      setAnimatedProgress(progress);
    }, 100);
    return () => clearTimeout(timer);
  }, [progress, isPaused]);
  
  // Variable timing micro-process progression 
  useEffect(() => {
    if (isPaused) return;
    
    const currentDuration = microProcesses[microProcessIndex]?.duration || 2000;
    
    const timeout = setTimeout(() => {
      setMicroProcessIndex(prev => (prev + 1) % 3);
    }, currentDuration);
    
    return () => clearTimeout(timeout);
  }, [microProcessIndex, isPaused]);
  
  const helixMark = () => {
    const markColor = isDarkMode ? '#ffffff' : '#061733';
    
    return (
      <svg width="32" height="56" viewBox="0 0 57.56 100" fill="none">
        <path fill={markColor} d="M57.56,13.1c0,7.27-7.6,10.19-11.59,11.64-4,1.46-29.98,11.15-34.78,13.1C6.4,39.77,0,41.23,0,48.5v-13.1C0,28.13,6.4,26.68,11.19,24.74c4.8-1.94,30.78-11.64,34.78-13.1,4-1.45,11.59-4.37,11.59-11.64v13.09h0Z"/>
        <path fill={markColor} d="M57.56,38.84c0,7.27-7.6,10.19-11.59,11.64s-29.98,11.16-34.78,13.1c-4.8,1.94-11.19,3.4-11.19,10.67v-13.1c0-7.27,6.4-8.73,11.19-10.67,4.8-1.94,30.78-11.64,34.78-13.1,4-1.46,11.59-4.37,11.59-11.64v13.09h0Z"/>
        <path fill={markColor} d="M57.56,64.59c0,7.27-7.6,10.19-11.59,11.64-4,1.46-29.98,11.15-34.78,13.1-4.8,1.94-11.19,3.39-11.19,10.67v-13.1c0-7.27,6.4-8.73,11.19-10.67,4.8-1.94,30.78-11.64,34.78-13.1,4-1.45,11.59-4.37,11.59-11.64v13.1h0Z"/>
      </svg>
    );
  };
  
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
      background: isDarkMode 
        ? colours.dark.background
        : colours.light.background,
      color: isDarkMode ? colours.dark.text : colours.light.text,
      fontFamily: "'Raleway', -apple-system, BlinkMacSystemFont, sans-serif",
      zIndex: 1000,
      animation: 'appLoadingScreenEnter 260ms ease-out both',
      willChange: 'opacity',
    }}>

      
      {/* Content */}
      <div style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        textAlign: 'center',
        zIndex: 1
      }}>
        {/* Helix Mark — single calm breathing animation on the mark only
            (counter-pulsing the outer card + inner mark made the logo wobble). */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 80,
          height: 80,
          borderRadius: 0,
          background: isDarkMode ? colours.darkBlue : colours.light.cardBackground,
          border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.25)' : colours.light.border}`,
          color: isDarkMode ? colours.accent : colours.highlight,
          marginBottom: 32,
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* Soft ambient glow that drifts behind the mark */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: -2,
              background: `radial-gradient(circle at 50% 50%, ${isDarkMode ? 'rgba(135, 243, 243, 0.18)' : 'rgba(54, 144, 206, 0.14)'}, transparent 70%)`,
              animation: 'appLoadingGlow 3.2s ease-in-out infinite',
              pointerEvents: 'none',
            }}
          />
          <div style={{ animation: 'appLoadingMarkBreathe 3.2s ease-in-out infinite', position: 'relative' }}>
            {helixMark()}
          </div>
        </div>
        
        {/* Operation Progress */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 16,
          minWidth: 280
        }}>
          {/* Current Operation */}
          <div style={{
            textAlign: 'center',
            marginBottom: 8
          }}>
            <div style={{
              fontSize: 15,
              fontWeight: '600',
              color: isDarkMode ? colours.dark.text : colours.light.text,
              marginBottom: 6,
              letterSpacing: '-0.1px'
            }}>
              {getStageMessage()}
            </div>
            <div
              key={`${stage}-${microProcessIndex}`}
              style={{
                fontSize: 12,
                color: isDarkMode ? colours.subtleGrey : colours.greyText,
                fontWeight: '500',
                marginBottom: 10,
                animation: 'appLoadingSubFade 360ms ease-out both',
              }}
            >
              {getStageSubMessage()}
            </div>
            {/* Travelling highlight across three dots — no abrupt reset on loop. */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6
            }}>
              {[0, 1, 2].map(i => {
                const isActive = microProcessIndex === i;
                return (
                  <div
                    key={i}
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: '50%',
                      background: isActive
                        ? (isDarkMode ? colours.accent : colours.highlight)
                        : (isDarkMode ? 'rgba(54, 144, 206, 0.28)' : colours.light.border),
                      transform: isActive ? 'scale(1.35)' : 'scale(1)',
                      boxShadow: isActive
                        ? `0 0 6px ${isDarkMode ? 'rgba(135, 243, 243, 0.45)' : 'rgba(54, 144, 206, 0.35)'}`
                        : 'none',
                      transition: 'transform 0.4s cubic-bezier(0.22, 1, 0.36, 1), background 0.4s ease, box-shadow 0.4s ease',
                    }}
                  />
                );
              })}
            </div>
          </div>
          
          {/* Progress indicator — determinate fill plus a subtle indeterminate
              shimmer so the bar stays alive between real updates. */}
          <div style={{
            width: '100%',
            height: 2,
            background: isDarkMode ? 'rgba(54, 144, 206, 0.15)' : colours.light.border,
            borderRadius: 0,
            overflow: 'hidden',
            position: 'relative'
          }}>
            <div style={{
              height: '100%',
              background: isDarkMode ? colours.accent : colours.highlight,
              borderRadius: 0,
              width: `${Math.max(5, animatedProgress)}%`,
              transition: 'width 0.8s cubic-bezier(0.22, 1, 0.36, 1)'
            }} />
            <div
              aria-hidden
              style={{
                position: 'absolute',
                inset: 0,
                background: `linear-gradient(90deg, transparent 0%, ${isDarkMode ? 'rgba(135, 243, 243, 0.45)' : 'rgba(54, 144, 206, 0.35)'} 50%, transparent 100%)`,
                animation: 'appLoadingBarShimmer 1.8s linear infinite',
                pointerEvents: 'none',
              }}
            />
          </div>
        </div>
      </div>
      
      <style>{`
        @keyframes appLoadingScreenEnter {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes appLoadingMarkBreathe {
          0%, 100% {
            transform: scale(1);
            opacity: 1;
          }
          50% {
            transform: scale(1.04);
            opacity: 0.94;
          }
        }
        @keyframes appLoadingGlow {
          0%, 100% { opacity: 0.55; transform: scale(0.96); }
          50%      { opacity: 1;    transform: scale(1.08); }
        }
        @keyframes appLoadingBarShimmer {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        @keyframes appLoadingSubFade {
          from { opacity: 0; transform: translateY(3px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          div[style*="appLoadingMarkBreathe"],
          div[style*="appLoadingGlow"],
          div[style*="appLoadingBarShimmer"],
          div[style*="appLoadingSubFade"],
          div[style*="appLoadingScreenEnter"] {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
};

export default AppLoadingScreen;
