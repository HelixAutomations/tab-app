import React, { useState, useEffect } from 'react';
import { Text, Stack } from '@fluentui/react';
import { mergeStyles } from '@fluentui/react/lib/Styling';
import { Enquiry } from '../../app/functionality/types';
import { colours } from '../../app/styles/colours';
import { useTheme } from '../../app/functionality/ThemeContext';
import EnquiryLineItem from './EnquiryLineItem';
import { GroupedEnquiry } from './enquiryGrouping';
import { TeamsActivityData, fetchTeamsActivityTracking } from '../../app/functionality/teamsActivityTracking';

// Extend Enquiry to include source type
type EnquiryWithSource = Enquiry & { __sourceType?: 'new' | 'legacy' };

interface TeamData {
  'Created Date'?: string;
  'Created Time'?: string;
  'Full Name'?: string;
  'Last'?: string;
  'First'?: string;
  'Nickname'?: string;
  'Initials'?: string;
  'Email'?: string;
  'Entra ID'?: string;
  'Clio ID'?: string;
  'Rate'?: number;
  'Role'?: string;
  'AOW'?: string;
}

interface GroupedEnquiryCardProps {
  groupedEnquiry: GroupedEnquiry;
  onSelect: (enquiry: Enquiry) => void;
  onRate: (enquiryId: string) => void;
  onRatingChange?: (enquiryId: string, newRating: string) => Promise<void>;
  onPitch?: (enquiry: Enquiry) => void;
  teamData?: TeamData[] | null;
  isLast?: boolean;
  userAOW?: string[]; // List of user's areas of work (lowercase)
  getPromotionStatus?: (enquiry: Enquiry) => 'pitch' | 'instruction' | null;
  onFilterByPerson?: (initials: string) => void;
  /**
   * Map of enquiry ID to document count for each enquiry in the group
   */
  documentCounts?: Record<string, number>;
}

const _formatCurrency = (value: string): string => {
  const regex = /(?:£)?(\d{1,3}(?:,\d{3})*)(?: to £?(\d{1,3}(?:,\d{3})*))?/;
  const matches = value.match(regex);
  if (!matches) return value;

  return matches
    .slice(1)
    .filter(Boolean)
    .map((num) =>
      num.includes('£')
        ? num.replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1,')
        : `£${parseInt(num.replace(/,/g, ''), 10).toLocaleString()}`
    )
    .join(' to ');
};
void _formatCurrency; // Reserved for future use

const getAreaColor = (area: string): string => {
  switch (area?.toLowerCase()) {
    case 'commercial':
      return colours.blue;
    case 'construction':
      return colours.orange;
    case 'property':
      return colours.green;
    case 'employment':
      return colours.yellow;
    default:
      return colours.cta;
  }
};

// (Removed unused Fluent UI icon button styles)

