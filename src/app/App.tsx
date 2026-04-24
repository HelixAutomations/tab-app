import React, { useState, useEffect, useLayoutEffect, lazy, Suspense, useMemo, useCallback } from 'react';
import CustomTabs from './styles/CustomTabs';
import './styles/index.css';
import './styles/ImmediateActionsPortal.css';
import { ThemeProvider, useTheme } from './functionality/ThemeContext';
import Navigator from '../components/Navigator';
import { useNavigatorActions } from './functionality/NavigatorContext';
import ResourcesModal from '../components/ResourcesModal';
import FormsHub from '../tabs/forms/FormsHub';
import { NavigatorProvider } from './functionality/NavigatorContext';
import { ToastProvider } from '../components/feedback/ToastProvider';
import { colours } from './styles/colours';
import { app } from '@microsoft/teams-js';
import { Matter, UserData, Enquiry, Tab, TeamData, POID, Transaction, BoardroomBooking, SoundproofPodBooking, InstructionData, NormalizedMatter } from './functionality/types';
import { hasActiveMatterOpening } from './functionality/matterOpeningUtils';
import { normalizeMatterData } from '../utils/matterNormalization';
import { getProxyBaseUrl } from '../utils/getProxyBaseUrl';
import { ADMIN_USERS, isAdminUser, canSeePrivateHubControls, canSeeActivityTab } from './admin';
import { EffectivePermissionsProvider } from './effectivePermissions';
import HubToolsChip from '../components/HubToolsChip';
import DebugLatencyOverlay from '../components/DebugLatencyOverlay';
import TabMountMeter from '../components/TabMountMeter';
import { startInteraction } from '../utils/interactionTracker';
import { useFirstHydration } from '../utils/useFirstHydration';
import MaintenanceNotice from './MaintenanceNotice';
import { useServiceHealthMonitor } from './functionality/useServiceHealthMonitor';
import actionLog from '../utils/actionLog';
import { trackClientEvent } from '../utils/telemetry';

const proxyBaseUrl = getProxyBaseUrl();

/** Retry a dynamic import up to `retries` times with exponential back-off. */
function retryImport<T>(fn: () => Promise<T>, retries = 2, delay = 1000): Promise<T> {
  return fn().catch((err) => {
    if (retries <= 0) throw err;
    return new Promise<T>((resolve) => setTimeout(resolve, delay)).then(() =>
      retryImport(fn, retries - 1, delay * 2),
    );
  });
}

const loadHomeTab = () => retryImport(() => import('../tabs/home/Home'));
const loadEnquiriesTab = () => retryImport(() => import('../tabs/enquiries/Enquiries'));
const loadInstructionsTab = () => retryImport(() => import('../tabs/instructions/Instructions'));
const loadReportingTab = () => retryImport(() => import('../tabs/Reporting/ReportingHome'));
const Home = lazy(loadHomeTab);
const Enquiries = lazy(loadEnquiriesTab);
const Instructions = lazy(loadInstructionsTab);
const loadMattersTab = () => retryImport(() => import('../tabs/matters/Matters'));
const Matters = lazy(loadMattersTab);
const Roadmap = lazy(() => retryImport(() => import('../tabs/roadmap/Roadmap')));
const ReportingHome = lazy(loadReportingTab);

type LocalInstructionFixtures = {
  instructionData: InstructionData[];
  rawIdVerifications: any[];
  poidData: POID[];
};

let localInstructionFixturesPromise: Promise<LocalInstructionFixtures> | null = null;

function mapLocalIdVerifications(rawIdVerifications: any[]): POID[] {
  return rawIdVerifications
    .map((v) => ({
      poid_id: String(v.InternalId),
      first: v.FirstName,
      last: v.LastName,
      email: v.Email,
      nationality: v.Nationality,
      nationality_iso: v.NationalityAlpha2,
      date_of_birth: v.DOB,
      passport_number: v.PassportNumber,
      drivers_license_number: v.DriversLicenseNumber,
      house_building_number: v.HouseNumber,
      street: v.Street,
      city: v.City,
      county: v.County,
      post_code: v.Postcode,
      country: v.Country,
      company_name: v.company_name || v.CompanyName,
      company_number: v.company_number || v.CompanyNumber,
      company_house_building_number: v.company_house_building_number || v.CompanyHouseNumber,
      company_street: v.company_street || v.CompanyStreet,
      company_city: v.company_city || v.CompanyCity,
      company_county: v.company_county || v.CompanyCounty,
      company_post_code: v.company_post_code || v.CompanyPostcode,
      company_country: v.company_country || v.CompanyCountry,
      company_country_code: v.company_country_code || v.CompanyCountryCode,
      stage: v.stage,
      check_result: v.EIDOverallResult,
      pep_sanctions_result: v.PEPAndSanctionsCheckResult,
      address_verification_result: v.AddressVerificationResult,
      check_expiry: v.CheckExpiry,
      poc: v.poc,
      prefix: v.prefix,
      type: v.type,
      client_id: v.ClientId,
      matter_id: v.MatterId,
    }))
    .filter((poid) =>
      poid &&
      poid.poid_id &&
      poid.first &&
      poid.last &&
      isNaN(Number(poid.first)) &&
      isNaN(Number(poid.last))
    );
}

async function loadLocalInstructionFixtures(): Promise<LocalInstructionFixtures> {
  if (!localInstructionFixturesPromise) {
    localInstructionFixturesPromise = Promise.all([
      import('../localData/localInstructionData.json'),
      import('../localData/localIdVerifications.json'),
    ]).then(([instructionModule, idVerificationModule]) => {
      const instructionData = (((instructionModule as { default?: InstructionData[] }).default) ?? instructionModule) as InstructionData[];
      const rawIdVerifications = ((((idVerificationModule as { default?: any[] }).default) ?? idVerificationModule) as any[]);

      return {
        instructionData,
        rawIdVerifications,
        poidData: mapLocalIdVerifications(rawIdVerifications),
      };
    });
  }

  return localInstructionFixturesPromise;
}

interface AppProps {
  teamsContext: app.Context | null;
  userData: UserData[] | null;
  enquiries: Enquiry[] | null;
  enquiriesUsingSnapshot?: boolean;
  enquiriesLiveRefreshInFlight?: boolean;
  enquiriesLastLiveSyncAt?: number | null;
  matters: NormalizedMatter[];
  isLoading: boolean;
  error: string | null;
  teamData?: TeamData[] | null;
  isLocalDev?: boolean;
  onAreaChange?: (areas: string[]) => void;
  onUserChange?: (user: UserData) => void;
  onReturnToAdmin?: () => void;
  originalAdminUser?: UserData | null;
  onRefreshEnquiries?: () => Promise<void>;
  onRefreshMatters?: () => Promise<void>;
  onOptimisticClaim?: (enquiryId: string, claimerEmail: string) => void;
  subscribeToEnquiryStream?: (listener: (event: { changeType: string; enquiryId: string; claimedBy?: string; claimedAt?: string | null; record?: Record<string, unknown> }) => void) => () => void;
  subscribeToPipelineStream?: (listener: (event: { eventType: string; entityId: string; entityType: string; field: string; status: string; source: string; timestamp: string; data?: Record<string, unknown> }) => void) => () => void;
  sseConnectionState?: 'connecting' | 'live' | 'error';
  lastPipelineEventAt?: number | null;
}

type ReportingNavigationView = 'logMonitor' | 'dataCentre';

interface ReportingNavigationRequest {
  view: ReportingNavigationView;
  requestedAt: number;
}

/** Fast shallow equality check for instruction arrays — avoids expensive workbench rebuild when data hasn't changed. */
function instructionDataEqual(a: InstructionData[], b: InstructionData[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].prospectId !== b[i].prospectId) return false;
    const aInst = a[i].instructions ?? [];
    const bInst = b[i].instructions ?? [];
    if (aInst.length !== bInst.length) return false;
    for (let j = 0; j < aInst.length; j++) {
      if ((aInst[j] as any)?.InstructionRef !== (bInst[j] as any)?.InstructionRef) return false;
      if ((aInst[j] as any)?.Stage !== (bInst[j] as any)?.Stage) return false;
    }
  }
  return true;
}

