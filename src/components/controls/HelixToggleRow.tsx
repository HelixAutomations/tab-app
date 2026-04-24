import React from 'react';
import { colours } from '../../app/styles/colours';

/**
 * HelixToggleRow — canonical checkbox-style toggle row.
 *
 * Lifted from the Home bottom-left layout overlay (the design we landed on as
 * the house standard for utilitarian on/off toggles): sharp corners, brand
 * accent border on the tick square, 11px label, transparent button background.
 *
 * Use this anywhere a control is a simple boolean operator-toggle (feature
 * flags, layout switches, dev surfaces). Do NOT use for appearance toggles
 * with two equal states (those use the pill `toggleSwitch` in UserBubble).
 */
export interface HelixToggleRowProps {
    label: string;
    value: boolean;
    onChange: (next: boolean) => void;
    isDarkMode: boolean;
    /** Optional hint shown to the right (e.g. "live" / "off"). */
    hint?: string;
    /** Override accent colour (defaults to dark-mode accent / light highlight). */
    accent?: string;
    title?: string;
    disabled?: boolean;
}

const HelixToggleRow: React.FC<HelixToggleRowProps> = ({
    label,
    value,
    onChange,
    isDarkMode,
    hint,
    accent,
    title,
    disabled = false,
}) => {
    const tickAccent = accent ?? (isDarkMode ? colours.accent : colours.highlight);
    const labelColour = isDarkMode ? colours.dark.text : colours.light.text;
    const hintColour = isDarkMode ? colours.subtleGrey : colours.greyText;

    return (
        <button
            type="button"
            onClick={() => !disabled && onChange(!value)}
            aria-pressed={value}
            title={title}
            disabled={disabled}
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 8px',
                fontSize: 11,
                fontWeight: 500,
                letterSpacing: '0.02em',
                border: 'none',
                background: 'transparent',
                color: labelColour,
                cursor: disabled ? 'not-allowed' : 'pointer',
                textAlign: 'left',
                borderRadius: 0,
                width: '100%',
                opacity: disabled ? 0.55 : 1,
            }}
        >
            <span
                style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 14,
                    height: 14,
                    border: `1px solid ${tickAccent}`,
                    background: value ? tickAccent : 'transparent',
                    color: value ? (isDarkMode ? colours.dark.background : '#ffffff') : 'transparent',
                    fontSize: 10,
                    lineHeight: 1,
                    flexShrink: 0,
                    borderRadius: 0,
                    transition: 'background 0.15s ease',
                }}
                aria-hidden
            >
                {value ? '\u2713' : ''}
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>{label}</span>
            {hint && (
                <span style={{ fontSize: 10, color: hintColour, flexShrink: 0 }}>{hint}</span>
            )}
        </button>
    );
};

export default HelixToggleRow;
