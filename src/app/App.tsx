import React, { useState, useEffect, useLayoutEffect, lazy, Suspense, useMemo, useCallback } from 'react';
import CustomTabs from './styles/CustomTabs';
import './styles/index.css';
import './styles/ImmediateActionsPortal.css';
import { ThemeProvider, useTheme } from './functionality/ThemeContext';
import Navigator from '../components/Navigator';
import { useNavigatorActions } from './functionality/NavigatorContext';
import FormsModal from '../components/FormsModal';
import ResourcesModal from '../components/ResourcesModal';
import { NavigatorProvider } from './functionality/NavigatorContext';
import { ToastProvider } from '../components/feedback/ToastProvider';
import { colours } from './styles/colours';
import { app } from '@microsoft/teams-js';
import { Matter, UserData, Enquiry, Tab, TeamData, POID, Transaction, BoardroomBooking, SoundproofPodBooking, InstructionData, NormalizedMatter } from './functionality/types';
import { hasActiveMatterOpening } from './functionality/matterOpeningUtils';
import { normalizeMatterData } from '../utils/matterNormalization';
import { getProxyBaseUrl } from '../utils/getProxyBaseUrl';
import { ADMIN_USERS, isAdminUser, canSeePrivateHubControls } from './admin';
import HubToolsChip from '../components/HubToolsChip';
import MaintenanceNotice from './MaintenanceNotice';
import { useServiceHealthMonitor } from './functionality/useServiceHealthMonitor';

const proxyBaseUrl = getProxyBaseUrl();

const loadHomeTab = () => import('../tabs/home/Home');
const loadEnquiriesTab = () => import('../tabs/enquiries/Enquiries');
const loadInstructionsTab = () => import('../tabs/instructions/Instructions');
const loadReportingTab = () => import('../tabs/Reporting/ReportingHome');
const Home = lazy(loadHomeTab);
const Enquiries = lazy(loadEnquiriesTab);
const Instructions = lazy(loadInstructionsTab);
const loadMattersTab = () => import('../tabs/matters/Matters');
const Matters = lazy(loadMattersTab);
const Roadmap = lazy(() => import('../tabs/roadmap/Roadmap'));
const ReportingHome = lazy(loadReportingTab); // Replace ReportingCode with ReportingHome

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
}

type ReportingNavigationView = 'logMonitor' | 'dataCentre';

