import React, { useEffect, useState } from 'react';
import { Modal, IconButton, Spinner } from '@fluentui/react';

interface ChangelogModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode?: boolean;
}

const ChangelogModal: React.FC<ChangelogModalProps> = ({ isOpen, onClose, isDarkMode = false }) => {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const fetchChangelog = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch('/logs/changelog.md');
        if (!response.ok) throw new Error('Failed to load changelog');
        const text = await response.text();
        setContent(text);
      } catch (err) {
        setError('Failed to load changelog');
        console.error('Changelog load error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchChangelog();
  }, [isOpen]);

  const bg = isDarkMode ? '#1e293b' : '#ffffff';
  const text = isDarkMode ? '#f1f5f9' : '#0f172a';
  const textMuted = isDarkMode ? '#94a3b8' : '#64748b';
  const border = isDarkMode ? '#334155' : '#e2e8f0';
  const bgCode = isDarkMode ? '#0f172a' : '#f8fafc';

  return (
    <Modal
      isOpen={isOpen}
      onDismiss={onClose}
      isBlocking={false}
      styles={{
        main: {
          width: '90vw',
          height: '90vh',
          maxWidth: '1200px',
          maxHeight: '900px',
          padding: 0,
          background: bg,
          borderRadius: '8px',
          overflow: 'hidden',
        },
        scrollableContent: {
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }
      }}
    >
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: `1px solid ${border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={text} strokeWidth="2">
              <path d="M12 8v4l3 3"/>
              <circle cx="12" cy="12" r="10"/>
            </svg>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: text }}>
              Session Changelog
            </h2>
          </div>
          <IconButton
            iconProps={{ iconName: 'ChromeClose' }}
            onClick={onClose}
            styles={{
              root: {
                color: textMuted,
                ':hover': { background: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }
              }
            }}
          />
        </div>

        {/* Content */}
        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: '24px',
        }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px' }}>
              <Spinner label="Loading changelog..." />
            </div>
          ) : error ? (
            <div style={{ 
              padding: '20px', 
              textAlign: 'center', 
              color: '#ef4444',
              background: isDarkMode ? 'rgba(239, 68, 68, 0.1)' : 'rgba(239, 68, 68, 0.05)',
              borderRadius: '6px'
            }}>
              {error}
            </div>
          ) : (
            <div style={{
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              fontSize: '13px',
              lineHeight: '1.8',
              color: text,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}>
              {content.split('\n').map((line, i) => {
                // Style headers differently
                if (line.startsWith('# ')) {
                  return (
                    <div key={i} style={{
                      fontSize: '20px',
                      fontWeight: 700,
                      marginTop: i > 0 ? '32px' : 0,
                      marginBottom: '16px',
                      color: text,
                      borderBottom: `2px solid ${border}`,
                      paddingBottom: '8px',
                    }}>
                      {line.replace('# ', '')}
                    </div>
                  );
                }

                // Style individual entries - extract only the title (between first and second /)
                if (line.match(/^\d{4}-\d{2}-\d{2}/)) {
                  const parts = line.split(' / ');
                  if (parts.length >= 2) {
                    const date = parts[0];
                    const title = parts[1]; // Just the title, not the full description
                    
                    return (
                      <div key={i} style={{
                        marginBottom: '8px',
                        padding: '8px 12px',
                        background: bgCode,
                        border: `1px solid ${border}`,
                        borderRadius: '4px',
                        borderLeft: `3px solid ${isDarkMode ? '#60a5fa' : '#3690CE'}`,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                      }}>
                        <span style={{ color: isDarkMode ? '#60a5fa' : '#3690CE', fontWeight: 600, flexShrink: 0 }}>
                          {date}
                        </span>
                        <span style={{ color: textMuted, flexShrink: 0 }}>•</span>
                        <span style={{ color: text, flex: 1 }}>
                          {title}
                        </span>
                      </div>
                    );
                  }
                }

                // Skip empty lines and regular text
                return null;
              })}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default ChangelogModal;
