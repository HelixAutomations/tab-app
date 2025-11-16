import React from 'react';
import { IconButton } from '@fluentui/react';
import { TeamsActivityData } from '../app/functionality/teamsActivityTracking';

interface TeamsLinkWidgetProps {
  activityData: TeamsActivityData;
  isDarkMode?: boolean;
  size?: 'small' | 'medium' | 'large';
}

const TeamsLinkWidget: React.FC<TeamsLinkWidgetProps> = ({
  activityData,
  isDarkMode = false,
  size = 'medium',
}) => {

  // Add CSS for pulse animation
  React.useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.7; }
      }
    `;
    document.head.appendChild(style);
    
    return () => {
      document.head.removeChild(style);
    };
  }, []);
  
  // Test mode - use hardcoded working Teams data for all enquiries to test functionality
  const isTestMode = true; // Always test mode for now
  const testData = {
    ...activityData,
    EnquiryId: activityData.EnquiryId || "test",
    TeamId: "b7d73ffb-70b5-45d6-9940-8f9cc7762135",
    ChannelId: "19:09c0d3669cd2464aab7db60520dd9180@thread.tacv2",
    ActivityId: "0:1f8xa74sTyomF0IsWs67yuaTV4C4y7dVMV1LdaPTg1S96Ojky7aoK2d4dmBepYHMEMdPAX0ovoNuP3JncVAYaJw",
    LeadName: activityData.LeadName || "Test User",
    teamsLink: "https://teams.microsoft.com/l/message/19:09c0d3669cd2464aab7db60520dd9180@thread.tacv2/0:1f8xa74sTyomF0IsWs67yuaTV4C4y7dVMV1LdaPTg1S96Ojky7aoK2d4dmBepYHMEMdPAX0ovoNuP3JncVAYaJw?tenantId=7fbc252f-3ce5-460f-9740-4e1cb8bf78b8&groupId=b7d73ffb-70b5-45d6-9940-8f9cc7762135"
  };

  const effectiveData = isTestMode ? testData : activityData;
  
  const handleClick = (e: React.MouseEvent<any>) => {
    e.stopPropagation();
    
    // Debug logging
    console.log('Teams widget clicked:', {
      hasTeamsLink: !!effectiveData.teamsLink,
      teamsLink: effectiveData.teamsLink,
      clientName: effectiveData.LeadName,
      activityData: effectiveData,
      isTestMode
    });
    
    // Show alert to confirm click is working
    alert('Teams widget clicked! Check console for details.');
    
    if (effectiveData.teamsLink) {
      // Open the specific Teams conversation
      console.log('Opening Teams link:', effectiveData.teamsLink);
      window.open(effectiveData.teamsLink, '_blank');
    } else {
      // No specific Teams link - open Teams with a search for the client
      const clientName = effectiveData.LeadName || 'client';
      const teamsSearchUrl = `https://teams.microsoft.com/l/search/conversations?query=${encodeURIComponent(clientName)}`;
      console.log('Opening Teams search:', teamsSearchUrl);
      window.open(teamsSearchUrl, '_blank');
    }
  };

  // Icon size mapping
  const iconSizeMap = {
    small: 14,
    medium: 16,
    large: 20,
  };

  // Button size mapping
  const buttonSizeMap = {
    small: 24,
    medium: 28,
    large: 32,
  };

  const iconSize = iconSizeMap[size];
  const buttonSize = buttonSizeMap[size];

  // Status dot color (green for active, blue for test mode)
  const statusColor = isTestMode ? '#3b82f6' : '#10b981';

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <IconButton
        iconProps={{ 
          iconName: 'TeamsLogo16',
          style: { 
            fontSize: iconSize,
            color: '#ffffff' // Always white in test mode
          }
        }}
        title={isTestMode ? 'Open Teams (Test Mode)' : 'Open Teams conversation'}
        onClick={handleClick}
        styles={{
          root: {
            width: buttonSize,
            height: buttonSize,
            borderRadius: '50%',
            backgroundColor: '#3b82f6', // Always blue in test mode
            border: '2px solid #ffffff',
            cursor: 'pointer',
            position: 'relative',
          },
          rootHovered: {
            backgroundColor: '#2563eb',
            transform: 'scale(1.1)',
          },
          rootPressed: {
            backgroundColor: '#1d4ed8',
            transform: 'scale(0.95)',
          },
        }}
      />
      
      {/* Status dot */}
      <div
        style={{
          position: 'absolute',
          top: -2,
          right: -2,
          width: 10,
          height: 10,
          borderRadius: '50%',
          backgroundColor: '#10b981', // Green for active
          border: '2px solid #ffffff',
          boxSizing: 'border-box',
          animation: 'pulse 2s infinite',
        }}
        title={isTestMode ? 'Test mode - click to open Teams' : 'Active conversation'}
      />
      
      {isTestMode && (
        <div style={{
          position: 'absolute',
          top: -20,
          left: -10,
          fontSize: '10px',
          color: '#3b82f6',
          fontWeight: 'bold',
          pointerEvents: 'none'
        }}>
          TEST
        </div>
      )}
    </div>
  );
};

export default TeamsLinkWidget;