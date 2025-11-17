import React, { useMemo, useState, useEffect } from 'react';
import { Stack, Text, Spinner, SpinnerSize, MessageBar, MessageBarType, IconButton, mergeStyles, Icon } from '@fluentui/react';
import ThemedSpinner from '../../components/ThemedSpinner';
import ToggleSwitch from '../../components/ToggleSwitch';
import SegmentedControl from '../../components/filter/SegmentedControl';
import FilterBanner from '../../components/filter/FilterBanner';
import { NormalizedMatter, UserData } from '../../app/functionality/types';
import {
  filterMattersByStatus,
  filterMattersByArea,
  filterMattersByRole,
  applyAdminFilter,
  getUniquePracticeAreas
} from '../../utils/matterNormalization';
import { isAdminUser } from '../../app/admin';
import MatterLineItem from './MatterLineItem';
import MatterOverview from './MatterOverview';
import { colours } from '../../app/styles/colours';
import { useTheme } from '../../app/functionality/ThemeContext';
import { useNavigatorActions } from '../../app/functionality/NavigatorContext';
// Debugger removed: MatterApiDebugger was deleted

interface MattersProps {
  matters: NormalizedMatter[];
  isLoading: boolean;
  error: string | null;
  userData: UserData[] | null;
}

const Matters: React.FC<MattersProps> = ({ matters, isLoading, error, userData }) => {
  const { isDarkMode } = useTheme();
  const { setContent } = useNavigatorActions();
  const [selected, setSelected] = useState<NormalizedMatter | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [activeFilter, setActiveFilter] = useState<string>('Active');
  const [activeAreaFilter, setActiveAreaFilter] = useState<string>('All');
  const [activeRoleFilter, setActiveRoleFilter] = useState<string>('Responsible');
  // Debug inspector removed with MatterApiDebugger
  // Scope & dataset selection
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const [useNewData, setUseNewData] = useState<boolean>(false); // Admin-only toggle to view VNet (new) data
  const [twoColumn, setTwoColumn] = useState<boolean>(false);

  const userFullName = userData?.[0]?.FullName?.toLowerCase();
  const userRole = userData?.[0]?.Role?.toLowerCase();
  const isAdmin = isAdminUser(userData?.[0] || null);
  const isLocalhost = (typeof window !== 'undefined') && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');


  // Apply all filters in sequence
  const filtered = useMemo(() => {
    let result = matters;

    // Decide dataset and scope to construct allowed sources
    const effectiveUseNew = isAdmin ? useNewData : false;
    const allowedSources = new Set<string>([
      ...(effectiveUseNew ? ['vnet_direct'] : ['legacy_all', 'legacy_user']),
    ]);
    if (allowedSources.size > 0) {
      result = result.filter((m) => allowedSources.has(m.dataSource));
    } else {
      // If no sources selected, show nothing
      result = [];
    }

    // Apply admin filter next
  // - If scope is 'all' and user is admin => show everyone
  // - Otherwise => show only user's matters
  const effectiveShowEveryone = scope === 'all' && isAdmin;
  result = applyAdminFilter(result, effectiveShowEveryone, userFullName || '', userRole || '');

    // For New data + Mine, restrict to Responsible solicitor only
    if (effectiveUseNew && scope === 'mine') {
      result = result.filter(m => m.role === 'responsible' || m.role === 'both');
    }

    // Apply status filter
    // Admin-only extra option: 'Matter Requests' filters by originalStatus === 'MatterRequest'
    if (activeFilter === 'Matter Requests') {
      result = result.filter(m => (m.originalStatus || '').toLowerCase() === 'matterrequest');
    } else if (activeFilter !== 'All') {
      result = filterMattersByStatus(result, activeFilter.toLowerCase() as any);
    } else {
    }

    // Apply area filter
    result = filterMattersByArea(result, activeAreaFilter);

    // Apply role filter
    if (activeRoleFilter !== 'All') {
      const allowedRoles = activeRoleFilter === 'Responsible' ? ['responsible'] :
                          activeRoleFilter === 'Originating' ? ['originating'] :
                          ['responsible', 'originating'];
      result = filterMattersByRole(result, allowedRoles as any);
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
    }

    return result;
  }, [
    matters,
    userFullName,
    userRole,
    activeFilter,
    activeAreaFilter,
    activeRoleFilter,
    searchTerm,
    scope,
    useNewData,
    isAdmin,
  ]);

  // Dataset count (post-source selection only, before other filters)
  const datasetCount = useMemo(() => {
    const effectiveUseNew = isAdmin ? useNewData : false;
    const allowedSources = new Set<string>([
      ...(effectiveUseNew ? ['vnet_direct'] : ['legacy_all', 'legacy_user']),
    ]);
    return matters.filter(m => allowedSources.has(m.dataSource)).length;
  }, [matters, useNewData, isAdmin]);

  // Pre-compute scope counts for a compact scope control with badges
  const scopeCounts = useMemo(() => {
    const effectiveUseNew = isAdmin ? useNewData : false;
    const allowedSources = new Set<string>([
      ...(effectiveUseNew ? ['vnet_direct'] : ['legacy_all', 'legacy_user']),
    ]);

    // Base after sources
    let base = matters.filter(m => allowedSources.has(m.dataSource));

    // Apply status filter
    if (activeFilter === 'Matter Requests') {
      base = base.filter(m => (m.originalStatus || '').toLowerCase() === 'matterrequest');
    } else if (activeFilter !== 'All') {
      base = filterMattersByStatus(base, activeFilter.toLowerCase() as any);
    }

    // Apply area filter
    base = filterMattersByArea(base, activeAreaFilter);

    // Apply role filter
    if (activeRoleFilter !== 'All') {
      const allowedRoles = activeRoleFilter === 'Responsible' ? ['responsible'] :
                          activeRoleFilter === 'Originating' ? ['originating'] :
                          ['responsible', 'originating'];
      base = filterMattersByRole(base, allowedRoles as any);
    }

    // Apply search
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      base = base.filter((m) =>
        m.clientName?.toLowerCase().includes(term) ||
        m.displayNumber?.toLowerCase().includes(term) ||
        m.description?.toLowerCase().includes(term) ||
        m.practiceArea?.toLowerCase().includes(term)
      );
    }

    // Counts per scope
    const mineList = (() => {
      let arr = applyAdminFilter(base, false, userFullName || '', userRole || '');
      if (effectiveUseNew) {
        arr = arr.filter(m => m.role === 'responsible' || m.role === 'both');
      }
      return arr;
    })();

    const allList = applyAdminFilter(base, true, userFullName || '', userRole || '');

    return {
      mine: mineList.length,
      all: allList.length,
    };
  }, [
    matters,
    useNewData,
    isAdmin,
    activeFilter,
    activeAreaFilter,
    activeRoleFilter,
    searchTerm,
    userFullName,
    userRole,
  ]);

  // Get unique practice areas for filtering
  const availableAreas = useMemo(() => {
    return getUniquePracticeAreas(matters);
  }, [matters]);

  // No auto-toggle for admins; let Luke/Alex choose when to see everyone's matters.

  // Set up navigation content with filter bar
  useEffect(() => {
    if (!selected) {
      console.log('🔄 Setting new FilterBanner content for Matters');
      setContent(
        <FilterBanner
          seamless
          dense
          collapsibleSearch
          primaryFilter={{
            value: activeFilter === 'All' ? 'Active' : activeFilter,
            onChange: setActiveFilter,
            options: ['Active', 'Closed'].map(o => ({ key: o, label: o })),
            ariaLabel: "Filter matters by status"
          }}
          secondaryFilter={{
            value: activeRoleFilter === 'All' ? 'Responsible' : activeRoleFilter,
            onChange: setActiveRoleFilter,
            options: ['Responsible','Originating'].map(o => ({ key: o, label: o })),
            ariaLabel: "Filter matters by role"
          }}
          search={{
            value: searchTerm,
            onChange: setSearchTerm,
            placeholder: "Search…"
          }}
        >
          {/* Area dropdown - scalable for many areas */}
          {availableAreas.length > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 500, color: isDarkMode ? colours.dark.text : colours.light.text }}>Area:</span>
              <select
                value={activeAreaFilter}
                onChange={(e) => setActiveAreaFilter(e.target.value)}
                style={{
                  padding: '4px 10px',
                  borderRadius: 10,
                  border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                  background: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
                  color: isDarkMode ? colours.dark.text : colours.light.text,
                  fontSize: 12,
                  fontFamily: 'Raleway, sans-serif',
                  minWidth: '120px'
                }}
              >
                <option value="All">All Areas</option>
                {availableAreas.map((area) => (
                  <option key={area} value={area}>{area}</option>
                ))}
              </select>
            </div>
          )}

          {/* Secondary controls row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {/* Scope filter */}
            <SegmentedControl
              id="matters-scope-seg"
              ariaLabel="Scope mine or all"
              value={scope}
              onChange={(k) => setScope(k as 'mine' | 'all')}
              options={[
                { key: 'mine', label: 'Mine', badge: scopeCounts.mine },
                { key: 'all', label: 'All', badge: scopeCounts.all, disabled: !isAdmin }
              ]}
            />

            {/* Layout toggle with icons */}
            <div 
              role="group" 
              aria-label="Layout: choose 1 or 2 columns"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                height: 28,
                padding: '2px 4px',
                background: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                borderRadius: 14,
                fontFamily: 'Raleway, sans-serif',
              }}
            >
              <button
                type="button"
                title="Single column layout"
                aria-label="Single column layout"
                aria-pressed={!twoColumn}
                onClick={() => setTwoColumn(false)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 22,
                  height: 22,
                  background: !twoColumn ? '#FFFFFF' : 'transparent',
                  border: 'none',
                  borderRadius: 11,
                  cursor: 'pointer',
                  transition: 'all 200ms ease',
                  opacity: !twoColumn ? 1 : 0.6,
                  boxShadow: !twoColumn 
                    ? (isDarkMode
                        ? '0 1px 3px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.24)'
                        : '0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.08)')
                    : 'none',
                }}
              >
                <Icon
                  iconName="SingleColumn"
                  style={{
                    fontSize: 10,
                    color: !twoColumn 
                      ? (isDarkMode ? '#1f2937' : '#1f2937')
                      : (isDarkMode ? 'rgba(255,255,255,0.70)' : 'rgba(0,0,0,0.55)'),
                  }}
                />
              </button>
              <button
                type="button"
                title="Two column layout"
                aria-label="Two column layout"
                aria-pressed={twoColumn}
                onClick={() => setTwoColumn(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 22,
                  height: 22,
                  background: twoColumn ? '#FFFFFF' : 'transparent',
                  border: 'none',
                  borderRadius: 11,
                  cursor: 'pointer',
                  transition: 'all 200ms ease',
                  opacity: twoColumn ? 1 : 0.6,
                  boxShadow: twoColumn 
                    ? (isDarkMode
                        ? '0 1px 3px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.24)'
                        : '0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.08)')
                    : 'none',
                }}
              >
                <Icon
                  iconName="DoubleColumn"
                  style={{
                    fontSize: 10,
                    color: twoColumn 
                      ? (isDarkMode ? '#1f2937' : '#1f2937')
                      : (isDarkMode ? 'rgba(255,255,255,0.70)' : 'rgba(0,0,0,0.55)'),
                  }}
                />
              </button>
            </div>

            {/* Admin data toggle */}
            {(isAdmin || isLocalhost) && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '4px 10px',
                  height: 28,
                  borderRadius: 14,
                  background: isDarkMode ? 'rgba(255,193,7,0.15)' : 'rgba(255,193,7,0.12)',
                  border: `1px solid ${isDarkMode ? 'rgba(255,193,7,0.3)' : 'rgba(255,193,7,0.25)'}`,
                  fontSize: 10,
                  fontWeight: 600,
                  color: isDarkMode ? '#ffd54f' : '#f57c00'
                }}
                title="Admin controls (alex, luke, cass only)"
              >
                <span style={{ fontSize: 10, whiteSpace: 'nowrap' }}>{filtered.length}/{datasetCount}</span>
                <div style={{ width: 1, height: 14, background: 'currentColor', opacity: 0.3 }} />
                <ToggleSwitch
                  id="matters-new-data-toggle"
                  checked={useNewData}
                  onChange={(v) => setUseNewData(v)}
                  size="sm"
                  onText="New"
                  offText="Legacy"
                  ariaLabel="Toggle dataset between legacy and new"
                />
              </div>
            )}
          </div>
        </FilterBanner>
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
  }, [
    setContent,
    selected,
    isDarkMode,
    activeFilter,
    activeAreaFilter,
    availableAreas,
    searchTerm,
  scope,
  useNewData,
    activeRoleFilter,
    filtered.length,
    datasetCount,
    isAdmin,
    isLocalhost,
    twoColumn,
  ]);

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
          <ThemedSpinner label="Loading matters..." size={SpinnerSize.medium} />
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
          {/* Table-style matter list */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0px',
              padding: 0,
              margin: 0,
              backgroundColor: 'transparent',
              width: '100%',
            }}
          >
            {filtered.map((matter, idx) => (
              <div
                key={matter.matterId || idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '16px 20px',
                  borderBottom: idx === filtered.length - 1 ? 'none' : `1px solid ${isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}`,
                  backgroundColor: 'transparent',
                  transition: 'background-color 0.2s ease',
                  cursor: 'pointer',
                  gap: '20px',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
                onClick={() => setSelected(matter)}
              >
                {/* Client & Matter Info */}
                <div style={{ flex: '1 1 280px', minWidth: 0 }}>
                  <div>
                    <span 
                      style={{ 
                        fontSize: '14px',
                        fontWeight: '600',
                        color: isDarkMode ? colours.dark.text : colours.light.text,
                        display: 'block',
                        marginBottom: '4px',
                        fontFamily: 'Raleway, sans-serif',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={matter.clientName || 'Unknown Client'}
                    >
                      {matter.clientName || 'Unknown Client'}
                    </span>
                  </div>
                  <div style={{ 
                    fontSize: '12px',
                    fontWeight: '500',
                    color: isDarkMode ? colours.dark.subText : colours.light.subText,
                    marginBottom: '4px',
                    fontFamily: 'Raleway, sans-serif',
                  }}>
                    {matter.displayNumber || matter.matterId}
                  </div>
                  <div>
                    <span 
                      style={{ 
                        fontSize: '13px',
                        color: isDarkMode ? colours.dark.subText : colours.light.subText,
                        display: 'block',
                        fontFamily: 'Raleway, sans-serif',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={matter.description || 'No description'}
                    >
                      {matter.description || 'No description'}
                    </span>
                  </div>
                </div>

                {/* Practice Area & Status */}
                <div style={{ flex: '1 1 180px', minWidth: 0 }}>
                  <div style={{ 
                    fontSize: '13px',
                    fontWeight: '500',
                    color: isDarkMode ? colours.dark.text : colours.light.text,
                    marginBottom: '2px',
                    fontFamily: 'Raleway, sans-serif',
                  }}>
                    {matter.practiceArea || 'No Area'}
                  </div>
                  <div style={{ 
                    fontSize: '12px',
                    color: matter.status?.toLowerCase() === 'active' 
                      ? (isDarkMode ? '#86efac' : '#22c55e')
                      : (isDarkMode ? colours.dark.subText : colours.light.subText),
                    fontWeight: '500',
                    marginTop: '2px',
                    textTransform: 'lowercase',
                    fontFamily: 'Raleway, sans-serif',
                  }}>
                    {matter.status?.toLowerCase() || 'unknown'}
                  </div>
                </div>

                {/* Responsible Solicitor */}
                <div style={{ flex: '1 1 140px', minWidth: 0 }}>
                  <div style={{ 
                    fontSize: '13px',
                    fontWeight: '500',
                    color: isDarkMode ? colours.dark.text : colours.light.text,
                    fontFamily: 'Raleway, sans-serif',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {matter.responsibleSolicitor || 'Unassigned'}
                  </div>
                </div>

                {/* Date & ID */}
                <div style={{ flex: '0 0 120px', textAlign: 'right' }}>
                  <div style={{ 
                    fontSize: '12px',
                    color: isDarkMode ? colours.dark.subText : colours.light.subText,
                    marginBottom: '4px',
                    fontFamily: 'Raleway, sans-serif',
                  }}>
                    {matter.openDate ? new Date(matter.openDate).toLocaleDateString('en-GB', {
                      day: '2-digit',
                      month: 'short', 
                      year: 'numeric'
                    }) : 'No date'}
                  </div>
                  <span style={{ 
                    fontSize: '11px',
                    color: isDarkMode ? 'rgba(148,163,184,0.6)' : 'rgba(100,116,139,0.6)',
                    fontFamily: 'Raleway, sans-serif',
                  }}>
                    ID: {matter.matterId || 'Unknown'}
                  </span>
                </div>

                {/* View Button */}
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '6px', 
                  flexShrink: 0, 
                  marginRight: '16px' 
                }}>
                  <button
                    style={{
                      padding: '6px 12px',
                      backgroundColor: isDarkMode ? 'rgba(54, 144, 206, 0.2)' : 'rgba(54, 144, 206, 0.1)',
                      border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.3)' : 'rgba(54, 144, 206, 0.2)'}`,
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: '500',
                      color: isDarkMode ? '#87ceeb' : '#0369a1',
                      cursor: 'pointer',
                      fontFamily: 'Raleway, sans-serif',
                      transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = isDarkMode ? 'rgba(54, 144, 206, 0.3)' : 'rgba(54, 144, 206, 0.15)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = isDarkMode ? 'rgba(54, 144, 206, 0.2)' : 'rgba(54, 144, 206, 0.1)';
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelected(matter);
                    }}
                  >
                    View
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Stack>
      </section>
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