interface ReportingNavigationRequest {
  view: ReportingNavigationView;
  requestedAt: number;
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
}) => {
  const [activeTab, setActiveTab] = useState('home');
  const [enquiriesEverVisited, setEnquiriesEverVisited] = useState(false);
  const [mattersEverVisited, setMattersEverVisited] = useState(false);
  const [instructionsEverVisited, setInstructionsEverVisited] = useState(false);
  const [pendingMatterId, setPendingMatterId] = useState<string | null>(null);
  const [pendingShowCcl, setPendingShowCcl] = useState(false);
  const [pendingEnquiryId, setPendingEnquiryId] = useState<string | null>(null);
  const [pendingEnquirySubTab, setPendingEnquirySubTab] = useState<string | null>(null);
  const [pendingEnquiryPitchScenario, setPendingEnquiryPitchScenario] = useState<string | null>(null);
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
  const persistedTheme = useMemo(() => {
    try {
      return typeof window !== 'undefined' ? window.localStorage.getItem('helix_theme') : null;
    } catch {
      return null;
    }
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

  // Use ThemeContext inside fallback so it reflects user toggle immediately
  const ThemedSuspenseFallback: React.FC = () => {
    const { isDarkMode } = useTheme();
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 200,
          flex: 1,
        }}
      >
        <div style={{ width: 120, height: 2, overflow: 'hidden', borderRadius: 0 }}>
          <div style={{
            height: '100%',
            background: `linear-gradient(90deg, transparent 0%, ${isDarkMode ? colours.accent : colours.highlight} 50%, transparent 100%)`,
            backgroundSize: '200% 100%',
            animation: 'helix-shimmer 1.5s ease-in-out infinite',
          }} />
        </div>
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
  
  // Modal state management with mutual exclusivity
  const [isFormsModalOpen, setIsFormsModalOpen] = useState(false);
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
      return { rateChangeTracker: false, showPhasedOutCustomTab: false, showAttendance: true, cclGuideMode: false, showOpsQueue: true, showHomeOpsCclDates: false, ...parsed };
    } catch {
      return { rateChangeTracker: false, showPhasedOutCustomTab: false, showAttendance: true, cclGuideMode: false, showOpsQueue: true, showHomeOpsCclDates: false };
    }
  });

  const [teamWideEnquiries, setTeamWideEnquiries] = useState<Enquiry[] | null>(null);
  const mattersHydrationRequestedForUserRef = React.useRef<string | null>(null);
  // Scroll position map for keep-alive tabs
  const tabScrollPositions = React.useRef<Record<string, number>>({});
  // Scroll-driven collapse for ImmediateActionsBar
  const [actionsHidden, setActionsHidden] = React.useState(false);
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
  const showPhasedOutCustomTab = isLocalDev && !isProductionPreview && (featureToggles?.showPhasedOutCustomTab ?? false);
  const showRoadmapTab = isLocalDev && !isProductionPreview;
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

  useEffect(() => {
    if ((isLocalDev && !isProductionPreview) || !featureToggles?.showPhasedOutCustomTab) {
      return;
    }

    setFeatureToggles(prev => {
      if (!prev.showPhasedOutCustomTab) {
        return prev;
      }

      const next = { ...prev, showPhasedOutCustomTab: false };
      localStorage.setItem('featureToggles', JSON.stringify(next));
      return next;
    });
  }, [featureToggles?.showPhasedOutCustomTab, isLocalDev, isProductionPreview]);

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

  // Check for active matter opening every 2 seconds
  useEffect(() => {
    const checkActiveMatter = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }
      setHasActiveMatter(hasActiveMatterOpening(isInMatterOpeningWorkflow));
    };

    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }
      checkActiveMatter();
    };
    
    // Initial check
    checkActiveMatter();
    
    // Set up polling
    const interval = setInterval(checkActiveMatter, 2000);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }
    
    return () => {
      clearInterval(interval);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [isInMatterOpeningWorkflow]);

  // Modal handlers with mutual exclusivity
  const openFormsModal = () => {
    setIsResourcesModalOpen(false);
    setIsFormsModalOpen(true);
  };

  const openResourcesModal = () => {
    setIsFormsModalOpen(false);
    setIsResourcesModalOpen(true);
  };

  const closeFormsModal = () => {
    setIsFormsModalOpen(false);
  };

  const closeResourcesModal = () => {
    setIsResourcesModalOpen(false);
  };

  // Open modals when tabs are selected
  useEffect(() => {
    if (activeTab === 'forms') {
      openFormsModal();
    }
  }, [activeTab]);

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
    if (activeTab === 'instructions' && !instructionsEverVisited) {
      setInstructionsEverVisited(true);
    }
  }, [activeTab, enquiriesEverVisited, mattersEverVisited, instructionsEverVisited]);

  useEffect(() => {
    if (typeof window === 'undefined' || isLocalDev) return;
    if (!teamsContext || !userData?.[0]) return;

    let cancelled = false;
    const warmNavigationChunks = () => {
      if (cancelled) return;
      void loadEnquiriesTab();
      void loadInstructionsTab();
      void loadMattersTab();
      void loadReportingTab();
    };

    if ('requestIdleCallback' in window) {
      const idleId = (window as typeof window & {
        requestIdleCallback: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
      }).requestIdleCallback(() => warmNavigationChunks(), { timeout: 600 });

      return () => {
        cancelled = true;
        if ('cancelIdleCallback' in window) {
          (window as typeof window & { cancelIdleCallback: (id: number) => void }).cancelIdleCallback(idleId);
        }
      };
    }

    const timer = globalThis.setTimeout(() => warmNavigationChunks(), 350);
    return () => {
      cancelled = true;
      globalThis.clearTimeout(timer);
    };
  }, [isLocalDev, teamsContext, userData]);

  // Save scroll position for the active tab continuously + collapse ImmediateActions on scroll
  useEffect(() => {
    const scrollRegion = document.querySelector('.app-scroll-region') as HTMLElement | null;
    if (!scrollRegion) return;
    let ticking = false;
    const handleScroll = () => {
      tabScrollPositions.current[activeTab] = scrollRegion.scrollTop;
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(() => {
          const scrollY = scrollRegion.scrollTop;
          setActionsHidden(activeTab === 'home' && scrollY > 30);
          ticking = false;
        });
      }
    };
    // Reset on tab switch
    if (activeTab !== 'home') setActionsHidden(false);
    scrollRegion.addEventListener('scroll', handleScroll, { passive: true });
    return () => scrollRegion.removeEventListener('scroll', handleScroll);
  }, [activeTab]);

  // Restore scroll position when switching tabs (synchronous to prevent flash)
  useLayoutEffect(() => {
    const scrollRegion = document.querySelector('.app-scroll-region') as HTMLElement | null;
    if (!scrollRegion) return;
    scrollRegion.scrollTop = tabScrollPositions.current[activeTab] || 0;
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
    Promise.resolve(onRefreshMatters())
      .catch(() => {
        if (!cancelled) {
          mattersHydrationRequestedForUserRef.current = null;
        }
      })
      .finally(() => {
        if (!cancelled && shouldBlockOnHydration) {
          setIsHydratingMattersOnDemand(false);
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

  const handleAllMattersFetched = (fetchedMatters: Matter[]) => {
    setAllMattersFromHome(fetchedMatters);
  };

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
      default:
        break;
    }
  }, [warmMattersTab]);

  const handleOutstandingBalancesFetched = (data: any) => {
    setOutstandingBalances(data);
  };

  const handleTransactionsFetched = (fetchedTransactions: Transaction[]) => {
    setTransactions(fetchedTransactions);
  };

  const handleBoardroomBookingsFetched = (data: BoardroomBooking[]) => {
    setBoardroomBookings(data);
  };

  const handleSoundproofBookingsFetched = (data: SoundproofPodBooking[]) => {
    setSoundproofBookings(data);
  };

  const handleFormsTabClick = () => {
    if (isFormsModalOpen) {
      closeFormsModal();
    } else {
      openFormsModal();
    }
  };

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
      if (!showPhasedOutCustomTab) {
        setActiveTab('enquiries');
        return;
      }
      setActiveTab('instructions');
    };
    const handleNavigateToEnquiries = () => {
      setActiveTab('enquiries');
    };
    const handleNavigateToHome = () => {
      setActiveTab('home');
    };
    const handleNavigateToEnquiry = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.enquiryId) {
        setPendingEnquiryId(String(detail.enquiryId));
        if (detail.subTab) setPendingEnquirySubTab(detail.subTab);
        setPendingEnquiryPitchScenario(typeof detail.pitchScenario === 'string' ? detail.pitchScenario : null);
        if (detail.timelineItem) {
          try { localStorage.setItem('navigateToTimelineItem', detail.timelineItem); } catch {}
        }
      }
      setActiveTab('enquiries');
    };
    const handleNavigateToReporting = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const requestedView = detail?.view;
      if (requestedView === 'logMonitor' || requestedView === 'dataCentre') {
        setReportingNavigationRequest({
          view: requestedView,
          requestedAt: Date.now(),
        });
      }
      setActiveTab('reporting');
    };
    const handleNavigateToMatter = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      warmMattersTab();
      if (detail?.matterId) {
        setPendingMatterId(detail.matterId);
      }
      setPendingShowCcl(!!detail?.showCcl);
      setActiveTab('matters');
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
    window.addEventListener('warmMattersTab', handleWarmMattersTab);

    return () => {
      window.removeEventListener('navigateToHome', handleNavigateToHome);
      window.removeEventListener('navigateToInstructions', handleNavigateToInstructions);
      window.removeEventListener('navigateToEnquiries', handleNavigateToEnquiries);
      window.removeEventListener('navigateToEnquiry', handleNavigateToEnquiry);
      window.removeEventListener('navigateToReporting', handleNavigateToReporting);
      window.removeEventListener('navigateToMatter', handleNavigateToMatter);
      window.removeEventListener('warmMattersTab', handleWarmMattersTab);
    };
  }, [showPhasedOutCustomTab, warmMattersTab]);

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
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('selectTestEnquiry'));
    }, 100);
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
    setActiveTab('matters');
  }, []);

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

  // Fetch instruction data when Instructions or Enquiries tab is active.
  // Enquiries needs workbench data (instruction/EID/payment/risk/matter) for pipeline chips.
  useEffect(() => {
    const currentUser = userData?.[0] || null;

    if (activeTab !== 'instructions' && activeTab !== 'enquiries') {
      return;
    }

    // Skip fetch if data already loaded
    if (instructionData.length > 0 || allInstructionData.length > 0) {
      return;
    }

    async function fetchInstructionData() {
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
        setInstructionData(userFilteredData);
        
        // Debug: Check what was actually set

        const instructionsCount = transformedData.filter(item => item.instructions.length > 0).length;
        const pitchedDealsCount = transformedData.filter(item => item.instructions.length === 0).length;


        const lukeTransformed = transformedData.find(item => 
          item.instructions?.[0]?.InstructionRef?.includes('27367-94842') ||
          String(item.prospectId)?.includes('27367-94842')
        );

        
        // Populate allInstructionData for all users to support Mine/All toggle
        setAllInstructionData(transformedData);
        


      } catch (err) {
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
              setAllInstructionData(all);
              
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
  }, [activeTab, userInitials, userData, instructionData.length, allInstructionData.length, instructionRefreshTrigger, useLocalData]);

  // Tabs visible to all users start with the Enquiries tab.
  // Only show the Reports tab to admins.
  const tabs: Tab[] = useMemo(() => {
    const isAdmin = isAdminUser(currentUser);
    const showReportsTab = isAdmin;

    return [
      { key: 'enquiries', text: 'Prospects' },
      ...(showPhasedOutCustomTab ? [{ key: 'instructions', text: 'Custom (phased out)' }] : []),
      { key: 'matters', text: 'Matters' },
      { key: 'forms', text: 'Forms', disabled: true },
      { key: 'resources', text: 'Resources', disabled: true },
      ...(showRoadmapTab ? [{ key: 'roadmap', text: 'Roadmap' }] : []),
      ...(showReportsTab ? [{ key: 'reporting', text: 'Reports' }] : []),
    ];
  }, [currentUser, showPhasedOutCustomTab, showRoadmapTab]);

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
            onTabSelect={(key) => setActiveTab(key)}
            onTabWarm={warmTabByKey}
            onHomeClick={() => setActiveTab('home')}
            tabs={tabs}
            ariaLabel="Main Navigation Tabs"
            user={userData?.[0]}
            onFormsClick={handleFormsTabClick}
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
            onFeatureToggle={handleFeatureToggle}
            featureToggles={featureToggles}
            onShowTestEnquiry={handleShowTestEnquiry}
            demoModeEnabled={demoModeEnabled}
            onToggleDemoMode={handleToggleDemoMode}
          />
          {/* Thin loading bar — visible when boot data is still loading */}
          {(!enquiries || enquiries.length === 0) && !isLoading && (
            <div style={{
              height: 2,
              background: `linear-gradient(90deg, transparent 0%, ${colours.highlight} 50%, transparent 100%)`,
              backgroundSize: '200% 100%',
              animation: 'helix-shimmer 1.5s ease-in-out infinite',
              flexShrink: 0,
            }} />
          )}
          <style>{`@keyframes helix-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
          {/* Navigator + Immediate Actions — scroll-driven collapse on home tab */}
          <div
            className="app-navigator"
            style={{
              overflow: 'hidden',
              maxHeight: (activeTab === 'home' && actionsHidden) ? 0 : 200,
              opacity: (activeTab === 'home' && actionsHidden) ? 0 : 1,
              transition: 'opacity 180ms ease, max-height 220ms ease',
              transitionDelay: (activeTab === 'home' && actionsHidden) ? '0ms' : '120ms',
              pointerEvents: (activeTab === 'home' && actionsHidden) ? 'none' : undefined,
            } as React.CSSProperties}
          >
            <Navigator />
          </div>
          
          {/* App-level Immediate Actions Bar — always mounted, scroll-driven collapse */}
          <div
            id="app-level-immediate-actions"
            className="immediate-actions-portal"
            style={{
              position: 'relative',
              zIndex: 1,
              width: '100%',
              minHeight: (activeTab === 'home' && !actionsHidden) ? 56 : 0,
              maxHeight: (activeTab === 'home' && !actionsHidden) ? 200 : 0,
              minWidth: 0,
              boxSizing: 'border-box',
              color: 'inherit',
              overflow: 'hidden',
              opacity: (activeTab === 'home' && !actionsHidden) ? 1 : 0,
              pointerEvents: (activeTab === 'home' && !actionsHidden) ? undefined : 'none',
              transition: 'opacity 180ms ease, max-height 220ms ease, min-height 220ms ease',
              transitionDelay: (activeTab === 'home' && actionsHidden) ? '120ms' : '0ms',
            } as React.CSSProperties}
          />

          {/* Full-width Modal Overlays */}
          <FormsModal
            userData={userData}
            teamData={teamData}
            matters={matters || []}
            isOpen={isFormsModalOpen}
            onDismiss={closeFormsModal}
          />
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
            {!dataReady ? (
              /* Shell-first boot: tabs are visible, content area shows a shimmer bar */
              <div style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 200,
              }}>
                <div style={{ width: 120, height: 2, overflow: 'hidden', borderRadius: 0 }}>
                  <div style={{
                    height: '100%',
                    background: `linear-gradient(90deg, transparent 0%, ${isDarkMode ? colours.accent : colours.highlight} 50%, transparent 100%)`,
                    backgroundSize: '200% 100%',
                    animation: 'helix-shimmer 1.5s ease-in-out infinite',
                  }} />
                </div>
              </div>
            ) : (
            <>
            {/* Keep-alive: Home always mounted, visibility toggled */}
            <div style={{ display: activeTab === 'home' ? undefined : 'none' }}>
              <Suspense fallback={<ThemedSuspenseFallback />}>
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
                  demoModeEnabled={demoModeEnabled}
                />
              </Suspense>
            </div>
            {/* Keep-alive: Enquiries mounted once visited, then kept alive */}
            {enquiriesEverVisited && (
              <div style={{ display: activeTab === 'enquiries' ? undefined : 'none' }}>
                <Suspense fallback={<ThemedSuspenseFallback />}>
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
                </Suspense>
              </div>
            )}
            {/* Keep-alive: Matters mounted once visited, then kept alive */}
            {mattersEverVisited && (
              <div style={{ display: activeTab === 'matters' ? undefined : 'none' }}>
                <Suspense fallback={<ThemedSuspenseFallback />}>
                  <Matters
                    matters={seededMattersForTab}
                    isLoading={isLoading || (!hasSeededMattersForTab && isHydratingMattersOnDemand)}
                    error={error}
                    userData={userData}
                    isActive={activeTab === 'matters'}
                    teamData={teamData}
                    enquiries={(teamWideEnquiries && teamWideEnquiries.length > 0) ? teamWideEnquiries : enquiries}
                    workbenchByInstructionRef={workbenchByInstructionRef}
                    pendingMatterId={pendingMatterId}
                    pendingShowCcl={pendingShowCcl}
                    onPendingMatterHandled={handlePendingMatterHandled}
                    demoModeEnabled={demoModeEnabled}
                  />
                </Suspense>
              </div>
            )}
            {/* Keep-alive: Instructions mounted once visited */}
            {instructionsEverVisited && (
              <div style={{ display: activeTab === 'instructions' ? undefined : 'none' }}>
                <Suspense fallback={<ThemedSuspenseFallback />}>
                  <Instructions
                    userInitials={userInitials}
                    instructionData={instructionData}
                    setInstructionData={setInstructionData}
                    allInstructionData={allInstructionData}
                    teamData={teamData}
                    userData={userData}
                    matters={allMattersFromHome || []}
                    hasActiveMatter={hasActiveMatter}
                    setIsInMatterOpeningWorkflow={setIsInMatterOpeningWorkflow}
                    poidData={poidData}
                    setPoidData={setPoidData}
                    enquiries={enquiries}
                    featureToggles={featureToggles}
                    demoModeEnabled={demoModeEnabled}
                  />
                </Suspense>
              </div>
            )}
            {/* Reporting: admin-only, mount/unmount is fine */}
            {activeTab === 'reporting' && (
              <Suspense fallback={<ThemedSuspenseFallback />}>
                <ReportingHome
                  userData={userData}
                  teamData={teamData}
                  demoModeEnabled={demoModeEnabled}
                  featureToggles={featureToggles}
                  navigationRequest={reportingNavigationRequest}
                  onNavigationRequestHandled={(requestedAt) => {
                    setReportingNavigationRequest((current) => (
                      current && current.requestedAt === requestedAt ? null : current
                    ));
                  }}
                />
              </Suspense>
            )}
            {activeTab === 'roadmap' && (
              <Suspense fallback={<ThemedSuspenseFallback />}>
                <Roadmap userData={userData} />
              </Suspense>
            )}
            </>
            )}
          </div>
        </div>
        {dataReady && (isLocalDev || canSeePrivateHubControls(userData[0] || null)) && (
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
        </ToastProvider>
      </ThemeProvider>
    </NavigatorProvider>
  );
};

export default App;