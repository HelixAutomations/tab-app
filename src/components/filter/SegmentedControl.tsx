import React, { useRef, useLayoutEffect, useState } from 'react';
import { useTheme } from '../../app/functionality/ThemeContext';
import { colours } from '../../app/styles/colours';

export interface SegmentedOption {
  key: string;
  label: string;
  badge?: number | string; // optional count / indicator
  disabled?: boolean;
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
 * Reusable segmented control (pill / tab-like) with animated thumb.
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
  style
}) => {
  const { isDarkMode } = useTheme();
  const height = size === 'sm' ? 30 : 36;
  const fontSize = size === 'sm' ? 11 : 13;
  const paddingX = 12;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [thumbRect, setThumbRect] = useState<{ left: number; width: number }>({ left: 2, width: 0 });

  const activeIndex = options.findIndex(o => o.key === value);

  const recalc = () => {
    const container = containerRef.current;
    const activeBtn = btnRefs.current[activeIndex];
    if (container && activeBtn) {
      const c = container.getBoundingClientRect();
      const b = activeBtn.getBoundingClientRect();
      setThumbRect({ left: b.left - c.left + 2, width: b.width - 4 });
    }
  };

  useLayoutEffect(() => { recalc(); }, [activeIndex, options, value, size]);
  useLayoutEffect(() => {
    window.addEventListener('resize', recalc);
    return () => window.removeEventListener('resize', recalc);
  }, []);

  return (
    <div
      id={id}
      role="tablist"
      aria-label={ariaLabel}
      style={{
        display: 'flex',
        position: 'relative',
        background: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
        borderRadius: pill ? height : 8,
        padding: 2,
        height,
        fontFamily: 'Raleway, sans-serif',
        userSelect: 'none',
        overflow: 'hidden',
        width: fullWidth ? '100%' : 'auto',
        ...style,
      }}
      ref={containerRef}
    >
      {activeIndex >= 0 && (
        <span
          aria-hidden="true"
          style={{
            pointerEvents: 'none',
            position: 'absolute',
            top: 2,
            height: height - 4,
            left: thumbRect.left,
            width: thumbRect.width,
            background: colours.highlight, // unified blue highlight
            borderRadius: pill ? height : 6,
            transition: 'left 240ms cubic-bezier(.4,.2,.2,1), width 240ms cubic-bezier(.4,.2,.2,1)',
            boxShadow: isDarkMode ? '0 2px 4px rgba(0,0,0,0.4)' : '0 2px 4px rgba(0,0,0,0.18)',
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
              gap: 6,
              background: 'transparent',
              border: 'none',
              cursor: opt.disabled ? 'not-allowed' : 'pointer',
              padding: `0 ${paddingX}px`,
              fontSize,
              fontWeight: 600,
              color: isActive ? '#fff' : (isDarkMode ? 'rgba(255,255,255,0.65)' : '#546178'),
              transition: 'color 160ms',
              minWidth: 0,
              whiteSpace: 'nowrap'
            }}
            ref={el => { btnRefs.current[idx] = el; }}
          >
            <span>{opt.label}</span>
            {typeof opt.badge !== 'undefined' && (
              <span style={{
                background: isActive ? (isDarkMode ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.35)') : (isDarkMode ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.12)'),
                color: isActive ? (isDarkMode ? '#fff' : '#132343') : (isDarkMode ? '#d8dfeb' : '#3d506a'),
                borderRadius: 12,
                padding: '2px 6px',
                fontSize: fontSize - 2,
                fontWeight: 600,
                lineHeight: 1,
              }}>{opt.badge}</span>
            )}
          </button>
        );
      })}
    </div>
  );
};

export default SegmentedControl;
