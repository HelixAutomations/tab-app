import React from 'react';
import type { CSSProperties } from 'react';
import { colours } from '../../../app/styles/colours';
import { useTheme } from '../../../app/functionality/ThemeContext';

type MatterSearchResult = {
  matterId: number | null;
  displayNumber: string;
  clientName: string;
  responsibleSolicitor: string | null;
  practiceArea: string | null;
  description: string | null;
  status: 'active' | 'closed';
  originalStatus: string | null;
  openDate: string | null;
  closeDate: string | null;
};

type AgeingBuckets = {
  current: number;
  days_1_30: number;
  days_31_60: number;
  days_61_90: number;
  days_90_plus: number;
  undated: number;
};

type MatterExposureBill = {
  billId: number | null;
  billNumber: string;
  issuedAt: string | null;
  dueAt: string | null;
  dueAmount: number;
  totalAmount: number;
  paidAmount: number;
  pendingAmount: number;
  state: string | null;
  shared: boolean;
  kind: string | null;
  lastSentAt: string | null;
  paidAt: string | null;
  ageingBucket: keyof AgeingBuckets;
  isOverdue: boolean;
};

type MatterExposureClient = {
  balanceId: number;
  contactId: number | null;
  contactName: string;
  totalOutstandingBalance: number;
  lastPaymentDate: string | null;
  lastSharedDate: string | null;
  newestIssuedBillDueDate: string | null;
  pendingPaymentsTotal: number;
  remindersEnabled: boolean;
  currency: { id: number | null; code: string; sign: string };
  matterCount: number;
  associationType: 'exclusive' | 'shared';
  linkedMatterIds: number[];
  linkedMatters: Array<{
    matterId: number | null;
    displayNumber: string;
    clientName: string;
  }>;
  billCount: number;
  overdueBillCount: number;
  overdueExposure: number;
  ageingBuckets: AgeingBuckets;
  bills: MatterExposureBill[];
};

type MatterExposureBreakdown = {
  matter: MatterSearchResult;
  source: string;
  snapshot: {
    lastSync: string | null;
    status: string | null;
  };
  totals: {
    linkedClientCount: number;
    totalLinkedExposure: number;
    exclusiveExposure: number;
    sharedExposure: number;
    overdueExposure: number;
    pendingPaymentsTotal: number;
    billCount: number;
    overdueBillCount: number;
    ageingBuckets: AgeingBuckets;
  };
  clients: MatterExposureClient[];
};

interface OutstandingMatterExplorerProps {
  formatCurrency: (value: number) => string;
}

const bucketLabelMap: Record<keyof AgeingBuckets, string> = {
  current: 'Current',
  days_1_30: '1-30',
  days_31_60: '31-60',
  days_61_90: '61-90',
  days_90_plus: '90+',
  undated: 'Undated',
};

const searchInputStyle = (isDarkMode: boolean): CSSProperties => ({
  width: '100%',
  border: `1px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.5)' : 'rgba(6, 23, 51, 0.12)'}`,
  background: isDarkMode ? 'rgba(8, 28, 48, 0.92)' : 'rgba(255, 255, 255, 0.96)',
  color: isDarkMode ? colours.dark.text : colours.light.text,
  padding: '9px 10px',
  fontSize: 12,
  outline: 'none',
  borderRadius: 0,
});

const selectStyle = (isDarkMode: boolean): CSSProperties => ({
  border: `1px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.5)' : 'rgba(6, 23, 51, 0.12)'}`,
  background: isDarkMode ? 'rgba(8, 28, 48, 0.92)' : 'rgba(255, 255, 255, 0.96)',
  color: isDarkMode ? colours.dark.text : colours.light.text,
  padding: '8px 10px',
  fontSize: 11,
  outline: 'none',
  borderRadius: 0,
});

const listButtonStyle = (isDarkMode: boolean, isSelected: boolean): CSSProperties => ({
  width: '100%',
  textAlign: 'left',
  border: `1px solid ${isSelected
    ? (isDarkMode ? 'rgba(135, 243, 243, 0.35)' : 'rgba(54, 144, 206, 0.25)')
    : (isDarkMode ? 'rgba(75, 85, 99, 0.28)' : 'rgba(6, 23, 51, 0.08)')}`,
  background: isSelected
    ? (isDarkMode ? 'rgba(135, 243, 243, 0.08)' : 'rgba(54, 144, 206, 0.06)')
    : (isDarkMode ? 'rgba(8, 28, 48, 0.65)' : 'rgba(255, 255, 255, 0.8)'),
  color: isDarkMode ? colours.dark.text : colours.light.text,
  padding: '10px 12px',
  cursor: 'pointer',
  borderRadius: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
});

