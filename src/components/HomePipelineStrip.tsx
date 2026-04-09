import React from 'react';
import './HomePipelineStrip.css';

export type HomePipelineItemState = 'default' | 'active' | 'done' | 'loading';

export interface HomePipelineStripItem<Key extends string = string> {
  key: Key;
  label: string;
  title?: string;
  state?: HomePipelineItemState;
  tone?: string;
  disabled?: boolean;
}

type HomePipelineStripStyle = React.CSSProperties & {
  '--home-pipeline-columns'?: string;
  '--home-pipeline-tone'?: string;
};

interface HomePipelineStripProps<Key extends string = string> {
  items: HomePipelineStripItem<Key>[];
  onSelect: (key: Key) => void;
  ariaLabel: string;
  className?: string;
}

export default function HomePipelineStrip<Key extends string = string>({
  items,
  onSelect,
  ariaLabel,
  className,
}: HomePipelineStripProps<Key>) {
  const stripStyle: HomePipelineStripStyle = {
    '--home-pipeline-columns': String(items.length),
  };

  return (
    <div
      className={['home-pipeline-strip', className].filter(Boolean).join(' ')}
      style={stripStyle}
      aria-label={ariaLabel}
    >
      {items.map((item) => {
        const itemState = item.state || 'default';
        const itemStyle: HomePipelineStripStyle = {
          '--home-pipeline-tone': item.tone || 'var(--text-secondary, #A0A0A0)',
        };

        return (
          <button
            key={item.key}
            type="button"
            className="home-pipeline-strip__item"
            data-state={itemState}
            title={item.title || item.label}
            aria-label={item.title || item.label}
            disabled={item.disabled}
            style={itemStyle}
            onClick={() => {
              if (!item.disabled) onSelect(item.key);
            }}
          >
            <span className="home-pipeline-strip__dot" aria-hidden="true" />
            <span className="home-pipeline-strip__label">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}