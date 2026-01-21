import React, { useState } from 'react';
import { Text, Icon, Link, TooltipHost, mergeStyles, Pivot, PivotItem } from '@fluentui/react';
import type { NormalizedMatter, Transaction } from '../../app/functionality/types';
import { colours } from '../../app/styles/colours';
import { useTheme } from '../../app/functionality/ThemeContext';

interface MatterOverviewProps {
  matter: NormalizedMatter;
  overviewData?: any;
  outstandingData?: any;
  complianceData?: any;
  matterSpecificActivitiesData?: any;
  onEdit?: () => void;
  transactions?: Transaction[];
}

/* ------------------------------------------------------------------
   STYLES
------------------------------------------------------------------ */

const containerStyle = (isDarkMode: boolean) =>
  mergeStyles({
    backgroundColor: isDarkMode ? colours.dark.background : colours.light.background,
    color: isDarkMode ? colours.dark.text : colours.light.text,
    minHeight: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
  });

const headerStyle = (isDarkMode: boolean) =>
  mergeStyles({
    backgroundColor: isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground,
    borderBottom: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
    padding: '16px 24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  });

const headerLeftStyle = mergeStyles({
  display: 'flex',
  alignItems: 'center',
  gap: 12,
});

const matterBadgeStyle = (isDarkMode: boolean) =>
  mergeStyles({
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    backgroundColor: isDarkMode ? 'rgba(54, 144, 206, 0.15)' : 'rgba(54, 144, 206, 0.1)',
    border: `1px solid ${colours.highlight}`,
    borderRadius: 6,
    padding: '6px 12px',
    fontWeight: 600,
    color: colours.highlight,
    fontSize: 14,
  });

const statusBadgeStyle = (status: 'active' | 'closed', isDarkMode: boolean) =>
  mergeStyles({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '4px 10px',
    borderRadius: 12,
    fontSize: 12,
    fontWeight: 600,
    backgroundColor:
      status === 'active'
        ? isDarkMode
          ? 'rgba(34, 197, 94, 0.2)'
          : 'rgba(34, 197, 94, 0.12)'
        : isDarkMode
        ? 'rgba(148, 163, 184, 0.2)'
        : 'rgba(148, 163, 184, 0.15)',
    color:
      status === 'active'
        ? isDarkMode
          ? '#86efac'
          : '#15803d'
        : isDarkMode
        ? '#94a3b8'
        : '#64748b',
  });

const mainLayoutStyle = mergeStyles({
  display: 'grid',
  gridTemplateColumns: '1fr 320px',
  gap: 0,
  flex: 1,
  '@media (max-width: 1024px)': {
    gridTemplateColumns: '1fr',
  },
});

const leftColumnStyle = (isDarkMode: boolean) =>
  mergeStyles({
    padding: 24,
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
    backgroundColor: isDarkMode ? colours.dark.background : colours.light.background,
  });

const rightColumnStyle = (isDarkMode: boolean) =>
  mergeStyles({
    padding: 24,
    borderLeft: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
    backgroundColor: isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground,
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
    '@media (max-width: 1024px)': {
      borderLeft: 'none',
      borderTop: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
    },
  });

const metricsGridStyle = mergeStyles({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
  gap: 16,
});

const metricCardStyle = (isDarkMode: boolean) =>
  mergeStyles({
    backgroundColor: isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground,
    border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
    borderRadius: 10,
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    transition: 'box-shadow 0.2s, transform 0.2s',
    ':hover': {
      boxShadow: isDarkMode
        ? '0 4px 12px rgba(0, 0, 0, 0.4)'
        : '0 4px 12px rgba(0, 0, 0, 0.08)',
      transform: 'translateY(-1px)',
    },
  });

const metricLabelStyle = (isDarkMode: boolean) =>
  mergeStyles({
    fontSize: 12,
    fontWeight: 500,
    color: isDarkMode ? colours.dark.subText : colours.greyText,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  });

const metricValueStyle = (isDarkMode: boolean, accent?: boolean) =>
  mergeStyles({
    fontSize: 24,
    fontWeight: 700,
    color: accent ? colours.highlight : isDarkMode ? colours.dark.text : colours.light.text,
    fontFamily: 'Raleway, sans-serif',
  });

const sectionCardStyle = (isDarkMode: boolean) =>
  mergeStyles({
    backgroundColor: isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground,
    border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
    borderRadius: 10,
    padding: 20,
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  });

const sectionTitleStyle = (isDarkMode: boolean) =>
  mergeStyles({
    fontSize: 16,
    fontWeight: 700,
    color: isDarkMode ? colours.dark.text : colours.light.text,
    fontFamily: 'Raleway, sans-serif',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 12,
    borderBottom: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
  });

const fieldRowStyle = mergeStyles({
  display: 'grid',
  gridTemplateColumns: '140px 1fr',
  gap: 12,
  alignItems: 'baseline',
});

const fieldLabelStyle = (isDarkMode: boolean) =>
  mergeStyles({
    fontSize: 13,
    fontWeight: 500,
    color: isDarkMode ? colours.dark.subText : colours.greyText,
  });

const fieldValueStyle = (isDarkMode: boolean) =>
  mergeStyles({
    fontSize: 14,
    fontWeight: 500,
    color: isDarkMode ? colours.dark.text : colours.light.text,
    wordBreak: 'break-word',
  });

const avatarStyle = (bgColor: string) =>
  mergeStyles({
    width: 36,
    height: 36,
    borderRadius: '50%',
    backgroundColor: bgColor,
    color: 'white',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    fontSize: 13,
    flexShrink: 0,
  });

const teamRowStyle = mergeStyles({
  display: 'flex',
  alignItems: 'center',
  gap: 12,
});

const clientActionButtonStyle = (isDarkMode: boolean) =>
  mergeStyles({
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: isDarkMode ? colours.dark.cardBackground : colours.light.grey,
    border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'background-color 0.15s',
    textDecoration: 'none',
    ':hover': {
      backgroundColor: isDarkMode ? colours.dark.cardHover : colours.light.cardHover,
    },
  });

const progressBarStyle = (isDarkMode: boolean) =>
  mergeStyles({
    height: 8,
    borderRadius: 4,
    backgroundColor: isDarkMode ? colours.dark.border : '#e5e7eb',
    overflow: 'hidden',
    position: 'relative',
  });

const progressFillStyle = (percentage: number) =>
  mergeStyles({
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: `${percentage}%`,
    backgroundColor: '#16a34a',
    borderRadius: 4,
    transition: 'width 0.3s ease',
  });

/* ------------------------------------------------------------------
   COMPONENT
------------------------------------------------------------------ */

const MatterOverview: React.FC<MatterOverviewProps> = ({
  matter,
  overviewData,
  outstandingData,
}) => {
  const { isDarkMode } = useTheme();
  const [activeTab, setActiveTab] = useState('overview');

  // Helpers
  const fmt = (v?: string | null): string =>
    v && String(v).trim().length > 0 ? String(v) : '—';

  const fmtDate = (v?: string | null): string => {
    if (!v) return '—';
    const d = new Date(v);
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB');
  };

  const fmtCurrency = (n?: number | null): string => {
    try {
      const val = typeof n === 'number' && isFinite(n) ? n : 0;
      return new Intl.NumberFormat('en-GB', {
        style: 'currency',
        currency: 'GBP',
        maximumFractionDigits: 0,
      }).format(val);
    } catch {
      return '£0';
    }
  };

  const safeNumber = (v: unknown, fallback = 0): number =>
    typeof v === 'number' && isFinite(v) ? v : fallback;

  const get = (obj: unknown, key: string): unknown =>
    obj && typeof obj === 'object' ? (obj as Record<string, unknown>)[key] : undefined;

  const getInitials = (full?: string): string => {
    const s = (full || '').trim();
    if (!s) return '—';
    const parts = s.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  // Derived metrics
  const billableAmount = safeNumber(get(overviewData, 'billableAmount'));
  const billableHours = safeNumber(get(overviewData, 'billableHours'));
  const nonBillableAmount = safeNumber(get(overviewData, 'nonBillableAmount'));
  const nonBillableHours = safeNumber(get(overviewData, 'nonBillableHours'));
  const outstandingBalance = safeNumber(
    get(outstandingData, 'total_outstanding_balance') ??
      get(outstandingData, 'due') ??
      get(outstandingData, 'balance')
  );
  const clientFunds = safeNumber(get(overviewData, 'clientFunds'));
  const totalAmount = billableAmount + nonBillableAmount;
  const billablePct = totalAmount > 0 ? Math.round((billableAmount / totalAmount) * 100) : 0;
  const totalHours = billableHours + nonBillableHours;

  const clioUrl = (() => {
    const dn = matter.displayNumber;
    return dn && dn !== '—'
      ? `https://eu.app.clio.com/nc/#/matters/${encodeURIComponent(dn)}`
      : undefined;
  })();

  const teamMembers = [
    {
      role: 'Responsible',
      name: matter.responsibleSolicitor,
      color: '#22c55e',
    },
    {
      role: 'Originating',
      name: matter.originatingSolicitor,
      color: '#0ea5e9',
    },
    {
      role: 'Supervising',
      name: matter.supervisingPartner,
      color: '#f59e0b',
    },
  ].filter((m) => m.name && m.name.trim());

  return (
    <div className={containerStyle(isDarkMode)}>
      {/* Header */}
      <div className={headerStyle(isDarkMode)}>
        <div className={headerLeftStyle}>
          <div className={matterBadgeStyle(isDarkMode)}>
            <Icon iconName="OpenFolderHorizontal" styles={{ root: { fontSize: 16 } }} />
            {clioUrl ? (
              <Link
                href={clioUrl}
                target="_blank"
                styles={{
                  root: {
                    color: colours.highlight,
                    fontWeight: 600,
                    textDecoration: 'none',
                    ':hover': { textDecoration: 'underline' },
                  },
                }}
              >
                {fmt(matter.displayNumber)}
              </Link>
            ) : (
              <span>{fmt(matter.displayNumber)}</span>
            )}
          </div>
          <Text
            variant="large"
            styles={{
              root: {
                fontWeight: 600,
                color: isDarkMode ? colours.dark.text : colours.light.text,
                fontFamily: 'Raleway, sans-serif',
              },
            }}
          >
            {fmt(matter.matterName || matter.description)}
          </Text>
        </div>
        <div className={statusBadgeStyle(matter.status, isDarkMode)}>
          <Icon
            iconName={matter.status === 'active' ? 'StatusCircleCheckmark' : 'StatusCircleBlock'}
            styles={{ root: { fontSize: 12 } }}
          />
          {matter.status === 'active' ? 'Active' : 'Closed'}
        </div>
      </div>

      {/* Tab Navigation */}
      <div
        style={{
          backgroundColor: isDarkMode
            ? colours.dark.sectionBackground
            : colours.light.sectionBackground,
          borderBottom: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
          paddingLeft: 24,
        }}
      >
        <Pivot
          selectedKey={activeTab}
          onLinkClick={(item) => item && setActiveTab(item.props.itemKey || 'overview')}
          styles={{
            root: { borderBottom: 'none' },
            link: {
              color: isDarkMode ? colours.dark.text : colours.light.text,
              fontWeight: 500,
              fontSize: 14,
              padding: '12px 16px',
              height: 'auto',
              lineHeight: 1.4,
              selectors: {
                ':hover': {
                  backgroundColor: isDarkMode
                    ? colours.dark.cardHover
                    : colours.light.cardHover,
                },
              },
            },
            linkIsSelected: {
              color: colours.highlight,
              fontWeight: 600,
              selectors: {
                '::before': {
                  backgroundColor: colours.highlight,
                  height: 3,
                },
              },
            },
          }}
        >
          <PivotItem itemKey="overview" headerText="Overview" itemIcon="Info" />
          <PivotItem itemKey="activities" headerText="Activities" itemIcon="Timeline" />
          <PivotItem itemKey="documents" headerText="Documents" itemIcon="Document" />
          <PivotItem itemKey="communications" headerText="Communications" itemIcon="Mail" />
          <PivotItem itemKey="billing" headerText="Billing" itemIcon="Money" />
        </Pivot>
      </div>

      {/* Main Content */}
      <div className={mainLayoutStyle}>
        {/* Left Column - Main Content */}
        <div className={leftColumnStyle(isDarkMode)}>
          {/* Key Metrics */}
          <div className={metricsGridStyle}>
            <div className={metricCardStyle(isDarkMode)}>
              <span className={metricLabelStyle(isDarkMode)}>Work in Progress</span>
              <span className={metricValueStyle(isDarkMode, true)}>{fmtCurrency(billableAmount)}</span>
              <span
                style={{
                  fontSize: 12,
                  color: isDarkMode ? colours.dark.subText : colours.greyText,
                }}
              >
                {billableHours.toFixed(1)}h billable
              </span>
            </div>
            <div className={metricCardStyle(isDarkMode)}>
              <span className={metricLabelStyle(isDarkMode)}>Outstanding</span>
              <span
                className={metricValueStyle(isDarkMode)}
                style={{ color: outstandingBalance > 0 ? '#ef4444' : undefined }}
              >
                {fmtCurrency(outstandingBalance)}
              </span>
              <span
                style={{
                  fontSize: 12,
                  color: isDarkMode ? colours.dark.subText : colours.greyText,
                }}
              >
                Balance due
              </span>
            </div>
            <div className={metricCardStyle(isDarkMode)}>
              <span className={metricLabelStyle(isDarkMode)}>Client Funds</span>
              <span
                className={metricValueStyle(isDarkMode)}
                style={{ color: clientFunds > 0 ? '#22c55e' : undefined }}
              >
                {fmtCurrency(clientFunds)}
              </span>
              <span
                style={{
                  fontSize: 12,
                  color: isDarkMode ? colours.dark.subText : colours.greyText,
                }}
              >
                On account
              </span>
            </div>
            <div className={metricCardStyle(isDarkMode)}>
              <span className={metricLabelStyle(isDarkMode)}>Total Hours</span>
              <span className={metricValueStyle(isDarkMode)}>{totalHours.toFixed(1)}h</span>
              <span
                style={{
                  fontSize: 12,
                  color: isDarkMode ? colours.dark.subText : colours.greyText,
                }}
              >
                {billableHours.toFixed(1)}h billable / {nonBillableHours.toFixed(1)}h non-billable
              </span>
            </div>
          </div>

          {/* Time Breakdown */}
          <div className={sectionCardStyle(isDarkMode)}>
            <div className={sectionTitleStyle(isDarkMode)}>
              <Icon iconName="Clock" styles={{ root: { color: colours.highlight } }} />
              Time Breakdown
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: isDarkMode ? colours.dark.text : colours.light.text }}>
                  Billable: {fmtCurrency(billableAmount)} ({billableHours.toFixed(2)}h)
                </span>
                <span style={{ color: isDarkMode ? colours.dark.subText : colours.greyText }}>
                  {billablePct}%
                </span>
              </div>
              <div className={progressBarStyle(isDarkMode)}>
                <div className={progressFillStyle(billablePct)} />
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 12,
                  color: isDarkMode ? colours.dark.subText : colours.greyText,
                }}
              >
                <span>Billable</span>
                <span>Non-Billable: {fmtCurrency(nonBillableAmount)} ({nonBillableHours.toFixed(2)}h)</span>
              </div>
            </div>
          </div>

          {/* Matter Details */}
          <div className={sectionCardStyle(isDarkMode)}>
            <div className={sectionTitleStyle(isDarkMode)}>
              <Icon iconName="Info" styles={{ root: { color: colours.highlight } }} />
              Matter Details
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className={fieldRowStyle}>
                <span className={fieldLabelStyle(isDarkMode)}>Practice Area</span>
                <span className={fieldValueStyle(isDarkMode)}>{fmt(matter.practiceArea)}</span>
              </div>
              <div className={fieldRowStyle}>
                <span className={fieldLabelStyle(isDarkMode)}>Description</span>
                <span className={fieldValueStyle(isDarkMode)}>{fmt(matter.description)}</span>
              </div>
              {matter.opponent && (
                <div className={fieldRowStyle}>
                  <span className={fieldLabelStyle(isDarkMode)}>Opponent</span>
                  <span className={fieldValueStyle(isDarkMode)}>{fmt(matter.opponent)}</span>
                </div>
              )}
              <div className={fieldRowStyle}>
                <span className={fieldLabelStyle(isDarkMode)}>Open Date</span>
                <span className={fieldValueStyle(isDarkMode)}>{fmtDate(matter.openDate)}</span>
              </div>
              {matter.cclDate && (
                <div className={fieldRowStyle}>
                  <span className={fieldLabelStyle(isDarkMode)}>CCL Date</span>
                  <span className={fieldValueStyle(isDarkMode)}>{fmtDate(matter.cclDate)}</span>
                </div>
              )}
              {matter.closeDate && (
                <div className={fieldRowStyle}>
                  <span className={fieldLabelStyle(isDarkMode)}>Close Date</span>
                  <span className={fieldValueStyle(isDarkMode)}>{fmtDate(matter.closeDate)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Team */}
          <div className={sectionCardStyle(isDarkMode)}>
            <div className={sectionTitleStyle(isDarkMode)}>
              <Icon iconName="People" styles={{ root: { color: colours.highlight } }} />
              Team
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {teamMembers.map((member, idx) => (
                <div key={idx} className={teamRowStyle}>
                  <TooltipHost content={`${member.name} (${member.role})`}>
                    <div className={avatarStyle(member.color)}>{getInitials(member.name)}</div>
                  </TooltipHost>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span className={fieldValueStyle(isDarkMode)}>{member.name}</span>
                    <span
                      style={{
                        fontSize: 12,
                        color: isDarkMode ? colours.dark.subText : colours.greyText,
                      }}
                    >
                      {member.role} Solicitor
                    </span>
                  </div>
                </div>
              ))}
              {teamMembers.length === 0 && (
                <span style={{ color: isDarkMode ? colours.dark.subText : colours.greyText }}>
                  No team members assigned
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right Column - Client Sidebar */}
        <div className={rightColumnStyle(isDarkMode)}>
          {/* Client Card */}
          <div className={sectionCardStyle(isDarkMode)}>
            <div className={sectionTitleStyle(isDarkMode)}>
              <Icon iconName="Contact" styles={{ root: { color: colours.highlight } }} />
              Client
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div className={avatarStyle(colours.highlight)}>
                  {getInitials(matter.clientName)}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
                  <Link
                    href="#"
                    styles={{
                      root: {
                        fontWeight: 600,
                        color: colours.highlight,
                        fontSize: 15,
                      },
                    }}
                  >
                    {fmt(matter.clientName)}
                  </Link>
                  {matter.clientEmail && (
                    <span
                      style={{
                        fontSize: 12,
                        color: isDarkMode ? colours.dark.subText : colours.greyText,
                      }}
                    >
                      {matter.clientEmail}
                    </span>
                  )}
                </div>
              </div>

              {/* Quick Actions */}
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  paddingTop: 12,
                  borderTop: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                }}
              >
                {matter.clientPhone && (
                  <TooltipHost content={`Call ${matter.clientPhone}`}>
                    <a
                      href={`tel:${matter.clientPhone}`}
                      className={clientActionButtonStyle(isDarkMode)}
                      aria-label="Call Client"
                    >
                      <Icon
                        iconName="Phone"
                        styles={{
                          root: { color: isDarkMode ? colours.dark.text : colours.light.text },
                        }}
                      />
                    </a>
                  </TooltipHost>
                )}
                {matter.clientEmail && (
                  <TooltipHost content={`Email ${matter.clientEmail}`}>
                    <a
                      href={`mailto:${matter.clientEmail}`}
                      className={clientActionButtonStyle(isDarkMode)}
                      aria-label="Email Client"
                    >
                      <Icon
                        iconName="Mail"
                        styles={{
                          root: { color: isDarkMode ? colours.dark.text : colours.light.text },
                        }}
                      />
                    </a>
                  </TooltipHost>
                )}
              </div>

              {/* Contact Details */}
              {(matter.clientPhone || matter.clientEmail) && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    paddingTop: 12,
                    borderTop: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                  }}
                >
                  {matter.clientPhone && (
                    <div className={fieldRowStyle} style={{ gridTemplateColumns: '70px 1fr' }}>
                      <span className={fieldLabelStyle(isDarkMode)}>Phone</span>
                      <span className={fieldValueStyle(isDarkMode)}>{matter.clientPhone}</span>
                    </div>
                  )}
                  {matter.clientEmail && (
                    <div className={fieldRowStyle} style={{ gridTemplateColumns: '70px 1fr' }}>
                      <span className={fieldLabelStyle(isDarkMode)}>Email</span>
                      <span
                        className={fieldValueStyle(isDarkMode)}
                        style={{ wordBreak: 'break-all' }}
                      >
                        {matter.clientEmail}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Quick Info */}
          <div className={sectionCardStyle(isDarkMode)}>
            <div className={sectionTitleStyle(isDarkMode)}>
              <Icon iconName="BulletedList" styles={{ root: { color: colours.highlight } }} />
              Quick Info
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className={fieldRowStyle} style={{ gridTemplateColumns: '90px 1fr' }}>
                <span className={fieldLabelStyle(isDarkMode)}>Matter ID</span>
                <span className={fieldValueStyle(isDarkMode)}>{fmt(matter.matterId)}</span>
              </div>
              {matter.source && (
                <div className={fieldRowStyle} style={{ gridTemplateColumns: '90px 1fr' }}>
                  <span className={fieldLabelStyle(isDarkMode)}>Source</span>
                  <span className={fieldValueStyle(isDarkMode)}>{matter.source}</span>
                </div>
              )}
              {matter.referrer && (
                <div className={fieldRowStyle} style={{ gridTemplateColumns: '90px 1fr' }}>
                  <span className={fieldLabelStyle(isDarkMode)}>Referrer</span>
                  <span className={fieldValueStyle(isDarkMode)}>{matter.referrer}</span>
                </div>
              )}
              {matter.value && (
                <div className={fieldRowStyle} style={{ gridTemplateColumns: '90px 1fr' }}>
                  <span className={fieldLabelStyle(isDarkMode)}>Value</span>
                  <span className={fieldValueStyle(isDarkMode)}>{matter.value}</span>
                </div>
              )}
              {matter.rating && (
                <div className={fieldRowStyle} style={{ gridTemplateColumns: '90px 1fr' }}>
                  <span className={fieldLabelStyle(isDarkMode)}>Rating</span>
                  <span
                    className={fieldValueStyle(isDarkMode)}
                    style={{
                      color:
                        matter.rating === 'Good'
                          ? '#22c55e'
                          : matter.rating === 'Poor'
                          ? '#ef4444'
                          : undefined,
                    }}
                  >
                    {matter.rating}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Data Source Badge */}
          <div
            style={{
              padding: '8px 12px',
              backgroundColor: isDarkMode
                ? 'rgba(54, 144, 206, 0.1)'
                : 'rgba(54, 144, 206, 0.05)',
              borderRadius: 6,
              fontSize: 11,
              color: isDarkMode ? colours.dark.subText : colours.greyText,
              textAlign: 'center',
            }}
          >
            Data source: {matter.dataSource.replace(/_/g, ' ')}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MatterOverview;
