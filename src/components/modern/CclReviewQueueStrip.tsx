import React from 'react';

export interface CclQueueStripItem {
    key: string;
    label: string;
    group?: string;
    reviewed: boolean;
    flagged: boolean;
    unresolved: boolean;
}

interface CclReviewQueueStripProps {
    isMobile: boolean;
    items: CclQueueStripItem[];
    currentKey: string | null;
    onJump: (key: string) => void;
    /** Cross-pane hover wiring: the placeholder currently hovered (or null). */
    hoveredFieldKey?: string | null;
    /** Cross-pane hover wiring: notify parent when a dot is hovered. */
    onHover?: (key: string | null) => void;
}

/**
 * Persistent horizontal dot-strip that sits at the top of the review rail.
 * Each dot is one decision in the queue. Clicking jumps to that field.
 *
 * Colour semantics (brand tokens only):
 *  - current → `colours.accent` (teal, dark-mode highlight)
 *  - reviewed → `colours.green`
 *  - flagged (PT ≤ 7) → `colours.orange`
 *  - unresolved (placeholder / unknown) → `colours.cta`
 *  - idle → `colours.subtleGrey`
 *
 * Groups are separated by a 1px vertical divider so the user can see which
 * category they are in at a glance. Tooltip exposes the field label + group
 * so hover still tells the full story without widening the row.
 */
export default function CclReviewQueueStrip({
    isMobile,
    items,
    currentKey,
    onJump,
    hoveredFieldKey = null,
    onHover,
}: CclReviewQueueStripProps) {
    if (items.length === 0) return null;

    const padding = isMobile ? '6px 16px 10px' : '4px 24px 10px';
    const dotSize = isMobile ? 10 : 8;
    const dotGap = isMobile ? 6 : 5;

    return (
        <div
            className="ccl-review-queue-strip"
            style={{
                padding,
                display: 'flex',
                alignItems: 'center',
                gap: dotGap,
                flexShrink: 0,
                overflowX: 'auto',
                scrollbarWidth: 'none',
                WebkitOverflowScrolling: 'touch',
            }}
            role="tablist"
            aria-label="Review queue"
        >
            {items.map((item, index) => {
                const prev = index > 0 ? items[index - 1] : null;
                const showDivider = !!prev && prev.group && item.group && prev.group !== item.group;
                const isCurrent = item.key === currentKey;
                const isCrossHovered = !!hoveredFieldKey && hoveredFieldKey === item.key;
                const state = isCurrent
                    ? 'current'
                    : item.reviewed
                        ? 'reviewed'
                        : item.unresolved
                            ? 'unresolved'
                            : item.flagged
                                ? 'flagged'
                                : 'idle';
                const tooltip = `${item.label}${item.group ? ` · ${item.group}` : ''}${item.reviewed ? ' · reviewed' : item.flagged ? ' · flagged' : item.unresolved ? ' · needs wording' : ''}`;
                return (
                    <React.Fragment key={item.key}>
                        {showDivider && (
                            <span
                                aria-hidden="true"
                                style={{
                                    width: 1,
                                    height: dotSize + 4,
                                    background: 'rgba(148,163,184,0.22)',
                                    margin: `0 ${dotGap - 2}px`,
                                    flexShrink: 0,
                                }}
                            />
                        )}
                        <button
                            type="button"
                            role="tab"
                            aria-selected={isCurrent}
                            aria-label={tooltip}
                            title={tooltip}
                            onClick={() => onJump(item.key)}
                            onMouseEnter={onHover ? () => onHover(item.key) : undefined}
                            onMouseLeave={onHover ? () => onHover(null) : undefined}
                            data-ccl-field-key={item.key}
                            className={`ccl-review-queue-strip__dot ccl-review-queue-strip__dot--${state}${isCrossHovered ? ' is-cross-hovered' : ''}`}
                            style={{
                                width: isCurrent ? dotSize + 6 : isCrossHovered ? dotSize + 4 : dotSize,
                                height: isCrossHovered ? dotSize + 2 : dotSize,
                                borderRadius: isCurrent ? 4 : '50%',
                                border: 'none',
                                background: 'transparent',
                                padding: 0,
                                cursor: 'pointer',
                                flexShrink: 0,
                                position: 'relative',
                                transition: 'width 0.18s ease, height 0.18s ease, transform 0.18s ease',
                                transform: isCrossHovered ? 'translateY(-1px)' : undefined,
                            }}
                        >
                            <span
                                aria-hidden="true"
                                style={{
                                    position: 'absolute',
                                    inset: 0,
                                    borderRadius: 'inherit',
                                    background: 'currentColor',
                                    opacity: isCurrent ? 1 : isCrossHovered ? 1 : item.reviewed ? 0.9 : 0.55,
                                    boxShadow: isCrossHovered ? '0 0 0 2px rgba(135, 243, 243, 0.55)' : undefined,
                                }}
                            />
                        </button>
                    </React.Fragment>
                );
            })}
        </div>
    );
}
