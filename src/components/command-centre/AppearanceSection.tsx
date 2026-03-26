import React, { useState } from 'react';
import { colours } from '../../app/styles/colours';
import { CommandCentreTokens } from './types';
import lightAvatarMark from '../../assets/dark blue mark.svg';
import darkAvatarMark from '../../assets/markwhite.svg';
import hlrBlueMark from '../../assets/HLRblue72.png';
import hlrWhiteMark from '../../assets/HLRwhite72.png';

interface AppearanceSectionProps {
    tokens: CommandCentreTokens;
    isLocalDev: boolean;
    toggleTheme: () => void;
}

const helixSwatches = [
    { key: 'website-blue', label: 'Website Blue', color: colours.websiteBlue },
    { key: 'dark-blue', label: 'Dark Blue', color: colours.darkBlue },
    { key: 'helix-blue', label: 'Helix Blue', color: colours.helixBlue },
    { key: 'highlight', label: 'Highlight', color: colours.blue },
    { key: 'accent', label: 'Accent', color: colours.accent },
    { key: 'cta', label: 'CTA Red', color: colours.cta },
    { key: 'grey', label: 'Helix Grey', color: colours.grey },
];

const colourPairings = [
    { label: 'Dark surface', desc: 'Dark mode with white labels and accent-ready cues', bg: colours.websiteBlue, fg: '#ffffff', accent: colours.accent, tag: 'DARK' as const },
    { label: 'Light surface', desc: 'Light mode with highlight-blue navigation cues', bg: colours.grey, fg: colours.darkBlue, accent: colours.blue, tag: 'LIGHT' as const },
];

type PlaygroundBase = 'websiteBlue' | 'darkBlue' | 'helixBlue' | 'grey';
type PlaygroundLayer = 'darkBlue' | 'helixBlue' | 'blue' | 'highlightBlue' | 'grey';
type PlaygroundAccent = 'accent' | 'blue' | 'cta' | 'green' | 'orange' | 'yellow';

const playgroundBaseOptions: Record<PlaygroundBase, { label: string; color: string }> = {
    websiteBlue: { label: 'Website Blue', color: colours.websiteBlue },
    darkBlue: { label: 'Dark Blue', color: colours.darkBlue },
    helixBlue: { label: 'Helix Blue', color: colours.helixBlue },
    grey: { label: 'Helix Grey', color: colours.grey },
};

const playgroundLayerOptions: Record<PlaygroundLayer, { label: string; color: string }> = {
    darkBlue: { label: 'Dark Blue', color: colours.darkBlue },
    helixBlue: { label: 'Helix Blue', color: colours.helixBlue },
    blue: { label: 'Highlight Blue', color: colours.blue },
    highlightBlue: { label: 'Light Highlight Blue', color: colours.highlightBlue },
    grey: { label: 'Helix Grey', color: colours.grey },
};

const playgroundAccentOptions: Record<PlaygroundAccent, { label: string; color: string }> = {
    accent: { label: 'Accent', color: colours.accent },
    blue: { label: 'Highlight', color: colours.blue },
    cta: { label: 'CTA', color: colours.cta },
    green: { label: 'Green', color: colours.green },
    orange: { label: 'Orange', color: colours.orange },
    yellow: { label: 'Yellow', color: colours.yellow },
};

