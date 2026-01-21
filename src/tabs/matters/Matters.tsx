import React, { useMemo, useState, useEffect } from 'react';
import { Text, SpinnerSize, MessageBar, MessageBarType, IconButton, mergeStyles, Icon } from '@fluentui/react';
import ThemedSpinner from '../../components/ThemedSpinner';
import SegmentedControl from '../../components/filter/SegmentedControl';
import FilterBanner from '../../components/filter/FilterBanner';
import EmptyState from '../../components/states/EmptyState';
import { NormalizedMatter, UserData } from '../../app/functionality/types';
import {
  filterMattersByStatus,
  filterMattersByArea,
  filterMattersByRole,
  applyAdminFilter,
  getUniquePracticeAreas
} from '../../utils/matterNormalization';
import { isAdminUser } from '../../app/admin';
import MatterOverview from './MatterOverview';
import MatterTableView from './MatterTableView';
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

  const userRec = userData?.[0] || {};
  const userRecAny = userRec as unknown as Record<string, unknown>;
  const userFullName = String(
    userRec.FullName ||
    userRecAny['Full Name'] ||
    [userRec.First, userRec.Last].filter(Boolean).join(' ') ||
    userRec.Email ||
    ''
  ).toLowerCase();
  const userRoleRaw = (userRec.Role || userRecAny.role || '').toString().toLowerCase();
  const isAdmin = isAdminUser(userRec || null);
  const userRole = isAdmin ? 'admin' : userRoleRaw;
  const isLocalhost = (typeof window !== 'undefined') && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');


  // Apply all filters in sequence
  const filtered = useMemo(() => {
    let result = matters;

    // Decide dataset and scope to construct allowed sources
    const allowedSources = new Set<string>(['legacy_all', 'legacy_user', 'vnet_direct']);
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

    // Apply role filter (skip when admin is viewing All scope)
    const shouldApplyRoleFilter = !(isAdmin && scope === 'all');
    if (activeRoleFilter !== 'All' && shouldApplyRoleFilter) {
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
    isAdmin,
  ]);

  // Dataset count (post-source selection only, before other filters)
  const datasetCount = useMemo(() => {
    const allowedSources = new Set<string>(['legacy_all', 'legacy_user', 'vnet_direct']);
    return matters.filter(m => allowedSources.has(m.dataSource)).length;
  }, [matters]);

  // Pre-compute scope counts for a compact scope control with badges
  const scopeCounts = useMemo(() => {
    const allowedSources = new Set<string>(['legacy_all', 'legacy_user', 'vnet_direct']);

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

    // Apply role filter to Mine count only (All count should reflect all matters for admins)
    const baseAll = base;
    let baseMine = baseAll;
    if (activeRoleFilter !== 'All') {
      const allowedRoles = activeRoleFilter === 'Responsible' ? ['responsible'] :
                          activeRoleFilter === 'Originating' ? ['originating'] :
                          ['responsible', 'originating'];
      baseMine = filterMattersByRole(baseAll, allowedRoles as any);
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
    const mineList = applyAdminFilter(baseMine, false, userFullName || '', userRole || '');

    const allList = applyAdminFilter(baseAll, true, userFullName || '', userRole || '');

    return {
      mine: mineList.length,
      all: allList.length,
    };
  }, [
    matters,
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
      const StatusFilter = () => {
        const height = 32;
        const isOpen = activeFilter === 'Active' || activeFilter === 'All';
        const isArchived = activeFilter === 'Closed';

        const iconOpen = (
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
            <path d="M5 8.5L7.5 11L11.5 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        );

        const iconArchived = (
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
            <path d="M3 5h10v7H3z" stroke="currentColor" strokeWidth="1.5" fill="none" />
            <path d="M2.5 3h11v2H2.5z" stroke="currentColor" strokeWidth="1.5" fill="none" />
          </svg>
        );

        return (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 0,
              background: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
              borderRadius: height / 2,
              padding: 4,
              height,
              fontFamily: 'Raleway, sans-serif',
              userSelect: 'none',
              overflow: 'hidden',
            }}
          >
            <button
              type="button"
              aria-pressed={isOpen}
              onClick={() => setActiveFilter('Active')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 5,
                background: isOpen ? (isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.9)') : 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '0 12px',
                height: height - 8,
                fontSize: 12,
                fontWeight: 500,
                color: isOpen ? (isDarkMode ? 'rgba(255,255,255,0.95)' : '#1f2937') : (isDarkMode ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.55)'),
                transition: 'color 200ms ease',
                whiteSpace: 'nowrap',
                outline: 'none',
                borderRadius: (height - 8) / 2,
                boxShadow: isOpen ? (isDarkMode ? '0 1px 2px rgba(0,0,0,0.2)' : '0 1px 2px rgba(0,0,0,0.06)') : 'none',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', color: 'inherit' }}>{iconOpen}</span>
              <span>Open</span>
            </button>
            <button
              type="button"
              aria-pressed={isArchived}
              onClick={() => setActiveFilter('Closed')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 5,
                background: isArchived ? (isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.9)') : 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '0 12px',
                height: height - 8,
                fontSize: 12,
                fontWeight: 500,
                color: isArchived ? (isDarkMode ? 'rgba(255,255,255,0.95)' : '#1f2937') : (isDarkMode ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.55)'),
                transition: 'color 200ms ease',
                whiteSpace: 'nowrap',
                outline: 'none',
                borderRadius: (height - 8) / 2,
                boxShadow: isArchived ? (isDarkMode ? '0 1px 2px rgba(0,0,0,0.2)' : '0 1px 2px rgba(0,0,0,0.06)') : 'none',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', color: 'inherit' }}>{iconArchived}</span>
              <span>Archived</span>
            </button>
          </div>
        );
      };

      const RoleFilter = () => {
        const height = 32;
        const isResponsible = activeRoleFilter === 'Responsible' || activeRoleFilter === 'All';
        const isOriginating = activeRoleFilter === 'Originating';

        const iconResponsible = (
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.5" />
            <path d="M3 14c1.5-3 8.5-3 10 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        );

        const iconOriginating = (
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
            <path d="M8 2v7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M5 6l3-3 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M3 14h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        );

        return (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 0,
              background: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
              borderRadius: height / 2,
              padding: 4,
              height,
              fontFamily: 'Raleway, sans-serif',
              userSelect: 'none',
              overflow: 'hidden',
            }}
          >
            <button
              type="button"
              aria-pressed={isResponsible}
              onClick={() => setActiveRoleFilter('Responsible')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 5,
                background: isResponsible ? (isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.9)') : 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '0 12px',
                height: height - 8,
                fontSize: 12,
                fontWeight: 500,
                color: isResponsible ? (isDarkMode ? 'rgba(255,255,255,0.95)' : '#1f2937') : (isDarkMode ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.55)'),
                transition: 'color 200ms ease',
                whiteSpace: 'nowrap',
                outline: 'none',
                borderRadius: (height - 8) / 2,
                boxShadow: isResponsible ? (isDarkMode ? '0 1px 2px rgba(0,0,0,0.2)' : '0 1px 2px rgba(0,0,0,0.06)') : 'none',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', color: 'inherit' }}>{iconResponsible}</span>
              <span>Responsible</span>
            </button>
            <button
              type="button"
              aria-pressed={isOriginating}
              onClick={() => setActiveRoleFilter('Originating')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 5,
                background: isOriginating ? (isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.9)') : 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '0 12px',
                height: height - 8,
                fontSize: 12,
                fontWeight: 500,
                color: isOriginating ? (isDarkMode ? 'rgba(255,255,255,0.95)' : '#1f2937') : (isDarkMode ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.55)'),
                transition: 'color 200ms ease',
                whiteSpace: 'nowrap',
                outline: 'none',
                borderRadius: (height - 8) / 2,
                boxShadow: isOriginating ? (isDarkMode ? '0 1px 2px rgba(0,0,0,0.2)' : '0 1px 2px rgba(0,0,0,0.06)') : 'none',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', color: 'inherit' }}>{iconOriginating}</span>
              <span>Originating</span>
            </button>
          </div>
        );
      };

      setContent(
        <FilterBanner
          seamless
          dense
          collapsibleSearch
          primaryFilter={(
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
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
              <StatusFilter />
            </div>
          )}
          secondaryFilter={(
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <RoleFilter />
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
                      minWidth: activeAreaFilter === 'All' ? '88px' : '120px'
                    }}
                  >
                    <option value="All">All Areas</option>
                    {availableAreas.map((area) => (
                      <option key={area} value={area}>{area}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}
          search={{
            value: searchTerm,
            onChange: setSearchTerm,
            placeholder: "Search…"
          }}
          middleActions={(isAdmin || isLocalhost) && (
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '4px 10px',
                  height: 28,
                  borderRadius: 14,
                  background: 'transparent',
                  border: `1px solid ${isDarkMode ? 'rgba(255,183,77,0.35)' : 'rgba(255,152,0,0.3)'}`,
                  fontSize: 10,
                  fontWeight: 600,
                  color: isDarkMode ? '#FFB74D' : '#E65100'
                }}
                title="Admin only"
                aria-label="Admin only"
              >
                <Icon iconName="Shield" style={{ fontSize: 10, opacity: 0.7 }} />
                <span style={{ fontSize: 10, whiteSpace: 'nowrap' }}>{filtered.length}/{datasetCount}</span>
              </div>
            </div>
          )}
        >
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
    activeRoleFilter,
    filtered.length,
    datasetCount,
    isAdmin,
    isLocalhost,
  ]);

  if (selected) {
    return <MatterOverview matter={selected} />;
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
    const hasFilters = Boolean(
      searchTerm.trim() ||
      activeFilter !== 'Active' ||
      activeAreaFilter !== 'All' ||
      activeRoleFilter !== 'Responsible' ||
      (isAdmin && scope === 'all')
    );

    return (
      <div className={containerStyle(isDarkMode)}>
        <EmptyState
          title={hasFilters ? 'No matching matters' : 'No matters found'}
          description={
            hasFilters
              ? 'No matters match your current filters. Try adjusting or clearing your filters to see more results.'
              : 'Try adjusting your search criteria or filters.'
          }
          illustration={hasFilters ? 'filter' : 'search'}
          size="md"
          action={
            hasFilters
              ? {
                  label: 'Clear All Filters',
                  onClick: () => {
                    setSearchTerm('');
                    setActiveFilter('Active');
                    setActiveAreaFilter('All');
                    setActiveRoleFilter('Responsible');
                    if (isAdmin) {
                      setScope('mine');
                    }
                  },
                  variant: 'primary'
                }
              : undefined
          }
        />
      </div>
    );
  }

  return (
    <div className={containerStyle(isDarkMode)}>
      <MatterTableView
        matters={filtered}
        isDarkMode={isDarkMode}
        onRowClick={(matter) => setSelected(matter)}
        loading={isLoading}
      />
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