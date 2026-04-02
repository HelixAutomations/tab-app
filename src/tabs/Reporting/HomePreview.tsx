import React, { useState } from 'react';
import type { CSSProperties } from 'react';
import { colours } from '../../app/styles/colours';
import { WIP } from './ManagementDashboard';
import { Icon } from '@fluentui/react/lib/Icon';
import { Text } from '@fluentui/react/lib/Text';
import { DefaultButton } from '@fluentui/react/lib/Button';
import type { IButtonStyles } from '@fluentui/react/lib/Button';
import { useTheme } from '../../app/functionality/ThemeContext';
import { Enquiry, Matter } from '../../app/functionality/types';
import './HomePreview.css';

interface RecoveredFee {
  payment_date: string;
  payment_allocated: number;
}

interface HomePreviewProps {
  enquiries: Enquiry[] | null;
  allMatters: Matter[] | null;
  wip: WIP[] | null | undefined;
  recoveredFees: RecoveredFee[] | null;
}

type RangeKey = 'today' | 'thisWeek' | 'thisMonth' | 'all';

const baseShadow = (isDarkMode: boolean): string => (
  isDarkMode ? '0 2px 8px rgba(0, 0, 0, 0.24)' : '0 2px 6px rgba(15, 23, 42, 0.08)'
);

const softBorder = (isDarkMode: boolean): string => (
  isDarkMode ? 'rgba(148, 163, 184, 0.28)' : 'rgba(15, 23, 42, 0.08)'
);

const sectionContainerStyle = (isDarkMode: boolean): CSSProperties => ({
  background: isDarkMode ? 'rgba(15, 23, 42, 0.86)' : '#FFFFFF',
  borderRadius: 14,
  border: `1px solid ${softBorder(isDarkMode)}`,
  boxShadow: baseShadow(isDarkMode),
  padding: '22px 24px',
  display: 'flex',
  flexDirection: 'column',
  gap: 18,
  fontFamily: 'Raleway, sans-serif',
});

const headerRowStyle = (isDarkMode: boolean): CSSProperties => ({
  display: 'flex',
  justifyContent: 'space-between',
  gap: 16,
  flexWrap: 'wrap',
  alignItems: 'center',
  color: isDarkMode ? colours.light.text : colours.dark.text,
  fontFamily: 'Raleway, sans-serif',
});

const headerTitleStyle = (isDarkMode: boolean): CSSProperties => ({
  fontSize: 20,
  fontWeight: 700,
  margin: 0,
  color: isDarkMode ? colours.light.text : colours.dark.text,
  fontFamily: 'Raleway, sans-serif',
});

const rangeButtonsRowStyle: CSSProperties = {
  display: 'flex',
  gap: 10,
  flexWrap: 'wrap',
};

const rangeButtonStyles = (isDarkMode: boolean, isActive: boolean): IButtonStyles => ({
  root: {
    borderRadius: 999,
    padding: '0 14px',
    height: 32,
    background: isActive
      ? colours.highlight
      : isDarkMode
        ? 'rgba(148, 163, 184, 0.18)'
        : 'rgba(54, 144, 206, 0.12)',
    color: isActive ? '#FFFFFF' : isDarkMode ? '#E2E8F0' : colours.helixBlue,
    border: isActive
      ? '1px solid rgba(13, 47, 96, 0.42)'
      : `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.28)' : 'rgba(13, 47, 96, 0.18)'}`,
    fontWeight: 600,
    boxShadow: 'none',
    transition: 'background 0.2s ease',
    fontFamily: 'Raleway, sans-serif',
  },
  rootHovered: {
    background: isActive
      ? '#2f7cb3'
      : isDarkMode
        ? 'rgba(148, 163, 184, 0.24)'
        : 'rgba(54, 144, 206, 0.18)',
  },
  rootPressed: {
    background: isActive
      ? '#266795'
      : isDarkMode
        ? 'rgba(148, 163, 184, 0.3)'
        : 'rgba(54, 144, 206, 0.24)',
  },
});

const metricsGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
  gap: 16,
  width: '100%',
};

