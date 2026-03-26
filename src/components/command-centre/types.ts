import React from 'react';
import { colours } from '../../app/styles/colours';

export type BubbleToastTone = 'info' | 'success' | 'warning';

export const AVAILABLE_AREAS = ['Commercial', 'Construction', 'Property', 'Employment', 'Misc/Other'] as const;

/** Shared theme tokens and interaction helpers for command centre sections */
export interface CommandCentreTokens {
    isDarkMode: boolean;
    bg: string;
    bgHover: string;
    controlRowBg: string;
    borderLight: string;
    borderMedium: string;
    textPrimary: string;
    textBody: string;
    textMuted: string;
    accentPrimary: string;
    ctaPrimary: string;
    shadowSm: string;
    toggleRow: React.CSSProperties;
    sectionTitle: React.CSSProperties;
    actionBtn: React.CSSProperties;
    applyRowHover: (el: HTMLElement) => void;
    resetRowHover: (el: HTMLElement) => void;
    applyInsetHover: (el: HTMLElement) => void;
    resetInsetHover: (el: HTMLElement) => void;
    toggleSwitch: (on: boolean) => React.CSSProperties;
    toggleKnob: (on: boolean) => React.CSSProperties;
    showToast: (message: string, tone?: BubbleToastTone) => void;
}

/** AoW colour using canonical brand tokens */
export const aowColour = (area: string, isDarkMode: boolean): string => {
    const a = area.toLowerCase();
    if (a.includes('commercial')) return isDarkMode ? colours.accent : colours.blue;
    if (a.includes('construction')) return colours.orange;
    if (a.includes('property')) return colours.green;
    if (a.includes('employment')) return colours.yellow;
    return colours.greyText;
};
