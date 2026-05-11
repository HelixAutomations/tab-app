// invisible change — Forms-stream landing confirmation strip.
//
// Renders a quiet "logged in stream" row immediately after a successful form
// submit. Reads `submissionId` (and optional `streamUrl` deep-link string of the
// form `forms?focusSubmission=<id>`) from the API response and lets the user
// open the Forms hub focused on that row.
//
// Design rules followed:
//   - Helix design tokens only; no inline colour invention.
//   - Body copy uses neutral grey (warm grey dark / dark warm grey light), not
//     brand blue. The accent dot is the only colour anchor.
//   - borderRadius: 0; subtle border + tinted surface; no PR copy.

import * as React from 'react';
import { colours } from '../../app/styles/colours';

interface FormsStreamLandedProps {
    submissionId?: string | null;
    streamUrl?: string | null;
    isDarkMode: boolean;
    /** Optional override label (default: "View in stream →"). */
    actionLabel?: string;
}

const SHORT_ID_LEN = 8;

const shortId = (id: string): string =>
    id.length > SHORT_ID_LEN ? id.slice(0, SHORT_ID_LEN) : id;

/**
 * Parse a streamUrl of the form `forms?focusSubmission=<id>` and return the id.
 * Falls back to the raw submissionId if the URL is missing or malformed.
 */
const extractFocusId = (streamUrl: string | null | undefined, fallback: string): string => {
    if (!streamUrl) return fallback;
    const match = streamUrl.match(/focusSubmission=([^&]+)/);
    return match?.[1] || fallback;
};

const FormsStreamLanded: React.FC<FormsStreamLandedProps> = ({
    submissionId,
    streamUrl,
    isDarkMode,
    actionLabel = 'View in stream →',
}) => {
    if (!submissionId) return null;

    const bodyText = isDarkMode ? '#d1d5db' : '#374151';
    const helpText = isDarkMode ? colours.subtleGrey : colours.greyText;
    const dotColour = isDarkMode ? colours.accent : colours.highlight;
    const dividerColour = isDarkMode
        ? 'rgba(75, 85, 99, 0.38)'
        : 'rgba(54, 144, 206, 0.18)';
    const surface = isDarkMode
        ? 'rgba(10, 28, 50, 0.55)'
        : 'rgba(214, 232, 255, 0.35)';
    const buttonColour = isDarkMode ? colours.accent : colours.highlight;

    const handleOpen = (): void => {
        const focusId = extractFocusId(streamUrl, submissionId);
        try {
            window.dispatchEvent(
                new CustomEvent('navigateToForms', {
                    detail: { focusSubmissionId: focusId },
                }),
            );
        } catch {
            // Non-critical — do not block the success state if dispatch fails.
        }
    };

    return (
        <div
            role="status"
            aria-live="polite"
            style={{
                marginTop: 8,
                padding: '8px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                borderTop: `1px solid ${dividerColour}`,
                background: surface,
                fontFamily: 'Raleway, sans-serif',
                fontSize: 12,
                lineHeight: 1.4,
                color: bodyText,
                borderRadius: 0,
            }}
        >
            <span
                aria-hidden="true"
                style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: dotColour,
                    flexShrink: 0,
                }}
            />
            <span style={{ color: bodyText }}>
                Logged in stream
                <span style={{ color: helpText, marginLeft: 6 }}>
                    · {shortId(submissionId)}
                </span>
            </span>
            <span style={{ flex: 1 }} />
            <button
                type="button"
                onClick={handleOpen}
                style={{
                    background: 'transparent',
                    border: 'none',
                    padding: '2px 4px',
                    cursor: 'pointer',
                    color: buttonColour,
                    fontFamily: 'Raleway, sans-serif',
                    fontSize: 12,
                    fontWeight: 600,
                    borderRadius: 0,
                }}
            >
                {actionLabel}
            </button>
        </div>
    );
};

export default FormsStreamLanded;
