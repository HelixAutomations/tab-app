import React, { useState } from 'react';

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

const RefreshDataModal: React.FC<RefreshDataModalProps> = ({ isOpen, onClose, onConfirm }) => {
  const [clientCaches, setClientCaches] = useState(true);
  const [enquiries, setEnquiries] = useState(true);
  const [matters, setMatters] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm({ clientCaches, enquiries, matters, reporting });
      onClose();
    } catch (e: any) {
      setError(e?.message || 'Failed to refresh.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Refresh data"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 3000,
        background: 'rgba(0,0,0,0.35)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '360px',
          maxWidth: '90vw',
          background: '#fff',
          borderRadius: 12,
          border: '1px solid rgba(0,0,0,0.08)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
          <div style={{ fontWeight: 700 }}>Refresh data</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Choose what to clear and refresh</div>
        </div>
        <div style={{ padding: 16, display: 'grid', gap: 10 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={clientCaches} onChange={(e) => setClientCaches(e.target.checked)} />
            <span>Client caches (localStorage)</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={enquiries} onChange={(e) => setEnquiries(e.target.checked)} />
            <span>Enquiries (server + fetch)</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={matters} onChange={(e) => setMatters(e.target.checked)} />
            <span>Matters (server + fetch)</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={reporting} onChange={(e) => setReporting(e.target.checked)} />
            <span>Reporting datasets (server only)</span>
          </label>
          {error && (
            <div style={{ color: '#b91c1c', fontSize: 12 }}>{error}</div>
          )}
        </div>
        <div style={{ padding: 16, borderTop: '1px solid rgba(0,0,0,0.08)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} disabled={busy} style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff' }}>Cancel</button>
          <button onClick={handleConfirm} disabled={busy} style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #0ea5e9', background: '#0ea5e9', color: '#fff', fontWeight: 600 }}>{busy ? 'Refreshing…' : 'Refresh'}</button>
        </div>
      </div>
    </div>
  );
};

export default RefreshDataModal;
