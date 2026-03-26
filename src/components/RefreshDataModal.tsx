import React, { useState } from 'react';
import { useTheme } from '../app/functionality/ThemeContext';
import { colours } from '../app/styles/colours';

interface RefreshDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (selection: {
    clientCaches: boolean;
    enquiries: boolean;
    matters: boolean;
    reporting: boolean;
  }) => Promise<void> | void;
}

const categories = [
  { key: 'clientCaches' as const, label: 'Client caches', desc: 'localStorage' },
  { key: 'enquiries' as const, label: 'Enquiries', desc: 'server + fetch' },
  { key: 'matters' as const, label: 'Matters', desc: 'server + fetch' },
  { key: 'reporting' as const, label: 'Reporting datasets', desc: 'server only' },
] as const;

const RefreshDataModal: React.FC<RefreshDataModalProps> = ({ isOpen, onClose, onConfirm }) => {
  const { isDarkMode } = useTheme();
  const [selected, setSelected] = useState({ clientCaches: true, enquiries: true, matters: false, reporting: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const toggle = (key: keyof typeof selected) => setSelected(prev => ({ ...prev, [key]: !prev[key] }));

  const handleConfirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm(selected);
      onClose();
    } catch (e: any) {
      setError(e?.message || 'Failed to refresh.');
    } finally {
      setBusy(false);
    }
  };

  const bg = isDarkMode ? colours.dark.cardBackground : '#fff';
  const borderCol = isDarkMode ? colours.dark.borderColor : 'rgba(0,0,0,0.08)';
  const textPrimary = isDarkMode ? colours.dark.text : colours.light.text;
  const textSecondary = isDarkMode ? colours.subtleGrey : colours.greyText;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Refresh data"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 3000,
        background: 'rgba(0, 3, 25, 0.6)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        animation: 'helix-fade-in 150ms ease-out',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '360px',
          maxWidth: '90vw',
          background: bg,
          borderRadius: 0,
          border: `1px solid ${borderCol}`,
          boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
          overflow: 'hidden',
          animation: 'helix-slide-in-up 250ms cubic-bezier(0, 0, 0.2, 1)',
        }}
      >
        {/* Header */}
        <div style={{ padding: '14px 16px', borderBottom: `1px solid ${borderCol}` }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: textPrimary }}>Refresh data</div>
          <div style={{ fontSize: 11, color: textSecondary, marginTop: 2 }}>Choose what to clear and refresh</div>
        </div>

        {/* Options */}
        <div style={{ padding: 16, display: 'grid', gap: 6 }}>
          {categories.map(({ key, label, desc }) => {
            const checked = selected[key];
            return (
              <label
                key={key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 10px',
                  borderRadius: 2,
                  cursor: 'pointer',
                  background: checked
                    ? (isDarkMode ? 'rgba(54, 144, 206, 0.08)' : 'rgba(54, 144, 206, 0.04)')
                    : 'transparent',
                  border: `1px solid ${checked
                    ? (isDarkMode ? 'rgba(54, 144, 206, 0.2)' : 'rgba(54, 144, 206, 0.15)')
                    : 'transparent'}`,
                  transition: 'background 150ms ease, border-color 150ms ease',
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(key)}
                  style={{ width: 14, height: 14, cursor: 'pointer', accentColor: colours.blue }}
                />
                <span style={{ fontSize: 12, fontWeight: 600, color: textPrimary }}>{label}</span>
                <span style={{ fontSize: 10, color: textSecondary, marginLeft: 'auto' }}>{desc}</span>
              </label>
            );
          })}
          {error && (
            <div style={{ color: colours.cta, fontSize: 11, fontWeight: 600, padding: '4px 0' }}>{error}</div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 16px', borderTop: `1px solid ${borderCol}`, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            disabled={busy}
            style={{
              padding: '7px 14px',
              borderRadius: 0,
              border: `1px solid ${borderCol}`,
              background: 'transparent',
              color: textSecondary,
              fontSize: 12,
              fontWeight: 600,
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={busy}
            style={{
              padding: '7px 14px',
              borderRadius: 0,
              border: 'none',
              background: colours.blue,
              color: '#fff',
              fontSize: 12,
              fontWeight: 600,
              cursor: busy ? 'not-allowed' : 'pointer',
              opacity: busy ? 0.7 : 1,
              transition: 'opacity 150ms ease',
            }}
          >
            {busy ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default RefreshDataModal;
