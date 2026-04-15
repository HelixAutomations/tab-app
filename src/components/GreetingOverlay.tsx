import React from 'react';
import { useTheme } from '../app/functionality/ThemeContext';
import { colours } from '../app/styles/colours';

interface GreetingOverlayProps {
  userName?: string | null;
  onDismiss: () => void;
}

// A lightweight, theme-aware full-viewport overlay shown once until dismissed.
// Persists dismissal outside via parent so we can coordinate other UI (like showing the theme toggle).
const GreetingOverlay: React.FC<GreetingOverlayProps> = ({ userName, onDismiss }) => {
  const { isDarkMode } = useTheme();

  const firstName = React.useMemo(() => {
    if (!userName) return '';
    const trimmed = userName.trim();
    if (!trimmed) return '';
    const token = trimmed.split(' ')[0];
    return token.charAt(0).toUpperCase() + token.slice(1);
  }, [userName]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Welcome"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 5000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backdropFilter: 'blur(2px)',
        background: isDarkMode
          ? 'linear-gradient(135deg, rgba(5,10,20,0.85) 0%, rgba(8,20,40,0.85) 100%)'
          : 'linear-gradient(135deg, rgba(255,255,255,0.85) 0%, rgba(245,247,250,0.9) 100%)',
        transition: 'opacity 180ms ease',
      }}
      onClick={(e) => {
        // Allow clicking outside the card to dismiss
        if (e.target === e.currentTarget) onDismiss();
      }}
    >
      <div
        style={{
          width: 'min(520px, 92vw)',
          borderRadius: 12,
          padding: '20px 18px',
          border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.10)' : 'rgba(6,23,51,0.12)'}`,
          boxShadow: isDarkMode
            ? '0 18px 42px rgba(0,0,0,0.45)'
            : '0 18px 42px rgba(6,23,51,0.12)',
          background: isDarkMode
            ? 'linear-gradient(180deg, rgba(15, 23, 42, 0.95) 0%, rgba(2, 6, 23, 0.95) 100%)'
            : 'linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(247, 249, 252, 0.98) 100%)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <span
            aria-hidden
            style={{
              display: 'inline-flex',
              width: 28,
              height: 28,
              borderRadius: 8,
              alignItems: 'center',
              justifyContent: 'center',
              background: isDarkMode ? 'rgba(59,130,246,0.18)' : 'rgba(37,99,235,0.12)',
              color: isDarkMode ? colours.accent : colours.highlight,
              boxShadow: isDarkMode ? 'inset 0 0 0 1px rgba(147,197,253,0.18)' : 'inset 0 0 0 1px rgba(29,78,216,0.15)',
              fontSize: 14,
            }}
          >
            ✨
          </span>
          <h2 style={{
            margin: 0,
            fontSize: 18,
            fontWeight: 700,
            color: isDarkMode ? colours.dark.text : colours.light.text,
            letterSpacing: 0.2,
          }}>
            {firstName ? `Welcome, ${firstName}!` : 'Welcome!'}
          </h2>
        </div>

        <p style={{
          margin: '0 0 14px 0',
          lineHeight: 1.4,
          color: isDarkMode ? 'rgba(226,232,240,0.86)' : 'rgba(15,23,42,0.86)',
          fontSize: 14,
        }}>
          Before we begin, a quick tip: you can switch between light and dark themes any time. We’ll show the toggle in a moment.
        </p>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onDismiss}
            autoFocus
            style={{
              appearance: 'none',
              border: 'none',
              borderRadius: 8,
              padding: '8px 12px',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              color: isDarkMode ? '#0B1220' : '#FFFFFF',
              background: isDarkMode
                ? `linear-gradient(135deg, ${colours.accent} 0%, ${colours.accent} 100%)`
                : `linear-gradient(135deg, ${colours.highlight} 0%, ${colours.highlight} 100%)`,
              boxShadow: isDarkMode
                ? '0 6px 16px rgba(96,165,250,0.28)'
                : '0 6px 16px rgba(29,78,216,0.24)',
            }}
          >
            Let’s go
          </button>
        </div>
      </div>
    </div>
  );
};

export default GreetingOverlay;
