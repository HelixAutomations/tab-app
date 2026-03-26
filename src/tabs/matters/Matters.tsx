import React, { useMemo, useState, useEffect, useDeferredValue, useRef } from 'react';
import { SpinnerSize } from '@fluentui/react/lib/Spinner';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { ActionButton } from '@fluentui/react/lib/Button';
import { Icon } from '@fluentui/react/lib/Icon';
import { mergeStyles } from '@fluentui/react/lib/Styling';
import NavigatorDetailBar from '../../components/NavigatorDetailBar';
import ThemedSpinner from '../../components/ThemedSpinner';
import SegmentedControl from '../../components/filter/SegmentedControl';
import FilterBanner from '../../components/filter/FilterBanner';
import EmptyState from '../../components/states/EmptyState';
import { Enquiry, NormalizedMatter, TeamData, UserData } from '../../app/functionality/types';
import {
  filterMattersByStatus,
  filterMattersByArea,
  filterMattersByRole,
  applyAdminFilter,
  getUniquePracticeAreas
} from '../../utils/matterNormalization';
import { isAdminUser, isCclUser } from '../../app/admin';
import MatterOverview from './MatterOverview';
import MatterTableView from './MatterTableView';
import { colours } from '../../app/styles/colours';
import { useTheme } from '../../app/functionality/ThemeContext';
import { useNavigatorActions } from '../../app/functionality/NavigatorContext';
import { useToast } from '../../components/feedback/ToastProvider';
// Debugger removed: MatterApiDebugger was deleted

type MatterSourceFilter = 'new' | 'all' | 'legacy';

function getAllowedMatterSources(filter: MatterSourceFilter): Set<string> {
  if (filter === 'new') {
    return new Set(['vnet_direct']);
  }

  if (filter === 'all') {
    return new Set(['legacy_all', 'legacy_user', 'vnet_direct']);
  }

  return new Set(['legacy_all', 'legacy_user']);
}

function getNextMatterSourceFilter(filter: MatterSourceFilter): MatterSourceFilter {
  if (filter === 'new') {
    return 'all';
  }

  if (filter === 'all') {
    return 'legacy';
  }

  return 'new';
}

// Synthetic demo matter — shared between list injection and pending-matter auto-select
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const DEMO_MATTER_CLIO_ID = '3311402'; // Real Clio matter ID for upload demo

const DEMO_MATTER: NormalizedMatter = {
  matterId: 'DEMO-3311402',
  matterName: 'Helix administration \u2014 Admin',
  displayNumber: 'HELIX01-01',
  instructionRef: 'HELIX01-01',
  openDate: new Date().toISOString().split('T')[0],
  closeDate: null,
  status: 'active',
  originalStatus: 'Active',
  clientId: '5257922',
  clientName: 'Helix administration',
  clientPhone: '0345 314 2044',
  clientEmail: 'info@helix-law.com',
  description: 'Admin',
  practiceArea: 'Commercial',
  source: 'Demo',
  responsibleSolicitor: 'Luke',
  originatingSolicitor: 'Luke',
  supervisingPartner: 'Luke',
  opponent: '',
  role: 'responsible',
  dataSource: 'vnet_direct',
};

interface MattersProps {
  matters: NormalizedMatter[];
  isLoading: boolean;
  error: string | null;
  userData: UserData[] | null;
  isActive?: boolean;
  teamData?: TeamData[] | null;
  enquiries?: Enquiry[] | null;
  workbenchByInstructionRef?: Map<string, any> | null;
  pendingMatterId?: string | null;
  pendingShowCcl?: boolean;
  onPendingMatterHandled?: () => void;
  demoModeEnabled?: boolean;
}

type MatterDetailTabKey = 'overview' | 'activities' | 'documents' | 'communications' | 'billing';

type MatterCclStatusSummary = {
  stage: string;
  label: string;
};

function getCanonicalCclLabel(stage: string): string {
  switch (stage.toLowerCase()) {
    case 'generated':
      return 'Generated';
    case 'reviewed':
      return 'Reviewed';
    case 'sent':
      return 'Sent';
    default:
      return 'Pending';
  }
}

