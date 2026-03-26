import React, { useState, useEffect, useCallback } from 'react';
import { FiAlertCircle, FiCheckCircle, FiExternalLink, FiRefreshCw } from 'react-icons/fi';
import { colours } from '../../app/styles/colours';
import { useTheme } from '../../app/functionality/ThemeContext';

interface AgedDebtItem {
  id: number;
  matter_ref: string;
  matter_description: string | null;
  fee_earner: string | null;
  amount: number;
  transaction_date: string | null;
  lifecycle_status: string | null;
  external_task_url: string | null;
  created_at: string | null;
  notes: string | null;
}

interface AgedDebtsReportProps {
  onBack: () => void;
  showToast?: (message: string, type: 'success' | 'warning' | 'error' | 'info') => void;
}

const AgedDebtsReport: React.FC<AgedDebtsReportProps> = ({ onBack, showToast }) => {
  const { isDarkMode } = useTheme();
  const [debts, setDebts] = useState<AgedDebtItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const textPrimary = isDarkMode ? colours.dark.text : colours.light.text;
  const textBody = isDarkMode ? '#d1d5db' : '#374151';
  const textMuted = isDarkMode ? colours.subtleGrey : colours.greyText;
  const accent = isDarkMode ? colours.accent : colours.highlight;
  const cardBg = isDarkMode ? 'rgba(6, 23, 51, 0.55)' : '#FFFFFF';
  const hoverBg = isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(13,47,96,0.03)';

  const fetchDebts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/transactions-v2/debts');
      if (!res.ok) throw new Error('Failed to load debts');
      const data = await res.json();
      setDebts(data.items || []);
    } catch (e: any) {
      setError(e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDebts(); }, [fetchDebts]);

  const formatAmount = (amount: number): string => {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(amount);
  };

  const shortDate = (iso: string | null): string => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  // Group by fee earner
  const grouped = debts.reduce<Record<string, AgedDebtItem[]>>((acc, d) => {
    const fe = d.fee_earner || 'Unassigned';
    if (!acc[fe]) acc[fe] = [];
    acc[fe].push(d);
    return acc;
  }, {});

  const totalDebt = debts.reduce((sum, d) => sum + (d.amount || 0), 0);

  return (
    <div style={{ padding: 16, fontFamily: "'Raleway', 'Segoe UI', sans-serif" }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: accent }}>
            Aged Debts
          </span>
          {!loading && (
            <span style={{ fontSize: 11, color: textMuted }}>
              {debts.length} items · {formatAmount(totalDebt)}
            </span>
          )}
        </div>
        <button
          onClick={fetchDebts}
          disabled={loading}
          style={{
            background: 'transparent',
            border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.25)' : 'rgba(13, 47, 96, 0.12)'}`,
            borderRadius: 0, padding: '4px 10px',
            cursor: loading ? 'wait' : 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 10, fontWeight: 600, color: accent,
            fontFamily: "'Raleway', 'Segoe UI', sans-serif",
            opacity: loading ? 0.5 : 1,
          }}
        >
          <FiRefreshCw size={10} style={{ animation: loading ? 'spin 1s linear infinite' : undefined }} />
          Refresh
        </button>
      </div>

      {loading && (
        <div style={{ padding: 24, textAlign: 'center', color: textMuted, fontSize: 11 }}>Loading debts…</div>
      )}

      {error && (
        <div style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 6, color: colours.cta, fontSize: 11 }}>
          <FiAlertCircle size={12} />
          {error}
        </div>
      )}

      {!loading && !error && debts.length === 0 && (
        <div style={{ padding: 24, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, color: textMuted, fontSize: 11 }}>
          <FiCheckCircle size={12} color={colours.green} />
          No aged debts outstanding
        </div>
      )}

      {!loading && !error && Object.keys(grouped).length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {Object.entries(grouped).sort(([, a], [, b]) => b.reduce((s, d) => s + d.amount, 0) - a.reduce((s, d) => s + d.amount, 0)).map(([fe, items]) => {
            const feTotal = items.reduce((s, d) => s + d.amount, 0);
            return (
              <div key={fe} style={{
                background: cardBg,
                border: `1px solid ${isDarkMode ? 'rgba(54,144,206,0.08)' : 'rgba(13,47,96,0.08)'}`,
              }}>
                <div style={{
                  padding: '8px 12px',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  borderBottom: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(13,47,96,0.06)'}`,
                }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: textPrimary }}>{fe}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: colours.cta }}>{formatAmount(feTotal)}</span>
                </div>
                <div style={{ padding: '4px 8px 6px' }}>
                  {items.map(item => (
                    <div
                      key={item.id}
                      style={{
                        padding: '5px 6px',
                        borderLeft: `2px solid ${item.lifecycle_status === 'approved' ? colours.green : colours.orange}`,
                        marginBottom: 3,
                        transition: 'background 0.14s ease',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = hoverBg; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 10, fontWeight: 600, color: textPrimary, flex: 1 }}>{item.matter_ref}</span>
                        <span style={{ fontSize: 10, fontWeight: 600, color: textPrimary }}>{formatAmount(item.amount)}</span>
                        {item.external_task_url && (
                          <a
                            href={item.external_task_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Open in Asana"
                            style={{ color: accent, opacity: 0.7 }}
                          >
                            <FiExternalLink size={9} />
                          </a>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 1 }}>
                        {item.matter_description && (
                          <span style={{ fontSize: 9, color: textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                            {item.matter_description}
                          </span>
                        )}
                        <span style={{ fontSize: 9, color: textMuted }}>{shortDate(item.transaction_date)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AgedDebtsReport;
