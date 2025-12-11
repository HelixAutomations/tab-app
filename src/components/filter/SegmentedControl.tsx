import React, { useRef, useLayoutEffect, useState, useCallback } from 'react';
import { useTheme } from '../../app/functionality/ThemeContext';
import { colours } from '../../app/styles/colours';

export interface SegmentedOption {
  key: string;
  label: string;
  badge?: number | string; // optional count / indicator
  disabled?: boolean;
  icon?: React.ReactNode; // optional custom icon
}

interface SegmentedControlProps {
  value: string;
  onChange: (key: string) => void;
  options: SegmentedOption[];
  size?: 'sm' | 'md';
  ariaLabel?: string;
  fullWidth?: boolean;
  pill?: boolean;
  id?: string;
  style?: React.CSSProperties;
}

/**
 * Apple-style segmented control with clean aesthetics and proper spacing
 */
const SegmentedControl: React.FC<SegmentedControlProps> = ({
  value,
  onChange,
  options,
  size = 'sm',
  ariaLabel,
  fullWidth = false,
  pill = true,
  id,
  style,
}) => {
  const { isDarkMode } = useTheme();
  const height = size === 'sm' ? 32 : 36;
  const fontSize = size === 'sm' ? 12 : 13;
  const paddingX = 12;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [thumbRect, setThumbRect] = useState<{ left: number; width: number }>({ left: 4, width: 0 });

  const activeIndex = options.findIndex((o) => o.key === value);

  const recalc = useCallback(() => {
    const container = containerRef.current;
    const activeBtn = btnRefs.current[activeIndex];
    if (container && activeBtn) {
      const c = container.getBoundingClientRect();
      const b = activeBtn.getBoundingClientRect();
  // Align left to container padding (4px) without double-adding; maintain 4px inset on both sides
  const left = Math.round(b.left - c.left);
  const width = Math.max(0, Math.round(b.width));
  setThumbRect({ left, width });
    }
  }, [activeIndex]);

  useLayoutEffect(() => {
    recalc();
  }, [recalc, activeIndex, options, value, size]);

  useLayoutEffect(() => {
    window.addEventListener('resize', recalc);
    return () => window.removeEventListener('resize', recalc);
  }, [recalc]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const idx = options.findIndex((o) => o.key === value);
      if (idx < 0) return;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        for (let i = idx + 1; i < options.length; i++) {
          if (!options[i].disabled) {
            onChange(options[i].key);
            break;
          }
        }
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        for (let i = idx - 1; i >= 0; i--) {
          if (!options[i].disabled) {
            onChange(options[i].key);
            break;
          }
        }
      }
    },
    [options, onChange, value]
  );

  return (
    <div
      id={id}
      role="tablist"
      aria-label={ariaLabel}
      ref={containerRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      style={{
        display: 'flex',
        position: 'relative',
        background: isDarkMode
          ? 'rgba(255,255,255,0.06)'
          : 'rgba(0,0,0,0.04)',
        borderRadius: pill ? height / 2 : 10,
        padding: 4,
        height,
        fontFamily: 'Raleway, sans-serif',
        userSelect: 'none',
        overflow: 'hidden',
        width: fullWidth ? '100%' : 'auto',
        boxShadow: 'none',
        ...style,
      }}
    >
      {/* Apple-style thumb with matching inner radius (outer radius - padding) */}
      {activeIndex >= 0 && (
        <span
          aria-hidden="true"
          style={{
            pointerEvents: 'none',
            position: 'absolute',
            top: 4,
            height: Math.max(0, height - 8),
            left: thumbRect.left,
            width: thumbRect.width,
            background: '#FFFFFF',
            borderRadius: pill ? (height - 8) / 2 : 8,
            transition:
              'left 250ms cubic-bezier(0.25, 0.46, 0.45, 0.94), width 250ms cubic-bezier(0.25, 0.46, 0.45, 0.94)',
            boxShadow: isDarkMode
              ? '0 1px 3px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.24)'
              : '0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.08)',
          }}
        />
      )}
      {/* Options */}
      {options.map((opt, idx) => {
        const isActive = opt.key === value;
        return (
          <button
            key={opt.key}
            role="tab"
            aria-selected={isActive}
            disabled={opt.disabled}
            onClick={() => !opt.disabled && onChange(opt.key)}
            style={{
              position: 'relative',
              zIndex: 1,
              flex: fullWidth ? 1 : undefined,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 5,
              background: 'transparent',
              border: 'none',
              cursor: opt.disabled ? 'not-allowed' : 'pointer',
              padding: `0 ${paddingX}px`,
              fontSize,
              fontWeight: 500,
              color: opt.disabled
                ? (isDarkMode ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.25)')
                : isActive
                ? (isDarkMode ? '#1f2937' : '#1f2937')
                : isDarkMode
                ? 'rgba(255,255,255,0.70)'
                : 'rgba(0,0,0,0.55)',
              transition: 'color 200ms ease',
              minWidth: 0,
              whiteSpace: 'nowrap',
              outline: 'none',
            }}
            ref={el => { btnRefs.current[idx] = el; }}
            onFocus={(e) => {
              const parent = containerRef.current;
              if (parent) parent.style.boxShadow = isDarkMode
                ? '0 0 0 2px rgba(54,144,206,.35)'
                : '0 0 0 2px rgba(54,144,206,.25)';
            }}
            onBlur={(e) => {
              const parent = containerRef.current;
              if (parent && !parent.contains(e.relatedTarget as Node)) {
                parent.style.boxShadow = 'none';
              }
            }}
          >
            {opt.icon && (
              <span style={{ 
                display: 'flex', 
                alignItems: 'center',
                color: opt.disabled
                  ? (isDarkMode ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.25)')
                  : isActive
                  ? '#1f2937'
                  : isDarkMode
                  ? 'rgba(255,255,255,0.70)'
                  : 'rgba(0,0,0,0.55)',
              }}>
                {opt.icon}
              </span>
            )}
            <span>{opt.label}</span>
            {typeof opt.badge !== 'undefined' && (
              <span style={{
                background: isActive
                  ? (isDarkMode ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.08)')
                  : (isDarkMode
                    ? 'rgba(255,255,255,0.15)'
                    : 'rgba(0,0,0,0.06)'),
                color: isActive
                  ? (isDarkMode ? '#1f2937' : '#1f2937')
                  : (isDarkMode ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.65)'),
                borderRadius: 8,
                padding: '2px 6px',
                fontSize: fontSize - 2,
                fontWeight: 600,
                lineHeight: 1.2,
              }}>{opt.badge}</span>
            )}
          </button>
        );
      })}
    </div>
  );
};

export default SegmentedControl;