const Matters: React.FC<MattersProps> = ({ matters, isLoading, error, userData, isActive = true, teamData, enquiries, workbenchByInstructionRef, pendingMatterId, pendingShowCcl = false, onPendingMatterHandled, demoModeEnabled = false }) => {
  const { isDarkMode } = useTheme();
  const { setContent } = useNavigatorActions();
  const { showToast, updateToast, hideToast } = useToast();
  const [selected, setSelected] = useState<NormalizedMatter | null>(null);
  const [activeDetailTab, setActiveDetailTab] = useState<MatterDetailTabKey>('overview');
  const [isEnteringDetail, setIsEnteringDetail] = useState<boolean>(false);

  // Inject demo matter into list when demo mode is on
  const effectiveMatters = useMemo(() => {
    if (!demoModeEnabled) return matters;
    // Avoid duplicating if somehow already present
    if (matters.some(m => m.matterId === DEMO_MATTER.matterId)) return matters;
    return [DEMO_MATTER, ...matters];
  }, [matters, demoModeEnabled]);

  // Auto-open CCL when arriving from matter opening with showCcl flag
  const [autoOpenCcl, setAutoOpenCcl] = useState(false);

  // Auto-select a matter when navigated to from matter opening
  useEffect(() => {
    if (!pendingMatterId) return;
    const match = effectiveMatters.find(m => m.matterId === pendingMatterId || m.displayNumber === pendingMatterId);
    if (match) {
      setSelected(match);
      setActiveDetailTab('overview');
      setAutoOpenCcl(pendingShowCcl);
      onPendingMatterHandled?.();
    }
  }, [pendingMatterId, pendingShowCcl, effectiveMatters, onPendingMatterHandled]);
  const detailEnterTimerRef = useRef<number | null>(null);
  const [overviewData, setOverviewData] = useState<any | null>(null);
  const [outstandingData, setOutstandingData] = useState<any | null>(null);
  const [outstandingBalancesList, setOutstandingBalancesList] = useState<any[] | null>(null);
  const [wipStatus, setWipStatus] = useState<'idle' | 'loading' | 'ready' | 'pending' | 'error'>('idle');
  const [fundsStatus, setFundsStatus] = useState<'idle' | 'loading' | 'ready' | 'pending' | 'error'>('idle');
  const [outstandingStatus, setOutstandingStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [auditEnabled, setAuditEnabled] = useState(false);
  const [auditStatus, setAuditStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [auditData, setAuditData] = useState<Record<string, unknown> | null>(null);
  const [resolvedClioMatterId, setResolvedClioMatterId] = useState<number | null>(null);
  const metricsRequestRef = useRef(0);
  const auditRequestRef = useRef(0);
  const metricsToastRef = useRef<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [activeFilter, setActiveFilter] = useState<string>('Active');
  const [activeAreaFilter, setActiveAreaFilter] = useState<string>('All');
  const [areaExpanded, setAreaExpanded] = useState(false);
  const [activeRoleFilter, setActiveRoleFilter] = useState<string>('Responsible');
  // Debug inspector removed with MatterApiDebugger
  // Scope & dataset selection
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  // Default to new-space matters, with explicit access to all or legacy-only data.
  const [dataSourceFilter, setDataSourceFilter] = useState<MatterSourceFilter>('new');
  
  // Use deferred values for smoother scope/filter changes
  const deferredScope = useDeferredValue(scope);
  const deferredDataSourceFilter = useDeferredValue(dataSourceFilter);
  const deferredActiveFilter = useDeferredValue(activeFilter);
  const deferredActiveAreaFilter = useDeferredValue(activeAreaFilter);
  const deferredActiveRoleFilter = useDeferredValue(activeRoleFilter);
  const deferredSearchTerm = useDeferredValue(searchTerm);

  const userRec = userData?.[0] || {};
  const userRecAny = userRec as unknown as Record<string, unknown>;
  const userFullName = String(
    userRec.FullName ||
    userRecAny['Full Name'] ||
    [userRec.First, userRec.Last].filter(Boolean).join(' ') ||
    userRec.Email ||
    ''
  ).toLowerCase();
  const userEmail = String(userRec.Email || userRecAny.Email || userRecAny.email || '').trim();
  const userInitials = String(
    userRec.Initials || userRecAny.Initials || userRecAny['Initials'] || ''
  ).trim();
  const rawEntraId =
    userRec.EntraID ||
    userRecAny.EntraID ||
    userRecAny['Entra ID'] ||
    userRecAny.entra_id ||
    userRecAny.entraId ||
    '';
  const userEntraId = (typeof rawEntraId === 'string' ? rawEntraId : String(rawEntraId || '')).trim();
  const resolvedEntraId = useMemo(() => {
    if (userEntraId && userEntraId !== 'undefined') return userEntraId;
    const initials = userInitials.toLowerCase();
    const email = userEmail.toLowerCase();
    const fullName = userFullName.toLowerCase();
    const match = (teamData || []).find((member) => {
      const memberInitials = String(member?.['Initials'] || '').trim().toLowerCase();
      const memberEmail = String(member?.['Email'] || '').trim().toLowerCase();
      const memberName = String(member?.['Full Name'] || '').trim().toLowerCase();
      return (
        (initials && memberInitials === initials) ||
        (email && memberEmail === email) ||
        (fullName && memberName === fullName)
      );
    });
    const teamEntraId = String(match?.['Entra ID'] || '').trim();
    return teamEntraId || '';
  }, [userEntraId, userInitials, userEmail, userFullName, teamData]);
  const userRoleRaw = (userRec.Role || userRecAny.role || '').toString().toLowerCase();
  const isAdmin = isAdminUser(userRec || null);
  const userRole = isAdmin ? 'admin' : userRoleRaw;
  const showCclColumns = useMemo(() => {
    if (!isCclUser(userInitials) || typeof window === 'undefined') {
      return false;
    }

    const hostname = window.location.hostname.toLowerCase();
    const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1';
    const isNonProductionHost = ['staging', 'uat', 'dev', 'preview'].some((segment) => hostname.includes(segment));

    return isLocalHost || !isNonProductionHost;
  }, [userInitials]);
  const [cclStatusByMatterId, setCclStatusByMatterId] = useState<Map<string, MatterCclStatusSummary>>(new Map());
  const disableFutureTabs = false; // Tabs enabled — content wired in MatterOverview
  const disabledTabMessage = 'Coming soon — this area is being prepared.';


  // Apply all filters in sequence (using deferred values for smooth UI)
  const mattersWithClient = useMemo(() => {
    if (!workbenchByInstructionRef) return effectiveMatters;
    return effectiveMatters.map((matter) => {
      if (matter.clientName && matter.clientName.trim()) return matter;
      const instructionRef = matter.instructionRef;
      if (!instructionRef) return matter;
      const workbenchItem = workbenchByInstructionRef.get(instructionRef);
      if (!workbenchItem) return matter;

      const instruction = workbenchItem.instruction || workbenchItem.Instruction || null;
      const clients = Array.isArray(workbenchItem.clients) ? workbenchItem.clients : [];
      const primaryClient = clients[0] || null;

      const companyName =
        instruction?.CompanyName ||
        instruction?.companyName ||
        primaryClient?.CompanyName ||
        primaryClient?.companyName ||
        '';
      const firstName =
        instruction?.FirstName ||
        instruction?.Forename ||
        primaryClient?.FirstName ||
        primaryClient?.firstName ||
        '';
      const lastName =
        instruction?.LastName ||
        instruction?.Surname ||
        primaryClient?.LastName ||
        primaryClient?.lastName ||
        '';
      const personName = `${firstName} ${lastName}`.trim();
      const resolvedName =
        companyName ||
        personName ||
        instruction?.ClientName ||
        instruction?.client_name ||
        primaryClient?.ClientName ||
        primaryClient?.client_name ||
        matter.clientName ||
        '';

      const resolvedClientId =
        matter.clientId ||
        instruction?.ClientId ||
        instruction?.clientId ||
        primaryClient?.ClientId ||
        primaryClient?.clientId ||
        '';
      const resolvedEmail =
        matter.clientEmail ||
        instruction?.Email ||
        instruction?.ClientEmail ||
        instruction?.EmailAddress ||
        instruction?.Email_Address ||
        instruction?.client_email ||
        instruction?.email ||
        primaryClient?.Email ||
        primaryClient?.ClientEmail ||
        primaryClient?.email ||
        primaryClient?.email_address ||
        '';
      const resolvedPhone =
        matter.clientPhone ||
        instruction?.Phone ||
        instruction?.ClientPhone ||
        instruction?.Phone_Number ||
        instruction?.phone_number ||
        instruction?.phone ||
        primaryClient?.Phone ||
        primaryClient?.ClientPhone ||
        primaryClient?.phone ||
        primaryClient?.phone_number ||
        '';
      const resolvedPracticeArea =
        matter.practiceArea ||
        instruction?.PracticeArea ||
        instruction?.practice_area ||
        instruction?.AreaOfWork ||
        instruction?.Area_of_Work ||
        instruction?.area ||
        primaryClient?.PracticeArea ||
        primaryClient?.practice_area ||
        primaryClient?.AreaOfWork ||
        primaryClient?.Area_of_Work ||
        '';

      return {
        ...matter,
        clientName: resolvedName,
        clientId: resolvedClientId || matter.clientId,
        clientEmail: resolvedEmail || matter.clientEmail,
        clientPhone: resolvedPhone || matter.clientPhone,
        practiceArea: resolvedPracticeArea || matter.practiceArea,
      };
    });
  }, [effectiveMatters, workbenchByInstructionRef]);

  const fallbackCclStatusByMatterId = useMemo(() => {
    const next = new Map<string, MatterCclStatusSummary>();

    mattersWithClient.forEach((matter) => {
      if (!matter.matterId) {
        return;
      }

      const stage = matter.cclDate ? 'sent' : 'pending';
      next.set(matter.matterId, {
        stage,
        label: getCanonicalCclLabel(stage),
      });
    });

    return next;
  }, [mattersWithClient]);

  useEffect(() => {
    if (!showCclColumns) {
      setCclStatusByMatterId(new Map());
      return;
    }

    const matterIds = mattersWithClient
      .map((matter) => matter.matterId)
      .filter((matterId): matterId is string => Boolean(matterId));

    if (matterIds.length === 0) {
      setCclStatusByMatterId(new Map());
      return;
    }

    let cancelled = false;

    fetch('/api/ccl/batch-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ matterIds }),
    })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`Failed to load CCL status (${response.status})`))))
      .then((data) => {
        if (cancelled) {
          return;
        }

        const next = new Map<string, MatterCclStatusSummary>();
        const results = data?.results && typeof data.results === 'object'
          ? data.results as Record<string, Record<string, unknown>>
          : {};

        Object.entries(results).forEach(([matterId, value]) => {
          const stage = typeof value?.stage === 'string' && value.stage.trim()
            ? value.stage.trim().toLowerCase()
            : 'pending';
          const label = typeof value?.label === 'string' && value.label.trim()
            ? value.label.trim()
            : getCanonicalCclLabel(stage);

          next.set(matterId, { stage, label });
        });

        setCclStatusByMatterId(next);
      })
      .catch(() => {
        if (!cancelled) {
          setCclStatusByMatterId(new Map());
        }
      });

    return () => {
      cancelled = true;
    };
  }, [showCclColumns, mattersWithClient]);

  const effectiveCclStatusByMatterId = useMemo(() => {
    const next = new Map(fallbackCclStatusByMatterId);
    cclStatusByMatterId.forEach((value, matterId) => {
      next.set(matterId, value);
    });
    return next;
  }, [fallbackCclStatusByMatterId, cclStatusByMatterId]);

  const filtered = useMemo(() => {
    let result = mattersWithClient;

    // Decide dataset and scope to construct allowed sources
    const allowedSources = getAllowedMatterSources(deferredDataSourceFilter);
    if (allowedSources.size > 0) {
      result = result.filter((m) => m.matterId === DEMO_MATTER.matterId || m.displayNumber === DEMO_MATTER.displayNumber || allowedSources.has(m.dataSource));
    } else {
      // If no sources selected, show nothing
      result = [];
    }

    // Apply admin filter next
    // - If scope is 'all' => show everyone
    // - Otherwise => show only user's matters
    const effectiveShowEveryone = deferredScope === 'all';
    result = applyAdminFilter(result, effectiveShowEveryone, userFullName || '', userRole || '');

    // For New data + Mine, restrict to Responsible solicitor only

    // Apply status filter
    // Admin-only extra option: 'Matter Requests' filters by originalStatus === 'MatterRequest'
    if (deferredActiveFilter === 'Matter Requests') {
      result = result.filter(m => (m.originalStatus || '').toLowerCase() === 'matterrequest');
    } else if (deferredActiveFilter !== 'All') {
      result = filterMattersByStatus(result, deferredActiveFilter.toLowerCase() as any);
    } else {
    }

    // Apply area filter
    result = filterMattersByArea(result, deferredActiveAreaFilter);

    // Apply role filter (skip when viewing All scope)
    const shouldApplyRoleFilter = deferredScope !== 'all';
    if (deferredActiveRoleFilter !== 'All' && shouldApplyRoleFilter) {
      const allowedRoles = deferredActiveRoleFilter === 'Responsible' ? ['responsible'] :
                          deferredActiveRoleFilter === 'Originating' ? ['originating'] :
                          ['responsible', 'originating'];
      result = filterMattersByRole(result, allowedRoles as any);
    }

    // Apply search term filter
    if (deferredSearchTerm.trim()) {
      const term = deferredSearchTerm.toLowerCase();
      result = result.filter((m) =>
        m.clientName?.toLowerCase().includes(term) ||
        m.displayNumber?.toLowerCase().includes(term) ||
        m.description?.toLowerCase().includes(term) ||
        m.practiceArea?.toLowerCase().includes(term)
      );
    }

    return result;
  }, [
    mattersWithClient,
    userFullName,
    userRole,
    deferredActiveFilter,
    deferredActiveAreaFilter,
    deferredActiveRoleFilter,
    deferredSearchTerm,
    deferredScope,
    deferredDataSourceFilter,
  ]);

  // Dataset count (post-source selection only, before other filters)
  const sourceCounts = useMemo(() => {
    const next = {
      new: 0,
      all: mattersWithClient.length,
      legacy: 0,
    };

    mattersWithClient.forEach((matter) => {
      if (matter.dataSource === 'vnet_direct') {
        next.new += 1;
        return;
      }

      if (matter.dataSource === 'legacy_all' || matter.dataSource === 'legacy_user') {
        next.legacy += 1;
      }
    });

    return next;
  }, [mattersWithClient]);

  const datasetCount = useMemo(() => {
    return sourceCounts[dataSourceFilter];
  }, [dataSourceFilter, sourceCounts]);

  // Pre-compute scope counts for a compact scope control with badges
  const scopeCounts = useMemo(() => {
    const allowedSources = getAllowedMatterSources(dataSourceFilter);

    // Base after sources
    let base = mattersWithClient.filter(m => allowedSources.has(m.dataSource));

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
    mattersWithClient,
    activeFilter,
    activeAreaFilter,
    activeRoleFilter,
    searchTerm,
    userFullName,
    userRole,
    dataSourceFilter,
  ]);

  // Get unique practice areas for filtering
  const availableAreas = useMemo(() => {
    return getUniquePracticeAreas(mattersWithClient);
  }, [mattersWithClient]);

  // No auto-toggle for admins; let Luke/Alex choose when to see everyone's matters.

  // Set up navigation content with filter bar
  useEffect(() => {
    if (!isActive) {
      return;
    }

    if (!selected) {
      const StatusFilter = () => {
        const statusValue = activeFilter === 'Closed' ? 'archived' : 'open';

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
          <SegmentedControl
            id="matters-status-seg"
            ariaLabel="Matter status"
            value={statusValue}
            onChange={(key) => setActiveFilter(key === 'archived' ? 'Closed' : 'Active')}
            options={[
              { key: 'open', label: 'Open', icon: iconOpen },
              { key: 'archived', label: 'Archived', icon: iconArchived },
            ]}
          />
        );
      };

      const RoleFilter = () => {
        const roleValue = activeRoleFilter === 'Originating' ? 'originating' : 'responsible';

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
          <SegmentedControl
            id="matters-role-seg"
            ariaLabel="Matter role"
            value={roleValue}
            onChange={(key) => setActiveRoleFilter(key === 'originating' ? 'Originating' : 'Responsible')}
            options={[
              { key: 'responsible', label: 'Responsible', icon: iconResponsible },
              { key: 'originating', label: 'Originating', icon: iconOriginating },
            ]}
          />
        );
      };

      setContent(
        <FilterBanner
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
                      { key: 'all', label: 'All', badge: scopeCounts.all }
                ]}
              />
              <StatusFilter />
            </div>
          )}
          secondaryFilter={(
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <RoleFilter />
              {availableAreas.length > 1 && (
                areaExpanded || activeAreaFilter !== 'All' ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 500, color: isDarkMode ? colours.dark.text : colours.light.text }}>Area:</span>
                    <select
                      value={activeAreaFilter}
                      onChange={(e) => {
                        setActiveAreaFilter(e.target.value);
                        if (e.target.value === 'All') setAreaExpanded(false);
                      }}
                      onBlur={() => { if (activeAreaFilter === 'All') setAreaExpanded(false); }}
                      autoFocus={areaExpanded && activeAreaFilter === 'All'}
                      style={{
                        height: 24,
                        padding: '0 28px 0 10px',
                        appearance: 'none',
                        backgroundColor: isDarkMode ? colours.darkBlue : colours.light.cardBackground,
                        backgroundImage: `url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='${isDarkMode ? '%23f3f4f6' : '%23061733'}' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
                        backgroundRepeat: 'no-repeat',
                        backgroundPosition: 'right 8px center',
                        borderRadius: 0,
                        border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.25)' : colours.light.border}`,
                        color: isDarkMode ? colours.dark.text : colours.light.text,
                        fontSize: 11,
                        fontFamily: 'Raleway, sans-serif',
                        cursor: 'pointer'
                      }}
                    >
                      <option value="All">All Areas</option>
                      {availableAreas.map((area) => (
                        <option key={area} value={area}>{area}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <button
                    type="button"
                    aria-label="Filter by area"
                    title="Filter by area of work"
                    onClick={() => setAreaExpanded(true)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 24,
                      height: 24,
                      borderRadius: 0,
                      border: `1px solid ${isDarkMode ? 'rgba(55,65,81,0.4)' : 'rgba(0,0,0,0.10)'}`,
                      background: 'transparent',
                      cursor: 'pointer',
                      color: isDarkMode ? colours.subtleGrey : colours.greyText,
                      padding: 0,
                      transition: 'all 150ms ease',
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                      <rect x="2" y="3" width="12" height="2" rx="0" fill="currentColor" />
                      <rect x="4" y="7" width="8" height="2" rx="0" fill="currentColor" />
                      <rect x="6" y="11" width="4" height="2" rx="0" fill="currentColor" />
                    </svg>
                  </button>
                )
              )}
            </div>
          )}
          search={{
            value: searchTerm,
            onChange: setSearchTerm,
            placeholder: "Search…"
          }}
          middleActions={(
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setDataSourceFilter((previous) => getNextMatterSourceFilter(previous))}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '4px 10px',
                  height: 28,
                  borderRadius: 14,
                  background: dataSourceFilter === 'all'
                    ? (isDarkMode ? 'rgba(54, 144, 206, 0.2)' : 'rgba(54, 144, 206, 0.12)')
                    : dataSourceFilter === 'new'
                      ? (isDarkMode ? 'rgba(32, 178, 108, 0.2)' : 'rgba(32, 178, 108, 0.12)')
                      : 'transparent',
                  border: `1px solid ${dataSourceFilter === 'all'
                    ? (isDarkMode ? 'rgba(54, 144, 206, 0.5)' : 'rgba(54, 144, 206, 0.32)')
                    : dataSourceFilter === 'new'
                      ? (isDarkMode ? 'rgba(32, 178, 108, 0.5)' : 'rgba(32, 178, 108, 0.3)')
                      : (isDarkMode ? 'rgba(255,140,0,0.35)' : 'rgba(255,140,0,0.28)')}`,
                  fontSize: 10,
                  fontWeight: 600,
                  color: dataSourceFilter === 'all'
                    ? colours.highlight
                    : dataSourceFilter === 'new'
                      ? colours.green
                      : colours.orange,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
                title={
                  dataSourceFilter === 'new'
                    ? 'Showing new-space matters only (click to show all)'
                    : dataSourceFilter === 'all'
                      ? 'Showing new + legacy matters (click for legacy only)'
                      : 'Showing legacy matters only (click for new only)'
                }
                aria-label={
                  dataSourceFilter === 'new'
                    ? 'New matters only'
                    : dataSourceFilter === 'all'
                      ? 'All matters'
                      : 'Legacy matters only'
                }
              >
                <Icon
                  iconName={dataSourceFilter === 'all' ? 'Database' : dataSourceFilter === 'new' ? 'FabricOpenFolderHorizontal' : 'Archive'}
                  style={{ fontSize: 10, opacity: 0.75 }}
                />
                <span style={{ fontSize: 10, whiteSpace: 'nowrap' }}>
                  {dataSourceFilter === 'new' ? 'New' : dataSourceFilter === 'all' ? 'All' : 'Legacy'}: {filtered.length}/{datasetCount}
                </span>
              </button>
            </div>
          )}
        >
        </FilterBanner>
      );
    } else {
      setContent(
        <NavigatorDetailBar
          onBack={() => {
            if (detailEnterTimerRef.current) {
              window.clearTimeout(detailEnterTimerRef.current);
              detailEnterTimerRef.current = null;
            }
            setSelected(null);
            setActiveDetailTab('overview');
            setIsEnteringDetail(false);
          }}
          backLabel="Back"
          tabs={[
            { key: 'overview', label: 'Overview' },
            { key: 'activities', label: 'Activities', disabled: disableFutureTabs, disabledMessage: disabledTabMessage },
            { key: 'documents', label: 'Documents', disabled: disableFutureTabs, disabledMessage: disabledTabMessage },
            { key: 'communications', label: 'Comms', disabled: disableFutureTabs, disabledMessage: disabledTabMessage },
            { key: 'billing', label: 'Billing', disabled: disableFutureTabs, disabledMessage: disabledTabMessage },
          ]}
          activeTab={activeDetailTab}
          onTabChange={(key) => {
            if (disableFutureTabs && key !== 'overview') return;
            setActiveDetailTab(key as MatterDetailTabKey);
          }}
        />,
      );
    }
  }, [
    setContent,
    isActive,
    selected,
    isDarkMode,
    activeFilter,
    activeAreaFilter,
    areaExpanded,
    availableAreas,
    searchTerm,
    scope,
    activeRoleFilter,
    filtered.length,
    datasetCount,
    dataSourceFilter,
    activeDetailTab,
    disableFutureTabs,
    scopeCounts,
    sourceCounts,
  ]);

  useEffect(() => {
    return () => {
      setContent(null);
      if (detailEnterTimerRef.current) {
        window.clearTimeout(detailEnterTimerRef.current);
        detailEnterTimerRef.current = null;
      }
    };
  }, [setContent]);

  function beginDetailEntryTransition() {
    setIsEnteringDetail(true);
    if (detailEnterTimerRef.current) {
      window.clearTimeout(detailEnterTimerRef.current);
    }
    detailEnterTimerRef.current = window.setTimeout(() => {
      setIsEnteringDetail(false);
      detailEnterTimerRef.current = null;
    }, 260);
  }

  function renderMatterDetailSkeleton() {
    const box = (w: number | string, h: number, radius = 3) => (
      <div
        className="skeleton-shimmer"
        style={{
          width: w,
          height: h,
          borderRadius: radius,
        }}
      />
    );

    const casc = (delayMs: number) => ({
      ['--cascade-delay' as any]: `${delayMs}ms`,
    }) as React.CSSProperties;

    return (
      <div
        className={containerStyle(isDarkMode)}
        aria-busy="true"
        aria-label="Loading matter details"
      >
        <div
          className="skeleton-cascade"
          style={{
            ...casc(0),
            backgroundColor: isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground,
            borderBottom: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
            padding: '16px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
            {box(120, 28, 6)}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0, flex: 1 }}>
              {box('60%', 18, 6)}
              {box('40%', 12, 6)}
            </div>
          </div>
          {box(80, 26, 2)}
        </div>

        <div
          className="skeleton-cascade"
          style={{
            ...casc(70),
            display: 'grid',
            gridTemplateColumns: '1fr 320px',
            gap: 0,
            flex: 1,
            minHeight: 0,
          }}
        >
          <div
            style={{
              padding: 24,
              display: 'flex',
              flexDirection: 'column',
              gap: 20,
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: 16,
              }}
            >
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="skeleton-cascade"
                  style={{
                    ...casc(110 + i * 40),
                    backgroundColor: isDarkMode ? colours.darkBlue : colours.light.cardBackground,
                    border: `0.5px solid ${isDarkMode ? `${colours.dark.borderColor}66` : 'rgba(6, 23, 51, 0.06)'}`,
                    borderRadius: 0,
                    padding: 16,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                  }}
                >
                  {box('55%', 12, 6)}
                  {box('70%', 24, 6)}
                  {box('45%', 12, 6)}
                </div>
              ))}
            </div>

            <div
              className="skeleton-cascade"
              style={{
                ...casc(300),
                backgroundColor: isDarkMode ? colours.darkBlue : colours.light.cardBackground,
                border: `0.5px solid ${isDarkMode ? `${colours.dark.borderColor}66` : 'rgba(6, 23, 51, 0.06)'}`,
                borderRadius: 0,
                padding: 20,
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              {box(160, 16, 6)}
              {box('95%', 12, 6)}
              {box('88%', 12, 6)}
              {box('76%', 12, 6)}
              {box('92%', 12, 6)}
            </div>
          </div>

          <div
            style={{
              padding: 24,
              borderLeft: `0.5px solid ${isDarkMode ? `${colours.dark.borderColor}66` : 'rgba(6, 23, 51, 0.06)'}`,
              backgroundColor: isDarkMode ? colours.darkBlue : colours.light.cardBackground,
              display: 'flex',
              flexDirection: 'column',
              gap: 20,
            }}
          >
            <div
              className="skeleton-cascade"
              style={{
                ...casc(160),
                backgroundColor: isDarkMode ? colours.darkBlue : colours.light.cardBackground,
                border: `0.5px solid ${isDarkMode ? `${colours.dark.borderColor}66` : 'rgba(6, 23, 51, 0.06)'}`,
                borderRadius: 0,
                padding: 20,
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              {box(120, 16, 6)}
              {box('85%', 12, 6)}
              {box('70%', 12, 6)}
              {box('92%', 12, 6)}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const selectedWorkbenchItem = useMemo(() => {
    if (!selected?.instructionRef || !workbenchByInstructionRef) return undefined;
    return workbenchByInstructionRef.get(selected.instructionRef);
  }, [selected, workbenchByInstructionRef]);

  useEffect(() => {
    if (!auditEnabled || !selected) {
      setAuditStatus('idle');
      setAuditData(null);
      return;
    }

    const requestId = ++auditRequestRef.current;
    setAuditStatus('loading');

    const workbenchMatter = Array.isArray(selectedWorkbenchItem?.matters)
      ? selectedWorkbenchItem.matters[0]
      : null;
    const workbenchMatterId =
      workbenchMatter?.MatterId || workbenchMatter?.MatterID || workbenchMatter?.id || null;

    const payload = {
      clioMatterId: workbenchMatterId,
      instructionRef: selected.instructionRef || null,
      entraId: resolvedEntraId,
      initials: userInitials,
      local: {
        displayNumber: selected.displayNumber || null,
        description: selected.description || null,
        practiceArea: selected.practiceArea || null,
        openDate: selected.openDate || null,
        clientName: selected.clientName || null,
      },
    };

    (async () => {
      try {
        const resp = await fetch('/api/matter-audit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!resp.ok) throw new Error(await resp.text());
        const data = await resp.json();
        if (auditRequestRef.current !== requestId) return;
        setAuditData(data || null);
        setAuditStatus('ready');
      } catch (err) {
        if (auditRequestRef.current !== requestId) return;
        setAuditStatus('error');
        setAuditData(null);
      }
    })();
  }, [auditEnabled, selected, selectedWorkbenchItem, resolvedEntraId, userInitials]);

  useEffect(() => {
    if (!selected) {
      setOverviewData(null);
      setOutstandingData(null);
      setOutstandingBalancesList(null);
      setWipStatus('idle');
      setFundsStatus('idle');
      setOutstandingStatus('idle');
      setResolvedClioMatterId(null);
      return;
    }

    const requestId = ++metricsRequestRef.current;
    const matterIdRaw = selected.matterId;
    const matterIdNumber = Number(matterIdRaw);
    if (!matterIdRaw) {
      setWipStatus('error');
      setFundsStatus('error');
      setOutstandingStatus('error');
      return;
    }

    type MetricStepKey = 'wip' | 'funds' | 'outstanding';
    const metricSteps: Array<{ key: MetricStepKey; label: string }> = [
      { key: 'wip', label: 'Time entries' },
      { key: 'funds', label: 'Client funds' },
      { key: 'outstanding', label: 'Outstanding balances' },
    ];
    const progressState: Record<MetricStepKey, 'active' | 'done' | 'error'> = {
      wip: 'active',
      funds: 'active',
      outstanding: 'active',
    };

    const buildProgress = () =>
      metricSteps.map((step) => ({
        label: step.label,
        status: progressState[step.key],
      }));

    const showMetricsToast = (message: string) => {
      const progress = buildProgress();
      if (metricsToastRef.current) {
        updateToast(metricsToastRef.current, { type: 'loading', title: 'Matter metrics', message, persist: true, progress });
      } else {
        metricsToastRef.current = showToast({ type: 'loading', title: 'Matter metrics', message, persist: true, progress });
      }
    };

    const finishMetricsToast = (type: 'success' | 'error', message: string) => {
      if (metricsToastRef.current) {
        updateToast(metricsToastRef.current, { type, message, persist: false, duration: 2500 });
        const id = metricsToastRef.current;
        window.setTimeout(() => hideToast(id), 2600);
        metricsToastRef.current = null;
      }
    };

    setOverviewData(null);
    setOutstandingData(null);
    setOutstandingBalancesList(null);
    setWipStatus('loading');
    setFundsStatus('loading');
    setOutstandingStatus('loading');
    setResolvedClioMatterId(null);

    let pendingCount = metricSteps.length;
    let hadError = false;
    const updatePendingToast = () => {
      const activeLabels = metricSteps
        .filter((step) => progressState[step.key] === 'active')
        .map((step) => step.label);
      const message = activeLabels.length
        ? `Processing: ${activeLabels.join(' · ')}`
        : 'Finalising matter metrics';
      showMetricsToast(message);
    };
    const markMetricDone = (key: MetricStepKey, ok: boolean) => {
      progressState[key] = ok ? 'done' : 'error';
      pendingCount -= 1;
      if (!ok) hadError = true;
      if (pendingCount > 0) {
        updatePendingToast();
        return;
      }
      finishMetricsToast(hadError ? 'error' : 'success', hadError ? 'Matter metrics incomplete' : 'Matter metrics ready');
    };

    updatePendingToast();

    const formatIso = (raw?: string) => {
      if (!raw) return undefined;
      const parsed = new Date(raw);
      if (Number.isNaN(parsed.getTime())) return undefined;
      return parsed.toISOString().replace(/\.\d{3}Z$/, 'Z');
    };

    const dateFrom = formatIso(selected.openDate);
    const dateTo = formatIso(new Date().toISOString());

    (async () => {
      try {
        const params = new URLSearchParams({
          matterId: String(matterIdRaw),
          displayNumber: selected.displayNumber || '',
          instructionRef: selected.instructionRef || '',
          initials: userInitials,
          entraId: resolvedEntraId,
        });
        if (dateFrom) params.set('dateFrom', dateFrom);
        if (dateTo) params.set('dateTo', dateTo);
        const resp = await fetch(`/api/matter-metrics/wip?${params.toString()}`);
        if (!resp.ok) throw new Error(await resp.text());
        const data = await resp.json();
        if (metricsRequestRef.current !== requestId) return;
        if (data?.status === 'pending') {
          setWipStatus('pending');
          markMetricDone('wip', true);
          return;
        }
        setOverviewData((prev: Record<string, unknown> | null) => ({ ...(prev || {}), ...data }));
        if (data?.clioMatterId) {
          setResolvedClioMatterId(Number(data.clioMatterId));
        }
        setWipStatus('ready');
        markMetricDone('wip', true);
      } catch (err) {
        if (metricsRequestRef.current !== requestId) return;
        setWipStatus('error');
        markMetricDone('wip', false);
      }
    })();

    (async () => {
      try {
        const params = new URLSearchParams({
          matterId: String(matterIdRaw),
          displayNumber: selected.displayNumber || '',
          instructionRef: selected.instructionRef || '',
          initials: userInitials,
          entraId: resolvedEntraId,
        });
        const resp = await fetch(`/api/matter-metrics/funds?${params.toString()}`);
        if (!resp.ok) throw new Error(await resp.text());
        const data = await resp.json();
        if (metricsRequestRef.current !== requestId) return;
        if (data?.status === 'pending') {
          setFundsStatus('pending');
          markMetricDone('funds', true);
          return;
        }
        setOverviewData((prev: Record<string, unknown> | null) => ({ ...(prev || {}), ...data }));
        if (data?.clioMatterId) {
          setResolvedClioMatterId(Number(data.clioMatterId));
        }
        setFundsStatus('ready');
        markMetricDone('funds', true);
      } catch (err) {
        if (metricsRequestRef.current !== requestId) return;
        setFundsStatus('error');
        markMetricDone('funds', false);
      }
    })();

    (async () => {
      try {
        if (!resolvedEntraId) throw new Error('Missing Entra ID');
        const resp = await fetch(`/api/outstanding-balances/user/${encodeURIComponent(resolvedEntraId)}`);
        if (!resp.ok) throw new Error(await resp.text());
        const data = await resp.json();
        if (metricsRequestRef.current !== requestId) return;
        const list = Array.isArray(data?.data) ? data.data : [];
        const matchId = resolvedClioMatterId || (Number.isFinite(matterIdNumber) ? matterIdNumber : null);
        const findRecord = (entries: Record<string, any>[]) =>
          entries.find((entry) =>
            matchId && Array.isArray(entry.associated_matter_ids) && entry.associated_matter_ids.includes(matchId)
          );

        let record = list.length ? findRecord(list) : null;
        let finalList = list;

        if (!record && matchId) {
          const globalResp = await fetch(`/api/outstanding-balances?fresh=${Date.now()}`, {
            cache: 'no-store',
          });
          if (globalResp.ok) {
            const globalData = await globalResp.json();
            const globalList = Array.isArray(globalData?.data) ? globalData.data : [];
            const globalRecord = findRecord(globalList);
            if (globalRecord) {
              record = globalRecord;
              finalList = globalList;
            }
          }
        }

        setOutstandingBalancesList(finalList);
        setOutstandingData(record || null);
        setOutstandingStatus('ready');
        markMetricDone('outstanding', true);
      } catch (err) {
        if (metricsRequestRef.current !== requestId) return;
        setOutstandingStatus('error');
        markMetricDone('outstanding', false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, userInitials, resolvedEntraId]);

  useEffect(() => {
    if (!selected || !outstandingBalancesList || !outstandingBalancesList.length) return;
    const matterId = Number(selected.matterId);
    const matchId = resolvedClioMatterId || matterId;
    if (!matchId || Number.isNaN(matchId)) return;
    const record = outstandingBalancesList.find((entry: Record<string, any>) =>
      Array.isArray(entry.associated_matter_ids) && entry.associated_matter_ids.includes(matchId)
    );
    setOutstandingData(record || null);
  }, [selected, resolvedClioMatterId, outstandingBalancesList]);

  if (selected) {
    if (isEnteringDetail) {
      return (
        <div className={detailContainerStyle(isDarkMode)}>
          {renderMatterDetailSkeleton()}
        </div>
      );
    }
    return (
      <div className={detailContainerStyle(isDarkMode)}>
        <MatterOverview
          matter={selected}
          userInitials={userInitials}
          activeTab={activeDetailTab}
          overviewData={overviewData || undefined}
          outstandingData={outstandingData || undefined}
          wipStatus={wipStatus}
          fundsStatus={fundsStatus}
          outstandingStatus={outstandingStatus}
          auditEnabled={auditEnabled}
          auditStatus={auditStatus}
          auditData={auditData || undefined}
          onToggleAudit={() => setAuditEnabled((prev) => !prev)}
          workbenchItem={selectedWorkbenchItem}
          teamData={teamData}
          enquiries={enquiries}
          demoModeEnabled={demoModeEnabled}
          autoOpenCcl={autoOpenCcl}
          onCclOpened={() => setAutoOpenCcl(false)}
        />
      </div>
    );
  }

  // Only show the full-screen loading state on first load.
  // When switching users, keep the UI visible and show the in-context overlay cue instead.
  if (isLoading && effectiveMatters.length === 0) {
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
      scope === 'all' ||
      dataSourceFilter !== 'new'
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
                    setScope('mine');
                    setDataSourceFilter('new');
                  },
                  variant: 'primary'
                }
              : undefined
          }
        />
      </div>
    );
  }

  // Check if we're in a pending/transitioning state
  const isTransitioning = scope !== deferredScope || dataSourceFilter !== deferredDataSourceFilter ||
                          activeFilter !== deferredActiveFilter || activeAreaFilter !== deferredActiveAreaFilter ||
                          activeRoleFilter !== deferredActiveRoleFilter || searchTerm !== deferredSearchTerm;

  const showOverlayCue = isLoading || isTransitioning;
  const overlayCueText = isLoading ? 'Switching user…' : 'Updating view...';

  return (
    <div className={containerStyle(isDarkMode)}>
      {/* Processing overlay when transitioning between filter states */}
      {/* Spin animation for loading indicator */}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
      {showOverlayCue && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: isDarkMode ? 'rgba(2, 6, 23, 0.4)' : 'rgba(255, 255, 255, 0.4)',
          backdropFilter: 'blur(1px)',
          zIndex: 100,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '12px 20px',
            borderRadius: 8,
            background: isDarkMode ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)',
            boxShadow: isDarkMode ? '0 4px 20px rgba(0, 0, 0, 0.4)' : '0 4px 20px rgba(0, 0, 0, 0.15)',
            border: `1px solid ${isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)'}`,
          }}>
            <div style={{
              width: 16,
              height: 16,
              border: `2px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.3)' : 'rgba(54, 144, 206, 0.2)'}`,
              borderTopColor: colours.highlight,
              borderRadius: '50%',
              animation: 'spin 0.7s linear infinite',
            }} />
            <span style={{
              fontSize: 13,
              fontWeight: 500,
              color: isDarkMode ? 'rgba(255, 255, 255, 0.85)' : 'rgba(0, 0, 0, 0.7)',
              fontFamily: 'Raleway, sans-serif',
            }}>
              {overlayCueText}
            </span>
          </div>
        </div>
      )}
      <MatterTableView
        matters={filtered}
        isDarkMode={isDarkMode}
        showCclColumns={showCclColumns}
        cclStatusByMatterId={effectiveCclStatusByMatterId}
        onRowClick={(matter) => {
          setSelected(matter);
          setActiveDetailTab('overview');
          beginDetailEntryTransition();
        }}
        loading={isLoading}
      />
    </div>
  );

  function containerStyle(dark: boolean) {
    return mergeStyles({
      backgroundColor: dark ? colours.dark.background : colours.light.background,
      flex: 1,
      minHeight: 0,
      display: 'flex',
      flexDirection: 'column',
      boxSizing: 'border-box',
      position: 'relative',
      overflow: 'hidden',
      color: dark ? colours.light.text : colours.dark.text,
    });
  }

  function detailContainerStyle(dark: boolean) {
    return mergeStyles({
      backgroundColor: dark ? colours.dark.background : colours.light.background,
      flex: 1,
      minHeight: 0,
      display: 'flex',
      flexDirection: 'column',
      boxSizing: 'border-box',
      position: 'relative',
      overflowY: 'auto',
      overflowX: 'hidden',
      color: dark ? colours.light.text : colours.dark.text,
    });
  }
};

export default Matters;