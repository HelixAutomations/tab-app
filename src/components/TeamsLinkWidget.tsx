import React from 'react';
import { app } from '@microsoft/teams-js';
import { Icon } from '@fluentui/react';
import { mergeStyles } from '@fluentui/react/lib/Styling';
import { useTheme } from '../app/functionality/ThemeContext';
import { TeamsActivityData, getActivityStatusColor } from '../app/functionality/teamsActivityTracking';

interface TeamsLinkWidgetProps {
  activityData: TeamsActivityData | null;
  size?: 'small' | 'medium';
  className?: string;
  // Allow override for v2 enquiries without API data
  leadName?: string;
  forceShow?: boolean;
}

const TeamsLinkWidget: React.FC<TeamsLinkWidgetProps> = ({ 
  activityData, 
  size = 'small', 
  className,
  leadName,
  forceShow = false
}) => {
  const { isDarkMode } = useTheme();

  // Show widget if we have activity data OR if explicitly forced to show
  if (!activityData && !forceShow) {
    return null;
  }

  // Create effective activity data with fallbacks
  const effectiveData = activityData || {
    Id: 0,
    ActivityId: '',
    ChannelId: '',
    TeamId: '',
    EnquiryId: '',
    LeadName: leadName || 'Unknown Client',
    Email: '',
    Phone: '',
    CardType: 'Enquiry',
    MessageTimestamp: '',
    Stage: 'new',
    Status: 'active',
    ClaimedBy: '',
    ClaimedAt: '',
    CreatedAt: '',
    UpdatedAt: '',
    teamsLink: ''
  };

  // No hardcoded test links; rely on API-provided teamsLink when available
  // If teamsLink is missing but we have ChannelId/TeamId, construct one
  const constructTeamsLink = (): string | null => {
    if (effectiveData.teamsLink) return effectiveData.teamsLink;
    
    // Need channelId and teamId at minimum
    if (!effectiveData.ChannelId || !effectiveData.TeamId) return null;
    
    const tenantId = '7fbc252f-3ce5-460f-9740-4e1cb8bf78b8';
    
    const resolveMessageId = (value: unknown): string | null => {
      if (!value) return null;
      if (typeof value === 'number' && value > 1640995200000) return String(value);
      const raw = String(value).trim();
      if (!raw) return null;
      if (raw.startsWith('0:')) {
        const tail = raw.split(':')[1];
        if (tail && /^\d{13,}$/.test(tail)) return tail;
      }
      const match = raw.match(/\d{13,}/);
      if (match) return match[0];
      return null;
    };

    // Try to get messageId from various sources (epoch ms timestamp)
    let messageId: string | null = null;
    if ((effectiveData as any).TeamsMessageId) {
      messageId = resolveMessageId((effectiveData as any).TeamsMessageId);
    }
    if (!messageId && (effectiveData as any).ActivityId) {
      messageId = resolveMessageId((effectiveData as any).ActivityId);
    }
    if (!messageId && effectiveData.MessageTimestamp) {
      const d = new Date(effectiveData.MessageTimestamp);
      if (!isNaN(d.getTime())) messageId = String(d.getTime());
    }
    if (!messageId && (effectiveData as any).CreatedAtMs) {
      messageId = resolveMessageId((effectiveData as any).CreatedAtMs);
    }
    
    if (!messageId) return null;

    const channelId = encodeURIComponent(effectiveData.ChannelId);
    const encMessageId = encodeURIComponent(messageId);

    const query = new URLSearchParams({
      tenantId,
      groupId: effectiveData.TeamId,
      parentMessageId: messageId,
      createdTime: messageId,
    });

    return `https://teams.microsoft.com/l/message/${channelId}/${encMessageId}?${query.toString()}`;
  };
  
  const resolvedTeamsLink = constructTeamsLink();

  const handleClick = (e: React.MouseEvent<any>) => {
    e.stopPropagation();

    const openUrl = async (url: string) => {
      try {
        await app.openLink(url);
      } catch {
        window.open(url, '_blank');
      }
    };

    if (resolvedTeamsLink) {
      void openUrl(resolvedTeamsLink);
      return;
    }

    void openUrl('https://teams.microsoft.com/');
  };

  const statusColor = getActivityStatusColor(effectiveData.Stage, isDarkMode);
  const isSmall = size === 'small';

  const widgetStyle = mergeStyles({
    display: 'inline-flex',
    alignItems: 'center',
    gap: isSmall ? 3 : 4,
    padding: isSmall ? '6px' : '8px',
    borderRadius: '50%',
    background: isDarkMode 
      ? 'rgba(88, 101, 242, 0.12)' 
      : 'rgba(88, 101, 242, 0.08)',
    border: `1px solid ${isDarkMode ? 'rgba(88, 101, 242, 0.25)' : 'rgba(88, 101, 242, 0.15)'}`,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    fontSize: isSmall ? 10 : 12,
    fontWeight: 600,
    color: isDarkMode ? 'rgba(173, 177, 252, 0.9)' : 'rgba(67, 80, 180, 0.9)',
    textDecoration: 'none',
    userSelect: 'none',
    position: 'relative',
    selectors: {
      ':hover': {
        background: isDarkMode 
          ? 'rgba(88, 101, 242, 0.18)' 
          : 'rgba(88, 101, 242, 0.12)',
        borderColor: isDarkMode ? 'rgba(88, 101, 242, 0.35)' : 'rgba(88, 101, 242, 0.25)',
        transform: 'translateY(-1px)',
        boxShadow: isDarkMode 
          ? '0 2px 8px rgba(88, 101, 242, 0.2)' 
          : '0 2px 8px rgba(88, 101, 242, 0.15)',
      },
      ':active': {
        transform: 'translateY(0)',
      },
    },
  });

  const iconStyle = mergeStyles({
    fontSize: isSmall ? 11 : 13,
    color: isDarkMode ? 'rgba(173, 177, 252, 0.8)' : 'rgba(67, 80, 180, 0.8)',
  });

  const statusDotStyle = mergeStyles({
    width: isSmall ? 6 : 7,
    height: isSmall ? 6 : 7,
    borderRadius: '50%',
    background: statusColor,
    flexShrink: 0,
    boxShadow: `0 0 0 2px ${statusColor}30`,
  });

  const tooltipText = resolvedTeamsLink 
    ? `Open Teams card • Stage: ${effectiveData.Stage}`
    : `Teams activity tracked (no direct link available)`;

  return (
    <button
      className={`${widgetStyle} ${className || ''}`}
      onClick={handleClick}
      title={tooltipText}
      aria-label={`View Teams conversation for ${effectiveData.LeadName}`}
      type="button"
    >
      <Icon iconName="TeamsLogo" className={iconStyle} />
      <div 
        className={statusDotStyle} 
        style={{
          position: 'absolute',
          top: -2,
          right: -2,
        }}
      />
    </button>
  );
};

export default TeamsLinkWidget;