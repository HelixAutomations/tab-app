import React, { useState } from 'react';
import { Icon } from '@fluentui/react';
import { colours } from '../../../app/styles/colours';

export interface CCLField {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'select';
  required?: boolean;
  placeholder?: string;
  autoFilled?: boolean;
  options?: { key: string; text: string }[];
}

interface FieldInputProps {
  field: CCLField;
  value: string;
  onChange: (v: string) => void;
  isDarkMode: boolean;
  inputBg: string;
  inputBorder: string;
  text: string;
  textMuted: string;
}

const FieldInput: React.FC<FieldInputProps> = ({
  field, value, onChange, isDarkMode, inputBg, inputBorder, text, textMuted,
}) => {
  const [focused, setFocused] = useState(false);
  const accentBlue = colours.highlight;
  const activeBorder = focused
    ? (isDarkMode ? 'rgba(54,144,206,0.5)' : 'rgba(54,144,206,0.4)')
    : inputBorder;

  const commonInputStyle: React.CSSProperties = {
    width: '100%',
    padding: '7px 10px',
    background: inputBg,
    border: `1px solid ${activeBorder}`,
    borderRadius: 2,
    color: text,
    fontSize: 12,
    fontFamily: "'Segoe UI', -apple-system, sans-serif",
    outline: 'none',
    transition: 'border-color 0.12s ease',
    boxSizing: 'border-box' as const,
  };

  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4,
      }}>
        <label style={{
          fontSize: 11, fontWeight: 600, color: text,
        }}>
          {field.label}
        </label>
        {field.required && (
          <span style={{ fontSize: 10, color: colours.cta, fontWeight: 700 }}>*</span>
        )}
        {field.autoFilled && value && (
          <span style={{
            fontSize: 9, fontWeight: 600, padding: '1px 5px', borderRadius: 2,
            background: isDarkMode ? 'rgba(54,144,206,0.12)' : 'rgba(54,144,206,0.08)',
            color: accentBlue, marginLeft: 4,
          }}>
            AUTO
          </span>
        )}
      </div>
      {field.type === 'textarea' ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={field.placeholder}
          rows={3}
          style={{
            ...commonInputStyle,
            resize: 'vertical' as const,
            minHeight: 60,
          }}
        />
      ) : field.type === 'select' && field.options ? (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            ...commonInputStyle,
            cursor: 'pointer',
            backgroundColor: inputBg,
          }}
        >
          <option value="">— Select —</option>
          {field.options.map((opt) => (
            <option key={opt.key} value={opt.key}>{opt.text}</option>
          ))}
        </select>
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={field.placeholder}
          style={commonInputStyle}
        />
      )}
    </div>
  );
};

export default FieldInput;
