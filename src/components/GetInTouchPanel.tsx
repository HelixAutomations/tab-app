import React, { useEffect, useState } from 'react';
import { useTheme } from '../app/functionality/ThemeContext';
import { colours } from '../app/styles/colours';
import TechIdeaForm from '../CustomForms/TechIdeaForm';
import TechProblemForm from '../CustomForms/TechProblemForm';
import { UserData } from '../app/functionality/types';

type GetInTouchView = 'menu' | 'problem' | 'idea';

type GetInTouchPanelVariant = 'default' | 'compact';

interface GetInTouchPanelProps {
  currentUser?: UserData;
  variant?: GetInTouchPanelVariant;
  fullWidth?: boolean;
  title?: string;
  disabled?: boolean;
}

const GetInTouchPanel: React.FC<GetInTouchPanelProps> = ({
  currentUser,
  variant = 'default',
  fullWidth = false,
  title = 'Get in touch',
  disabled = false,
}) => {
  const { isDarkMode } = useTheme();
  const [view, setView] = useState<GetInTouchView>('menu');

  const isCompact = variant === 'compact';

  useEffect(() => {
    if (disabled && view !== 'menu') {
      setView('menu');
    }
  }, [disabled, view]);

  if (view === 'problem') {
    if (disabled) {
      return null;
    }
    return <TechProblemForm currentUser={currentUser} onBack={() => setView('menu')} />;
  }

  if (view === 'idea') {
    if (disabled) {
      return null;
    }
    return <TechIdeaForm currentUser={currentUser} onBack={() => setView('menu')} />;
  }

  return (
    <div
      style={{
        marginTop: isCompact ? '12px' : '16px',
        padding: isCompact ? '12px' : '16px',
        width: fullWidth ? '100%' : undefined,
        background: isDarkMode ? 'rgba(15, 23, 42, 0.55)' : 'rgba(255, 255, 255, 0.7)',
        border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.18)' : 'rgba(15, 23, 42, 0.08)'}`,
        borderRadius: '8px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: isCompact ? '8px' : '10px' }}>
        <span style={{ fontSize: isCompact ? '11px' : '12px', fontWeight: 700, color: isDarkMode ? colours.dark.text : colours.light.text }}>
          {title}
        </span>
        {!isCompact && !disabled && (
          <span style={{ fontSize: '10px', color: isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(15, 23, 42, 0.6)' }}>
            Choose a form
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', width: '100%' }}>
        <button
          onClick={disabled ? undefined : () => setView('problem')}
          disabled={disabled}
          style={{
            padding: isCompact ? '7px 10px' : '8px 12px',
            borderRadius: '6px',
            border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.28)' : 'rgba(15, 23, 42, 0.12)'}`,
            background: isDarkMode ? 'rgba(7, 16, 32, 0.7)' : 'rgba(255, 255, 255, 0.9)',
            color: isDarkMode ? 'rgba(226, 232, 240, 0.9)' : 'rgba(15, 23, 42, 0.8)',
            fontSize: isCompact ? '10px' : '11px',
            fontWeight: 600,
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.55 : 1,
            flex: fullWidth ? 1 : undefined,
            minWidth: fullWidth ? 0 : undefined,
          }}
        >
          Report a technical problem
        </button>

        <button
          onClick={disabled ? undefined : () => setView('idea')}
          disabled={disabled}
          style={{
            padding: isCompact ? '7px 10px' : '8px 12px',
            borderRadius: '6px',
            border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.28)' : 'rgba(15, 23, 42, 0.12)'}`,
            background: isDarkMode ? 'rgba(7, 16, 32, 0.7)' : 'rgba(255, 255, 255, 0.9)',
            color: isDarkMode ? 'rgba(226, 232, 240, 0.9)' : 'rgba(15, 23, 42, 0.8)',
            fontSize: isCompact ? '10px' : '11px',
            fontWeight: 600,
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.55 : 1,
            flex: fullWidth ? 1 : undefined,
            minWidth: fullWidth ? 0 : undefined,
          }}
        >
          Submit an idea
        </button>
      </div>
    </div>
  );
};

export default GetInTouchPanel;
