import React, { useMemo, useState, useEffect } from 'react';
import { Stack, Text, Spinner, SpinnerSize, MessageBar, MessageBarType, IconButton, mergeStyles, Icon } from '@fluentui/react';
import { Matter, UserData } from '../../app/functionality/types';
import MatterLineItem from './MatterLineItem';
import MatterOverview from './MatterOverview';
import { colours } from '../../app/styles/colours';
import { useTheme } from '../../app/functionality/ThemeContext';
import { useNavigator } from '../../app/functionality/NavigatorContext';
import MatterApiDebugger from '../../components/MatterApiDebugger';

interface MattersProps {
  matters: Matter[];
  isLoading: boolean;
  error: string | null;
  userData: UserData[] | null;
}

const Matters: React.FC<MattersProps> = ({ matters, isLoading, error, userData }) => {
  const { isDarkMode } = useTheme();
  const { setContent } = useNavigator();
  const [selected, setSelected] = useState<Matter | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [activeFilter, setActiveFilter] = useState<string>('Closed');
  const [activeAreaFilter, setActiveAreaFilter] = useState<string>('All');
  const [showDataInspector, setShowDataInspector] = useState<boolean>(false);

  const userFullName = userData?.[0]?.FullName?.toLowerCase();
  const userRole = userData?.[0]?.Role?.toLowerCase();
  const isAdmin = userRole?.includes('admin');

  const baseFiltered = useMemo(() => {
    if (!userFullName) return [];
    if (isAdmin) return matters;
    
    // Show all matters for Luke and Alex
    if (userFullName.includes('luke') || userFullName.includes('alex')) {
      return matters;
    }
    
    return matters.filter((m) => {
      const responsible = m.ResponsibleSolicitor?.toLowerCase().trim() || '';
      const originating = m.OriginatingSolicitor?.toLowerCase().trim() || '';
      return responsible === userFullName || originating === userFullName;
    });
  }, [matters, userFullName, isAdmin]);

  const filtered = useMemo(() => {
    let result = baseFiltered;

    // Filter by status
    if (activeFilter === 'Active') {
      result = result.filter((m) => m.Status?.toLowerCase() !== 'closed');
    } else if (activeFilter === 'Closed') {
      result = result.filter((m) => m.Status?.toLowerCase() === 'closed');
    }

    // Filter by area
    if (activeAreaFilter !== 'All') {
      result = result.filter((m) => m.PracticeArea?.toLowerCase() === activeAreaFilter.toLowerCase());
    }

    // Apply search term filter
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter((m) =>
        m.ClientName?.toLowerCase().includes(term) ||
        m.DisplayNumber?.toLowerCase().includes(term) ||
        m.Description?.toLowerCase().includes(term) ||
        m.PracticeArea?.toLowerCase().includes(term)
      );
    }

    return result;
  }, [baseFiltered, activeFilter, activeAreaFilter, searchTerm]);

  // Get unique practice areas for filtering
  const availableAreas = useMemo(() => {
    const areas = Array.from(new Set(baseFiltered.map(m => m.PracticeArea).filter(Boolean)));
    return areas.sort();
  }, [baseFiltered]);

  // Set up navigation content with filter bar
  useEffect(() => {
    if (!selected) {
      const filterOptions = ['All', 'Active', 'Closed'];
      
      setContent(
        <div style={{
          backgroundColor: isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground,
          padding: '12px 24px',
          boxShadow: isDarkMode ? '0 2px 4px rgba(0,0,0,0.4)' : '0 2px 4px rgba(0,0,0,0.1)',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          fontSize: '14px',
          fontFamily: 'Raleway, sans-serif',
          flexWrap: 'wrap',
        }}>
          {/* Status filter navigation buttons */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {filterOptions.map(filterOption => (
              <button
                key={filterOption}
                onClick={() => setActiveFilter(filterOption)}
                style={{
                  background: activeFilter === filterOption ? colours.highlight : 'transparent',
                  color: activeFilter === filterOption ? 'white' : (isDarkMode ? colours.dark.text : colours.light.text),
                  border: `1px solid ${colours.highlight}`,
                  borderRadius: '16px',
                  padding: '6px 16px',
                  fontSize: '12px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  fontFamily: 'Raleway, sans-serif',
                }}
              >
                {filterOption}
              </button>
            ))}
          </div>
          
          {/* Area filter buttons - only show if there are multiple areas */}
          {availableAreas.length > 1 && (
            <>
              <div style={{ width: '1px', height: '20px', background: isDarkMode ? colours.dark.border : colours.light.border }} />
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {/* All areas button */}
                <button
                  key="All-Areas"
                  onClick={() => setActiveAreaFilter('All')}
                  style={{
                    background: activeAreaFilter === 'All' ? colours.highlight : (isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground),
                    color: activeAreaFilter === 'All' ? 'white' : (isDarkMode ? colours.dark.text : colours.light.text),
                    border: `1px solid ${activeAreaFilter === 'All' ? colours.highlight : (isDarkMode ? colours.dark.border : colours.light.border)}`,
                    borderRadius: '12px',
                    padding: '4px 12px',
                    fontSize: '11px',
                    fontWeight: '500',
                    cursor: 'pointer',
                    fontFamily: 'Raleway, sans-serif',
                    transition: 'all 0.2s ease',
                  }}
                >
                  All Areas
                </button>
                {/* Individual area buttons */}
                {availableAreas.map(area => (
                  <button
                    key={area}
                    onClick={() => setActiveAreaFilter(area)}
                    style={{
                      background: activeAreaFilter === area ? colours.highlight : (isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground),
                      color: activeAreaFilter === area ? 'white' : (isDarkMode ? colours.dark.text : colours.light.text),
                      border: `1px solid ${activeAreaFilter === area ? colours.highlight : (isDarkMode ? colours.dark.border : colours.light.border)}`,
                      borderRadius: '12px',
                      padding: '4px 12px',
                      fontSize: '11px',
                      fontWeight: '500',
                      cursor: 'pointer',
                      fontFamily: 'Raleway, sans-serif',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    {area}
                  </button>
                ))}
              </div>
            </>
          )}
          
          {/* Search input */}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="text"
              placeholder="Search matters..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                padding: '6px 12px',
                borderRadius: '16px',
                border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                background: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
                color: isDarkMode ? colours.dark.text : colours.light.text,
                fontSize: '12px',
                fontFamily: 'Raleway, sans-serif',
                outline: 'none',
                width: '200px',
              }}
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: isDarkMode ? colours.dark.text : colours.light.text,
                  cursor: 'pointer',
                  padding: '4px',
                }}
              >
                <Icon iconName="Clear" style={{ fontSize: '12px' }} />
              </button>
            )}
          </div>
          
          {/* Development Inspector Button - Only show in localhost */}
          {(window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && (
            <>
              <div style={{ width: '1px', height: '20px', background: isDarkMode ? colours.dark.border : colours.light.border }} />
              <IconButton
                iconProps={{ iconName: 'TestBeaker' }}
                title="Debug API calls and filtering (Local Dev)"
                onClick={() => setShowDataInspector(true)}
                styles={{
                  root: {
                    backgroundColor: colours.cta,
                    color: 'white',
                    borderRadius: '50%',
                    width: '32px',
                    height: '32px',
                  }
                }}
              />
            </>
          )}
        </div>
      );
    } else {
      setContent(
        <div style={{
          backgroundColor: isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground,
          boxShadow: isDarkMode ? '0 2px 4px rgba(0,0,0,0.4)' : '0 2px 4px rgba(0,0,0,0.1)',
          borderTop: isDarkMode ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.05)',
          padding: '0 24px',
          display: 'flex',
          flexDirection: 'row',
          gap: '8px',
          alignItems: 'center',
          height: '48px',
          position: 'sticky',
          top: '48px',
          zIndex: 999,
        }}>
          <IconButton
            iconProps={{ iconName: 'ChevronLeft' }}
            onClick={() => setSelected(null)}
            styles={{
              root: {
                width: 32,
                height: 32,
                borderRadius: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: isDarkMode ? colours.dark.sectionBackground : '#f3f3f3',
                boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                marginRight: 8,
              }
            }}
            title="Back"
            ariaLabel="Back"
          />
          <Text variant="mediumPlus" styles={{
            root: {
              fontWeight: '600',
              color: isDarkMode ? colours.dark.text : colours.light.text,
              fontFamily: 'Raleway, sans-serif',
            }
          }}>
            Matter Details
          </Text>
        </div>
      );
    }
    return () => setContent(null);
  }, [setContent, selected, isDarkMode, activeFilter, activeAreaFilter, availableAreas, searchTerm]);

  if (selected) {
    return (
      <div style={{ padding: 20 }}>
        <MatterOverview matter={selected} />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={containerStyle(isDarkMode)}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          height: '200px' 
        }}>
          <Spinner label="Loading matters..." size={SpinnerSize.medium} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={containerStyle(isDarkMode)}>
        <div style={{ padding: '20px' }}>
          <MessageBar messageBarType={MessageBarType.error}>{error}</MessageBar>
        </div>
      </div>
    );
  }

  if (filtered.length === 0 && !isLoading && !error) {
    return (
      <div className={containerStyle(isDarkMode)}>
        <div style={{
          backgroundColor: 'transparent',
          borderRadius: '12px',
          padding: '60px 40px',
          textAlign: 'center',
          boxShadow: 'none',
        }}>
          <Icon
            iconName="Search"
            styles={{
              root: {
                fontSize: '48px',
                color: isDarkMode ? colours.dark.subText : colours.light.subText,
                marginBottom: '20px',
              },
            }}
          />
          <Text
            variant="xLarge"
            styles={{
              root: {
                color: isDarkMode ? colours.dark.text : colours.light.text,
                fontFamily: 'Raleway, sans-serif',
                fontWeight: '600',
                marginBottom: '8px',
              },
            }}
          >
            No matters found
          </Text>
          <Text
            variant="medium"
            styles={{
              root: {
                color: isDarkMode ? colours.dark.subText : colours.light.subText,
                fontFamily: 'Raleway, sans-serif',
              },
            }}
          >
            Try adjusting your search criteria or filters
          </Text>
        </div>
        {showDataInspector && (
          <MatterApiDebugger
            currentMatters={matters}
            onClose={() => setShowDataInspector(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div className={containerStyle(isDarkMode)}>
      <section className="page-section">
        <Stack
          tokens={{ childrenGap: 0 }}
          styles={{
            root: {
              backgroundColor: isDarkMode 
                ? colours.dark.sectionBackground 
                : colours.light.sectionBackground,
              padding: '16px',
              borderRadius: 0,
              boxShadow: isDarkMode
                ? `0 4px 12px ${colours.dark.border}`
                : `0 4px 12px ${colours.light.border}`,
              width: '100%',
              fontFamily: 'Raleway, sans-serif',
            },
          }}
        >
          {/* Connected List Items */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: "0px",
            padding: 0,
            margin: 0,
            backgroundColor: 'transparent',
          }}>
            {filtered.map((m, idx) => (
              <MatterLineItem
                key={m.UniqueID || m.MatterID || idx}
                matter={m}
                onSelect={setSelected}
                isLast={idx === filtered.length - 1}
              />
            ))}
          </div>
        </Stack>
      </section>

      {/* Matter API Debugger - Only in development */}
      {showDataInspector && (
        <MatterApiDebugger
          currentMatters={matters}
          onClose={() => setShowDataInspector(false)}
        />
      )}
    </div>
  );

  function containerStyle(dark: boolean) {
    return mergeStyles({
      backgroundColor: dark ? colours.dark.background : colours.light.background,
      minHeight: '100vh',
      boxSizing: 'border-box',
      color: dark ? colours.light.text : colours.dark.text,
    });
  }
};

export default Matters;