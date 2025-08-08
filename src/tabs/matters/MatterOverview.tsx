import React from 'react';
import { Stack, Text, Icon, Link, TooltipHost, Separator } from '@fluentui/react';
import type { NormalizedMatter, Transaction } from '../../app/functionality/types';
import { colours } from '../../app/styles/colours';

interface MatterOverviewProps {
  matter: NormalizedMatter;
  overviewData?: any;
  outstandingData?: any;
  complianceData?: any;
  matterSpecificActivitiesData?: any;
  onEdit?: () => void;
  transactions?: Transaction[];
}

const MatterOverview: React.FC<MatterOverviewProps> = ({ matter, overviewData, outstandingData }) => {
  // Helpers
  const fmt = (v?: string | null): string => (v && String(v).trim().length > 0 ? String(v) : '—');
  const fmtDate = (v?: string | null): string => {
    if (!v) return '—';
    const d = new Date(v);
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
  };
  const fmtCurrency = (n?: number | null): string => {
    try {
      const val = typeof n === 'number' && isFinite(n) ? n : 0;
      return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 2 }).format(val);
    } catch {
      return '£0.00';
    }
  };
  const safeNumber = (v: unknown, fallback = 0): number => (typeof v === 'number' && isFinite(v) ? v : fallback);
  const get = (obj: unknown, key: string): unknown => (obj && typeof obj === 'object' ? (obj as Record<string, unknown>)[key] : undefined);
  const getInitials = (full?: string): string => {
    const s = (full || '').trim();
    if (!s) return '—';
    const parts = s.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  // Derived metrics (fallbacks if not provided)
  const billableAmount = safeNumber(get(overviewData, 'billableAmount'));
  const billableHours = safeNumber(get(overviewData, 'billableHours'));
  const nonBillableAmount = safeNumber(get(overviewData, 'nonBillableAmount'));
  const nonBillableHours = safeNumber(get(overviewData, 'nonBillableHours'));
  const outstandingBalance = safeNumber(
    get(outstandingData, 'total_outstanding_balance') ?? get(outstandingData, 'due') ?? get(outstandingData, 'balance')
  );
  const clientFunds = safeNumber(get(overviewData, 'clientFunds'));
  const totalAmount = billableAmount + nonBillableAmount;
  const billablePct = totalAmount > 0 ? Math.round((billableAmount / totalAmount) * 100) : 0;

  const clioUrl = (() => {
    const dn = fmt(matter.displayNumber);
    return dn && dn !== '—' ? `https://eu.app.clio.com/nc/#/matters/${encodeURIComponent(dn)}` : undefined;
  })();

  return (
    <div style={{ padding: 20 }}>
      {/* Header: Folder icon + Clio link with Display Number */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <Icon iconName="OpenFolderHorizontal" styles={{ root: { fontSize: 20, color: colours.highlight } }} />
        {clioUrl ? (
          <Link href={clioUrl} target="_blank">{fmt(matter.displayNumber)}</Link>
        ) : (
          <Text>{fmt(matter.displayNumber)}</Text>
        )}
      </div>

      {/* Main two-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
        {/* Left column */}
        <div>
          {/* Metrics row: WIP, Outstanding Balance, Client Funds */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ background: 'white', borderRadius: 10, border: `1px solid ${colours.light.border}`, padding: 12, minWidth: 260, flex: 1 }}>
              <span style={{ color: colours.light.subText, fontSize: 12, display: 'block', marginBottom: 8 }}>Work in Progress</span>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <span style={{ color: colours.light.subText }}>Billable</span>
                  <span style={{ fontWeight: 600 }}>{fmtCurrency(billableAmount)}</span>
                  <span style={{ color: colours.light.subText }}>Hours: {billableHours.toFixed(2)}h</span>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <span style={{ color: colours.light.subText }}>Non-Billable</span>
                  <span style={{ fontWeight: 600 }}>{fmtCurrency(nonBillableAmount)}</span>
                  <span style={{ color: colours.light.subText }}>Hours: {nonBillableHours.toFixed(2)}h</span>
                </div>
              </div>
            </div>
            <div style={{ background: 'white', borderRadius: 10, border: `1px solid ${colours.light.border}`, padding: 12, minWidth: 220, flex: 1 }}>
              <span style={{ color: colours.light.subText, fontSize: 12, display: 'block', marginBottom: 8 }}>Outstanding Balance</span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                <span style={{ color: colours.light.subText, minWidth: 80 }}>Balance</span>
                <span style={{ fontWeight: 600 }}>{fmtCurrency(outstandingBalance)}</span>
              </div>
            </div>
            <div style={{ background: 'white', borderRadius: 10, border: `1px solid ${colours.light.border}`, padding: 12, minWidth: 220, flex: 1 }}>
              <span style={{ color: colours.light.subText, fontSize: 12, display: 'block', marginBottom: 8 }}>Client Funds (Matter)</span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                <span style={{ color: colours.light.subText, minWidth: 80 }}>Funds</span>
                <span style={{ fontWeight: 600 }}>{fmtCurrency(clientFunds)}</span>
              </div>
            </div>
          </div>

          {/* Time section */}
          <div style={{ marginTop: 16, background: 'white', borderRadius: 10, border: `1px solid ${colours.light.border}`, padding: 12 }}>
            <span style={{ color: colours.light.subText, fontSize: 12, display: 'block', marginBottom: 6 }}>Time</span>
            <Stack tokens={{ childrenGap: 6 }}>
              <span style={{ color: colours.light.subText }}>Billable: {fmtCurrency(billableAmount)} ({billableHours.toFixed(2)}h)</span>
              <span style={{ color: colours.light.subText }}>Non-Billable: {fmtCurrency(nonBillableAmount)} ({nonBillableHours.toFixed(2)}h)</span>
              <div style={{ position: 'relative', height: 12, borderRadius: 10, background: '#ccc', overflow: 'hidden', marginTop: 8 }}>
                <div style={{ position: 'absolute', inset: 0, width: `${billablePct}%`, backgroundColor: '#16a34a' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ color: colours.light.subText }}>Billable</span>
                <span style={{ color: colours.light.subText }}>Non-Billable</span>
              </div>
            </Stack>
          </div>

          {/* Matter Details */}
          <div style={{ marginTop: 16, background: 'white', borderRadius: 10, border: `1px solid ${colours.light.border}`, padding: 12 }}>
            <span style={{ color: colours.light.subText, fontWeight: 600 }}>Matter Details</span>
            <Separator styles={{ root: { margin: '8px 0' } }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <span style={{ color: colours.light.subText, minWidth: 110 }}>Practice Area:</span>
                <span>{fmt(matter.practiceArea)}</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <span style={{ color: colours.light.subText, minWidth: 110 }}>Description:</span>
                <span>{fmt(matter.description)}</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <span style={{ color: colours.light.subText, minWidth: 110 }}>Opponent:</span>
                <span>{fmt(matter.opponent as string)}</span>
              </div>
            </div>
            <Separator styles={{ root: { margin: '8px 0' } }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <span style={{ color: colours.light.subText, minWidth: 110 }}>Open Date:</span>
                <span>{fmtDate(matter.openDate)}</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <span style={{ color: colours.light.subText, minWidth: 110 }}>CCL Date:</span>
                <span>{fmtDate(matter.cclDate as any)}</span>
              </div>
            </div>
            <Separator styles={{ root: { margin: '8px 0' } }} />
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <TooltipHost content={`${fmt(matter.originatingSolicitor)} (Originating)`}>
                <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#0ea5e9', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                  {getInitials(matter.originatingSolicitor)}
                </div>
              </TooltipHost>
              <TooltipHost content={`${fmt(matter.responsibleSolicitor)} (Responsible)`}>
                <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#22c55e', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                  {getInitials(matter.responsibleSolicitor)}
                </div>
              </TooltipHost>
              <TooltipHost content={`${fmt(matter.supervisingPartner)} (Supervising)`}>
                <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#f59e0b', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                  {getInitials(matter.supervisingPartner)}
                </div>
              </TooltipHost>
            </div>
          </div>
        </div>

        {/* Right column: Client */}
        <div>
          <div style={{ background: 'white', borderRadius: 10, border: `1px solid ${colours.light.border}`, padding: 12 }}>
            <span style={{ color: colours.light.subText, fontWeight: 600 }}>Client</span>
            <Separator styles={{ root: { margin: '8px 0' } }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon iconName="Contact" />
              <Link href="#" target="_blank">{fmt(matter.clientName)}</Link>
              <span style={{ color: colours.light.subText }}>{fmt(matter.clientEmail)}</span>
            </div>
            <Separator styles={{ root: { margin: '8px 0' } }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <TooltipHost content="Call Client">
                <div role="button" aria-label="Call Client" title="Call Client" style={{ width: 32, height: 32, borderRadius: 8, background: colours.light.background, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  <Icon iconName="Phone" />
                </div>
              </TooltipHost>
              <TooltipHost content="Email Client">
                <div role="button" aria-label="Email Client" title="Email Client" style={{ width: 32, height: 32, borderRadius: 8, background: colours.light.background, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  <Icon iconName="Mail" />
                </div>
              </TooltipHost>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 12 }}>
                <span style={{ color: colours.light.subText }}>{fmt(matter.clientPhone)}</span>
                <span style={{ color: colours.light.subText }}>{fmt(matter.clientEmail)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MatterOverview;