const statCardStyle = (isDarkMode: boolean): CSSProperties => ({
  display: 'flex',
  flexDirection: 'column',
  gap: 3,
  padding: '10px 12px',
  background: isDarkMode ? 'rgba(8, 28, 48, 0.72)' : 'rgba(255, 255, 255, 0.82)',
  border: `1px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.28)' : 'rgba(6, 23, 51, 0.08)'}`,
  minHeight: 66,
});

const helperTextStyle = (isDarkMode: boolean): CSSProperties => ({
  fontSize: 10,
  lineHeight: 1.5,
  color: isDarkMode ? '#d1d5db' : '#374151',
});

const mutedTextStyle = (isDarkMode: boolean): CSSProperties => ({
  fontSize: 10,
  color: isDarkMode ? colours.greyText : colours.subtleGrey,
});

const pillStyle = (isDarkMode: boolean, tone: 'neutral' | 'accent' | 'warning'): CSSProperties => ({
  fontSize: 10,
  fontWeight: 700,
  padding: '4px 6px',
  border: `1px solid ${tone === 'accent'
    ? (isDarkMode ? 'rgba(135, 243, 243, 0.25)' : 'rgba(54, 144, 206, 0.18)')
    : tone === 'warning'
      ? 'rgba(255, 140, 0, 0.25)'
      : (isDarkMode ? 'rgba(75, 85, 99, 0.28)' : 'rgba(6, 23, 51, 0.08)')}`,
  color: tone === 'accent'
    ? (isDarkMode ? colours.accent : colours.highlight)
    : tone === 'warning'
      ? colours.orange
      : (isDarkMode ? colours.greyText : colours.subtleGrey),
});

function formatDateLabel(value: string | null, includeYear = true) {
  if (!value) return 'None';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'None';
  return parsed.toLocaleDateString('en-GB', includeYear
    ? { day: '2-digit', month: 'short', year: 'numeric' }
    : { day: '2-digit', month: 'short' });
}