const AppearanceSection: React.FC<AppearanceSectionProps> = ({ tokens, isLocalDev, toggleTheme }) => {
    const [paletteCollapsed, setPaletteCollapsed] = useState(true);
    const [isPaletteHeaderHovered, setIsPaletteHeaderHovered] = useState(false);
    const [activePairing, setActivePairing] = useState(0);
    const [activeIntent, setActiveIntent] = useState<'NAV' | 'ACTION' | 'POSITIVE'>('NAV');
    const [playgroundBase, setPlaygroundBase] = useState<PlaygroundBase>('darkBlue');
    const [playgroundLayer, setPlaygroundLayer] = useState<PlaygroundLayer>('helixBlue');
    const [playgroundAccent, setPlaygroundAccent] = useState<PlaygroundAccent>('accent');

    const {
        isDarkMode, borderLight, textPrimary, textMuted, sectionTitle,
        toggleRow, toggleSwitch, toggleKnob, applyInsetHover, resetInsetHover, showToast,
    } = tokens;

    return (
        <div style={{ marginBottom: 20 }}>
            <div style={sectionTitle}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                </svg>
                Appearance
            </div>

            {/* Theme toggle — merged from standalone Mode section */}
            <div
                style={{
                    ...toggleRow,
                    background: 'transparent',
                    borderRadius: 0,
                    boxShadow: 'none',
                    transition: 'all 0.15s ease',
                    marginBottom: 12,
                }}
                onMouseEnter={(e) => applyInsetHover(e.currentTarget)}
                onMouseLeave={(e) => resetInsetHover(e.currentTarget)}
                onClick={() => { toggleTheme(); showToast(`Switched to ${isDarkMode ? 'light' : 'dark'} mode`, 'success'); }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {isDarkMode ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={textPrimary} strokeWidth="2">
                            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                        </svg>
                    ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={textPrimary} strokeWidth="2">
                            <circle cx="12" cy="12" r="5"/>
                        </svg>
                    )}
                    <span style={{ fontSize: 12, fontWeight: 500, color: textPrimary }}>{isDarkMode ? 'Dark' : 'Light'} Mode</span>
                </div>
                <div style={toggleSwitch(isDarkMode)}>
                    <div style={toggleKnob(isDarkMode)} />
                </div>
            </div>

            {/* Brand palette */}
            <div style={{
                background: isDarkMode ? colours.darkBlue : colours.grey,
                border: `1px solid ${isDarkMode ? colours.dark.borderColor : colours.highlightNeutral}`,
                borderRadius: 0,
                overflow: 'hidden',
            }}>
                {/* Toggle header */}
                <div
                    style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '8px 14px', cursor: 'pointer',
                        transition: 'background 0.15s ease',
                        background: isPaletteHeaderHovered ? (isDarkMode ? 'rgba(54, 144, 206, 0.06)' : 'rgba(54, 144, 206, 0.03)') : 'transparent',
                    }}
                    onMouseEnter={() => setIsPaletteHeaderHovered(true)}
                    onMouseLeave={() => setIsPaletteHeaderHovered(false)}
                    onClick={() => setPaletteCollapsed(prev => !prev)}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <img src={isDarkMode ? darkAvatarMark : lightAvatarMark} alt="" style={{ width: 8, height: 14, opacity: 0.5 }} />
                        <span style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, color: textMuted, opacity: 0.7 }}>Brand</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {paletteCollapsed && (
                            <div style={{ display: 'flex', gap: 3 }}>
                                {helixSwatches.map(s => (
                                    <span key={s.key} style={{ width: 8, height: 8, borderRadius: 1, background: s.color, display: 'block', border: `1px solid ${isDarkMode ? `${colours.dark.borderColor}44` : `${colours.darkBlue}20`}` }} />
                                ))}
                            </div>
                        )}
                        <svg
                            width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={textMuted} strokeWidth="2.5"
                            style={{ flexShrink: 0, transition: 'transform 0.2s ease', transform: paletteCollapsed ? 'rotate(0deg)' : 'rotate(180deg)' }}
                        >
                            <path d="M6 9l6 6 6-6"/>
                        </svg>
                    </div>
                </div>

                {/* Collapsible body */}
                <div style={{
                    maxHeight: paletteCollapsed ? 0 : 600,
                    opacity: paletteCollapsed ? 0 : 1,
                    overflow: 'hidden',
                    transition: 'max-height 0.35s ease, opacity 0.2s ease, padding 0.35s ease',
                    padding: paletteCollapsed ? '0 14px' : '0 14px 12px 14px',
                }}>
                    {/* Swatches row */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginTop: 8, marginBottom: 12 }}>
                        {helixSwatches.map((swatch) => (
                            <div
                                key={swatch.key}
                                title={`${swatch.label}\nClick to copy ${swatch.color}`}
                                onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(swatch.color); showToast(`Copied ${swatch.color}`, 'info'); }}
                                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, cursor: 'pointer', flex: 1, minWidth: 0 }}
                            >
                                <span
                                    style={{
                                        width: 22, height: 22, background: swatch.color, borderRadius: 2,
                                        border: `1px solid ${isDarkMode ? `${colours.dark.borderColor}66` : `${colours.darkBlue}20`}`,
                                        display: 'block', boxSizing: 'border-box',
                                        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                                    }}
                                    onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.25)'; e.currentTarget.style.boxShadow = `0 2px 8px ${swatch.color}44`; e.currentTarget.style.zIndex = '10'; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.zIndex = '0'; }}
                                />
                                <span style={{ fontSize: 7, color: textMuted, fontWeight: 700, letterSpacing: 0.15, whiteSpace: 'nowrap' }}>{swatch.label}</span>
                                <span style={{ fontSize: 6, color: textPrimary, opacity: 0.8, fontWeight: 600, letterSpacing: 0.1, whiteSpace: 'nowrap' }}>{swatch.color}</span>
                            </div>
                        ))}
                    </div>

                    {/* Downloads */}
                    <div style={{ fontSize: 7, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, color: textMuted, marginBottom: 6, opacity: 0.6 }}>
                        Downloads
                    </div>
                    <div key={`brand-assets-${colourPairings[activePairing]?.tag || 'none'}`} style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 12 }}>
                        {(() => {
                            const tag = colourPairings[activePairing]?.tag;
                            if (tag === 'DARK') {
                                return [
                                    { label: 'Helix Mark', desc: 'SVG \u00b7 light mark', src: darkAvatarMark, filename: 'helix-mark-white.svg', preview: darkAvatarMark, previewBg: colours.darkBlue, isLogo: false },
                                    { label: 'Helix Logo', desc: 'PNG \u00b7 light logo', src: hlrWhiteMark, filename: 'HLRwhite72.png', preview: hlrWhiteMark, previewBg: colours.helixBlue, isLogo: true },
                                ];
                            }
                            if (tag === 'LIGHT') {
                                return [
                                    { label: 'Helix Mark', desc: 'SVG \u00b7 dark mark', src: lightAvatarMark, filename: 'helix-mark-dark.svg', preview: lightAvatarMark, previewBg: colours.grey, isLogo: false },
                                    { label: 'Helix Logo', desc: 'PNG \u00b7 dark logo', src: hlrBlueMark, filename: 'HLRblue72.png', preview: hlrBlueMark, previewBg: colours.grey, isLogo: true },
                                ];
                            }
                            return [];
                        })().map(asset => (
                            <div
                                key={asset.filename}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
                                    background: 'transparent',
                                    borderLeft: '3px solid transparent',
                                    borderTop: `1px solid ${borderLight}`,
                                    borderRight: `1px solid ${borderLight}`,
                                    borderBottom: `1px solid ${borderLight}`,
                                    borderRadius: 0, cursor: 'pointer', transition: 'all 0.15s ease',
                                }}
                                title={`Download ${asset.label}`}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    const a = document.createElement('a');
                                    a.href = asset.src;
                                    a.download = asset.filename;
                                    document.body.appendChild(a);
                                    a.click();
                                    document.body.removeChild(a);
                                    showToast(`Downloaded ${asset.filename}`, 'info');
                                }}
                                onMouseEnter={(e) => { applyInsetHover(e.currentTarget); }}
                                onMouseLeave={(e) => { resetInsetHover(e.currentTarget); }}
                            >
                                <div style={{
                                    width: asset.isLogo ? 88 : 24, height: asset.isLogo ? 32 : 24, borderRadius: 2,
                                    background: asset.previewBg,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    border: `1px solid ${isDarkMode ? `${colours.dark.borderColor}44` : `${colours.darkBlue}12`}`,
                                    flexShrink: 0, overflow: 'hidden',
                                }}>
                                    <img
                                        src={asset.preview} alt=""
                                        style={asset.isLogo
                                            ? { width: '100%', height: '100%', objectFit: 'contain', display: 'block', padding: '0 6px', boxSizing: 'border-box' as const }
                                            : { width: 8, height: 14 }
                                        }
                                    />
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 9, fontWeight: 600, color: isDarkMode ? '#d1d5db' : colours.darkBlue, lineHeight: 1.2 }}>{asset.label}</div>
                                    <div style={{ fontSize: 7, color: textMuted, opacity: 0.7 }}>{asset.desc}</div>
                                </div>
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={textMuted} strokeWidth="2" style={{ flexShrink: 0, opacity: 0.5 }}>
                                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" strokeLinecap="round" strokeLinejoin="round"/>
                                    <polyline points="7 10 12 15 17 10" strokeLinecap="round" strokeLinejoin="round"/>
                                    <line x1="12" y1="15" x2="12" y2="3" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                            </div>
                        ))}
                    </div>

                    {/* Compositions & Playground (local dev only) */}
                    {isLocalDev && <>
                        <div style={{ fontSize: 7, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, color: textMuted, marginBottom: 6, opacity: 0.6 }}>
                            Compositions
                        </div>

                        <div style={{ display: 'flex', gap: 3, marginBottom: 8 }}>
                            {colourPairings.map((p, i) => (
                                <button
                                    key={p.tag}
                                    onClick={(e) => { e.stopPropagation(); setActivePairing(i); }}
                                    style={{
                                        flex: 1, padding: '4px 0', fontSize: 7, fontWeight: 700,
                                        textTransform: 'uppercase', letterSpacing: 0.5,
                                        background: activePairing === i ? (isDarkMode ? colours.helixBlue : colours.highlightBlue) : 'transparent',
                                        color: activePairing === i ? textPrimary : textMuted,
                                        border: `1px solid ${activePairing === i ? (isDarkMode ? `${colours.blue}44` : colours.highlightNeutral) : 'transparent'}`,
                                        borderRadius: 2, cursor: 'pointer', transition: 'all 0.15s ease',
                                    }}
                                >
                                    {p.tag}
                                </button>
                            ))}
                        </div>

                        <div style={{ display: 'flex', gap: 3, marginBottom: 8 }}>
                            {([
                                { key: 'NAV' as const, label: 'NAV' },
                                { key: 'ACTION' as const, label: 'ACTION' },
                                { key: 'POSITIVE' as const, label: 'POSITIVE' },
                            ]).map(intent => (
                                <button
                                    key={intent.key}
                                    onClick={(e) => { e.stopPropagation(); setActiveIntent(intent.key); }}
                                    style={{
                                        flex: 1, padding: '4px 0', fontSize: 7, fontWeight: 700,
                                        textTransform: 'uppercase', letterSpacing: 0.5,
                                        background: activeIntent === intent.key ? (isDarkMode ? colours.darkBlue : colours.highlightBlue) : 'transparent',
                                        color: activeIntent === intent.key ? textPrimary : textMuted,
                                        border: `1px solid ${activeIntent === intent.key ? (isDarkMode ? `${colours.blue}33` : colours.highlightNeutral) : 'transparent'}`,
                                        borderRadius: 2, cursor: 'pointer', transition: 'all 0.15s ease',
                                    }}
                                >
                                    {intent.label}
                                </button>
                            ))}
                        </div>

                        {/* Live composition preview */}
                        {(() => {
                            const p = colourPairings[activePairing];
                            const intentAccent = activeIntent === 'ACTION' ? colours.cta : activeIntent === 'POSITIVE' ? colours.green : p.accent;
                            const intentLabel = activeIntent === 'ACTION' ? 'CTA' : activeIntent === 'POSITIVE' ? 'Positive' : 'Navigation';
                            return (
                                <div style={{
                                    background: p.bg, borderRadius: 2, padding: 10,
                                    border: `1px solid ${isDarkMode ? `${colours.dark.borderColor}66` : `${colours.darkBlue}15`}`,
                                    transition: 'background 0.25s ease',
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: intentAccent, flexShrink: 0 }} />
                                        <span style={{ fontSize: 11, fontWeight: 600, color: p.fg, letterSpacing: '-0.2px' }}>{p.label}</span>
                                    </div>
                                    <div style={{ fontSize: 9, color: p.fg, opacity: 0.7, marginBottom: 10, lineHeight: 1.4 }}>{p.desc}</div>
                                    <div
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: 8,
                                            padding: '6px 8px', background: `${intentAccent}10`,
                                            border: `1px solid ${intentAccent}22`, borderRadius: 2,
                                            transition: 'all 0.15s ease', cursor: 'default',
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.background = `${intentAccent}20`;
                                            e.currentTarget.style.borderColor = `${intentAccent}44`;
                                            e.currentTarget.style.transform = 'translateY(-1px)';
                                            e.currentTarget.style.boxShadow = `0 2px 8px ${p.bg}88`;
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.background = `${intentAccent}10`;
                                            e.currentTarget.style.borderColor = `${intentAccent}22`;
                                            e.currentTarget.style.transform = 'translateY(0)';
                                            e.currentTarget.style.boxShadow = 'none';
                                        }}
                                    >
                                        <div style={{ width: 4, height: 4, borderRadius: '50%', background: intentAccent }} />
                                        <span style={{ fontSize: 9, color: p.fg, opacity: 0.8, flex: 1 }}>Interactive row</span>
                                        <span style={{ fontSize: 8, color: intentAccent, fontWeight: 600 }}>{intentLabel}</span>
                                    </div>
                                    <div style={{ display: 'flex', gap: 2, marginTop: 8 }}>
                                        <div style={{ flex: 4, height: 3, background: p.bg, borderRadius: 1, border: `1px solid ${p.fg}15` }} />
                                        <div style={{ flex: 2, height: 3, background: `${intentAccent}40`, borderRadius: 1 }} />
                                        <div style={{ flex: 1, height: 3, background: intentAccent, borderRadius: 1 }} />
                                    </div>
                                </div>
                            );
                        })()}

                        {/* Playground */}
                        <div style={{ fontSize: 7, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, color: textMuted, marginTop: 10, marginBottom: 6, opacity: 0.6 }}>
                            Playground
                        </div>
                        <div style={{ display: 'flex', gap: 3, marginBottom: 6 }}>
                            {[
                                { label: 'UserBubble', apply: () => { setPlaygroundBase('darkBlue'); setPlaygroundLayer('helixBlue'); setPlaygroundAccent('accent'); } },
                                { label: 'Dark Nav', apply: () => { setPlaygroundBase('websiteBlue'); setPlaygroundLayer('darkBlue'); setPlaygroundAccent('accent'); } },
                                { label: 'Light Nav', apply: () => { setPlaygroundBase('grey'); setPlaygroundLayer('blue'); setPlaygroundAccent('blue'); } },
                            ].map(preset => (
                                <button
                                    key={preset.label}
                                    onClick={(e) => { e.stopPropagation(); preset.apply(); }}
                                    style={{
                                        flex: 1, padding: '4px 0', fontSize: 7, fontWeight: 700,
                                        textTransform: 'uppercase', letterSpacing: 0.4,
                                        border: `1px solid ${isDarkMode ? `${colours.dark.borderColor}66` : colours.highlightNeutral}`,
                                        background: 'transparent', color: textMuted, borderRadius: 2, cursor: 'pointer',
                                    }}
                                >
                                    {preset.label}
                                </button>
                            ))}
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 3, marginBottom: 8 }}>
                            {([{
                                key: 'base', label: 'Base', value: playgroundBase,
                                set: setPlaygroundBase as (v: string) => void, options: playgroundBaseOptions,
                            }, {
                                key: 'layer', label: 'Layer', value: playgroundLayer,
                                set: setPlaygroundLayer as (v: string) => void, options: playgroundLayerOptions,
                            }, {
                                key: 'accent', label: 'Accent', value: playgroundAccent,
                                set: setPlaygroundAccent as (v: string) => void, options: playgroundAccentOptions,
                            }] as const).map(group => (
                                <div key={group.key}>
                                    <div style={{ fontSize: 6, color: textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 }}>{group.label}</div>
                                    <select
                                        value={group.value}
                                        onChange={(e) => group.set(e.target.value)}
                                        style={{
                                            width: '100%', padding: '4px 6px', fontSize: 8,
                                            background: isDarkMode ? colours.darkBlue : '#fff',
                                            color: textPrimary, border: `1px solid ${borderLight}`, borderRadius: 2,
                                        }}
                                    >
                                        {Object.entries(group.options).map(([key, option]) => (
                                            <option key={key} value={key}>{(option as { label: string }).label}</option>
                                        ))}
                                    </select>
                                </div>
                            ))}
                        </div>

                        {(() => {
                            const base = playgroundBaseOptions[playgroundBase];
                            const layer = playgroundLayerOptions[playgroundLayer];
                            const accent = playgroundAccentOptions[playgroundAccent];
                            const text = base.color === colours.grey || base.color === colours.highlightBlue ? colours.darkBlue : '#ffffff';
                            return (
                                <div style={{
                                    background: base.color,
                                    border: `1px solid ${isDarkMode ? `${colours.dark.borderColor}66` : `${colours.darkBlue}15`}`,
                                    borderRadius: 2, padding: 8,
                                }}>
                                    <div style={{
                                        background: layer.color, border: `1px solid ${accent.color}33`,
                                        borderRadius: 2, padding: '6px 8px', marginBottom: 6,
                                        color: text, fontSize: 9, fontWeight: 600,
                                    }}>
                                        Layer preview
                                    </div>
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: 6,
                                        padding: '6px 8px', background: `${accent.color}14`,
                                        border: `1px solid ${accent.color}33`,
                                        borderLeft: `3px solid ${accent.color}`,
                                        borderRadius: 0, color: text, fontSize: 8,
                                    }}>
                                        <span style={{ width: 4, height: 4, borderRadius: '50%', background: accent.color }} />
                                        <span style={{ flex: 1 }}>Interactive cue</span>
                                        <span style={{ color: accent.color, fontWeight: 700 }}>{accent.label}</span>
                                    </div>
                                    <div style={{ display: 'flex', gap: 4, marginTop: 6, fontSize: 6, color: textMuted }}>
                                        <span>{base.color}</span>
                                        <span>{layer.color}</span>
                                        <span>{accent.color}</span>
                                    </div>
                                </div>
                            );
                        })()}
                    </>}
                </div>
            </div>
        </div>
    );
};

export default AppearanceSection;
