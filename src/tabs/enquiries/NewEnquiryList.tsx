import React, { useState, useEffect, useMemo } from 'react';
import { mergeStyles } from '@fluentui/react';
import { useTheme } from '../../app/functionality/ThemeContext';
import { colours } from '../../app/styles/colours';
import { NewEnquiry } from '../../app/functionality/newEnquiryTypes';
import { UserData } from '../../app/functionality/types';
import { fetchNewEnquiriesData } from '../../app/functionality/fetchNewEnquiries';
import NewEnquiryLineItem from './NewEnquiryLineItem';
import { TeamsActivityData, fetchTeamsActivityTracking } from '../../app/functionality/teamsActivityTracking';

interface NewEnquiryListProps {
  onSelectEnquiry?: (enquiry: NewEnquiry) => void;
  onRateEnquiry?: (enquiryId: number) => void;
  onPitch?: (enquiry: NewEnquiry) => void;
  userData?: UserData[];
  activeMainTab?: string;
  selectedArea?: string | null;
}

const NewEnquiryList: React.FC<NewEnquiryListProps> = ({
  onSelectEnquiry,
  onRateEnquiry,
  onPitch,
  userData,
  activeMainTab,
  selectedArea,
}) => {
  const { isDarkMode } = useTheme();
  const [enquiries, setEnquiries] = useState<NewEnquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEnquiry, setSelectedEnquiry] = useState<NewEnquiry | null>(null);
  const [teamsActivityMap, setTeamsActivityMap] = useState<Map<string, TeamsActivityData>>(new Map());

  // Filter enquiries based on user's areas of work, main tab, and selected area
  const filteredEnquiries = useMemo(() => {
    let filtered = enquiries;
    
    // Filter by activeMainTab first
    if (activeMainTab === 'Claimed') {
      filtered = filtered.filter(enquiry => 
        enquiry.poc && 
        enquiry.poc.toLowerCase() !== 'team@helix-law.com'
      );
    } else if (activeMainTab === 'Unclaimed') {
      filtered = filtered.filter(enquiry => 
        enquiry.poc?.toLowerCase() === 'team@helix-law.com'
      );
    }
    
    // Filter by user's areas of work
    // Skip area filtering in local development (localhost)
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (!isLocalhost && userData && userData.length > 0 && userData[0].AOW) {
      const userAOW = userData[0].AOW.split(',').map(a => a.trim().toLowerCase());
      const hasFullAccess = userAOW.some(
        area => area.includes('operations') || area.includes('tech')
      );

      if (!hasFullAccess) {
        filtered = filtered.filter(enquiry => {
          const area = enquiry.aow?.toLowerCase();
          if (!area) return false;
          return userAOW.some(a => a === area || a.includes(area) || area.includes(a));
        });
      }
    }
    
    // Apply area-specific filter if selected
    if (selectedArea) {
      // Handle multiple areas (comma-separated)
      const selectedAreas = selectedArea.split(',').map(a => a.trim().toLowerCase());
      const hasFullAccess = selectedAreas.some(
        area => area.includes('operations') || area.includes('tech')
      );

      if (!hasFullAccess) {
        filtered = filtered.filter(enq => {
          const area = (enq.aow || (enq as any).Area_of_Work || '').toLowerCase();
          return selectedAreas.some(sel => sel === area || sel.includes(area) || area.includes(sel));
        });
      }
      // If user has Operations/Tech access, show all enquiries (no area filtering)
    }
    
    return filtered;
  }, [enquiries, userData, activeMainTab, selectedArea]);

  useEffect(() => {
    loadEnquiries();
  }, []);

  // Fetch Teams activity data for enquiries
  useEffect(() => {
    const fetchTeamsData = async () => {
      if (enquiries.length === 0) return;
      
      // Get all enquiry IDs (convert to strings as the API expects string IDs)
      const enquiryIds = enquiries.map(e => e.id.toString());
      
      if (enquiryIds.length > 0) {
        try {
          const activityData = await fetchTeamsActivityTracking(enquiryIds);
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

  const loadEnquiries = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Check if we're in development/localhost - use new system
      const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      
      if (isLocalhost) {
        // Development: Use new enquiry system (not ready for production)
        const data = await fetchNewEnquiriesData();
        setEnquiries(data);
      } else {
        // Production: Fall back to mock data until new system is ready
        console.log('Production mode: Using mock enquiry data (new system not ready)');
        const { mockNewEnquiries } = await import('../../app/functionality/newEnquiryTypes');
        setEnquiries(mockNewEnquiries);
      }
    } catch (err) {
      setError('Failed to load enquiries');
      console.error('Error loading enquiries:', err);
      // Fallback to mock data on any error
      const { mockNewEnquiries } = await import('../../app/functionality/newEnquiryTypes');
      setEnquiries(mockNewEnquiries);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectEnquiry = (enquiry: NewEnquiry) => {
    // Toggle accordion: if same enquiry clicked, collapse it; otherwise expand the new one
    if (selectedEnquiry?.id === enquiry.id) {
      setSelectedEnquiry(null); // Collapse if same enquiry
    } else {
      setSelectedEnquiry(enquiry); // Expand new enquiry
    }
  };

  const handlePitch = (enquiry: NewEnquiry) => {
    if (onPitch) {
      onPitch(enquiry);
    }
  };

  const handleRateEnquiry = (enquiryId: number) => {
    if (onRateEnquiry) {
      onRateEnquiry(enquiryId);
    }
  };

  const containerStyles = mergeStyles({
    // Remove background and padding since this is now inline
  });

  const headerStyles = mergeStyles({
    marginBottom: '32px',
    textAlign: 'center',
  });

  const titleStyles = mergeStyles({
    fontSize: '28px',
    fontWeight: '600',
    color: isDarkMode ? colours.dark.text : colours.light.text,
    marginBottom: '8px',
  });

  const subtitleStyles = mergeStyles({
    fontSize: '16px',
    color: isDarkMode ? colours.dark.subText : colours.light.subText,
  });

  const loadingStyles = mergeStyles({
    textAlign: 'center',
    padding: '60px 20px',
    fontSize: '18px',
    color: isDarkMode ? colours.dark.text : colours.light.text,
  });

  const errorStyles = mergeStyles({
    textAlign: 'center',
    padding: '60px 20px',
    fontSize: '16px',
    color: colours.cta,
    backgroundColor: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
    borderRadius: '12px',
    border: `1px solid ${colours.cta}`,
  });

  const statsStyles = mergeStyles({
    display: 'flex',
    justifyContent: 'center',
    gap: '32px',
    marginBottom: '32px',
    flexWrap: 'wrap',
  });

  const statItemStyles = mergeStyles({
    textAlign: 'center',
    padding: '16px 24px',
    backgroundColor: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
    borderRadius: '12px',
    border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
    minWidth: '120px',
  });

  const statNumberStyles = mergeStyles({
    fontSize: '24px',
    fontWeight: '700',
    color: colours.blue,
    marginBottom: '4px',
  });

  const statLabelStyles = mergeStyles({
    fontSize: '14px',
    color: isDarkMode ? colours.dark.subText : colours.light.subText,
  });

  if (loading) {
    return (
      <div className={containerStyles}>
        <div className={loadingStyles}>
          Loading new enquiries...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={containerStyles}>
        <div className={errorStyles}>
          <h3>Error Loading Enquiries</h3>
          <p>{error}</p>
          <button 
            onClick={loadEnquiries}
            style={{
              marginTop: '16px',
              padding: '12px 24px',
              backgroundColor: colours.blue,
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500',
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Calculate stats using filtered enquiries
  const totalEnquiries = filteredEnquiries.length;
  const highValueEnquiries = filteredEnquiries.filter(e => {
    if (!e.value) return false; // Skip if value is null or undefined
    const value = parseFloat(e.value.replace(/[£,]/g, ''));
    return value >= 3000;
  }).length;
  const recentEnquiries = filteredEnquiries.filter(e => {
    const enquiryDate = new Date(e.datetime);
    const today = new Date();
    const diffTime = Math.abs(today.getTime() - enquiryDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays <= 7;
  }).length;

  return (
    <div className={containerStyles}>
      {loading ? (
        <div className={loadingStyles}>
          Loading new enquiries...
        </div>
      ) : error ? (
        <div className={errorStyles}>
          <h3>Error Loading Enquiries</h3>
          <p>{error}</p>
          <button 
            onClick={loadEnquiries}
            style={{
              marginTop: '16px',
              padding: '12px 24px',
              backgroundColor: colours.blue,
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500',
            }}
          >
            Retry
          </button>
        </div>
      ) : filteredEnquiries.length === 0 ? (
        <div className={errorStyles}>
          <h3>No Enquiries Found</h3>
          <p>No enquiries match your current area of work filter.</p>
        </div>
      ) : (
        <>
          {/* Area Filter Status */}
          {userData && userData[0]?.AOW && (
            <div style={{
              marginBottom: '16px',
              padding: '12px 16px',
              background: isDarkMode ? 'rgba(34, 197, 94, 0.1)' : 'rgba(34, 197, 94, 0.05)',
              border: isDarkMode ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid rgba(34, 197, 94, 0.2)',
              borderRadius: '8px',
              fontSize: '12px',
              color: isDarkMode ? 'rgba(187, 247, 208, 0.9)' : 'rgba(21, 128, 61, 0.9)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 6h18M3 12h18M3 18h18" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"/>
              </svg>
              <span>
                Filtered by areas: <strong>{userData[0].AOW}</strong>
                {filteredEnquiries.length !== enquiries.length && (
                  <span style={{ opacity: 0.8 }}> • Showing {filteredEnquiries.length} of {enquiries.length} enquiries</span>
                )}
              </span>
            </div>
          )}
          
          {/* Enquiry Line Items with Inline Expansion */}
          <div>
            {filteredEnquiries.map((enquiry, index) => (
              <NewEnquiryLineItem
                key={enquiry.id}
                enquiry={enquiry}
                onSelect={handleSelectEnquiry}
                onRate={handleRateEnquiry}
                onPitch={handlePitch}
                isLast={index === filteredEnquiries.length - 1}
                isExpanded={selectedEnquiry?.id === enquiry.id}
                teamsActivityData={teamsActivityMap.get(enquiry.id.toString())}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default NewEnquiryList;
