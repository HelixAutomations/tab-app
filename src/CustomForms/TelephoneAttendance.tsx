// src/Forms/TelephoneAttendance.tsx
// invisible change

import React from 'react';
import { useTheme } from '../app/functionality/ThemeContext';

const TelephoneAttendance: React.FC = () => {
  const { isDarkMode } = useTheme();

  return (
    <div style={{ 
      width: '100%', 
      height: '100%',
      padding: '16px',
      boxSizing: 'border-box',
    }}>
      <iframe
        src="https://www.cognitoforms.com/f/QzaAr_2Q7kesClKq8g229g/41"
        allow="payment"
        style={{ 
          border: 0, 
          width: '100%', 
          height: '600px',
          borderRadius: '4px',
          background: isDarkMode ? '#061733' : '#ffffff',
        }}
        title="Telephone Attendance"
      />
    </div>
  );
};

export default TelephoneAttendance;
