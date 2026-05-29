// src/CustomForms/shared/RecordPicker.tsx
//
// Shared lookup widget used by Helix forms. Supports two modes:
//   - "sync": filter an in-memory list (e.g. claimed matters).
//   - "async": call a server-backed search function with debouncing.
//
// In both modes the field exposes an explicit busy state, an open dropdown,
// keyboard-friendly selection, and "no matches" microcopy so users are never
// left wondering whether something is happening.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@fluentui/react/lib/Icon';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';
import './RecordPicker.css';

export interface PickerOption {
  id: string;
  label: string;
  sublabel?: string;
  meta?: string;
  badge?: string;
  badgeTone?: 'neutral' | 'info' | 'warning';
  raw?: unknown;
}

interface BaseProps {
  value: string;
  onTextChange: (text: string) => void;
  onSelect: (option: PickerOption) => void;
  placeholder?: string;
  isDarkMode: boolean;
  disabled?: boolean;
  emptyMessage?: string;
  busyMessage?: string;
  maxHeight?: number;
  fontFamily?: string;
  ariaLabel?: string;
}

type Props = BaseProps & (
  | { mode: 'sync'; options: PickerOption[]; minChars?: number }
  | { mode: 'async'; search: (query: string) => Promise<PickerOption[]>; debounceMs?: number; minChars?: number }
);

const containerStyle: React.CSSProperties = { position: 'relative', width: '100%' };

function inputStyle(font?: string): React.CSSProperties {
  return {
    width: '100%',
    height: '44px',
    border: '1px solid var(--home-tile-border)',
    background: 'var(--surface-card)',
    padding: '0 40px 0 12px',
    fontFamily: font || 'inherit',
    fontSize: '14px',
    color: 'var(--text-primary)',
    outline: 'none',
    boxSizing: 'border-box',
  };
}

function dropdownStyle(maxHeight: number, isDarkMode: boolean): React.CSSProperties {
  return {
    position: 'absolute',
    top: 'calc(100% + 4px)',
    left: 0,
    right: 0,
    background: 'var(--surface-card)',
    border: '1px solid var(--home-tile-border)',
    maxHeight,
    overflowY: 'auto',
    zIndex: 20,
    boxShadow: isDarkMode
      ? '0 6px 18px rgba(0,0,0,0.45)'
      : '0 6px 18px rgba(15, 23, 42, 0.12)',
  };
}

const optionStyle: React.CSSProperties = {
  padding: '10px 12px',
  cursor: 'pointer',
  borderBottom: '1px solid var(--home-tile-border)',
  fontSize: '13px',
  color: 'var(--text-primary)',
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
};

const statusRowStyle: React.CSSProperties = {
  padding: '10px 12px',
  fontSize: '12px',
  color: 'var(--text-muted)',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
};

function badgeStyle(tone: PickerOption['badgeTone']): React.CSSProperties {
  const palette: Record<NonNullable<PickerOption['badgeTone']>, { bg: string; fg: string }> = {
    neutral: { bg: 'var(--surface-muted, rgba(148,163,184,0.18))', fg: 'var(--text-muted)' },
    info: { bg: 'rgba(37,99,235,0.12)', fg: '#2563eb' },
    warning: { bg: 'rgba(217,119,6,0.15)', fg: '#b45309' },
  };
  const colours = palette[tone || 'neutral'];
  return {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '1px 6px',
    fontSize: '10px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    background: colours.bg,
    color: colours.fg,
    marginLeft: '6px',
  };
}

const RecordPicker: React.FC<Props> = (props) => {
  const {
    value,
    onTextChange,
    onSelect,
    placeholder,
    isDarkMode,
    disabled,
    emptyMessage = 'No matches found',
    busyMessage = 'Searching...',
    maxHeight = 280,
    fontFamily,
    ariaLabel,
  } = props;

  const [open, setOpen] = useState(false);
  const [asyncOptions, setAsyncOptions] = useState<PickerOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const minChars = props.minChars ?? 2;

  // Close on outside click.
  useEffect(() => {
    if (!open) return undefined;
    const handler = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Async search with debouncing.
  useEffect(() => {
    if (props.mode !== 'async') return undefined;
    const trimmed = value.trim();
    if (trimmed.length < minChars) {
      setAsyncOptions([]);
      setBusy(false);
      return undefined;
    }
    let cancelled = false;
    setBusy(true);
    const t = setTimeout(async () => {
      try {
        const results = await props.search(trimmed);
        if (!cancelled) setAsyncOptions(results);
      } catch {
        if (!cancelled) setAsyncOptions([]);
      } finally {
        if (!cancelled) setBusy(false);
      }
    }, props.debounceMs ?? 250);
    return () => { cancelled = true; clearTimeout(t); setBusy(false); };
  }, [props.mode, value, minChars, props]);

  const filteredSync = useMemo(() => {
    if (props.mode !== 'sync') return [];
    const trimmed = value.trim().toLowerCase();
    if (!trimmed) return props.options.slice(0, 50);
    return props.options.filter((opt) => {
      return (
        opt.label.toLowerCase().includes(trimmed)
        || (opt.sublabel || '').toLowerCase().includes(trimmed)
        || (opt.meta || '').toLowerCase().includes(trimmed)
      );
    }).slice(0, 50);
  }, [props, value]);

  const visibleOptions = props.mode === 'sync' ? filteredSync : asyncOptions;
  const showEmpty = open
    && !busy
    && touched
    && value.trim().length >= minChars
    && visibleOptions.length === 0;

  const handleSelect = useCallback((option: PickerOption) => {
    onSelect(option);
    setOpen(false);
  }, [onSelect]);

  return (
    <div ref={containerRef} style={containerStyle}>
      <input
        type="text"
        value={value}
        disabled={disabled}
        onChange={(e) => {
          onTextChange(e.target.value);
          setOpen(true);
          setTouched(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        style={inputStyle(fontFamily)}
      />
      <div style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
        {busy
          ? <Spinner size={SpinnerSize.xSmall} ariaLabel={busyMessage} />
          : <Icon iconName="Search" style={{ fontSize: '14px', color: 'var(--text-muted)' }} />}
      </div>

      {open && (busy || visibleOptions.length > 0 || showEmpty) && (
        <div className="record-picker-dropdown" style={dropdownStyle(maxHeight, isDarkMode)} role="listbox">
          {busy && (
            <div style={statusRowStyle}>
              <Spinner size={SpinnerSize.xSmall} />
              <span>{busyMessage}</span>
            </div>
          )}
          {!busy && visibleOptions.map((option) => (
            <div
              key={option.id}
              role="option"
              aria-selected={false}
              onClick={() => handleSelect(option)}
              style={optionStyle}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = isDarkMode
                  ? 'rgba(255,255,255,0.05)'
                  : 'rgba(0,0,0,0.03)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', fontWeight: 600 }}>
                <span>{option.label}</span>
                {option.badge && <span style={badgeStyle(option.badgeTone)}>{option.badge}</span>}
              </div>
              {option.sublabel && (
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{option.sublabel}</div>
              )}
              {option.meta && (
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{option.meta}</div>
              )}
            </div>
          ))}
          {showEmpty && (
            <div style={statusRowStyle}>
              <Icon iconName="Info" style={{ fontSize: '12px' }} />
              <span>{emptyMessage}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default RecordPicker;
