import React, { useMemo, useState, useEffect } from 'react';
import { Stack, Text, Spinner, SpinnerSize, MessageBar, MessageBarType, IconButton, mergeStyles, Icon } from '@fluentui/react';
import { NormalizedMatter, UserData } from '../../app/functionality/types';
import {
  filterMattersByStatus,
  filterMattersByArea,
  filterMattersByRole,
  applyAdminFilter,
  hasAdminAccess,
  getUniquePracticeAreas
} from '../../utils/matterNormalization';
import MatterLineItem from './MatterLineItem';
import MatterOverview from './MatterOverview';
import { colours } from '../../app/styles/colours';
import { useTheme } from '../../app/functionality/ThemeContext';
import { useNavigator } from '../../app/functionality/NavigatorContext';
import MatterApiDebugger from '../../components/MatterApiDebugger';

interface MattersProps {
  matters: NormalizedMatter[];
  isLoading: boolean;
  error: string | null;
  userData: UserData[] | null;
}

const Matters: React.FC<MattersProps> = ({ matters, isLoading, error, userData }) => {
  const { isDarkMode } = useTheme();
  const { setContent } = useNavigator();
  const [selected, setSelected] = useState<NormalizedMatter | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [activeFilter, setActiveFilter] = useState<string>('Active');
  const [activeAreaFilter, setActiveAreaFilter] = useState<string>('All');
  const [activeRoleFilter, setActiveRoleFilter] = useState<string>('All'); // New role filter
  const [showDataInspector, setShowDataInspector] = useState<boolean>(false);
  const [showEveryone, setShowEveryone] = useState<boolean>(false); // New admin toggle

  const userFullName = userData?.[0]?.FullName?.toLowerCase();
  const userRole = userData?.[0]?.Role?.toLowerCase();
  const isAdmin = hasAdminAccess(userRole || '', userFullName || '');

  // Debug the incoming matters
  console.log('🔍 Matters received:', matters.length);
  console.log('🔍 First matter sample:', matters[0]);
  console.log('🔍 User info:', { userFullName, userRole, isAdmin });

  // Apply all filters in sequence
  const filtered = useMemo(() => {
    let result = matters;
    console.log('🔍 Filter Debug - Starting with matters:', result.length);

    // Apply admin filter first
    result = applyAdminFilter(result, showEveryone, userFullName || '', userRole || '');
    console.log('🔍 After admin filter:', result.length, 'showEveryone:', showEveryone);

    // Apply status filter
    result = filterMattersByStatus(result, activeFilter.toLowerCase() as any);
    console.log('🔍 After status filter:', result.length, 'activeFilter:', activeFilter);

    // Apply area filter
    result = filterMattersByArea(result, activeAreaFilter);
    console.log('🔍 After area filter:', result.length, 'activeAreaFilter:', activeAreaFilter);

    // Apply role filter
    if (activeRoleFilter !== 'All') {
      const allowedRoles = activeRoleFilter === 'Responsible' ? ['responsible'] :
                          activeRoleFilter === 'Originating' ? ['originating'] :
                          ['responsible', 'originating'];
      result = filterMattersByRole(result, allowedRoles as any);
      console.log('🔍 After role filter:', result.length, 'activeRoleFilter:', activeRoleFilter);
    }

    // Apply search term filter
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter((m) =>
        m.clientName?.toLowerCase().includes(term) ||
        m.displayNumber?.toLowerCase().includes(term) ||
        m.description?.toLowerCase().includes(term) ||
        m.practiceArea?.toLowerCase().includes(term)
      );
      console.log('🔍 After search filter:', result.length, 'searchTerm:', searchTerm);
    }

    console.log('🔍 Final filtered result:', result.length);
    return result;
  }, [matters, showEveryone, userFullName, userRole, activeFilter, activeAreaFilter, activeRoleFilter, searchTerm]);

  // Get unique practice areas for filtering
  const availableAreas = useMemo(() => {
    return getUniquePracticeAreas(matters);
  }, [matters]);

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

          {/* Role filter buttons */}
          <div style={{ width: '1px', height: '20px', background: isDarkMode ? colours.dark.border : colours.light.border }} />
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: '500', color: isDarkMode ? colours.dark.text : colours.light.text }}>
              Role:
            </span>
            {['All', 'Responsible', 'Originating'].map(roleOption => (
              <button
                key={roleOption}
                onClick={() => setActiveRoleFilter(roleOption)}
                style={{
                  background: activeRoleFilter === roleOption ? colours.highlight : 'transparent',
                  color: activeRoleFilter === roleOption ? 'white' : (isDarkMode ? colours.dark.text : colours.light.text),
                  border: `1px solid ${colours.highlight}`,
                  borderRadius: '12px',
                  padding: '4px 12px',
                  fontSize: '11px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  fontFamily: 'Raleway, sans-serif',
                }}
              >
                {roleOption}
              </button>
            ))}
          </div>

          {/* Admin toggle - only show if user has admin access */}
          {isAdmin && (
            <>
              <div style={{ width: '1px', height: '20px', background: isDarkMode ? colours.dark.border : colours.light.border }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="checkbox"
                  id="showEveryone"
                  checked={showEveryone}
                  onChange={(e) => setShowEveryone(e.target.checked)}
                  style={{ cursor: 'pointer' }}
                />
                <label 
                  htmlFor="showEveryone" 
                  style={{ 
                    fontSize: '11px', 
                    fontWeight: '500', 
                    color: isDarkMode ? colours.dark.text : colours.light.text,
                    cursor: 'pointer',
                    fontFamily: 'Raleway, sans-serif',
                  }}
                >
                  See Everyone's
                </label>
              </div>
            </>
          )}
          
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
        {/* TODO: Update MatterApiDebugger to use NormalizedMatter */}
        {showDataInspector && (
          <div style={{ padding: '20px', background: '#f0f0f0', margin: '10px 0' }}>
            <h4>Debug Info (Temporary)</h4>
            <p>Total matters: {matters.length}</p>
            <p>Filtered matters: {filtered.length}</p>
            <button onClick={() => setShowDataInspector(false)}>Close</button>
          </div>
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
                key={m.matterId || idx}
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
        <div style={{ padding: '20px', background: '#f0f0f0', margin: '10px 0' }}>
          <h4>Debug Info (Temporary)</h4>
          <p>Total matters: {matters.length}</p>
          <p>Filtered matters: {filtered.length}</p>
          <button onClick={() => setShowDataInspector(false)}>Close</button>
        </div>
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