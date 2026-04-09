import React from 'react';
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
    const previewTimestamp = new Date().toLocaleString();

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
                ERROR SCREEN PREVIEW — this is not a real error
            </div>

            {/* Mirrored ErrorBoundary fallback */}
            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '100%',
                    height: '100%',
                    padding: 20,
                    backgroundColor: '#f5f5f5',
                    fontFamily: 'Raleway, sans-serif',
                }}
            >
                <div
                    style={{
                        maxWidth: 600,
                        padding: 40,
                        backgroundColor: 'white',
                        borderRadius: 0,
                        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                        textAlign: 'center',
                    }}
                >
                    <h1 style={{ color: colours.cta, marginBottom: 16 }}>
                        We hit a problem
                    </h1>
                    <p style={{ color: '#666', marginBottom: 16, lineHeight: '1.5' }}>
                        This page ran into an unexpected error. Reload to try again.
                    </p>
                    <div
                        style={{
                            marginBottom: 24,
                            padding: '12px 16px',
                            backgroundColor: '#f9f9f9',
                            borderRadius: 0,
                            border: '1px solid #e5e5e5',
                            color: '#333',
                            fontSize: 15,
                            lineHeight: 1.6,
                        }}
                    >
                        <strong>Support reference:</strong>
                        <div style={{ fontFamily: 'monospace', fontSize: 16, marginTop: 4 }}>
                            {previewCode}
                        </div>
                        <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>
                            Captured at {previewTimestamp}
                        </div>
                    </div>

                    {/* Simulated dev error details */}
                    <details
                        style={{
                            marginBottom: 24,
                            textAlign: 'left',
                            padding: 16,
                            backgroundColor: '#f9f9f9',
                            borderRadius: 0,
                            fontSize: 14,
                        }}
                    >
                        <summary style={{ cursor: 'pointer', fontWeight: 'bold', marginBottom: 8 }}>
                            Error Details (Development Only)
                        </summary>
                        <pre style={{ overflow: 'auto', fontSize: 12, color: colours.cta, margin: '8px 0' }}>
                            Error: Preview mode — no actual error occurred
                        </pre>
                        <pre style={{ overflow: 'auto', fontSize: 11, color: '#666', maxHeight: 200 }}>
                            {`    at PreviewComponent\n    at ErrorBoundary\n    at App`}
                        </pre>
                    </details>

                    <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                        <button
                            onClick={onClose}
                            style={{
                                padding: '12px 24px',
                                backgroundColor: colours.highlight,
                                color: 'white',
                                border: 'none',
                                borderRadius: 0,
                                fontSize: 16,
                                fontWeight: 600,
                                cursor: 'pointer',
                                fontFamily: 'Raleway, sans-serif',
                            }}
                        >
                            Close Preview
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ErrorScreenPreview;
