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
  const [activeRoleFilter, setActiveRoleFilter] = useState<string>('All');
  const [showDataInspector, setShowDataInspector] = useState<boolean>(false);
  // Scope & dataset selection
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const [useNewData, setUseNewData] = useState<boolean>(false); // Admin-only toggle to view VNet (new) data

  // Local debug state
  type DebugResult = {
    status: number;
    durationMs: number;
    payload: unknown;
    expanded: boolean;
  };
  const isLocalhost = (typeof window !== 'undefined') && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  const [debugLoading, setDebugLoading] = useState<boolean>(false);
  const [debugError, setDebugError] = useState<string | null>(null);
  const [allMattersResult, setAllMattersResult] = useState<DebugResult | null>(null);
  const [userMattersResult, setUserMattersResult] = useState<DebugResult | null>(null);

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

    // Decide dataset and scope to construct allowed sources
    const effectiveUseNew = isAdmin ? useNewData : false;
    const allowedSources = new Set<string>([
      ...(effectiveUseNew ? ['vnet_direct'] : ['legacy_all']),
    ]);
    if (allowedSources.size > 0) {
      result = result.filter((m) => allowedSources.has(m.dataSource));
      console.log('🔍 After source filter:', result.length, 'sources:', Array.from(allowedSources));
  console.log('🔍 Sample after source filter:', result.slice(0,3).map(m => ({id: m.matterId, ds: m.dataSource, originalStatus: m.originalStatus, status: m.status, role: m.role})));
    } else {
      // If no sources selected, show nothing
      result = [];
      console.log('🔍 After source filter: 0 (no sources selected)');
    }

    // Apply admin filter next
  // - If scope is 'all' and user is admin => show everyone
  // - Otherwise => show only user's matters
  const effectiveShowEveryone = scope === 'all' && isAdmin;
  result = applyAdminFilter(result, effectiveShowEveryone, userFullName || '', userRole || '');
  console.log('🔍 After admin filter:', result.length, 'showEveryone:', effectiveShowEveryone);

    // For New data + Mine, restrict to Responsible solicitor only
    if (effectiveUseNew && scope === 'mine') {
      const before = result.length;
      result = result.filter(m => m.role === 'responsible' || m.role === 'both');
      console.log('🔍 New+Mine responsible-only filter:', { before, after: result.length });
    }

    // Apply status filter
    // Admin-only extra option: 'Matter Requests' filters by originalStatus === 'MatterRequest'
    if (activeFilter === 'Matter Requests') {
      const before = result.length;
      result = result.filter(m => (m.originalStatus || '').toLowerCase() === 'matterrequest');
      console.log('🔍 Matter Requests filter applied:', { before, after: result.length });
    } else if (activeFilter !== 'All') {
      result = filterMattersByStatus(result, activeFilter.toLowerCase() as any);
      console.log('🔍 After status filter:', result.length, 'activeFilter:', activeFilter);
    } else {
      console.log('🔍 Status filter skipped (All selected):', result.length);
    }

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
  ]);

  // Dataset count (post-source selection only, before other filters)
  const datasetCount = useMemo(() => {
    const effectiveUseNew = isAdmin ? useNewData : false;
    const allowedSources = new Set<string>([
      ...(effectiveUseNew ? ['vnet_direct'] : ['legacy_all']),
    ]);
    return matters.filter(m => allowedSources.has(m.dataSource)).length;
  }, [matters, useNewData, isAdmin]);

  // Get unique practice areas for filtering
  const availableAreas = useMemo(() => {
    return getUniquePracticeAreas(matters);
  }, [matters]);

  // No auto-toggle for admins; let Luke/Alex choose when to see everyone's matters.

  // Set up navigation content with filter bar
  useEffect(() => {
    if (!selected) {
  const filterOptions = isAdmin ? ['All', 'Active', 'Closed', 'Matter Requests'] : ['All', 'Active', 'Closed'];
      
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

          {/* Scope: Mine | All (All only for admins) */}
          <div style={{ width: '1px', height: '20px', background: isDarkMode ? colours.dark.border : colours.light.border }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: isDarkMode ? colours.dark.text : colours.light.text }}>Scope:</span>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 11 }}>
              <input
                type="radio"
                name="scope"
                checked={scope === 'mine'}
                onChange={() => setScope('mine')}
              />
              Mine
            </label>
            {isAdmin && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 11 }}>
                <input
                  type="radio"
                  name="scope"
                  checked={scope === 'all'}
                  onChange={() => setScope('all')}
                />
                All
              </label>
            )}
            <span style={{ fontSize: 11, color: isDarkMode ? colours.dark.subText : colours.light.subText }}>
              Showing {filtered.length} of {datasetCount}
            </span>
          </div>

          {/* Admin-only dataset switch: Legacy vs New (VNet) */}
          {isAdmin && (
            <>
              <div style={{ width: '1px', height: '20px', background: isDarkMode ? colours.dark.border : colours.light.border }} />
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 11 }}>
                <input type="checkbox" checked={useNewData} onChange={(e) => setUseNewData(e.target.checked)} />
                New data
              </label>
            </>
          )}
          
          {/* Area dropdown - scalable for many areas */}
          {availableAreas.length > 1 && (
            <>
              <div style={{ width: '1px', height: '20px', background: isDarkMode ? colours.dark.border : colours.light.border }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: 500, color: isDarkMode ? colours.dark.text : colours.light.text }}>Area:</span>
                <select
                  value={activeAreaFilter}
                  onChange={(e) => setActiveAreaFilter(e.target.value)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '12px',
                    border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                    background: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
                    color: isDarkMode ? colours.dark.text : colours.light.text,
                    fontSize: '12px',
                    fontFamily: 'Raleway, sans-serif',
                    minWidth: '200px'
                  }}
                >
                  <option value="All">All Areas</option>
                  {availableAreas.map((area) => (
                    <option key={area} value={area}>{area}</option>
                  ))}
                </select>
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
  ]);

  // ----- Local debug: fetch API payloads when inspector opens -----
  const safeParse = async (resp: Response): Promise<unknown> => {
    const text = await resp.text();
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  };

  const fetchDebugData = async (): Promise<void> => {
    if (!isLocalhost) return;
    setDebugError(null);
    setDebugLoading(true);
    try {
      // getAllMatters
      const t0 = performance.now();
      const respAll = await fetch('/api/getAllMatters');
      const payloadAll = await safeParse(respAll);
      setAllMattersResult({
        status: respAll.status,
        durationMs: Math.round(performance.now() - t0),
        payload: payloadAll,
        expanded: false,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to fetch /api/getAllMatters';
      setDebugError(msg);
    }

    try {
      // getMatters for current user
      const name = encodeURIComponent(userFullName || '');
      const t1 = performance.now();
      const respUser = await fetch(`/api/getMatters?fullName=${name}`);
      const payloadUser = await safeParse(respUser);
      setUserMattersResult({
        status: respUser.status,
        durationMs: Math.round(performance.now() - t1),
        payload: payloadUser,
        expanded: false,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to fetch /api/getMatters';
      setDebugError(prev => prev ?? msg);
    } finally {
      setDebugLoading(false);
    }
  };

  useEffect(() => {
    if (showDataInspector && isLocalhost) {
      void fetchDebugData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDataInspector, userFullName]);

  const DebugPanel: React.FC = () => {
    const summarize = (payload: unknown): { count: number | null; preview: unknown } => {
      if (Array.isArray(payload)) {
        return { count: payload.length, preview: payload.slice(0, 3) };
      }
      if (payload && typeof payload === 'object' && Array.isArray((payload as { data?: unknown[] }).data)) {
        const arr = (payload as { data: unknown[] }).data;
        return { count: arr.length, preview: arr.slice(0, 3) };
      }
      return { count: null, preview: payload };
    };

    const renderSection = (title: string, result: DebugResult | null, onToggle: () => void) => {
      return (
        <div style={{ background: '#fff', padding: 12, borderRadius: 8, border: '1px solid #ddd', marginBottom: 12 }}>
          <h5 style={{ margin: '0 0 8px 0' }}>{title}</h5>
          {!result ? (
            <Text>Not loaded</Text>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <Text>Status: {result.status}</Text>
                <Text>Time: {result.durationMs} ms</Text>
                <Text>
                  Count: {summarize(result.payload).count ?? 'n/a'}
                </Text>
              </div>
              <pre style={{ background: '#f7f7f7', padding: 8, borderRadius: 6, maxHeight: 240, overflow: 'auto', marginTop: 8 }}>
                {JSON.stringify(summarize(result.payload).preview, null, 2)}
              </pre>
              <button onClick={onToggle} style={{ marginTop: 6 }}>
                {result.expanded ? 'Hide full JSON' : 'Show full JSON'}
              </button>
              {result.expanded && (
                <pre style={{ background: '#eef6ff', padding: 8, borderRadius: 6, maxHeight: 360, overflow: 'auto', marginTop: 8 }}>
                  {JSON.stringify(result.payload, null, 2)}
                </pre>
              )}
            </>
          )}
        </div>
      );
    };

    return (
      <div style={{ padding: 16, background: '#f0f4f8', border: '1px solid #cfe0f5', borderRadius: 8, margin: '10px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h4 style={{ margin: 0 }}>Debug API (Local Only)</h4>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => void fetchDebugData()} disabled={debugLoading}>Refresh</button>
            <button onClick={() => setShowDataInspector(false)}>Close</button>
          </div>
        </div>
        <div style={{ marginTop: 8, marginBottom: 8, color: '#555' }}>
          <Text>
            You are {isAdmin ? '' : 'not '}an admin. Showing results for user: {userFullName || 'unknown'}
          </Text>
        </div>
        {debugError && (
          <MessageBar messageBarType={MessageBarType.error}>{debugError}</MessageBar>
        )}
        {debugLoading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Spinner size={SpinnerSize.small} />
            <Text>Loading debug data…</Text>
          </div>
        )}
        {renderSection('GET /api/getAllMatters', allMattersResult, () => {
          setAllMattersResult(prev => (prev ? { ...prev, expanded: !prev.expanded } : prev));
        })}
        {renderSection(`GET /api/getMatters?fullName=${userFullName || ''}`, userMattersResult, () => {
          setUserMattersResult(prev => (prev ? { ...prev, expanded: !prev.expanded } : prev));
        })}
      </div>
    );
  };

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
        {showDataInspector && isLocalhost && (
          <DebugPanel />
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
  {showDataInspector && isLocalhost && <DebugPanel />}
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