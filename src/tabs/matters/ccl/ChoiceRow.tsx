import React from 'react';
import { colours } from '../../../app/styles/colours';

interface ChoiceRowProps {
  label: string;
  value: string | null;
  options: { key: string; label: string }[];
  onChange: (key: string) => void;
  isDarkMode: boolean;
}

const ChoiceRow: React.FC<ChoiceRowProps> = ({ label, value, options, onChange, isDarkMode }) => {
  const text = isDarkMode ? '#f1f5f9' : '#1e293b';
  const textMuted = isDarkMode ? '#94a3b8' : '#64748b';
  const accentBlue = colours.highlight;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: text, minWidth: 100 }}>{label}</span>
      <div style={{ display: 'flex', gap: 4 }}>
        {options.map((opt) => {
          const isActive = value === opt.key;
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => onChange(opt.key)}
              style={{
                padding: '4px 12px', borderRadius: 2,
                fontSize: 11, fontWeight: isActive ? 700 : 500,
                background: isActive
                  ? (isDarkMode ? 'rgba(54,144,206,0.2)' : 'rgba(54,144,206,0.12)')
                  : 'transparent',
                border: `1px solid ${isActive
                  ? (isDarkMode ? 'rgba(54,144,206,0.4)' : 'rgba(54,144,206,0.3)')
                  : (isDarkMode ? 'rgba(54,144,206,0.15)' : 'rgba(148,163,184,0.2)')}`,
                color: isActive ? accentBlue : textMuted,
                cursor: 'pointer', transition: 'all 0.12s ease',
                fontFamily: 'inherit',
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default ChoiceRow;
