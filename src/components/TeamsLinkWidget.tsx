import React from 'react';
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

  const handleClick = (e: React.MouseEvent<any>) => {
    e.stopPropagation();
    
    if (effectiveData.teamsLink) {
      // Open the specific Teams conversation
      window.open(effectiveData.teamsLink, '_blank');
    } else {
      // No specific Teams link - just open Teams web app
      const teamsWebUrl = 'https://teams.microsoft.com/';
      window.open(teamsWebUrl, '_blank');
    }
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

  const tooltipText = effectiveData.teamsLink 
    ? `Open Teams conversation • Stage: ${effectiveData.Stage}`
    : `Open Teams app`;

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