const App: React.FC<AppProps> = ({
  teamsContext,
  userData,
  enquiries,
  enquiriesUsingSnapshot = false,
  enquiriesLiveRefreshInFlight = false,
  enquiriesLastLiveSyncAt = null,
  matters,
  isLoading,
  error,
  teamData,
  isLocalDev = false,
  onAreaChange,
  onUserChange,
  onReturnToAdmin,
  originalAdminUser,
  onRefreshEnquiries,
  onRefreshMatters,
  onOptimisticClaim,
  subscribeToEnquiryStream,
  subscribeToPipelineStream,
  sseConnectionState,
  lastPipelineEventAt,
}) => {
  const [activeTab, setActiveTab] = useState('home');
  const [enquiriesEverVisited, setEnquiriesEverVisited] = useState(false);
  const [mattersEverVisited, setMattersEverVisited] = useState(false);
  const [pendingMatterId, setPendingMatterId] = useState<string | null>(null);
  const [pendingShowCcl, setPendingShowCcl] = useState(false);
  const [pendingEnquiryId, setPendingEnquiryId] = useState<string | null>(null);
  const [pendingEnquirySubTab, setPendingEnquirySubTab] = useState<string | null>(null);
  const [pendingEnquiryPitchScenario, setPendingEnquiryPitchScenario] = useState<string | null>(null);
  const [pendingFormTitle, setPendingFormTitle] = useState<string | null>(null);
  const [reportingNavigationRequest, setReportingNavigationRequest] = useState<ReportingNavigationRequest | null>(null);
  const [demoModeEnabled, setDemoModeEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem('demoModeEnabled') === 'true';
    } catch {
      return false;
    }
  });
  const [pendingDemoMode, setPendingDemoMode] = useState(() => demoModeEnabled);
  const { state: serviceHealth, dismiss: dismissMaintenance } = useServiceHealthMonitor();
  const systemPrefersDark = typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : false;
  const hostTheme = useMemo(() => {
    const normalizeTheme = (value?: string | null) => {
      if (!value) {
        return undefined;
      }
      const lower = value.toLowerCase();
      if (lower === 'dark' || lower === 'contrast' || lower === 'light' || lower === 'default') {
        return lower;
      }
      return undefined;
    };

    if (typeof document === 'undefined') {
      return undefined;
    }

    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const fromQuery = normalizeTheme(params.get('theme'));
      if (fromQuery) {
        return fromQuery;
      }
    }

    const datasetTheme = normalizeTheme(document.body?.dataset?.theme ?? null);
    if (datasetTheme) {
      return datasetTheme;
    }

    if (document.body?.classList.contains('theme-dark')) {
      return 'dark';
    }
    if (document.body?.classList.contains('theme-contrast')) {
      return 'contrast';
    }
    if (document.body?.classList.contains('theme-light')) {
      return 'light';
    }

    return undefined;
  }, []);
  // Local override: persist user selection across refreshes
  // useState + event listener so isDarkMode updates when user toggles theme mid-session
  const [persistedTheme, setPersistedTheme] = React.useState<string | null>(() => {
    try {
      return typeof window !== 'undefined' ? window.localStorage.getItem('helix_theme') : null;
    } catch {
      return null;
    }
  });

  React.useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.theme) setPersistedTheme(detail.theme);
    };
    window.addEventListener('helix-theme-changed', handler);
    return () => window.removeEventListener('helix-theme-changed', handler);
  }, []);

  const teamsTheme = teamsContext?.app?.theme ? teamsContext.app.theme.toLowerCase() : undefined;
  const themeName = (persistedTheme as string | null) ?? teamsTheme ?? hostTheme;
  const isDarkMode = themeName === 'dark' || themeName === 'contrast' || (!themeName && systemPrefersDark);

  // Ensure body background matches theme immediately for smooth transitions
  React.useEffect(() => {
    if (typeof document !== 'undefined') {
      const bg = isDarkMode ? colours.websiteBlue : colours.light.background;
      // Set on <html> so no layer can leak a stale background
      document.documentElement.style.backgroundColor = bg;
      document.documentElement.style.transition = 'background-color 0.15s ease';
      const body = document.body;
      if (body) {
        body.style.backgroundColor = bg;
        body.style.transition = 'background-color 0.15s ease';
        body.dataset.theme = isDarkMode ? 'dark' : 'light';
        body.classList.toggle('theme-dark', isDarkMode);
        body.classList.toggle('theme-light', !isDarkMode);
      }
      
      // Also update the immediate actions portal background
      const portalElement = document.getElementById('app-level-immediate-actions');
      if (portalElement) {
        // Clear any previously applied inline backgrounds so theme changes don't leave artefacts
        portalElement.style.removeProperty('background');
        portalElement.style.removeProperty('background-color');
        portalElement.style.removeProperty('color');
      }
    }
  }, [isDarkMode]);

  // Suspense fallback — rendered while a lazy tab chunk is still downloading.
  // A thin 2px shimmer strip pinned above the content slot.
  // During initial boot the global `!dataReady` strip is already visible, so
  // this one bails (avoids stacking into a 4px bar that looks like a filter
  // underline). Post-boot, this is the only cue when a not-yet-prefetched
  // chunk is arriving from the network.
  const ThemedSuspenseFallback: React.FC = () => {
    const { isDarkMode } = useTheme();
    if (!dataReady) return null;
    return (
      <div
        role="status"
        aria-live="polite"
        aria-label="Loading tab"
        style={{ width: '100%', height: 2, overflow: 'hidden', borderRadius: 0 }}
      >
        <div style={{
          height: '100%',
          background: `linear-gradient(90deg, transparent 0%, ${isDarkMode ? colours.accent : colours.highlight} 50%, transparent 100%)`,
          backgroundSize: '200% 100%',
          animation: 'helix-shimmer 1.5s ease-in-out infinite',
        }} />
      </div>
    );
  };

  const [poidData, setPoidData] = useState<POID[]>([]);
  const [initialLocalPoidCount, setInitialLocalPoidCount] = useState<number | null>(null);
  const [instructionData, setInstructionData] = useState<InstructionData[]>([]);
  const [allInstructionData, setAllInstructionData] = useState<InstructionData[]>([]); // Admin: all users' instructions
  const [allMattersFromHome, setAllMattersFromHome] = useState<Matter[] | null>(null);
  const [outstandingBalances, setOutstandingBalances] = useState<any>(null);
  const [transactions, setTransactions] = useState<Transaction[] | undefined>(undefined);
  const [boardroomBookings, setBoardroomBookings] = useState<BoardroomBooking[] | null>(null);
  const [soundproofBookings, setSoundproofBookings] = useState<SoundproofPodBooking[] | null>(null);
  const [isHydratingMattersOnDemand, setIsHydratingMattersOnDemand] = useState(false);

  // ── UX hydration probes (Round 2 instrumentation) ──
  // Fires hydrate.{name} once when the underlying data is first non-empty,
  // capturing time-to-meaningful-content from App-mount.
  useFirstHydration('matters', Array.isArray(matters) && matters.length > 0, { count: matters?.length });
  useFirstHydration('enquiries', Array.isArray(enquiries) && enquiries.length > 0, { count: enquiries?.length });
  useFirstHydration('instructions', instructionData.length > 0, { count: instructionData.length });
  useFirstHydration('sse.connected', sseConnectionState === 'live', { state: sseConnectionState });
  
  const [isResourcesModalOpen, setIsResourcesModalOpen] = useState(false);
  
  const [hasActiveMatter, setHasActiveMatter] = useState(false);
  const [hasImmediateActions, setHasImmediateActions] = useState(false);
  const [isInMatterOpeningWorkflow, setIsInMatterOpeningWorkflow] = useState(false);
  
  // Feature toggles - persisted in localStorage
  const [featureToggles, setFeatureToggles] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('featureToggles');
      const parsed = saved ? JSON.parse(saved) : {};
      // rateChangeTracker defaults to false - users opt-in via UserBubble
      // showAttendance defaults to true - annual leave visible by default
      return { rateChangeTracker: false, showAttendance: true, cclGuideMode: false, showOpsQueue: true, showHomeOpsCclDates: false, ...parsed };
    } catch {
      return { rateChangeTracker: false, showAttendance: true, cclGuideMode: false, showOpsQueue: true, showHomeOpsCclDates: false };
    }
  });

  const [teamWideEnquiries, setTeamWideEnquiries] = useState<Enquiry[] | null>(null);
  const mattersHydrationRequestedForUserRef = React.useRef<string | null>(null);
  const prevTabRef = React.useRef(activeTab);
  // Scroll position map for keep-alive tabs
  const tabScrollPositions = React.useRef<Record<string, number>>({});
  // Refs for tab-switch visibility of Navigator + ImmediateActions
  const navigatorChromeRef = React.useRef<HTMLDivElement | null>(null);
  const actionsWrapperRef = React.useRef<HTMLDivElement | null>(null);
  const currentUser = userData?.[0] || null;
  const useLocalData = useMemo(() => {
    if (process.env.REACT_APP_USE_LOCAL_DATA === 'true') {
      return true;
    }

    if (process.env.REACT_APP_USE_LOCAL_DATA === 'false') {
      return false;
    }

    if (typeof window === 'undefined') {
      return Boolean(isLocalDev);
    }

    return window.location.hostname === 'localhost';
  }, [isLocalDev]);
  const isProductionPreview = Boolean(featureToggles?.viewAsProd);
  const homeFeatureToggles = useMemo(
    () => ({ ...(featureToggles || {}), viewAsProd: false }),
    [featureToggles]
  );
  const showActivityTab = canSeeActivityTab(currentUser, isLocalDev) && !isProductionPreview;
  const matterSeedUserName = useMemo(() => {
    const user = userData?.[0];
    if (!user) {
      return '';
    }

    return String(
      user.FullName ||
      [user.First, user.Last].filter(Boolean).join(' ') ||
      user.Email ||
      ''
    );
  }, [userData]);
  const seededMattersForTab = useMemo<NormalizedMatter[]>(() => {
    if ((matters || []).length > 0) {
      return matters;
    }

    if (!(allMattersFromHome || []).length) {
      return [];
    }

    return (allMattersFromHome || []).map((matter) =>
      normalizeMatterData(matter, matterSeedUserName, 'legacy_all')
    );
  }, [matters, allMattersFromHome, matterSeedUserName]);
  const hasSeededMattersForTab = seededMattersForTab.length > 0;

  // Stable empty-array fallback for Instructions matters prop
  const mattersForInstructions = useMemo<Matter[]>(() => allMattersFromHome || [], [allMattersFromHome]);
  // Stable enquiries prop for Matters — prefer team-wide if available
  const enquiriesForMatters = useMemo(() => (teamWideEnquiries && teamWideEnquiries.length > 0) ? teamWideEnquiries : enquiries, [teamWideEnquiries, enquiries]);

  useEffect(() => {
    try {
      const migrationKey = 'featureToggles.homeOpsCclDates.defaultHidden.v1';
      if (localStorage.getItem(migrationKey) === 'true') {
        return;
      }

      setFeatureToggles(prev => {
        const next = { ...prev, showHomeOpsCclDates: false };
        localStorage.setItem('featureToggles', JSON.stringify(next));
        localStorage.setItem(migrationKey, 'true');
        return next;
      });
    } catch {
      // Ignore storage failures and keep runtime defaults.
    }
  }, []);
  
  const handleFeatureToggle = useCallback((feature: string, enabled: boolean) => {
    setFeatureToggles(prev => {
      const next = { ...prev, [feature]: enabled };
      localStorage.setItem('featureToggles', JSON.stringify(next));
      return next;
    });
  }, []);

  const workbenchByInstructionRef = useMemo(() => {
    const map = new Map<string, any>();

    (allInstructionData || []).forEach((prospect: any) => {
      const instructions = prospect.instructions ?? [];
      const deals = prospect.deals ?? [];

      instructions.forEach((inst: any) => {
        const instructionRef = inst?.InstructionRef;
        if (!instructionRef) return;

        const dealsForInst = deals.filter((d: any) => d?.InstructionRef === instructionRef);
        const deal = dealsForInst[0];

        const riskSource = [
          ...(prospect.riskAssessments ?? prospect.compliance ?? []),
          ...(inst.riskAssessments ?? inst.compliance ?? []),
        ];
        dealsForInst.forEach((d: any) => {
          if (d?.instruction) {
            riskSource.push(...(d.instruction.riskAssessments ?? []));
            riskSource.push(...(d.instruction.compliance ?? []));
          }
        });

        const eidSource = [
          ...(prospect.electronicIDChecks ?? []),
          ...(prospect.idVerifications ?? []),
          ...(inst.electronicIDChecks ?? []),
          ...(inst.idVerifications ?? []),
        ];
        dealsForInst.forEach((d: any) => {
          if (d?.instruction) {
            eidSource.push(...(d.instruction.electronicIDChecks ?? []));
            eidSource.push(...(d.instruction.idVerifications ?? []));
          }
        });

        const risk = riskSource.find((r: any) => r?.MatterId === instructionRef);
        const eids = eidSource.filter(
          (e: any) => (e?.MatterId ?? e?.InstructionRef) === instructionRef,
        );
        const eid = eids[0];

        const rawDocs = [
          ...(prospect.documents ?? []),
          ...(inst.documents ?? []),
          ...dealsForInst.flatMap((d: any) => [
            ...(d.documents ?? []),
            ...(d.instruction?.documents ?? []),
          ]),
        ];
        const docsMap: Record<string, any> = {};
        rawDocs.forEach((doc: any) => {
          const key =
            doc?.DocumentId !== undefined
              ? String(doc.DocumentId)
              : `${doc?.FileName ?? ''}-${doc?.UploadedAt ?? ''}`;
          if (!docsMap[key]) {
            docsMap[key] = doc;
          }
        });
        const documents = Object.values(docsMap);

        const clientsForInst: any[] = [];
        const prospectClients = [
          ...(prospect.jointClients ?? prospect.joinedClients ?? []),
          ...dealsForInst.flatMap((d: any) => d.jointClients ?? []),
        ];
        prospectClients.forEach((jc: any) => {
          if (!jc?.DealId) return;
          if (dealsForInst.some((d: any) => d.DealId === jc.DealId)) {
            const match = dealsForInst.find((d: any) => d.DealId === jc.DealId);
            clientsForInst.push({
              ClientEmail: jc.ClientEmail,
              HasSubmitted: jc.HasSubmitted,
              Lead: false,
              deals: [
                {
                  DealId: jc.DealId,
                  InstructionRef: instructionRef,
                  ServiceDescription: match?.ServiceDescription,
                  Status: match?.Status,
                },
              ],
            });
          }
        });
        dealsForInst.forEach((d: any) => {
          if (d?.LeadClientEmail) {
            clientsForInst.push({
              ClientEmail: d.LeadClientEmail,
              Lead: true,
              deals: [
                {
                  DealId: d.DealId,
                  InstructionRef: d.InstructionRef,
                  ServiceDescription: d.ServiceDescription,
                  Status: d.Status,
                },
              ],
            });
          }
        });

        const payments =
          inst?.payments ??
          deal?.payments ??
          deal?.instruction?.payments ??
          [];

        map.set(String(instructionRef), {
          instruction: inst,
          deal,
          deals: dealsForInst,
          clients: clientsForInst,
          risk,
          eid,
          eids,
          documents,
          payments,
          prospectId: deal?.ProspectId || inst?.ProspectId || prospect.prospectId,
          documentCount: documents.length,
        });
      });
    });

    return map;
  }, [allInstructionData]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    const checkActiveMatter = () => {
      if (document.visibilityState === 'hidden') {
        return;
      }

      setHasActiveMatter(hasActiveMatterOpening(isInMatterOpeningWorkflow));
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key?.startsWith('matterOpeningDraft_')) {
        checkActiveMatter();
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkActiveMatter();
      }
    };

    checkActiveMatter();

    window.addEventListener('storage', handleStorage);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('storage', handleStorage);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isInMatterOpeningWorkflow]);

  const openResourcesModal = useCallback(() => {
    setIsResourcesModalOpen(true);
  }, []);

  const closeResourcesModal = useCallback(() => {
    setIsResourcesModalOpen(false);
  }, []);

  useEffect(() => {
    if (activeTab === 'resources') {
      openResourcesModal();
    }
  }, [activeTab]);

  // Track first visit to Enquiries for keep-alive mounting
  useEffect(() => {
    if (activeTab === 'enquiries' && !enquiriesEverVisited) {
      setEnquiriesEverVisited(true);
    }
    if (activeTab === 'matters' && !mattersEverVisited) {
      setMattersEverVisited(true);
    }
  }, [activeTab, enquiriesEverVisited, mattersEverVisited]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!userData?.[0]) return;
    if (activeTab !== 'home') return;

    let cancelled = false;
    let idleId: number | null = null;
    const warmNavigationChunks = () => {
      if (cancelled || document.hidden || activeTab !== 'home') return;
      // Chunks only — just downloads the JS, no component mount.
      // Makes first-visit tab switches feel instant by removing the
      // network leg from the critical path.
      void loadEnquiriesTab();
      void loadInstructionsTab();
      void loadReportingTab();
      void retryImport(() => import('../tabs/roadmap/Roadmap'));
      if (!mattersEverVisited) {
        void loadMattersTab();
        setMattersEverVisited(true);
      }
    };

    const scheduleWarmNavigation = () => {
      if (cancelled) return;

      if ('requestIdleCallback' in window) {
        idleId = (window as typeof window & {
          requestIdleCallback: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
        }).requestIdleCallback(() => warmNavigationChunks(), { timeout: 2500 });
        return;
      }

      warmNavigationChunks();
    };

    const timer = globalThis.setTimeout(scheduleWarmNavigation, 4000);

    return () => {
      cancelled = true;
      if (idleId !== null && 'cancelIdleCallback' in window) {
        (window as typeof window & { cancelIdleCallback: (id: number) => void }).cancelIdleCallback(idleId);
      }
      globalThis.clearTimeout(timer);
    };
  }, [activeTab, mattersEverVisited, userData]);

  // ─── Bars inside scroll region — tab-switch visibility only ───
  // Navigator + ImmediateActions are inside .app-scroll-region so they
  // scroll away naturally. No collapse logic needed — just hide them
  // on tabs where they don't belong.

  useLayoutEffect(() => {
    const isMobile = window.matchMedia('(max-width: 640px)').matches;
    const scrollContainer = (isMobile
      ? document.querySelector('.app-root')
      : document.querySelector('.app-scroll-region')) as HTMLElement | null;
    if (scrollContainer) {
      scrollContainer.scrollTop = tabScrollPositions.current[activeTab] || 0;
    }

    const navNode = navigatorChromeRef.current;
    const actNode = actionsWrapperRef.current;
    if (navNode) {
      navNode.classList.toggle('chrome-tab-hidden', activeTab !== 'home' && activeTab !== 'enquiries');
    }
    if (actNode) {
      actNode.classList.toggle('chrome-tab-hidden', activeTab !== 'home');
    }
  }, [activeTab]);

  // Save scroll position on scroll (rAF-throttled)
  useEffect(() => {
    const isMobile = window.matchMedia('(max-width: 640px)').matches;
    const scrollContainer = (isMobile
      ? document.querySelector('.app-root')
      : document.querySelector('.app-scroll-region')) as HTMLElement | null;
    if (!scrollContainer) return;

    let frameId: number | null = null;
    const onScroll = () => {
      if (frameId != null) return;
      frameId = requestAnimationFrame(() => {
        frameId = null;
        tabScrollPositions.current[activeTab] = scrollContainer.scrollTop;
      });
    };

    scrollContainer.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      scrollContainer.removeEventListener('scroll', onScroll);
      if (frameId != null) cancelAnimationFrame(frameId);
    };
  }, [activeTab]);

  // Presence heartbeat — fires every 60s so the server knows who's online and what tab they're viewing
  useEffect(() => {
    const id = setInterval(() => {
      trackClientEvent('Nav', 'heartbeat', { tab: activeTab });
    }, 60_000);
    // Fire immediately on mount so presence registers without waiting 60s
    trackClientEvent('Nav', 'heartbeat', { tab: activeTab });
    return () => clearInterval(id);
  }, [activeTab]);

  useEffect(() => {
    mattersHydrationRequestedForUserRef.current = null;
  }, [userData?.[0]?.Email, userData?.[0]?.EntraID]);

  useEffect(() => {
    if (activeTab !== 'matters') return;
    if (!onRefreshMatters) return;
    if (isHydratingMattersOnDemand) return;
    if ((matters || []).length > 0) return;

    const userKey = userData?.[0]?.Email || userData?.[0]?.EntraID || 'unknown';
    if (mattersHydrationRequestedForUserRef.current === userKey) {
      return;
    }
    mattersHydrationRequestedForUserRef.current = userKey;

    let cancelled = false;
    const shouldBlockOnHydration = !hasSeededMattersForTab;
    if (shouldBlockOnHydration) {
      setIsHydratingMattersOnDemand(true);
    }
    actionLog.start('Matters hydration');
    Promise.resolve(onRefreshMatters())
      .catch(() => {
        if (!cancelled) {
          mattersHydrationRequestedForUserRef.current = null;
          actionLog.warn('Matters hydration failed');
        }
      })
      .finally(() => {
        if (!cancelled) {
          actionLog.end('Matters hydration');
          if (shouldBlockOnHydration) {
            setIsHydratingMattersOnDemand(false);
          }
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab, matters, onRefreshMatters, isHydratingMattersOnDemand, userData, hasSeededMattersForTab]);

  // Stable callbacks for keep-alive children (avoids new closure per render)
  const handlePendingEnquiryHandled = useCallback(() => {
    setPendingEnquiryId(null);
    setPendingEnquirySubTab(null);
    setPendingEnquiryPitchScenario(null);
  }, []);
  const handlePendingMatterHandled = useCallback(() => {
    setPendingMatterId(null);
    setPendingShowCcl(false);
  }, []);

  const activateTab = useCallback((nextTab: string) => {
    // Phase 0 (UX Realtime Programme): measure tab-switch latency.
    // setActiveTab() must NOT be wrapped in startTransition (see /memories/repo/home-boot-performance.md).
    setActiveTab((prev) => {
      if (prev === nextTab) return prev;
      const handle = startInteraction('nav.tabSwitch', { from: prev, to: nextTab });
      // End on the next paint — closest signal to "user sees new tab" without DOM coupling.
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => requestAnimationFrame(() => handle.end()));
      } else {
        handle.end();
      }
      return nextTab;
    });
  }, []);

  // CCL deep-link: Teams autopilot card links here as
  //   ?tab=operations&cclMatter=<id>&autoReview=1
  // On mount, forward to the existing `openHomeCclReview` window event (handled
  // inside OperationsDashboard at L4213), navigate to Home, and strip the
  // query params so the URL doesn't keep triggering on back/forward.
  // See docs/notes/CCL_BACKEND_CHAIN_SILENT_AUTOPILOT_SERVICE.md Phase E.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const cclMatter = params.get('cclMatter');
    if (!cclMatter) return;
    const autoReview = params.get('autoReview') === '1';
    const autoRunAi = params.get('autoRunAi') === '1';
    activateTab('home');
    // Give OperationsDashboard a tick to mount its listener before dispatching.
    const t = setTimeout(() => {
      window.dispatchEvent(new CustomEvent('openHomeCclReview', {
        detail: {
          matterId: cclMatter,
          openInspector: autoReview,
          autoRunAi,
        },
      }));
    }, 400);
    // Strip query params so refreshes don't loop
    try {
      params.delete('cclMatter');
      params.delete('autoReview');
      params.delete('autoRunAi');
      const next = params.toString();
      const url = window.location.pathname + (next ? `?${next}` : '') + window.location.hash;
      window.history.replaceState(null, '', url);
    } catch {
      /* non-fatal */
    }
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAllMattersFetched = useCallback((fetchedMatters: Matter[]) => {
    setAllMattersFromHome(fetchedMatters);
  }, []);

  const warmMattersTab = useCallback(() => {
    void loadMattersTab();
    setMattersEverVisited(true);
  }, []);

  const warmTabByKey = useCallback((key: string) => {
    switch (key) {
      case 'home':
        void loadHomeTab();
        break;
      case 'enquiries':
        void loadEnquiriesTab();
        break;
      case 'instructions':
        void loadInstructionsTab();
        break;
      case 'matters':
        warmMattersTab();
        break;
      case 'reporting':
        void loadReportingTab();
        break;
      case 'roadmap':
        // Roadmap chunk is small but still benefits from prefetch on hover/pointerdown.
        void retryImport(() => import('../tabs/roadmap/Roadmap'));
        break;
      default:
        break;
    }
  }, [warmMattersTab]);

  const handleOutstandingBalancesFetched = useCallback((data: any) => {
    setOutstandingBalances(data);
  }, []);

  const handleTransactionsFetched = useCallback((fetchedTransactions: Transaction[]) => {
    setTransactions(fetchedTransactions);
  }, []);

  const handleBoardroomBookingsFetched = useCallback((data: BoardroomBooking[]) => {
    setBoardroomBookings(data);
  }, []);

  const handleSoundproofBookingsFetched = useCallback((data: SoundproofPodBooking[]) => {
    setSoundproofBookings(data);
  }, []);

  const handleNavigationRequestHandled = useCallback((requestedAt: number) => {
    setReportingNavigationRequest((current) => (
      current && current.requestedAt === requestedAt ? null : current
    ));
  }, []);

  const handleResourcesTabClick = () => {
    if (isResourcesModalOpen) {
      closeResourcesModal();
    } else {
      openResourcesModal();
    }
  };

  useEffect(() => {
    const closeLoadingScreen = () => {
      const loadingScreen = document.getElementById('loading-screen');
      if (loadingScreen) {
        loadingScreen.style.transition = 'opacity 0.3s';
        loadingScreen.style.opacity = '0';
        setTimeout(() => loadingScreen.remove(), 300);
      }
    };

    if (teamsContext && userData) {
      closeLoadingScreen();
    }
  }, [teamsContext, userData]);

  // Boot preheat: warm server cache for core reporting datasets on first load.
  // Only for admin users (Reports tab is admin-only) — avoids unnecessary server load for non-admin users.
  const bootPreheatFired = React.useRef(false);
  useEffect(() => {
    if (isLocalDev) return;
    if (bootPreheatFired.current || !userData?.[0]?.EntraID) return;
    if (!isAdminUser(userData[0])) return;
    bootPreheatFired.current = true;
    const timer = setTimeout(() => {
      fetch('/api/cache-preheater/preheat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          datasets: ['teamData', 'userData', 'enquiries', 'allMatters'],
          entraId: userData[0].EntraID,
        }),
      }).catch(() => { /* fire-and-forget */ });
    }, 20000); // 20s after boot — warm server caches once Home data has settled
    return () => clearTimeout(timer);
  }, [isLocalDev, userData]);

  // Listen for navigation events from child components
  useEffect(() => {
    const handleNavigateToInstructions = () => {
      actionLog('Navigate → enquiries', 'via navigateToInstructions');
      activateTab('enquiries');
    };
    const handleNavigateToEnquiries = () => {
      actionLog('Navigate → enquiries');
      activateTab('enquiries');
    };
    const handleNavigateToHome = () => {
      actionLog('Navigate → home');
      activateTab('home');
    };
    const handleNavigateToEnquiry = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      actionLog('Navigate → enquiry', detail?.enquiryId ? `#${detail.enquiryId}` : undefined);
      if (detail?.enquiryId) {
        setPendingEnquiryId(String(detail.enquiryId));
        if (detail.subTab) setPendingEnquirySubTab(detail.subTab);
        setPendingEnquiryPitchScenario(typeof detail.pitchScenario === 'string' ? detail.pitchScenario : null);
        if (detail.timelineItem) {
          try { localStorage.setItem('navigateToTimelineItem', detail.timelineItem); } catch {}
        }
      }
      activateTab('enquiries');
    };
    const handleNavigateToReporting = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const requestedView = detail?.view;
      actionLog('Navigate → reporting', requestedView || undefined);
      if (requestedView === 'logMonitor' || requestedView === 'dataCentre') {
        setReportingNavigationRequest({
          view: requestedView,
          requestedAt: Date.now(),
        });
      }
      activateTab('reporting');
    };
    const handleNavigateToMatter = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      actionLog('Navigate → matter', detail?.matterId || undefined);
      warmMattersTab();
      if (detail?.matterId) {
        setPendingMatterId(detail.matterId);
      }
      setPendingShowCcl(!!detail?.showCcl);
      activateTab('matters');
    };
    const handleNavigateToForms = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const requestedFormTitle = typeof detail?.formTitle === 'string' ? detail.formTitle : null;
      actionLog('Navigate → forms', requestedFormTitle || undefined);
      setPendingFormTitle(requestedFormTitle);
      activateTab('forms');
    };
    const handleWarmMattersTab = () => {
      warmMattersTab();
    };

    window.addEventListener('navigateToHome', handleNavigateToHome);
    window.addEventListener('navigateToInstructions', handleNavigateToInstructions);
    window.addEventListener('navigateToEnquiries', handleNavigateToEnquiries);
    window.addEventListener('navigateToEnquiry', handleNavigateToEnquiry);
    window.addEventListener('navigateToReporting', handleNavigateToReporting);
    window.addEventListener('navigateToMatter', handleNavigateToMatter);
    window.addEventListener('navigateToForms', handleNavigateToForms);
    window.addEventListener('warmMattersTab', handleWarmMattersTab);

    return () => {
      window.removeEventListener('navigateToHome', handleNavigateToHome);
      window.removeEventListener('navigateToInstructions', handleNavigateToInstructions);
      window.removeEventListener('navigateToEnquiries', handleNavigateToEnquiries);
      window.removeEventListener('navigateToEnquiry', handleNavigateToEnquiry);
      window.removeEventListener('navigateToReporting', handleNavigateToReporting);
      window.removeEventListener('navigateToMatter', handleNavigateToMatter);
      window.removeEventListener('navigateToForms', handleNavigateToForms);
      window.removeEventListener('warmMattersTab', handleWarmMattersTab);
    };
  }, [activateTab, warmMattersTab]);

  // State to trigger instruction data refresh
  const [instructionRefreshTrigger, setInstructionRefreshTrigger] = useState<number>(0);

  // Listen for instruction data refresh requests from Instructions component
  useEffect(() => {
    const handleRefreshInstructionData = () => {
      // Clear existing data to force re-fetch
      setInstructionData([]);
      setAllInstructionData([]);
      // Trigger re-fetch by incrementing counter
      setInstructionRefreshTrigger(prev => prev + 1);
    };

    window.addEventListener('refreshInstructionData', handleRefreshInstructionData);
    return () => {
      window.removeEventListener('refreshInstructionData', handleRefreshInstructionData);
    };
  }, []);

  const dispatchDemoModeActivation = useCallback(() => {
    // Fire the enquiry-injection cue first so Enquiries.tsx seeds demo rows.
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('selectTestEnquiry'));
    }, 100);
    // Follow with the realtime-pulse wave so every wired Home tile gets a
    // visible "new event landed" cue instead of silently re-rendering with
    // the injected demo rows already present. Staggered ~120ms per tile inside
    // the Home handler — here we just fire the trigger once.
    setTimeout(() => {
      try { window.dispatchEvent(new CustomEvent('demoRealtimePulse')); } catch { /* ignore */ }
      // Also flag the canonical change channels so freshness indicators
      // (fresh-id sets, tile pulses) treat the demo entries as inbound rather
      // than baseline.
      try { window.dispatchEvent(new CustomEvent('helix:enquiriesChanged')); } catch { /* ignore */ }
      try { window.dispatchEvent(new CustomEvent('helix:mattersChanged')); } catch { /* ignore */ }
      try { window.dispatchEvent(new CustomEvent('helix:outstandingBalancesChanged')); } catch { /* ignore */ }
      try { window.dispatchEvent(new CustomEvent('helix:opsQueueChanged')); } catch { /* ignore */ }
    }, 200);
  }, []);

  // Handler to enable demo mode (adds a stable demo enquiry for demos/testing)
  const handleShowTestEnquiry = useCallback(() => {
    // Persist demo mode across sessions on this device
    try {
      localStorage.setItem('demoModeEnabled', 'true');
    } catch {
      // ignore storage errors (e.g., restricted environments)
    }
    setDemoModeEnabled(true);
    // If already on Enquiries, dispatch immediately; otherwise wait until user visits
    if (activeTab === 'enquiries') {
      dispatchDemoModeActivation();
      return;
    }
    setPendingDemoMode(true);
  }, [activeTab, dispatchDemoModeActivation]);

  const handleToggleDemoMode = useCallback(
    (enabled: boolean) => {
      if (enabled) {
        handleShowTestEnquiry();
        return;
      }
      setPendingDemoMode(false);
      setDemoModeEnabled(false);
      try {
        localStorage.setItem('demoModeEnabled', 'false');
      } catch {
        // ignore storage errors
      }
    },
    [handleShowTestEnquiry]
  );

  const handleOpenDemoMatter = useCallback((showCcl = false) => {
    setPendingMatterId('DEMO-3311402');
    setPendingShowCcl(showCcl);
    activateTab('matters');
  }, [activateTab]);

  useEffect(() => {
    if (!pendingDemoMode || activeTab !== 'enquiries') {
      return;
    }
    setPendingDemoMode(false);
    dispatchDemoModeActivation();
  }, [pendingDemoMode, activeTab, dispatchDemoModeActivation]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === 'demoModeEnabled') {
        setDemoModeEnabled(event.newValue === 'true');
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  // Determine the current user's initials
  const userInitials = userData?.[0]?.Initials?.toUpperCase() || '';

  // Ref-based guard: track whether instruction data has been fetched to avoid re-triggering the effect
  const instructionDataFetchedRef = React.useRef(false);
  // Reset the ref when the refresh trigger increments (user explicitly requested re-fetch)
  React.useEffect(() => {
    instructionDataFetchedRef.current = false;
  }, [instructionRefreshTrigger]);

  // ── Pipeline realtime subscription ──
  // Listen for pipeline.changed SSE events and patch instructionData in-place.
  React.useEffect(() => {
    if (!subscribeToPipelineStream) return;

    const unsubscribe = subscribeToPipelineStream((event) => {
      const { entityId, field, status, eventType, data } = event;
      if (!entityId) return;

      // Helper: patch a matching InstructionData entry (by InstructionRef in instructions[])
      const patchInstructionState = (setter: React.Dispatch<React.SetStateAction<InstructionData[]>>) => {
        setter(prev => {
          if (!prev || prev.length === 0) return prev;
          let changed = false;
          const next = prev.map(prospect => {
            const matchesProspect = prospect.instructions?.some(
              (inst: any) => inst.InstructionRef === entityId
            );
            if (!matchesProspect) return prospect;

            changed = true;
            // Deep-patch based on event type
            if (field === 'matter' && (eventType === 'matter.opened')) {
              const matterData = data || {};
              const existingMatters = prospect.matters || [];
              // Idempotent: skip if matter with same displayNumber or clioMatterId already exists
              const mdn = (matterData as any).displayNumber || (matterData as any).display_number;
              const mcid = (matterData as any).clioMatterId;
              const alreadyExists = existingMatters.some((m: any) =>
                (mdn && (m.displayNumber === mdn || m.display_number === mdn)) ||
                (mcid && m.clioMatterId === mcid)
              );
              return {
                ...prospect,
                matters: alreadyExists ? existingMatters : [...existingMatters, matterData],
                instructions: prospect.instructions?.map((inst: any) =>
                  inst.InstructionRef === entityId
                    ? { ...inst, MatterOpened: true, MatterStatus: status, ...(mdn ? { DisplayNumber: mdn } : {}) }
                    : inst
                ),
              };
            }

            if (field === 'payment') {
              return {
                ...prospect,
                instructions: prospect.instructions?.map((inst: any) =>
                  inst.InstructionRef === entityId
                    ? { ...inst, PaymentStatus: status, PaymentCompleted: status === 'paid' }
                    : inst
                ),
              };
            }

            if (field === 'risk') {
              const riskData = data || {};
              const existingRisks = prospect.riskAssessments || [];
              // Idempotent: skip if risk assessment for same entityId already exists
              const alreadyExists = existingRisks.some((r: any) =>
                r.InstructionRef === entityId || r.MatterId === entityId
              );
              return {
                ...prospect,
                riskAssessments: alreadyExists ? existingRisks : [...existingRisks, riskData],
                instructions: prospect.instructions?.map((inst: any) =>
                  inst.InstructionRef === entityId
                    ? { ...inst, RiskAssessed: true, RiskAssessmentResult: (riskData as any).result || (riskData as any).riskAssessmentResult || status }
                    : inst
                ),
              };
            }

            if (field === 'id_verification') {
              const idData = data || {};
              const existingEidChecks = prospect.electronicIDChecks || [];
              const existingIdVerifs = prospect.idVerifications || [];
              // Idempotent: skip if ID check for same entityId already exists
              const alreadyExists = existingEidChecks.some((c: any) =>
                c.InstructionRef === entityId || c.entityId === entityId
              );
              return {
                ...prospect,
                electronicIDChecks: alreadyExists ? existingEidChecks : [...existingEidChecks, idData],
                idVerifications: alreadyExists ? existingIdVerifs : [...existingIdVerifs, idData],
                instructions: prospect.instructions?.map((inst: any) =>
                  inst.InstructionRef === entityId
                    ? { ...inst, IdVerified: true }
                    : inst
                ),
              };
            }

            if (field === 'instruction') {
              return {
                ...prospect,
                instructions: prospect.instructions?.map((inst: any) =>
                  inst.InstructionRef === entityId
                    ? { ...inst, Stage: status === 'completed' ? 'Instructed' : (status || inst.Stage) }
                    : inst
                ),
              };
            }

            if (field === 'deal') {
              const dealData = data || {};
              const existingDeals = prospect.deals || [];
              // Idempotent: skip if deal with same dealId already exists
              const did = (dealData as any).dealId;
              const alreadyExists = did && existingDeals.some((d: any) => d.dealId === did);
              return {
                ...prospect,
                deals: alreadyExists ? existingDeals : [...existingDeals, dealData],
              };
            }

            // Generic fallback — mark something changed so downstream can re-render
            return { ...prospect };
          });
          return changed ? next : prev;
        });
      };

      // Patch both user-scoped and all-data views
      patchInstructionState(setInstructionData);
      patchInstructionState(setAllInstructionData);
    });

    return unsubscribe;
  }, [subscribeToPipelineStream]);

  // Fetch instruction data when Instructions or Enquiries tab is active.
  // Enquiries needs workbench data (instruction/EID/payment/risk/matter) for pipeline chips.
  useEffect(() => {
    const currentUser = userData?.[0] || null;

    if (activeTab !== 'instructions' && activeTab !== 'enquiries') {
      return;
    }

    // Skip fetch if data already loaded (ref-based to avoid re-trigger on state change)
    if (instructionDataFetchedRef.current) {
      return;
    }

    async function fetchInstructionData() {
      actionLog.start('Instructions fetch');
      const pilotUsers = ["AC", "JW", "KW", "BL", "LZ"];
      // Use the actual user's initials for filtering, not LZ's
      const targetInitials = userInitials;
      const isAdmin = isAdminUser(currentUser);

      if (useLocalData) {
        const {
          instructionData: localInstructionData,
          rawIdVerifications,
          poidData: localPoidData,
        } = await loadLocalInstructionFixtures();

        setInitialLocalPoidCount(localPoidData.length);
        setPoidData((current) => (current.length > 0 ? current : localPoidData));

        // Merge local instruction data with ID verification data
        const instructionsWithIdVerifications = (localInstructionData as InstructionData[]).map(prospect => ({
          ...prospect,
          // Add ID verifications to prospect level
          idVerifications: rawIdVerifications.filter(
            (idv: any) => prospect.instructions?.some((inst: any) => inst.InstructionRef === idv.InstructionRef)
          ),
          // Also add to instructions level for easier access
          instructions: prospect.instructions?.map(inst => ({
            ...inst,
            idVerifications: rawIdVerifications.filter(
              (idv: any) => idv.InstructionRef === inst.InstructionRef
            )
          }))
        }));
        
        setInstructionData(instructionsWithIdVerifications);
        // Populate allInstructionData for all users to support Mine/All toggle
        setAllInstructionData(instructionsWithIdVerifications);
        instructionDataFetchedRef.current = true;
        return;
      }

      try {

        
  // Call unified server endpoint - always request all data for Mine/All toggle.
  // Do NOT send initials here to avoid server-side filtering which breaks the All toggle.
  const params = new URLSearchParams();
  params.append('includeAll', 'true');
  const url = `/api/instructions?${params.toString()}`;

        
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }
        
        const data = await res.json();


        // Debug: Check if Luke Test instruction is in the response

        const lukeTest = data.instructions?.find((i: any) => i.InstructionRef?.includes('27367-94842'));

        
        // Backend now returns all items (instructions + deals) in the instructions array
        // Transform each item into our frontend format
        const transformedData: InstructionData[] = data.instructions.map((item: any) => {
          // Check if this is a real instruction or a standalone deal
          const isRealInstruction = item.isRealInstruction !== false;
          
          if (isRealInstruction) {
            // This is a real instruction with embedded deal data
            return {
              prospectId: item.InstructionRef, // Use instruction ref as prospect ID
              instructions: [item], // Single instruction
              deals: item.deal ? [item.deal] : [], // Nested deal if exists
              documents: item.documents || [], // Nested documents
              idVerifications: item.idVerifications || [], // Nested ID verifications
              electronicIDChecks: item.idVerifications || [], // Alias for compatibility
              riskAssessments: item.riskAssessments || [], // Nested risk assessments
              compliance: item.riskAssessments || [], // Alias for compatibility
              jointClients: item.deal?.jointClients || [], // Joint clients from nested deal
              matters: item.matters || [], // Nested matters if any
              payments: item.payments || [], // Add payments data from instruction
              
              // Add computed properties for UI
              verificationStatus: (item.idVerifications?.length || 0) > 0 ? 'completed' : 'pending',
              riskStatus: (item.riskAssessments?.length || 0) > 0 ? 'assessed' : 'pending',
              nextAction: item.Stage || 'review',
              matterLinked: !!item.MatterId,
              paymentCompleted: item.InternalStatus === 'paid',
              documentCount: item.documents?.length || 0
            };
          } else {
            // This is a standalone deal (pitched deal without instruction)
            const deal = item.deal || item; // Deal data might be nested or at root level
            return {
              prospectId: item.InstructionRef || `deal-${deal.DealId}`, // Use instruction ref or deal ID
              instructions: [], // No instruction yet for pitched deals
              deals: [deal], // Single deal
              documents: deal.documents || [],
              idVerifications: [],
              electronicIDChecks: [],
              riskAssessments: [],
              compliance: [],
              jointClients: deal.jointClients || [],
              matters: [],
              
              // Add computed properties for UI
              verificationStatus: 'pending',
              riskStatus: 'pending',
              nextAction: deal.Status || 'pitched',
              matterLinked: false,
              paymentCompleted: false,
              documentCount: deal.documents?.length || 0
            };
          }
        });

        // Filter user-specific instructions for the main instructionData
        const userFilteredData = transformedData.filter(item => {
          // For real instructions, check if user is assigned
          if (item.instructions.length > 0) {
            return item.instructions.some((inst: any) => 
              inst.HelixContact === targetInitials || 
              inst.assignedTo === targetInitials
            );
          }
          // For pitched deals, check PitchedBy, assignee, or POC
          return item.deals.some((deal: any) => 
            deal.PitchedBy === targetInitials ||
            deal.assignedTo === targetInitials || 
            deal.poc === targetInitials
          );
        });

        // Set filtered data for the user's personal view
        setInstructionData(prev => instructionDataEqual(prev, userFilteredData) ? prev : userFilteredData);
        
        // Debug: Check what was actually set

        const instructionsCount = transformedData.filter(item => item.instructions.length > 0).length;
        const pitchedDealsCount = transformedData.filter(item => item.instructions.length === 0).length;


        const lukeTransformed = transformedData.find(item => 
          item.instructions?.[0]?.InstructionRef?.includes('27367-94842') ||
          String(item.prospectId)?.includes('27367-94842')
        );

        
        // Populate allInstructionData for all users to support Mine/All toggle
        setAllInstructionData(prev => instructionDataEqual(prev, transformedData) ? prev : transformedData);
        instructionDataFetchedRef.current = true;
        actionLog.end('Instructions fetch', `${transformedData.length} items`);


      } catch (err) {
        actionLog.warn('Instructions fetch failed', String(err));
        console.error("❌ Error fetching instruction data from unified endpoint:", err);
        
        // Fallback: try the legacy endpoint as backup

        const path = process.env.REACT_APP_GET_INSTRUCTION_DATA_PATH;
        const code = process.env.REACT_APP_GET_INSTRUCTION_DATA_CODE;
        if (path && code) {
          try {
            const url = `${proxyBaseUrl}/${path}?code=${code}`;
            const res = await fetch(url);
            if (res.ok) {
              const data = await res.json();
              const all = Array.isArray(data) ? data : [data];
              
              // Populate allInstructionData for all users to support Mine/All toggle
              setAllInstructionData(prev => instructionDataEqual(prev, all) ? prev : all);
              
              const filtered = all.reduce<InstructionData[]>((acc, prospect) => {
                const instructions = (prospect.instructions ?? []).filter(
                  (inst: any) => inst.HelixContact === targetInitials,
                );
                if (instructions.length > 0) {
                  const refSet = new Set(
                    instructions.map((i: any) => i.InstructionRef),
                  );
                  acc.push({
                    ...prospect,
                    instructions,
                    deals: (prospect.deals ?? []).filter((d: any) =>
                      refSet.has(d.InstructionRef),
                    ),
                  });
                }
                return acc;
              }, []);
              setInstructionData(filtered);
              instructionDataFetchedRef.current = true;

            } else {
              console.error("Failed to fetch instructions from legacy endpoint");
            }
          } catch (legacyErr) {
            console.error("Legacy endpoint error:", legacyErr);
          }
        } else {
          console.error("Missing env variables for legacy instruction data endpoint");
        }
      }
    }

    if (userInitials) {
      fetchInstructionData();
    }
  }, [activeTab, userInitials, userData, instructionRefreshTrigger, useLocalData]);

  // Tabs visible to all users start with the Enquiries tab.
  // Only show the Reports tab to admins.
  const tabs: Tab[] = useMemo(() => {
    const isAdmin = isAdminUser(currentUser);
    const showReportsTab = isAdmin;

    return [
      { key: 'enquiries', text: 'Prospects' },
      { key: 'matters', text: 'Matters' },
      { key: 'forms', text: 'Forms' },
      { key: 'resources', text: 'Resources', disabled: true },
      ...(showActivityTab ? [{ key: 'roadmap', text: 'Activity' }] : []),
      ...(showReportsTab ? [{ key: 'reporting', text: 'Reports' }] : []),
    ];
  }, [currentUser, showActivityTab]);

  // Ensure the active tab is still valid when tabs change (e.g., when switching users)
  // If current tab is no longer available, redirect to home instead of breaking navigation
  useEffect(() => {
    const validTabKeys = tabs.map(tab => tab.key);
    const disabledTabKeys = tabs.filter(tab => tab.disabled).map(tab => tab.key);
    if (
      activeTab !== 'home' &&
      (!validTabKeys.includes(activeTab) || disabledTabKeys.includes(activeTab))
    ) {
      setActiveTab('home'); // Redirect to home if current tab is no longer valid or is disabled
    }
  }, [tabs, activeTab]);

  const { setContent } = useNavigatorActions();

  // Ensure Navigator content is cleared when navigating away from keep-alive tabs
  // to non-keep-alive tabs (Instructions, Matters, Reporting) which don't write content.
  React.useEffect(() => {
    if (activeTab !== 'home' && activeTab !== 'enquiries') {
      setContent(null);
    }
  }, [activeTab, setContent]);

  const dataReady = !!(teamsContext && userData);

  return (
    <NavigatorProvider>
      <EffectivePermissionsProvider>
      <ThemeProvider isDarkMode={isDarkMode || false}>
        <ToastProvider isDarkMode={isDarkMode} position="bottom-right">
        <div
          className="app-root"
          style={{
            backgroundColor: isDarkMode ? colours.dark.background : colours.light.background,
            height: '100vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            transition: 'background-color 0.15s ease',
          }}
        >
          <CustomTabs
            selectedKey={activeTab}
            onTabSelect={(key) => { actionLog(`Tab → ${key}`); trackClientEvent('Nav', 'tab-switch', { from: prevTabRef.current, to: key }); prevTabRef.current = key; activateTab(key); }}
            onTabWarm={warmTabByKey}
            onHomeClick={() => { actionLog('Tab → home'); trackClientEvent('Nav', 'tab-switch', { from: prevTabRef.current, to: 'home' }); prevTabRef.current = 'home'; activateTab('home'); }}
            tabs={tabs}
            ariaLabel="Main Navigation Tabs"
            user={userData?.[0]}
            onResourcesClick={handleResourcesTabClick}
            hasActiveMatter={hasActiveMatter}
            isInMatterOpeningWorkflow={isInMatterOpeningWorkflow}
            isLocalDev={isLocalDev}
            onAreaChange={onAreaChange}
            teamData={teamData as any}
            onUserChange={onUserChange}
            onReturnToAdmin={onReturnToAdmin}
            originalAdminUser={originalAdminUser}
            hasImmediateActions={hasImmediateActions}
            onRefreshEnquiries={onRefreshEnquiries}
            onRefreshMatters={onRefreshMatters}
            featureToggles={featureToggles}
            onShowTestEnquiry={handleShowTestEnquiry}
            demoModeEnabled={demoModeEnabled}
            onToggleDemoMode={handleToggleDemoMode}
          />
          {/* Thin loading bar — visible only while boot data is still arriving */}
          {!dataReady && (
            <div style={{
              height: 2,
              background: `linear-gradient(90deg, transparent 0%, ${isDarkMode ? colours.accent : colours.highlight} 50%, transparent 100%)`,
              backgroundSize: '200% 100%',
              animation: 'helix-shimmer 1.5s ease-in-out infinite',
              flexShrink: 0,
            }} />
          )}
          <style>{`@keyframes helix-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>

          <ResourcesModal
            isOpen={isResourcesModalOpen}
            onDismiss={closeResourcesModal}
            userData={userData}
            teamData={teamData}
            demoModeEnabled={demoModeEnabled}
            isLocalDev={isLocalDev}
            viewAsProd={Boolean(featureToggles?.viewAsProd)}
          />
          
          {!demoModeEnabled && (
            <MaintenanceNotice
              state={serviceHealth}
              isDarkMode={Boolean(isDarkMode)}
              onDismiss={dismissMaintenance}
            />
          )}
          
          <div className="app-scroll-region">
            {/* Navigator + Immediate Actions — inside scroll region so they
                scroll away naturally with the content. Hidden on non-home tabs. */}
            <div ref={navigatorChromeRef} className="app-navigator">
              <Navigator />
            </div>
            <div ref={actionsWrapperRef}>
              <div
                id="app-level-immediate-actions"
                className="immediate-actions-portal"
              />
            </div>

            {/* Render tabs immediately. Each tab handles its own loading
                states and skeletons internally; the thin top shimmer bar
                (rendered above while `!dataReady`) is the only global
                progress cue. Never hide the entire content area behind a
                loader — stale or partial data is more useful than a void. */}
            <>
            {/* Keep-alive: Home always mounted, visibility toggled */}
            <div style={{ display: activeTab === 'home' ? undefined : 'none' }}>
              <Suspense fallback={<ThemedSuspenseFallback />}>
                <TabMountMeter name="home">
                <Home
                  context={teamsContext}
                  userData={userData}
                  enquiries={enquiries}
                  enquiriesUsingSnapshot={enquiriesUsingSnapshot}
                  enquiriesLiveRefreshInFlight={enquiriesLiveRefreshInFlight}
                  enquiriesLastLiveSyncAt={enquiriesLastLiveSyncAt}
                  isActive={activeTab === 'home'}
                  matters={matters}
                  instructionData={instructionData}
                  onAllMattersFetched={handleAllMattersFetched}
                  onOutstandingBalancesFetched={handleOutstandingBalancesFetched}
                  onTransactionsFetched={handleTransactionsFetched}
                  onBoardroomBookingsFetched={handleBoardroomBookingsFetched}
                  onSoundproofBookingsFetched={handleSoundproofBookingsFetched}
                  teamData={teamData}
                  isInMatterOpeningWorkflow={isInMatterOpeningWorkflow}
                  onImmediateActionsChange={setHasImmediateActions}
                  originalAdminUser={originalAdminUser}
                  featureToggles={homeFeatureToggles}
                  onFeatureToggle={handleFeatureToggle}
                  demoModeEnabled={demoModeEnabled}
                />
                </TabMountMeter>
              </Suspense>
            </div>
            {/* Keep-alive: Enquiries mounted once visited, then kept alive */}
            {enquiriesEverVisited && (
              <div style={{ display: activeTab === 'enquiries' ? undefined : 'none' }}>
                <Suspense fallback={<ThemedSuspenseFallback />}>
                  <TabMountMeter name="enquiries">
                  <Enquiries
                    context={teamsContext}
                    userData={userData}
                    enquiries={enquiries}
                    enquiriesUsingSnapshot={enquiriesUsingSnapshot}
                    enquiriesLiveRefreshInFlight={enquiriesLiveRefreshInFlight}
                    enquiriesLastLiveSyncAt={enquiriesLastLiveSyncAt}
                    teamData={teamData}
                    prefetchedTeamWideEnquiries={teamWideEnquiries}
                    poidData={poidData}
                    setPoidData={setPoidData}
                    onRefreshEnquiries={onRefreshEnquiries}
                    onOptimisticClaim={onOptimisticClaim}
                    subscribeToEnquiryStream={subscribeToEnquiryStream}
                    instructionData={allInstructionData}
                    featureToggles={featureToggles}
                    originalAdminUser={originalAdminUser}
                    demoModeEnabled={demoModeEnabled}
                    isActive={activeTab === 'enquiries'}
                    onTeamWideEnquiriesLoaded={setTeamWideEnquiries}
                    pendingEnquiryId={pendingEnquiryId}
                    pendingEnquirySubTab={pendingEnquirySubTab}
                    pendingEnquiryPitchScenario={pendingEnquiryPitchScenario}
                    onPendingEnquiryHandled={handlePendingEnquiryHandled}
                  />
                  </TabMountMeter>
                </Suspense>
              </div>
            )}
            {/* Keep-alive: Matters mounted once visited, then kept alive */}
            {mattersEverVisited && (
              <div style={{ display: activeTab === 'matters' ? undefined : 'none' }}>
                <Suspense fallback={<ThemedSuspenseFallback />}>
                  <TabMountMeter name="matters">
                  <Matters
                    matters={seededMattersForTab}
                    isLoading={isLoading || (!hasSeededMattersForTab && isHydratingMattersOnDemand)}
                    error={error}
                    userData={userData}
                    isActive={activeTab === 'matters'}
                    teamData={teamData}
                    enquiries={enquiriesForMatters}
                    workbenchByInstructionRef={workbenchByInstructionRef}
                    pendingMatterId={pendingMatterId}
                    pendingShowCcl={pendingShowCcl}
                    onPendingMatterHandled={handlePendingMatterHandled}
                    demoModeEnabled={demoModeEnabled}
                  />
                  </TabMountMeter>
                </Suspense>
              </div>
            )}
            {activeTab === 'instructions' && (
              <Suspense fallback={<ThemedSuspenseFallback />}>
                <TabMountMeter name="instructions">
                <Instructions
                  userInitials={userInitials}
                  instructionData={instructionData}
                  setInstructionData={setInstructionData}
                  allInstructionData={allInstructionData}
                  teamData={teamData}
                  userData={userData}
                  matters={mattersForInstructions}
                  hasActiveMatter={hasActiveMatter}
                  setIsInMatterOpeningWorkflow={setIsInMatterOpeningWorkflow}
                  poidData={poidData}
                  setPoidData={setPoidData}
                  enquiries={enquiries}
                  featureToggles={featureToggles}
                  demoModeEnabled={demoModeEnabled}
                />
                </TabMountMeter>
              </Suspense>
            )}
            {activeTab === 'forms' && (
              <TabMountMeter name="forms">
              <FormsHub
                initialFormTitle={pendingFormTitle}
                isOpen={activeTab === 'forms'}
                matters={matters || []}
                onDismiss={() => {
                  setPendingFormTitle(null);
                  activateTab('home');
                }}
                onInitialFormHandled={() => setPendingFormTitle(null)}
                teamData={teamData}
                userData={userData}
              />
              </TabMountMeter>
            )}
            {/* Reporting: admin-only, mount/unmount is fine */}
            {activeTab === 'reporting' && (
              <Suspense fallback={<ThemedSuspenseFallback />}>
                <TabMountMeter name="reporting">
                <ReportingHome
                  userData={userData}
                  teamData={teamData}
                  demoModeEnabled={demoModeEnabled}
                  featureToggles={featureToggles}
                  navigationRequest={reportingNavigationRequest}
                  onNavigationRequestHandled={handleNavigationRequestHandled}
                />
                </TabMountMeter>
              </Suspense>
            )}
            {activeTab === 'roadmap' && (
              <Suspense fallback={<ThemedSuspenseFallback />}>
                <TabMountMeter name="roadmap">
                <Roadmap userData={userData} showBootMonitor={isLocalDev && !isProductionPreview} isLocalDev={isLocalDev} />
                </TabMountMeter>
              </Suspense>
            )}
            </>
          </div>
        </div>
        {dataReady && (isLocalDev || canSeePrivateHubControls(userData[0] || null) || canSeePrivateHubControls(originalAdminUser || null)) && (
          <HubToolsChip
            user={userData[0] || { First: 'Local', Last: 'Dev', Initials: 'LD', AOW: 'Commercial, Construction, Property, Employment, Misc/Other', Email: 'local@dev.com' }}
            isLocalDev={isLocalDev}
            bottomOffset={(!demoModeEnabled && serviceHealth.isUnavailable) ? 72 : 18}
            availableUsers={teamData as UserData[] || undefined}
            onUserChange={onUserChange}
            onReturnToAdmin={onReturnToAdmin}
            originalAdminUser={originalAdminUser}
            onRefreshEnquiries={onRefreshEnquiries}
            onRefreshMatters={onRefreshMatters}
            onFeatureToggle={handleFeatureToggle}
            featureToggles={featureToggles}
            demoModeEnabled={demoModeEnabled}
            onToggleDemoMode={handleToggleDemoMode}
            enquiriesUsingSnapshot={enquiriesUsingSnapshot}
            enquiriesLiveRefreshInFlight={enquiriesLiveRefreshInFlight}
            enquiriesLastLiveSyncAt={enquiriesLastLiveSyncAt}
            onOpenDemoMatter={handleOpenDemoMatter}
          />
        )}
        {/* UX Realtime Programme — Phase 0: dev-only latency overlay (LZ/AC + ?ux-debug=1). */}
        <DebugLatencyOverlay
          enabled={dataReady && (isLocalDev || canSeePrivateHubControls(userData[0] || null) || canSeePrivateHubControls(originalAdminUser || null))}
          bottomOffset={(!demoModeEnabled && serviceHealth.isUnavailable) ? 132 : 78}
        />
        </ToastProvider>
      </ThemeProvider>
      </EffectivePermissionsProvider>
    </NavigatorProvider>
  );
};

export default App;