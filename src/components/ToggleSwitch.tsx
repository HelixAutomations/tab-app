import React, { useCallback } from 'react';
import { useTheme } from '../app/functionality/ThemeContext';
import { colours } from '../app/styles/colours';

export interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  id?: string;
  disabled?: boolean;
  onText?: string; // optional inline text when ON
  offText?: string; // optional inline text when OFF
  size?: 'sm' | 'md';
  ariaLabel?: string; // a11y label if no visible text
  title?: string;
  style?: React.CSSProperties;
}

/**
 * Accessible, theme‑aware toggle switch (iOS style) for boolean state.
 * Renders a button with role="switch" and keyboard support (Space / Enter).
 */
const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
  checked,
  onChange,
  id,
  disabled = false,
  onText,
  offText,
  size = 'md',
  ariaLabel,
  title,
  style,
}) => {
  const { isDarkMode } = useTheme();

  const trackHeight = size === 'sm' ? 18 : 22;
  const trackWidth = size === 'sm' ? 36 : 44;
  const knobSize = size === 'sm' ? 14 : 18;
  const padding = (trackHeight - knobSize) / 2;

  const handleToggle = useCallback(() => {
    if (disabled) return;
    onChange(!checked);
  }, [disabled, checked, onChange]);

  const handleKey = useCallback((e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      handleToggle();
    }
  }, [handleToggle]);

  // Force consistent blue highlight (ignore CTA red)
  const onColour = colours.highlight;
  const offColour = isDarkMode ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.22)';
  const focusRing = isDarkMode ? '0 0 0 3px rgba(255,255,255,0.25)' : '0 0 0 3px rgba(0,0,0,0.15)';

  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      title={title}
      onClick={handleToggle}
      onKeyDown={handleKey}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'flex-start',
        width: trackWidth + (onText || offText ? (size === 'sm' ? 42 : 52) : 0),
        minWidth: trackWidth,
        height: trackHeight,
        padding: 0,
        margin: 0,
        border: 'none',
        background: 'transparent',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'Raleway, sans-serif',
        fontSize: size === 'sm' ? 11 : 12,
        color: isDarkMode ? colours.dark.text : colours.light.text,
        gap: 6,
        ...style,
      }}
    >
      {/* Track */}
      <span
        style={{
          position: 'relative',
          width: trackWidth,
            height: trackHeight,
          background: checked ? onColour : offColour,
          borderRadius: trackHeight,
          transition: 'background 180ms ease',
          boxShadow: isDarkMode ? 'inset 0 0 0 1px rgba(255,255,255,0.08)' : 'inset 0 0 0 1px rgba(0,0,0,0.08)',
        }}
      >
        {/* Knob */}
        <span
          style={{
            position: 'absolute',
            top: padding,
            left: padding,
            width: knobSize,
            height: knobSize,
            background: '#fff',
            borderRadius: '50%',
            transform: `translateX(${checked ? trackWidth - knobSize - padding * 2 : 0}px)`,
            transition: 'transform 180ms cubic-bezier(.4,.2,.2,1), background 180ms',
            boxShadow: '0 1px 2px rgba(0,0,0,0.25), 0 0 0 1px rgba(0,0,0,0.05)',
          }}
        />
      </span>
      {(onText || offText) && (
        <span
          style={{
            userSelect: 'none',
            fontWeight: 500,
            minWidth: size === 'sm' ? 32 : 40,
            textAlign: 'left',
            opacity: disabled ? 0.5 : 0.85,
            transition: 'color 180ms, opacity 180ms',
          }}
        >
          {checked ? onText : offText}
        </span>
      )}
      {/* Focus ring overlay */}
      <span
        className="toggle-focus-ring"
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: trackHeight,
          pointerEvents: 'none'
        }}
      />
      <style>{`
        button[id='${id || ''}']:focus-visible .toggle-focus-ring { box-shadow: ${focusRing}; }
        button[id='${id || ''}']:active span > span { filter: brightness(0.95); }
      `}</style>
    </button>
  );
};

export default ToggleSwitch;
