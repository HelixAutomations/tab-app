import React from 'react';
import './CompactOptionStrip.css';

export type CompactOptionStripItem<Key extends string = string> = {
  key: Key;
  label: string;
  icon?: React.ReactNode;
  count?: number | string;
  badge?: string;
  tone?: string;
  title?: string;
  disabled?: boolean;
  state?: 'default' | 'active' | 'done';
};

interface CompactOptionStripProps<Key extends string = string> {
  items: CompactOptionStripItem<Key>[];
  selectedKey?: Key | null;
  onSelect: (key: Key) => void;
  ariaLabel: string;
  className?: string;
}

type StripStyle = React.CSSProperties & {
  '--strip-tone'?: string;
  '--strip-tone-soft'?: string;
  '--strip-tone-soft-strong'?: string;
  '--strip-tone-border'?: string;
};

function toAlphaColour(colour: string | undefined, alpha: number, fallback: string): string {
  if (!colour) return fallback;
  const normalised = colour.trim();
  const shortHex = /^#([\da-f]{3})$/i.exec(normalised);
  const longHex = /^#([\da-f]{6})$/i.exec(normalised);

  if (shortHex) {
    const expanded = shortHex[1].split('').map((part) => `${part}${part}`).join('');
    const red = parseInt(expanded.slice(0, 2), 16);
    const green = parseInt(expanded.slice(2, 4), 16);
    const blue = parseInt(expanded.slice(4, 6), 16);
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
  }

  if (longHex) {
    const hex = longHex[1];
    const red = parseInt(hex.slice(0, 2), 16);
    const green = parseInt(hex.slice(2, 4), 16);
    const blue = parseInt(hex.slice(4, 6), 16);
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
  }

  return fallback;
}

export default function CompactOptionStrip<Key extends string = string>({
  items,
  selectedKey = null,
  onSelect,
  ariaLabel,
  className,
}: CompactOptionStripProps<Key>) {
  return (
    <div className={["compact-option-strip", className].filter(Boolean).join(' ')} aria-label={ariaLabel}>
      {items.map((item) => {
        const isSelected = item.key === selectedKey;
        const itemState = item.state || (isSelected ? 'active' : 'default');
        const style: StripStyle = {
          '--strip-tone': item.tone || 'var(--text-accent)',
          '--strip-tone-soft': toAlphaColour(item.tone, 0.08, 'rgba(var(--subtle-grey-rgb), 0.08)'),
          '--strip-tone-soft-strong': toAlphaColour(item.tone, 0.14, 'rgba(var(--subtle-grey-rgb), 0.14)'),
          '--strip-tone-border': toAlphaColour(item.tone, itemState === 'active' || isSelected ? 0.62 : 0.28, 'rgba(var(--subtle-grey-rgb), 0.18)'),
        };

        return (
          <button
            key={item.key}
            type="button"
            className="compact-option-strip__item"
            data-selected={isSelected}
            data-state={itemState}
            title={item.title || item.label}
            aria-label={item.title || item.label}
            aria-pressed={isSelected}
            disabled={item.disabled}
            style={style}
            onClick={() => {
              if (!item.disabled) onSelect(item.key);
            }}
            onMouseDown={(e) => { e.currentTarget.classList.add('compact-option-strip__item--pressed'); }}
            onMouseUp={(e) => { e.currentTarget.classList.remove('compact-option-strip__item--pressed'); }}
            onMouseLeave={(e) => { e.currentTarget.classList.remove('compact-option-strip__item--pressed'); }}
          >
            {item.icon ? <span className="compact-option-strip__icon">{item.icon}</span> : null}
            <span className="compact-option-strip__label">{item.label}</span>
            {item.count !== undefined ? <span className="compact-option-strip__count">{item.count}</span> : null}
            {item.badge ? <span className="compact-option-strip__badge">{item.badge}</span> : null}
          </button>
        );
      })}
    </div>
  );
}