const OutstandingMatterExplorer: React.FC<OutstandingMatterExplorerProps> = ({ formatCurrency }) => {
  const { isDarkMode } = useTheme();
  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState<MatterSearchResult[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [searchError, setSearchError] = React.useState<string | null>(null);
  const [selectedMatter, setSelectedMatter] = React.useState<MatterSearchResult | null>(null);
  const [breakdown, setBreakdown] = React.useState<MatterExposureBreakdown | null>(null);
  const [loadingBreakdown, setLoadingBreakdown] = React.useState(false);
  const [breakdownError, setBreakdownError] = React.useState<string | null>(null);
  const [associationFilter, setAssociationFilter] = React.useState<'all' | 'exclusive' | 'shared'>('all');
  const [clientSort, setClientSort] = React.useState<'balance' | 'overdue' | 'recentPayment'>('balance');
  const [billFilter, setBillFilter] = React.useState<'all' | 'overdue'>('all');
  const [expandedClients, setExpandedClients] = React.useState<Record<number, boolean>>({});

  React.useEffect(() => {
    const trimmedQuery = query.trim();
    if (trimmedQuery.length < 2) {
      setResults([]);
      setSearchError(null);
      setSearching(false);
      return undefined;
    }

    let cancelled = false;
    setSearching(true);
    setSearchError(null);

    const timeoutId = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/outstanding-balances/matter-search?q=${encodeURIComponent(trimmedQuery)}&limit=8`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          throw new Error(data?.error || 'Matter search failed');
        }
        setResults(Array.isArray(data?.results) ? data.results : []);
      } catch (error) {
        if (cancelled) return;
        setSearchError(error instanceof Error ? error.message : 'Matter search failed');
      } finally {
        if (!cancelled) {
          setSearching(false);
        }
      }
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [query]);

  const loadBreakdown = React.useCallback(async (matter: MatterSearchResult) => {
    if (!matter.matterId) return;

    setSelectedMatter(matter);
    setLoadingBreakdown(true);
    setBreakdownError(null);

    try {
      const res = await fetch(`/api/outstanding-balances/matter/${matter.matterId}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Unable to load matter exposure');
      }
      setBreakdown(data);
    } catch (error) {
      setBreakdown(null);
      setBreakdownError(error instanceof Error ? error.message : 'Unable to load matter exposure');
    } finally {
      setLoadingBreakdown(false);
    }
  }, []);

  React.useEffect(() => {
    if (!breakdown?.clients?.length) {
      setExpandedClients({});
      return;
    }

    setExpandedClients({ [breakdown.clients[0].balanceId]: true });
  }, [breakdown]);

  const visibleClients = React.useMemo(() => {
    if (!breakdown) return [];

    const filtered = breakdown.clients.filter((client) => (
      associationFilter === 'all' ? true : client.associationType === associationFilter
    ));

    const sorted = [...filtered].sort((left, right) => {
      if (clientSort === 'overdue') {
        if (right.overdueExposure !== left.overdueExposure) return right.overdueExposure - left.overdueExposure;
        return right.totalOutstandingBalance - left.totalOutstandingBalance;
      }
      if (clientSort === 'recentPayment') {
        const leftTs = left.lastPaymentDate ? Date.parse(left.lastPaymentDate) : 0;
        const rightTs = right.lastPaymentDate ? Date.parse(right.lastPaymentDate) : 0;
        if (rightTs !== leftTs) return rightTs - leftTs;
        return right.totalOutstandingBalance - left.totalOutstandingBalance;
      }
      return right.totalOutstandingBalance - left.totalOutstandingBalance;
    });

    return sorted.map((client) => ({
      ...client,
      visibleBills: client.bills.filter((bill) => (billFilter === 'all' ? true : bill.isOverdue)),
    }));
  }, [associationFilter, billFilter, breakdown, clientSort]);

  const hasStoredBillDetail = Boolean((breakdown?.totals.billCount || 0) > 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        paddingTop: 4,
        borderTop: `1px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.18)' : 'rgba(6, 23, 51, 0.08)'}`,
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: isDarkMode ? colours.dark.text : colours.light.text }}>
            Matter explorer
          </span>
          <span style={helperTextStyle(isDarkMode)}>
            Search a matter ref, client, or responsible solicitor to inspect linked outstanding exposure, bill detail, and ageing from the saved SQL snapshot.
          </span>
        </div>

        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search matter ref, client, or fee earner"
          style={searchInputStyle(isDarkMode)}
        />

        {searching && <span style={mutedTextStyle(isDarkMode)}>Searching matters...</span>}
        {!searching && searchError && <span style={{ ...mutedTextStyle(isDarkMode), color: colours.cta }}>{searchError}</span>}
        {!searching && !searchError && query.trim().length >= 2 && results.length === 0 && (
          <span style={mutedTextStyle(isDarkMode)}>No matching matters found.</span>
        )}

        {results.length > 0 && (
          <div style={{ display: 'grid', gap: 8 }}>
            {results.map((result) => (
              <button
                key={`${result.matterId}-${result.displayNumber}`}
                onClick={() => loadBreakdown(result)}
                style={listButtonStyle(isDarkMode, selectedMatter?.matterId === result.matterId)}
              >
                <span style={{ fontSize: 12, fontWeight: 700 }}>{result.displayNumber}</span>
                <span style={{ fontSize: 11 }}>{result.clientName}</span>
                <span style={mutedTextStyle(isDarkMode)}>
                  {result.responsibleSolicitor || 'No responsible solicitor'}
                  {result.practiceArea ? ` • ${result.practiceArea}` : ''}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {(selectedMatter || breakdown || loadingBreakdown || breakdownError) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {selectedMatter && (
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <a
                  href={selectedMatter.matterId ? `https://eu.app.clio.com/nc/#/matters/${selectedMatter.matterId}` : undefined}
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontSize: 15, fontWeight: 700, color: isDarkMode ? colours.accent : colours.highlight, textDecoration: 'none' }}
                >
                  {selectedMatter.displayNumber}
                </a>
                <span style={{ fontSize: 12, fontWeight: 600, color: isDarkMode ? colours.dark.text : colours.light.text }}>
                  {selectedMatter.clientName}
                </span>
                <span style={mutedTextStyle(isDarkMode)}>
                  {selectedMatter.responsibleSolicitor || 'No responsible solicitor'}
                  {selectedMatter.practiceArea ? ` • ${selectedMatter.practiceArea}` : ''}
                </span>
              </div>
              <button
                onClick={() => {
                  setSelectedMatter(null);
                  setBreakdown(null);
                  setBreakdownError(null);
                  setExpandedClients({});
                }}
                style={{
                  border: 'none',
                  background: 'none',
                  color: isDarkMode ? colours.accent : colours.highlight,
                  fontSize: 10,
                  fontWeight: 700,
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                Clear
              </button>
            </div>
          )}

          {loadingBreakdown && <span style={mutedTextStyle(isDarkMode)}>Loading linked exposure...</span>}
          {!loadingBreakdown && breakdownError && <span style={{ ...mutedTextStyle(isDarkMode), color: colours.cta }}>{breakdownError}</span>}

          {!loadingBreakdown && breakdown && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
                <div style={statCardStyle(isDarkMode)}>
                  <span style={mutedTextStyle(isDarkMode)}>Linked exposure</span>
                  <span style={{ fontSize: 18, fontWeight: 700, color: isDarkMode ? colours.dark.text : colours.light.text }}>
                    {formatCurrency(breakdown.totals.totalLinkedExposure)}
                  </span>
                </div>
                <div style={statCardStyle(isDarkMode)}>
                  <span style={mutedTextStyle(isDarkMode)}>Exclusive to matter</span>
                  <span style={{ fontSize: 18, fontWeight: 700, color: isDarkMode ? colours.dark.text : colours.light.text }}>
                    {formatCurrency(breakdown.totals.exclusiveExposure)}
                  </span>
                </div>
                <div style={statCardStyle(isDarkMode)}>
                  <span style={mutedTextStyle(isDarkMode)}>Shared across matters</span>
                  <span style={{ fontSize: 18, fontWeight: 700, color: isDarkMode ? colours.dark.text : colours.light.text }}>
                    {formatCurrency(breakdown.totals.sharedExposure)}
                  </span>
                </div>
                <div style={statCardStyle(isDarkMode)}>
                  <span style={mutedTextStyle(isDarkMode)}>Overdue exposure</span>
                  <span style={{ fontSize: 18, fontWeight: 700, color: breakdown.totals.overdueExposure > 0 ? colours.orange : (isDarkMode ? colours.dark.text : colours.light.text) }}>
                    {formatCurrency(breakdown.totals.overdueExposure)}
                  </span>
                </div>
                <div style={statCardStyle(isDarkMode)}>
                  <span style={mutedTextStyle(isDarkMode)}>Pending payments</span>
                  <span style={{ fontSize: 18, fontWeight: 700, color: isDarkMode ? colours.dark.text : colours.light.text }}>
                    {formatCurrency(breakdown.totals.pendingPaymentsTotal)}
                  </span>
                </div>
                <div style={statCardStyle(isDarkMode)}>
                  <span style={mutedTextStyle(isDarkMode)}>Bill rows / overdue</span>
                  <span style={{ fontSize: 18, fontWeight: 700, color: isDarkMode ? colours.dark.text : colours.light.text }}>
                    {breakdown.totals.billCount.toLocaleString('en-GB')} / {breakdown.totals.overdueBillCount.toLocaleString('en-GB')}
                  </span>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))', gap: 8 }}>
                {(Object.keys(bucketLabelMap) as Array<keyof AgeingBuckets>).map((bucketKey) => (
                  <div key={bucketKey} style={statCardStyle(isDarkMode)}>
                    <span style={mutedTextStyle(isDarkMode)}>{bucketLabelMap[bucketKey]}</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: isDarkMode ? colours.dark.text : colours.light.text }}>
                      {formatCurrency(breakdown.totals.ageingBuckets[bucketKey])}
                    </span>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={helperTextStyle(isDarkMode)}>
                  Shared exposure means the client balance is linked to this matter and at least one other matter. It is still not a true per-matter allocation.
                </span>
                <span style={mutedTextStyle(isDarkMode)}>
                  Snapshot source: {breakdown.source} • Last sync: {formatDateLabel(breakdown.snapshot.lastSync)} • Stored bill detail: {hasStoredBillDetail ? 'available' : 'not yet populated'}
                </span>
                {!hasStoredBillDetail && breakdown.totals.linkedClientCount > 0 && (
                  <span style={{ ...mutedTextStyle(isDarkMode), color: colours.orange }}>
                    Existing rows were likely synced before bill detail was added. Run Outstanding balances sync to populate bill-level detail.
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <select value={associationFilter} onChange={(event) => setAssociationFilter(event.target.value as 'all' | 'exclusive' | 'shared')} style={selectStyle(isDarkMode)}>
                  <option value="all">All clients</option>
                  <option value="exclusive">Exclusive only</option>
                  <option value="shared">Shared only</option>
                </select>
                <select value={clientSort} onChange={(event) => setClientSort(event.target.value as 'balance' | 'overdue' | 'recentPayment')} style={selectStyle(isDarkMode)}>
                  <option value="balance">Sort by exposure</option>
                  <option value="overdue">Sort by overdue</option>
                  <option value="recentPayment">Sort by recent payment</option>
                </select>
                <select value={billFilter} onChange={(event) => setBillFilter(event.target.value as 'all' | 'overdue')} style={selectStyle(isDarkMode)}>
                  <option value="all">All bills</option>
                  <option value="overdue">Overdue bills only</option>
                </select>
              </div>

              <div style={{ display: 'grid', gap: 8 }}>
                {visibleClients.length === 0 && (
                  <div style={{ ...statCardStyle(isDarkMode), minHeight: 'auto' }}>
                    <span style={helperTextStyle(isDarkMode)}>No linked clients match the current filter.</span>
                  </div>
                )}

                {visibleClients.map((client) => {
                  const isExpanded = Boolean(expandedClients[client.balanceId]);
                  return (
                    <div
                      key={client.balanceId}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                        padding: '12px 12px 10px',
                        background: isDarkMode ? 'rgba(8, 28, 48, 0.72)' : 'rgba(255, 255, 255, 0.82)',
                        border: `1px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.28)' : 'rgba(6, 23, 51, 0.08)'}`,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: isDarkMode ? colours.dark.text : colours.light.text }}>
                            {client.contactName}
                          </span>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            <span style={pillStyle(isDarkMode, client.associationType === 'exclusive' ? 'accent' : 'warning')}>
                              {client.associationType === 'exclusive' ? 'Exclusive' : `Shared x${client.matterCount}`}
                            </span>
                            {client.overdueBillCount > 0 && (
                              <span style={pillStyle(isDarkMode, 'warning')}>
                                {client.overdueBillCount} overdue
                              </span>
                            )}
                            {client.remindersEnabled && (
                              <span style={pillStyle(isDarkMode, 'neutral')}>
                                Reminders on
                              </span>
                            )}
                          </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: isDarkMode ? colours.dark.text : colours.light.text }}>
                            {formatCurrency(client.totalOutstandingBalance)}
                          </span>
                          <span style={mutedTextStyle(isDarkMode)}>Overdue: {formatCurrency(client.overdueExposure)}</span>
                          <span style={mutedTextStyle(isDarkMode)}>Pending: {formatCurrency(client.pendingPaymentsTotal)}</span>
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
                        <div style={statCardStyle(isDarkMode)}>
                          <span style={mutedTextStyle(isDarkMode)}>Last payment</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: isDarkMode ? colours.dark.text : colours.light.text }}>
                            {formatDateLabel(client.lastPaymentDate, false)}
                          </span>
                        </div>
                        <div style={statCardStyle(isDarkMode)}>
                          <span style={mutedTextStyle(isDarkMode)}>Next due in set</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: isDarkMode ? colours.dark.text : colours.light.text }}>
                            {formatDateLabel(client.newestIssuedBillDueDate, false)}
                          </span>
                        </div>
                        <div style={statCardStyle(isDarkMode)}>
                          <span style={mutedTextStyle(isDarkMode)}>Bills shown</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: isDarkMode ? colours.dark.text : colours.light.text }}>
                            {client.visibleBills.length.toLocaleString('en-GB')} / {client.billCount.toLocaleString('en-GB')}
                          </span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {client.linkedMatters.map((linkedMatter) => (
                          <span key={`${client.balanceId}-${linkedMatter.matterId}-${linkedMatter.displayNumber}`} style={pillStyle(isDarkMode, 'accent')}>
                            {linkedMatter.displayNumber}
                          </span>
                        ))}
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(84px, 1fr))', gap: 6 }}>
                        {(Object.keys(bucketLabelMap) as Array<keyof AgeingBuckets>).map((bucketKey) => (
                          <div key={`${client.balanceId}-${bucketKey}`} style={statCardStyle(isDarkMode)}>
                            <span style={mutedTextStyle(isDarkMode)}>{bucketLabelMap[bucketKey]}</span>
                            <span style={{ fontSize: 12, fontWeight: 700, color: isDarkMode ? colours.dark.text : colours.light.text }}>
                              {formatCurrency(client.ageingBuckets[bucketKey])}
                            </span>
                          </div>
                        ))}
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => setExpandedClients((prev) => ({ ...prev, [client.balanceId]: !prev[client.balanceId] }))}
                          style={{
                            border: 'none',
                            background: 'none',
                            color: isDarkMode ? colours.accent : colours.highlight,
                            fontSize: 10,
                            fontWeight: 700,
                            cursor: 'pointer',
                            padding: 0,
                          }}
                        >
                          {isExpanded ? 'Hide bill detail' : 'Show bill detail'}
                        </button>
                      </div>

                      {isExpanded && (
                        <div style={{ display: 'grid', gap: 6 }}>
                          {client.visibleBills.length === 0 && (
                            <div style={{ ...statCardStyle(isDarkMode), minHeight: 'auto' }}>
                              <span style={helperTextStyle(isDarkMode)}>
                                {client.billCount === 0
                                  ? 'No bill detail stored for this client in the current snapshot.'
                                  : 'No bill rows match the current bill filter.'}
                              </span>
                            </div>
                          )}

                          {client.visibleBills.map((bill) => (
                            <div
                              key={`${client.balanceId}-${bill.billId}-${bill.billNumber}`}
                              style={{
                                display: 'grid',
                                gridTemplateColumns: 'minmax(0, 1.2fr) repeat(4, minmax(90px, 0.8fr))',
                                gap: 8,
                                alignItems: 'center',
                                padding: '10px 10px',
                                border: `1px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.22)' : 'rgba(6, 23, 51, 0.06)'}`,
                                background: isDarkMode ? 'rgba(2, 12, 24, 0.32)' : 'rgba(248, 250, 252, 0.6)',
                              }}
                            >
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <a
                                  href={bill.billId ? `https://eu.app.clio.com/nc/#/bills/${bill.billId}` : undefined}
                                  target="_blank"
                                  rel="noreferrer"
                                  style={{ fontSize: 11, fontWeight: 700, color: isDarkMode ? colours.accent : colours.highlight, textDecoration: 'none' }}
                                >
                                  {bill.billNumber}
                                </a>
                                <span style={mutedTextStyle(isDarkMode)}>
                                  Due {formatDateLabel(bill.dueAt, false)} • {bucketLabelMap[bill.ageingBucket]}
                                </span>
                              </div>

                              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <span style={mutedTextStyle(isDarkMode)}>Due</span>
                                <span style={{ fontSize: 11, fontWeight: 700, color: bill.isOverdue ? colours.orange : (isDarkMode ? colours.dark.text : colours.light.text) }}>
                                  {formatCurrency(bill.dueAmount)}
                                </span>
                              </div>

                              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <span style={mutedTextStyle(isDarkMode)}>Pending</span>
                                <span style={{ fontSize: 11, fontWeight: 700, color: isDarkMode ? colours.dark.text : colours.light.text }}>
                                  {formatCurrency(bill.pendingAmount)}
                                </span>
                              </div>

                              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <span style={mutedTextStyle(isDarkMode)}>Paid</span>
                                <span style={{ fontSize: 11, fontWeight: 700, color: isDarkMode ? colours.dark.text : colours.light.text }}>
                                  {formatCurrency(bill.paidAmount)}
                                </span>
                              </div>

                              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <span style={mutedTextStyle(isDarkMode)}>State</span>
                                <span style={{ fontSize: 11, fontWeight: 700, color: isDarkMode ? colours.dark.text : colours.light.text }}>
                                  {bill.state || 'Unknown'}
                                  {bill.shared ? ' • Shared' : ''}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default OutstandingMatterExplorer;