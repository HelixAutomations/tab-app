import React, { useState, useMemo } from 'react';
import { Enquiry, UserData } from '../../../app/functionality/types';
import { ProspectHeader } from '../components/ProspectHeader';
import { useTheme } from '../../../app/functionality/ThemeContext';

/**
 * Safe clipboard copy with fallback for Teams context.
 */
async function safeCopyToClipboard(text: string): Promise<boolean> {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) return false;
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(trimmed);
      return true;
    }
    const textarea = document.createElement('textarea');
    textarea.value = trimmed;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    return true;
  } catch {
    return false;
  }
}

export interface VerificationSummaryProps {
  isDarkMode: boolean;
  userData: UserData[] | null | undefined;
  enquiry: Enquiry;
  amount?: string | number;
  passcode?: string;
  usedPitchRoute: boolean;
  onPreview?: (link: string) => void;
}

/**
 * Verification summary for Pitch Builder - shows prospect header + notes.
 */
export const VerificationSummary: React.FC<VerificationSummaryProps> = ({
  userData,
  enquiry,
  passcode,
}) => {
  const { isDarkMode } = useTheme();
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [notesCopied, setNotesCopied] = useState(false);

  // Theme
  const textPrimary = isDarkMode ? '#F1F5F9' : '#1E293B';
  const textSecondary = isDarkMode ? '#94A3B8' : '#64748B';
  const borderColor = isDarkMode ? 'rgba(125, 211, 252, 0.2)' : 'rgba(148, 163, 184, 0.25)';
  const accent = isDarkMode ? '#7DD3FC' : '#3690CE';
  const cardBg = isDarkMode 
    ? 'linear-gradient(135deg, rgba(7, 16, 32, 0.94) 0%, rgba(11, 30, 55, 0.86) 100%)'
    : '#FFFFFF';

  // Notes
  const notesDisplay = (enquiry?.Initial_first_call_notes || '').trim();
  const notesIsLong = useMemo(() => {
    if (!notesDisplay) return false;
    const lines = notesDisplay.split(/\r?\n/).length;
    return notesDisplay.length > 400 || lines > 8;
  }, [notesDisplay]);

  const handleCopyNotes = async () => {
    const ok = await safeCopyToClipboard(notesDisplay);
    if (ok) {
      setNotesCopied(true);
      setTimeout(() => setNotesCopied(false), 1500);
    }
  };

  return (
    <div>
      {/* Prospect Header */}
      <ProspectHeader
        enquiry={enquiry}
        userData={userData ?? undefined}
        passcode={passcode}
        showFeeEarnerToggle
      />

      {/* Notes Section */}
      {notesDisplay && (
        <div style={{
          background: cardBg,
          border: `1px solid ${borderColor}`,
          borderRadius: '4px',
          padding: '16px 20px',
          boxShadow: isDarkMode 
            ? '0 2px 8px rgba(0,0,0,0.15)' 
            : '0 2px 8px rgba(0,0,0,0.04)',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '12px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{
                width: '3px',
                height: '16px',
                background: accent,
                borderRadius: '2px',
              }} />
              <span style={{
                fontSize: '13px',
                fontWeight: 700,
                color: textPrimary,
                letterSpacing: '0.3px',
              }}>
                Initial Notes
              </span>
            </div>
            <button
              onClick={handleCopyNotes}
              style={{
                fontSize: '11px',
                fontWeight: 600,
                padding: '5px 12px',
                borderRadius: '3px',
                border: `1px solid ${borderColor}`,
                background: notesCopied 
                  ? (isDarkMode ? 'rgba(16, 185, 129, 0.1)' : 'rgba(16, 185, 129, 0.08)')
                  : 'transparent',
                color: notesCopied ? '#10B981' : textSecondary,
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {notesCopied ? '✓ Copied' : 'Copy'}
            </button>
          </div>

          <div style={{
            background: isDarkMode ? 'rgba(15, 23, 42, 0.5)' : '#F8FAFC',
            border: `1px solid ${isDarkMode ? 'rgba(125, 211, 252, 0.12)' : 'rgba(148, 163, 184, 0.18)'}`,
            borderRadius: '4px',
            padding: '12px 14px',
          }}>
            <div style={{
              color: textPrimary,
              fontSize: '13px',
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
              maxHeight: notesIsLong && !notesExpanded ? 140 : undefined,
              overflow: notesIsLong && !notesExpanded ? 'hidden' : undefined,
              position: 'relative',
            }}>
              {notesDisplay}
              {notesIsLong && !notesExpanded && (
                <div style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: 40,
                  background: isDarkMode
                    ? 'linear-gradient(transparent, rgba(15, 23, 42, 0.95))'
                    : 'linear-gradient(transparent, #F8FAFC)',
                }} />
              )}
            </div>
          </div>

          {notesIsLong && (
            <button
              onClick={() => setNotesExpanded(v => !v)}
              style={{
                fontSize: '11px',
                fontWeight: 600,
                padding: '5px 12px',
                borderRadius: '3px',
                border: `1px solid ${borderColor}`,
                background: 'transparent',
                color: textSecondary,
                cursor: 'pointer',
                marginTop: '12px',
              }}
            >
              {notesExpanded ? 'Show less' : 'Show more'}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default VerificationSummary;