const metricCardStyle = (isDarkMode: boolean): CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '16px 14px',
  borderRadius: 12,
  border: `1px solid ${softBorder(isDarkMode)}`,
  background: isDarkMode ? 'rgba(15, 23, 42, 0.7)' : 'rgba(248, 250, 252, 0.92)',
  boxShadow: 'none',
  gap: 12,
});

const iconStyle = (isDarkMode: boolean): CSSProperties => ({
  fontSize: 32,
  color: isDarkMode ? colours.highlight : colours.highlight,
});

const cardContentStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: 4,
};

const HomePreview: React.FC<HomePreviewProps> = ({ enquiries, allMatters, wip, recoveredFees }) => {
  const { isDarkMode } = useTheme();
  const [selectedRange, setSelectedRange] = useState<RangeKey>('all');

  const parseAndFormatDate = (dateStr: string | undefined): string => {
    if (!dateStr) return 'N/A';
    const parts = dateStr.includes('/') ? dateStr.split('/') : dateStr.split('-');
    let date: Date;
    if (parts.length === 3 && dateStr.includes('/')) {
      date = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`); // DD/MM/YYYY -> YYYY-MM-DD
    } else {
      date = new Date(dateStr);
    }
    if (isNaN(date.getTime())) return 'N/A';
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const formatCurrency = (amount: number): string => {
    if (amount < 10000) {
      return `£${amount.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    } else if (amount < 1000000) {
      return `£${(amount / 1000).toFixed(1)}k`;
    } else if (amount < 1000000000) {
      return `£${(amount / 1000000).toFixed(2)}m`;
    } else {
      return `£${(amount / 1000000000).toFixed(2)}b`;
    }
  };

  const formatHours = (hours: number): string => {
    const whole = Math.floor(hours);
    const fraction = hours - whole;
    const minutes = Math.round(fraction * 60);
    return `${whole}h ${minutes}m`;
  };

  const getDateRange = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let startDate: Date;

    switch (selectedRange) {
      case 'today':
        startDate = new Date(today);
        break;
      case 'thisWeek':
        startDate = new Date(today);
        startDate.setDate(today.getDate() - today.getDay() + (today.getDay() === 0 ? -6 : 1));
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'thisMonth':
        startDate = new Date(today.getFullYear(), today.getMonth(), 1);
        break;
      case 'all':
      default:
        startDate = new Date(0);
        break;
    }
    return { startDate, endDate: today };
  };

  const { startDate, endDate } = getDateRange();

  const filteredEnquiries = enquiries?.filter(e => {
    const date = new Date(e.Touchpoint_Date);
    return date >= startDate && date <= endDate;
  }) || [];
  const enquiriesCount = filteredEnquiries.length;
  const enquiriesRange = filteredEnquiries.length
    ? `${parseAndFormatDate(filteredEnquiries.reduce((min, e) => new Date(e.Touchpoint_Date) < new Date(min.Touchpoint_Date) ? e : min, filteredEnquiries[0]).Touchpoint_Date)} - ${parseAndFormatDate(filteredEnquiries.reduce((max, e) => new Date(e.Touchpoint_Date) > new Date(max.Touchpoint_Date) ? e : max, filteredEnquiries[0]).Touchpoint_Date)}`
    : 'N/A';

  const filteredMatters = allMatters?.filter(m => {
    const date = new Date((m as any)["Open Date"] || m.OpenDate);
    return date >= startDate && date <= endDate;
  }) || [];
  const mattersCount = filteredMatters.length;
  const mattersRange = filteredMatters.length
    ? `${parseAndFormatDate((filteredMatters.reduce((min, m) => new Date((m as any)["Open Date"] || m.OpenDate) < new Date((min as any)["Open Date"] || min.OpenDate) ? m : min, filteredMatters[0]) as any)["Open Date"] || filteredMatters[0].OpenDate)} - ${parseAndFormatDate((filteredMatters.reduce((max, m) => new Date((m as any)["Open Date"] || m.OpenDate) > new Date((max as any)["Open Date"] || max.OpenDate) ? m : max, filteredMatters[0]) as any)["Open Date"] || filteredMatters[0].OpenDate)}`
    : 'N/A';

  const filteredWip = wip?.filter(w => {
    const date = new Date(w.created_at);
    return date >= startDate && date <= endDate;
  }) || [];
  const wipTotalPounds = filteredWip.reduce((sum, w) => sum + (w.total || 0), 0) || 0;
  const wipTotalHours = filteredWip.reduce((sum, w) => sum + (w.quantity_in_hours || 0), 0) || 0;
  const wipRange = filteredWip.length
    ? `${parseAndFormatDate(filteredWip.reduce((min, w) => new Date(w.created_at) < new Date(min.created_at) ? w : min, filteredWip[0]).created_at)} - ${parseAndFormatDate(filteredWip.reduce((max, w) => new Date(w.created_at) > new Date(max.created_at) ? w : max, filteredWip[0]).created_at)}`
    : 'N/A';

  const filteredRecoveredFees = recoveredFees?.filter(r => {
    const date = new Date(r.payment_date);
    return date >= startDate && date <= endDate;
  }) || [];
  const collectedTotal = filteredRecoveredFees.reduce((sum, r) => sum + r.payment_allocated, 0) || 0;
  const collectedRange = filteredRecoveredFees.length
    ? `${parseAndFormatDate(filteredRecoveredFees.reduce((min, r) => new Date(r.payment_date) < new Date(min.payment_date) ? r : min, filteredRecoveredFees[0]).payment_date)} - ${parseAndFormatDate(filteredRecoveredFees.reduce((max, r) => new Date(r.payment_date) > new Date(max.payment_date) ? r : max, filteredRecoveredFees[0]).payment_date)}`
    : 'N/A';

  const metricCards = [
    { icon: 'People', title: 'Total Enquiries', value: enquiriesCount.toLocaleString(), range: enquiriesRange },
    { icon: 'Folder', title: 'Total Matters', value: mattersCount.toLocaleString(), range: mattersRange },
    { icon: 'Clock', title: 'WIP (h)', value: formatHours(wipTotalHours), range: wipRange },
    { icon: 'Clock', title: 'WIP (£)', value: formatCurrency(wipTotalPounds), range: wipRange },
    { icon: 'Money', title: 'Collected', value: formatCurrency(collectedTotal), range: collectedRange },
  ];

  const rangeOptions: Array<{ key: RangeKey; label: string }> = [
    { key: 'today', label: 'Today' },
    { key: 'thisWeek', label: 'This Week' },
    { key: 'thisMonth', label: 'This Month' },
    { key: 'all', label: 'All Time' },
  ];

  return (
    <section
      className="home-preview-section"
      style={sectionContainerStyle(isDarkMode)}
    >
      <div style={headerRowStyle(isDarkMode)}>
        <h2 style={headerTitleStyle(isDarkMode)}>Key Insights</h2>
        <div style={rangeButtonsRowStyle}>
          {rangeOptions.map((option) => (
            <DefaultButton
              key={option.key}
              text={option.label}
              onClick={() => setSelectedRange(option.key)}
              styles={rangeButtonStyles(isDarkMode, selectedRange === option.key)}
            />
          ))}
        </div>
      </div>
      <div style={metricsGridStyle}>
        {metricCards.map((card) => (
          <div key={card.title} className="metric-card" style={metricCardStyle(isDarkMode)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Icon iconName={card.icon} style={iconStyle(isDarkMode)} />
              <div style={cardContentStyle}>
                <Text
                  variant="large"
                  styles={{ root: { fontWeight: 600, color: isDarkMode ? '#E2E8F0' : colours.dark.text, fontFamily: 'Raleway, sans-serif' } }}
                >
                  {card.title}
                </Text>
                <Text
                  variant="xxLarge"
                  styles={{ root: { fontWeight: 800, color: isDarkMode ? '#FFFFFF' : '#0F172A', fontFamily: 'Raleway, sans-serif' } }}
                >
                  {card.value}
                </Text>
                <Text
                  variant="small"
                  styles={{ root: { color: isDarkMode ? 'rgba(226, 232, 240, 0.7)' : colours.greyText, fontFamily: 'Raleway, sans-serif' } }}
                >
                  {card.range}
                </Text>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

export default HomePreview;