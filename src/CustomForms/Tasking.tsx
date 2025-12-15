// src/Forms/Tasking.tsx
// invisible change

import React from 'react';
import { TooltipHost } from '@fluentui/react';
import { useTheme } from '../app/functionality/ThemeContext';
import { getFormModeToggleStyles } from './shared/formStyles';

const Tasking: React.FC = () => {
  const { isDarkMode } = useTheme();

  return (
    <div style={{ 
      width: '100%', 
      height: '100%',
      padding: '16px',
      boxSizing: 'border-box',
    }}>
      {/* Form Mode Toggle - Cognito/Bespoke */}
      <div style={getFormModeToggleStyles(isDarkMode).container}>
        <button 
          style={getFormModeToggleStyles(isDarkMode).option(true, false)}
          aria-pressed="true"
        >
          Cognito
        </button>
        <TooltipHost content="Bespoke version coming soon">
          <button 
            style={getFormModeToggleStyles(isDarkMode).option(false, true)}
            disabled
            aria-pressed="false"
          >
            Bespoke
          </button>
        </TooltipHost>
      </div>
      <iframe
        src="https://www.cognitoforms.com/f/QzaAr_2Q7kesClKq8g229g/90"
        allow="payment"
        style={{ 
          border: 0, 
          width: '100%', 
          height: '600px',
          borderRadius: '4px',
          background: isDarkMode ? '#1e293b' : '#ffffff',
        }}
        title="Create a Task"
      />
    </div>
  );
};

export default Tasking;