const GroupedEnquiryCard: React.FC<GroupedEnquiryCardProps> = ({ groupedEnquiry, onSelect, onRate, onRatingChange, onPitch, teamData, isLast, userAOW, getPromotionStatus, onFilterByPerson, documentCounts = {} }) => {
  const { isDarkMode } = useTheme();
  const [isExpanded, setIsExpanded] = useState(false);
  const [teamsActivityMap, setTeamsActivityMap] = useState<Map<string, TeamsActivityData>>(new Map());
  const { clientName, clientEmail, enquiries, latestDate, areas: _areas } = groupedEnquiry;
  void _areas; // Reserved for future use
  const enquiryCount = enquiries.length;
  const latestEnquiry = enquiries[0];

  // Fetch Teams activity data for v2 enquiries
  useEffect(() => {
    const fetchTeamsData = async () => {
      // Only fetch for v2 enquiries (new source type)
      const v2EnquiryIds = enquiries
        .filter(e => (e as EnquiryWithSource).__sourceType === 'new' && e.ID)
        .map(e => e.ID);

      if (v2EnquiryIds.length > 0) {
        try {
          const activityData = await fetchTeamsActivityTracking(v2EnquiryIds);
          const activityMap = new Map<string, TeamsActivityData>();
          activityData.forEach(data => {
            if (data.EnquiryId) {
              activityMap.set(data.EnquiryId, data);
            }
          });
          setTeamsActivityMap(activityMap);
        } catch (error) {
          console.error('Failed to fetch Teams activity data:', error);
        }
      }
    };

    fetchTeamsData();
  }, [enquiries]);

  const formatDate = (dateStr: string): string => {
    try {
      return new Date(dateStr).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  const _calculateTotalValue = (): string => {
    const values = enquiries
      .map(e => e.Value)
      .filter(v => v && v !== 'Not specified')
      .map(v => {
        const match = v?.match(/£?(\d{1,3}(?:,\d{3})*)/);
        return match ? parseInt(match[1].replace(/,/g, ''), 10) : 0;
      });
    
    if (values.length === 0) return 'Not specified';
    
    const total = values.reduce((sum, val) => sum + val, 0);
    return `£${total.toLocaleString()}`;
  };
  void _calculateTotalValue; // Reserved for future use

  const svgMark = encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 57.56 100" preserveAspectRatio="xMidYMid meet"><g fill="currentColor" opacity="0.22"><path d="M57.56,13.1c0,7.27-7.6,10.19-11.59,11.64-4,1.46-29.98,11.15-34.78,13.1C6.4,39.77,0,41.23,0,48.5v-13.1C0,28.13,6.4,26.68,11.19,24.74c4.8-1.94,30.78-11.64,34.78-13.1,4-1.45,11.59-4.37,11.59-11.64v13.09h0Z"/><path d="M57.56,38.84c0,7.27-7.6,10.19-11.59,11.64s-29.98,11.16-34.78,13.1c-4.8,1.94-11.19,3.4-11.19,10.67v-13.1c0-7.27,6.4-8.73,11.19-10.67,4.8-1.94,30.78-11.64,34.78-13.1,4-1.46,11.59-4.37,11.59-11.64v13.09h0Z"/><path d="M57.56,64.59c0,7.27-7.6,10.19-11.59,11.64-4,1.46-29.98,11.15-34.78,13.1-4.8,1.94-11.19,3.39-11.19,10.67v-13.1c0-7.27,6.4-8.73,11.19-10.67,4.8-1.94,30.78-11.64,34.78-13.1,4-1.45,11.59-4.37,11.59-11.64v13.1h0Z"/></g></svg>');
  // Show the decorative background mark only when expanded (or for single-enquiry cards)
  const showOverlay = isExpanded || enquiryCount === 1;
  const cardStyle = mergeStyles({
    position: 'relative',
    borderRadius: 10,
    // Align with Time Metrics card: subtle gradient + stronger border in dark mode
    background: isDarkMode
      ? 'linear-gradient(135deg, #1F2937 0%, #111827 100%)'
      : colours.light.cardBackground,
    backdropFilter: 'none',
    WebkitBackdropFilter: 'none',
    border: `1px solid ${isDarkMode ? '#374151' : 'rgba(0,0,0,0.06)'}`,
    borderLeft: `3px solid ${colours.highlight}`,
    boxShadow: isDarkMode 
      ? '0 2px 4px rgba(0,0,0,0.3)' 
      : '0 4px 12px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.04)',
    padding: '12px',
    marginBottom: isLast ? 0 : 8,
    cursor: 'pointer',
    fontFamily: 'Raleway, sans-serif',
    overflow: 'hidden',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    '::after': showOverlay
      ? {
          content: '""',
          position: 'absolute',
          top: 10,
          bottom: 10,
          right: 12,
          width: 168,
          background: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(6,23,51,0.08)',
          maskImage: `url("data:image/svg+xml,${svgMark}")`,
          WebkitMaskImage: `url("data:image/svg+xml,${svgMark}")`,
          maskRepeat: 'no-repeat',
          WebkitMaskRepeat: 'no-repeat',
          maskPosition: 'center',
          WebkitMaskPosition: 'center',
          maskSize: 'contain',
          WebkitMaskSize: 'contain',
          pointerEvents: 'none',
          mixBlendMode: isDarkMode ? 'screen' : 'multiply',
          filter: 'blur(.2px)',
          zIndex: 0,
        }
      : undefined,
    opacity: getPromotionStatus && groupedEnquiry.enquiries.some(eq => getPromotionStatus(eq)) ? 0.6 : 1,
    selectors: {
      ':hover': { 
        transform: 'translateY(-2px)', 
        borderColor: `${colours.highlight}80`,
        background: isDarkMode
          ? '#1F2937'
          : colours.light.cardBackground,
        boxShadow: isDarkMode 
          ? `0 4px 12px rgba(0,0,0,0.45)` 
          : `0 8px 20px rgba(0,0,0,0.1), 0 2px 6px ${colours.highlight}30`,
      },
      ':active': { transform: 'translateY(-1px)' },
    },
  });

  const topRow = mergeStyles({ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', position: 'relative' });

  const nameStyle = mergeStyles({
    fontWeight: 600,
    fontSize: 15,
    color: isDarkMode ? colours.dark.text : colours.light.text,
    marginBottom: 2,
  });

  const emailStyle = mergeStyles({
    fontSize: 12,
    color: isDarkMode ? 'rgba(156,163,175,1)' : 'rgba(71,85,105,0.9)',
    fontWeight: 500,
  });

  const countBadgeStyle = mergeStyles({
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: `${colours.highlight}18`,
    color: colours.highlight,
    border: `1px solid ${colours.highlight}30`,
    borderRadius: 12,
    padding: '3px 8px',
    fontSize: 11,
    fontWeight: 700,
    marginLeft: 8,
    minWidth: 26,
    height: 22,
    boxShadow: isDarkMode 
      ? `0 1px 3px rgba(0,0,0,0.2), inset 0 1px 0 ${colours.highlight}10` 
      : `0 1px 2px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.5)`,
  });

  const _metaStyle = mergeStyles({
    fontSize: 13,
    color: isDarkMode ? colours.dark.text : colours.light.text,
    fontWeight: 600,
  });
  void _metaStyle; // Reserved for future use

  const _valueStyle = mergeStyles({
    fontSize: 13,
    color: colours.highlight,
    fontWeight: 700,
  });
  void _valueStyle; // Reserved for future use

  const _dateStyle = mergeStyles({
    fontSize: 12,
    color: isDarkMode ? colours.dark.subText : colours.light.subText,
    fontWeight: 500,
  });
  void _dateStyle; // Reserved for future use

  const latestDateTextStyle = mergeStyles({
    fontSize: 12,
    color: isDarkMode ? colours.dark.subText : colours.light.subText,
    fontWeight: 700,
    lineHeight: 1.2,
    textAlign: 'right',
  });

  const previousDateTextStyle = mergeStyles({
    fontSize: 12,
    color: isDarkMode ? 'rgba(148,163,184,0.85)' : 'rgba(71,85,105,0.9)',
    fontWeight: 500,
    lineHeight: 1.2,
    textAlign: 'right',
    marginTop: 2,
  });

  const moreDotsStyle = mergeStyles({
    fontSize: 12,
    color: isDarkMode ? colours.dark.subText : colours.light.subText,
    opacity: 0.7,
    lineHeight: 1.2,
    textAlign: 'right',
    marginTop: 2,
  });

  // Horizontal timeline styles (previous on the left, latest on the right)
  const hTimelineContainer = mergeStyles({
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    width: 200,
    flex: '0 0 200px',
  });

  const hBar = mergeStyles({
    position: 'relative',
    width: 56,
    height: 8,
  });

  const hLine = mergeStyles({
    position: 'absolute',
    top: '50%',
    left: 2,
    right: 2,
    height: 2,
    transform: 'translateY(-50%)',
    background: isDarkMode ? 'rgba(148,163,184,0.35)' : 'rgba(100,116,139,0.35)',
    borderRadius: 2,
  });

  const hDotBase: React.CSSProperties = {
    position: 'absolute',
    top: '50%',
    width: 8,
    height: 8,
    borderRadius: '50%',
    transform: 'translateY(-50%)',
    boxShadow: isDarkMode
      ? '0 0 0 2px rgba(15,23,42,0.85)'
      : '0 0 0 2px rgba(255,255,255,0.92)'
  };

  const hDotLeft: React.CSSProperties = {
    ...hDotBase,
    left: 2,
    background: isDarkMode ? 'rgba(148,163,184,0.9)' : 'rgba(100,116,139,0.9)',
  };

  const hDotRight: React.CSSProperties = {
    ...hDotBase,
    right: 2,
    background: colours.highlight,
  };

  const hLabels = mergeStyles({
    display: 'flex',
    alignItems: 'baseline',
    gap: 6,
    whiteSpace: 'nowrap',
  });

  const sepStyle = mergeStyles({
    color: isDarkMode ? 'rgba(148,163,184,0.6)' : 'rgba(100,116,139,0.7)'
  });

  const actionsStyle = mergeStyles({ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' });

  const actionButtonStyle: React.CSSProperties = {
    padding: '8px 12px',
    background: isDarkMode ? 'rgba(148, 163, 184, 0.04)' : 'rgba(148, 163, 184, 0.04)',
    border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.28)' : 'rgba(100, 116, 139, 0.26)'}`,
    borderRadius: 8,
    color: isDarkMode ? 'rgba(226, 232, 240, 0.92)' : 'rgba(51, 65, 85, 0.95)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    fontSize: 12,
    fontWeight: 600,
    transition: 'all 0.2s ease',
    width: 36,
    height: 36,
  };

  const actionButtonHoverStyle: React.CSSProperties = {
    background: isDarkMode ? 'rgba(148, 163, 184, 0.12)' : 'rgba(148, 163, 184, 0.12)',
    borderColor: colours.highlight,
    color: colours.highlight,
  };

  const actionButtonActiveStyle: React.CSSProperties = {
    background: isDarkMode ? 'rgba(148, 163, 184, 0.18)' : 'rgba(148, 163, 184, 0.18)',
    borderColor: colours.highlight,
    color: colours.highlight,
    transform: 'scale(0.98)'
  };

  const expandedContentStyle = mergeStyles({
    padding: '0 16px 10px 16px',
    backgroundColor: isDarkMode ? 'rgba(15, 23, 42, 0.6)' : 'rgba(248, 250, 252, 0.8)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    borderRadius: 8,
    marginTop: 12,
  });

  const _areaTagsStyle = mergeStyles({
    display: 'flex',
    gap: 4,
    flexWrap: 'wrap',
    marginTop: 4,
  });
  void _areaTagsStyle; // Reserved for future use

  const _areaTagStyle = (area: string) => mergeStyles({
    display: 'inline-block',
    backgroundColor: `${getAreaColor(area)}15`,
    color: getAreaColor(area),
    fontSize: 9,
    fontWeight: 600,
    padding: '3px 6px',
    borderRadius: 10,
    textTransform: 'none',
    letterSpacing: '0.3px',
    border: `1px solid ${getAreaColor(area)}30`
  });
  void _areaTagStyle; // Reserved for future use

  const toggleExpanded = (e: React.MouseEvent<any>) => {
    e.stopPropagation();
    setIsExpanded(!isExpanded);
  };

  const handleMainClick = () => {
    if (enquiryCount === 1) {
      onSelect(latestEnquiry);
    } else {
      setIsExpanded(!isExpanded);
    }
  };

  return (
    <div className={cardStyle} onClick={handleMainClick}>
      {/* Left accent bar */}
      <span style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 2, background: colours.highlight, opacity: .95 }} />
      <div className={topRow}>
        <div style={{ minWidth: 160 }}>
          <div className={nameStyle}>
            {clientName}
            {enquiryCount > 1 && <span className={countBadgeStyle}>{enquiryCount}</span>}
          </div>
          <div className={emailStyle}>{clientEmail}</div>
        </div>
        <div className={hTimelineContainer}>
          <div className={hBar} aria-hidden>
            <div className={hLine} />
            {enquiryCount > 1 && <div style={hDotLeft} />}
            <div style={hDotRight} />
          </div>
          <div className={hLabels}>
            {enquiryCount > 1 && (
              <span className={previousDateTextStyle}>
                {formatDate(enquiries[1]?.Touchpoint_Date || '')}
              </span>
            )}
            {enquiryCount > 1 && <span className={sepStyle}>—</span>}
            <span className={latestDateTextStyle}>{formatDate(latestDate)}</span>
            {enquiryCount > 2 && <span className={moreDotsStyle}>…</span>}
          </div>
        </div>
        <div className={actionsStyle} onClick={e => e.stopPropagation()}>
          <button
            title="Call"
            style={actionButtonStyle}
            onClick={() => latestEnquiry.Phone_Number && (window.location.href = `tel:${latestEnquiry.Phone_Number}`)}
            onMouseEnter={(e) => Object.assign(e.currentTarget.style, actionButtonHoverStyle)}
            onMouseLeave={(e) => Object.assign(e.currentTarget.style, actionButtonStyle)}
            onMouseDown={(e) => Object.assign(e.currentTarget.style, actionButtonActiveStyle)}
            onMouseUp={(e) => Object.assign(e.currentTarget.style, actionButtonHoverStyle)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.86 19.86 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.86 19.86 0 0 1 2.1 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.66 12.66 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.66 12.66 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
            </svg>
          </button>
          <button
            title="Email"
            style={actionButtonStyle}
            onClick={() => clientEmail && (window.location.href = `mailto:${clientEmail}?subject=Your%20Enquiry`)}
            onMouseEnter={(e) => Object.assign(e.currentTarget.style, actionButtonHoverStyle)}
            onMouseLeave={(e) => Object.assign(e.currentTarget.style, actionButtonStyle)}
            onMouseDown={(e) => Object.assign(e.currentTarget.style, actionButtonActiveStyle)}
            onMouseUp={(e) => Object.assign(e.currentTarget.style, actionButtonHoverStyle)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
              <rect x="2" y="4" width="20" height="16" rx="2"></rect>
              <path d="M7 10l5 4 5-4"></path>
            </svg>
          </button>
          <button
            title={enquiryCount > 1 ? (isExpanded ? 'Collapse' : 'Expand') : 'View Details'}
            style={isExpanded ? { ...actionButtonStyle, background: isDarkMode ? 'rgba(148, 163, 184, 0.12)' : 'rgba(148, 163, 184, 0.12)', borderColor: colours.highlight, color: colours.highlight } : actionButtonStyle}
            onClick={toggleExpanded}
            onMouseEnter={(e) => Object.assign(e.currentTarget.style, { ...actionButtonHoverStyle })}
            onMouseLeave={(e) => Object.assign(e.currentTarget.style, isExpanded ? { ...actionButtonStyle, background: isDarkMode ? 'rgba(148, 163, 184, 0.12)' : 'rgba(148, 163, 184, 0.12)', borderColor: colours.highlight, color: colours.highlight } : actionButtonStyle)}
            onMouseDown={(e) => Object.assign(e.currentTarget.style, { ...actionButtonActiveStyle })}
            onMouseUp={(e) => Object.assign(e.currentTarget.style, { ...actionButtonHoverStyle })}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
              {isExpanded ? (
                <polyline points="18 15 12 9 6 15"></polyline>
              ) : (
                <polyline points="6 9 12 15 18 9"></polyline>
              )}
            </svg>
          </button>
        </div>
      </div>
      {isExpanded && enquiryCount > 1 && (
        <div className={expandedContentStyle} style={{ marginTop: 12 }}>
          <Stack tokens={{ childrenGap: 8 }}>
            <Text variant="medium" styles={{ root: { fontWeight: 600, color: isDarkMode ? colours.dark.text : colours.light.text, marginBottom: 8 } }}>All Enquiries ({enquiryCount})</Text>
            {enquiries.map((enquiry, idx) => (
              <div key={enquiry.ID} style={{ borderRadius: 4, overflow: 'hidden' }}>
                <EnquiryLineItem 
                  enquiry={enquiry} 
                  onSelect={onSelect} 
                  onRate={onRate}
                  onRatingChange={onRatingChange}
                  onPitch={onPitch} 
                  teamData={teamData} 
                  isLast={idx === enquiries.length - 1} 
                  userAOW={undefined}
                  promotionStatus={getPromotionStatus ? getPromotionStatus(enquiry) : null}
                  onFilterByPerson={onFilterByPerson}
                  teamsActivityData={teamsActivityMap.get(enquiry.ID || '')}
                  documentCount={documentCounts[enquiry.ID] || 0}
                />
              </div>
            ))}
          </Stack>
        </div>
      )}
    </div>
  );
};

export default GroupedEnquiryCard;
