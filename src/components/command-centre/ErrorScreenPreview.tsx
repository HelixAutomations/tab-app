import React, { useEffect, useState } from 'react';
import { colours } from '../../app/styles/colours';

interface ErrorScreenPreviewProps {
    onClose: () => void;
}

/**
 * Renders a preview of the ErrorBoundary fallback screen.
 * Opens from the Command Deck so devs can visualise the crash UX.
 */
const ErrorScreenPreview: React.FC<ErrorScreenPreviewProps> = ({ onClose }) => {
    const previewCode = 'HUB-PREVIEW';
    const capturedAt = new Date();

    // Mirror the live boundary's notify state machine: animate through
    // 'sending' → 'sent' on mount so devs can inspect the affordance.
    const [notifyStatus, setNotifyStatus] = useState<'sending' | 'sent'>('sending');
    useEffect(() => {
        const t = window.setTimeout(() => setNotifyStatus('sent'), 900);
        return () => window.clearTimeout(t);
    }, []);

    const surfaceCard = 'rgba(10, 28, 50, 0.92)';
    const surfaceInset = 'rgba(6, 23, 51, 0.55)';
    const borderSubtle = 'rgba(148, 163, 184, 0.18)';
    const borderStrong = 'rgba(148, 163, 184, 0.32)';
    const textPrimary = '#f3f4f6';
    const textBody = '#cbd5e1';
    const textHelp = '#94a3b8';
    const accent = colours.highlight;

    const linkButtonStyle: React.CSSProperties = {
        background: 'none',
        border: 'none',
        color: textHelp,
        fontSize: 12,
        letterSpacing: 0.3,
        cursor: 'pointer',
        fontFamily: 'Raleway, sans-serif',
        padding: '4px 6px',
    };

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 3100,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(0, 3, 25, 0.6)',
                backdropFilter: 'blur(6px)',
                WebkitBackdropFilter: 'blur(6px)',
            }}
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <style>{`
                @keyframes helix-envelope-bob {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(-3px); }
                }
                @keyframes helix-tick-draw {
                    to { stroke-dashoffset: 0; }
                }
            `}</style>
            {/* Preview banner */}
            <div
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    padding: '8px 16px',
                    background: colours.accent,
                    color: colours.websiteBlue,
                    fontSize: 12,
                    fontWeight: 700,
                    fontFamily: 'Raleway, sans-serif',
                    textAlign: 'center',
                    letterSpacing: '0.5px',
                    zIndex: 1,
                }}
            >
                ERROR SCREEN PREVIEW. This is not a real error.
            </div>

            {/* Mirrored ErrorBoundary fallback */}
            <div
                role="presentation"
                style={{
                    position: 'relative',
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 24,
                    background: `radial-gradient(120% 80% at 50% 0%, ${colours.helixBlue} 0%, ${colours.darkBlue} 45%, ${colours.websiteBlue} 100%)`,
                    fontFamily: 'Raleway, sans-serif',
                    color: textPrimary,
                    overflow: 'hidden',
                }}
            >
                <div
                    aria-hidden
                    style={{
                        position: 'absolute',
                        inset: 0,
                        backgroundImage:
                            'linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)',
                        backgroundSize: '48px 48px',
                        maskImage: 'radial-gradient(ellipse at center, rgba(0,0,0,0.7), transparent 70%)',
                        WebkitMaskImage: 'radial-gradient(ellipse at center, rgba(0,0,0,0.7), transparent 70%)',
                        pointerEvents: 'none',
                    }}
                />
                <div
                    style={{
                        position: 'relative',
                        width: '100%',
                        maxWidth: 520,
                        background: surfaceCard,
                        border: `1px solid ${borderSubtle}`,
                        padding: '36px 36px 28px',
                        backdropFilter: 'blur(8px)',
                        WebkitBackdropFilter: 'blur(8px)',
                        boxShadow: '0 24px 60px rgba(0, 0, 0, 0.45)',
                    }}
                >
                    <div
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '4px 10px',
                            border: `1px solid ${borderStrong}`,
                            fontSize: 10.5,
                            fontWeight: 600,
                            letterSpacing: 1.2,
                            textTransform: 'uppercase',
                            color: textHelp,
                            marginBottom: 22,
                        }}
                    >
                        <span
                            aria-hidden
                            style={{
                                width: 6,
                                height: 6,
                                borderRadius: '50%',
                                background: colours.cta,
                                boxShadow: `0 0 0 3px ${colours.cta}22`,
                            }}
                        />
                        Issue logged
                    </div>

                    <h1
                        style={{
                            fontSize: 22,
                            fontWeight: 600,
                            letterSpacing: -0.2,
                            margin: 0,
                            color: textPrimary,
                            lineHeight: 1.25,
                        }}
                    >
                        We hit a snag
                    </h1>
                    <p
                        style={{
                            margin: '10px 0 22px',
                            fontSize: 13.5,
                            lineHeight: 1.55,
                            color: textBody,
                            maxWidth: 440,
                        }}
                    >
                        Your work is safe and the rest of the app is still running. We've
                        flagged this automatically so the team can take a look.
                    </p>

                    {/* Notify status — mirrors live boundary */}
                    <div
                        aria-live="polite"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 14,
                            padding: '14px 16px',
                            background: surfaceInset,
                            border: `1px solid ${borderSubtle}`,
                            marginBottom: 22,
                        }}
                    >
                        <div
                            aria-hidden
                            style={{
                                position: 'relative',
                                width: 36,
                                height: 36,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                            }}
                        >
                            <svg
                                width={26}
                                height={26}
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke={notifyStatus === 'sent' ? textHelp : accent}
                                strokeWidth={1.6}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                style={{
                                    position: 'absolute',
                                    opacity: notifyStatus === 'sent' ? 0.55 : 1,
                                    transform: notifyStatus === 'sent' ? 'translateY(-2px)' : 'translateY(0)',
                                    animation: notifyStatus === 'sending' ? 'helix-envelope-bob 1.6s ease-in-out infinite' : 'none',
                                    transition: 'opacity 0.25s ease, transform 0.4s ease',
                                }}
                            >
                                <rect x={3} y={5} width={18} height={14} rx={0} />
                                <path d="M3 7l9 6 9-6" />
                            </svg>
                            {notifyStatus === 'sent' && (
                                <svg
                                    width={18}
                                    height={18}
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke={colours.green}
                                    strokeWidth={2.4}
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    style={{
                                        position: 'absolute',
                                        right: -2,
                                        bottom: -2,
                                        background: surfaceInset,
                                        padding: 1,
                                    }}
                                >
                                    <path
                                        d="M5 12.5l4.5 4.5L19 7"
                                        style={{
                                            strokeDasharray: 24,
                                            strokeDashoffset: 24,
                                            animation: 'helix-tick-draw 0.45s ease-out forwards',
                                        }}
                                    />
                                </svg>
                            )}
                        </div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontSize: 12.5, fontWeight: 600, letterSpacing: 0.2, color: textPrimary }}>
                                {notifyStatus === 'sent' ? 'Luke has been notified' : 'Notifying Luke'}
                            </div>
                            <div style={{ marginTop: 3, fontSize: 11.5, color: textHelp, lineHeight: 1.4 }}>
                                {notifyStatus === 'sent'
                                    ? "He'll take a look as soon as he's free."
                                    : 'Sending the details over to Teams.'}
                            </div>
                        </div>
                    </div>

                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 12,
                            padding: '10px 12px',
                            background: surfaceInset,
                            border: `1px solid ${borderSubtle}`,
                            fontSize: 11.5,
                            color: textHelp,
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                            <span style={{ letterSpacing: 1, textTransform: 'uppercase', fontSize: 10 }}>Ref</span>
                            <span
                                style={{
                                    fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
                                    fontSize: 12,
                                    color: textPrimary,
                                    letterSpacing: 0.4,
                                }}
                            >
                                {previewCode}
                            </span>
                        </div>
                        <span style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
                            {capturedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            {' · '}
                            {capturedAt.toLocaleDateString()}
                        </span>
                    </div>

                    <div style={{ marginTop: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <button type="button" onClick={onClose} style={{ ...linkButtonStyle, color: accent }}>
                            Close preview
                        </button>
                        <button type="button" onClick={onClose} style={linkButtonStyle}>
                            Reload the whole app
                        </button>
                    </div>

                    <details
                        style={{
                            marginTop: 22,
                            padding: '12px 14px',
                            background: surfaceInset,
                            border: `1px solid ${borderSubtle}`,
                            fontSize: 12,
                            color: textBody,
                        }}
                    >
                        <summary
                            style={{
                                cursor: 'pointer',
                                fontWeight: 600,
                                color: textPrimary,
                                letterSpacing: 0.3,
                                fontSize: 11,
                                textTransform: 'uppercase',
                            }}
                        >
                            Developer details
                        </summary>
                        <pre
                            style={{
                                marginTop: 10,
                                fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
                                fontSize: 11.5,
                                color: colours.cta,
                                overflow: 'auto',
                                maxHeight: 160,
                                whiteSpace: 'pre-wrap',
                            }}
                        >
                            Error: Preview mode. No actual error occurred.
                        </pre>
                        <pre
                            style={{
                                marginTop: 8,
                                fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
                                fontSize: 10.5,
                                color: textHelp,
                                overflow: 'auto',
                                maxHeight: 220,
                                whiteSpace: 'pre',
                            }}
                        >
                            {`    at PreviewComponent\n    at ErrorBoundary\n    at App`}
                        </pre>
                    </details>
                </div>
            </div>
        </div>
    );
};

export default ErrorScreenPreview;
