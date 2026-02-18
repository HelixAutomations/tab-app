import React, { useState, useEffect, lazy, Suspense, useMemo, useCallback } from 'react';
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
import localIdVerifications from '../localData/localIdVerifications.json';
import localInstructionData from '../localData/localInstructionData.json';
import { getProxyBaseUrl } from '../utils/getProxyBaseUrl';
import { ADMIN_USERS, isAdminUser, hasInstructionsAccess } from './admin';
import Loading from './styles/Loading';
import MaintenanceNotice from './MaintenanceNotice';
import { useServiceHealthMonitor } from './functionality/useServiceHealthMonitor';

const proxyBaseUrl = getProxyBaseUrl();

const Home = lazy(() => import('../tabs/home/Home'));
const Forms = lazy(() => import('../tabs/forms/Forms'));
const Enquiries = lazy(() => import('../tabs/enquiries/Enquiries'));
const Instructions = lazy(() => import('../tabs/instructions/Instructions'));
const Matters = lazy(() => import('../tabs/matters/Matters'));
const ReportingHome = lazy(() => import('../tabs/Reporting/ReportingHome')); // Replace ReportingCode with ReportingHome

interface AppProps {
  teamsContext: app.Context | null;
  userData: UserData[] | null;
  enquiries: Enquiry[] | null;
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
}

const App: React.FC<AppProps> = ({
  teamsContext,
  userData,
  enquiries,
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
}) => {
  const [activeTab, setActiveTab] = useState('home');
  const [pendingMatterId, setPendingMatterId] = useState<string | null>(null);
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
      const body = document.body;
      if (body) {
        body.style.backgroundColor = isDarkMode ? colours.websiteBlue : colours.light.background;
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
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          backgroundColor: isDarkMode ? colours.dark.background : colours.light.background,
          zIndex: 9999,
        }}
      >
        <Loading
          message="Loading content..."
          detailMessages={[
            'Fetching module data…',
            'Applying filters…',
            'Rendering components…',
            'Almost ready…',
          ]}
          isDarkMode={isDarkMode}
        />
      </div>
    );
  };
  const workspaceLoadingMessages = useMemo(
    () => [
      'Syncing Microsoft Teams context…',
      'Loading user profile…',
      'Retrieving matters and enquiries…',
      'Preparing dashboards…',
    ],
    [],
  );

  // Map and validate POID data from localIdVerifications
  const initialPoidData: POID[] = (localIdVerifications as any[])
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
      // Electronic ID verification fields
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
    .filter(poid =>
      poid &&
      poid.poid_id &&
      poid.first &&
      poid.last &&
      isNaN(Number(poid.first)) &&
      isNaN(Number(poid.last))
    );
  const [poidData, setPoidData] = useState<POID[]>(initialPoidData);
  const [instructionData, setInstructionData] = useState<InstructionData[]>([]);
  const [allInstructionData, setAllInstructionData] = useState<InstructionData[]>([]); // Admin: all users' instructions
  const [allMattersFromHome, setAllMattersFromHome] = useState<Matter[] | null>(null);
  const [outstandingBalances, setOutstandingBalances] = useState<any>(null);
  const [transactions, setTransactions] = useState<Transaction[] | undefined>(undefined);
  const [boardroomBookings, setBoardroomBookings] = useState<BoardroomBooking[] | null>(null);
  const [soundproofBookings, setSoundproofBookings] = useState<SoundproofPodBooking[] | null>(null);
  
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
      return { rateChangeTracker: false, ...parsed };
    } catch {
      return { rateChangeTracker: false };
    }
  });

  const [teamWideEnquiries, setTeamWideEnquiries] = useState<Enquiry[] | null>(null);
  
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
      setHasActiveMatter(hasActiveMatterOpening(isInMatterOpeningWorkflow));
    };
    
    // Initial check
    checkActiveMatter();
    
    // Set up polling
    const interval = setInterval(checkActiveMatter, 2000);
    
    return () => clearInterval(interval);
  }, [isInMatterOpeningWorkflow]);

  // Modal handlers with mutual exclusivity
  const openFormsModal = () => {
    setIsResourcesModalOpen(false); // Close resources modal first
    setIsFormsModalOpen(true);
  };

  const openResourcesModal = () => {
    setIsFormsModalOpen(false); // Close forms modal first
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

  const handleAllMattersFetched = (fetchedMatters: Matter[]) => {
    setAllMattersFromHome(fetchedMatters);
  };

  const handleOutstandingBalancesFetched = (data: any) => {
    setOutstandingBalances(data);
  };

  const handlePOID6YearsFetched = (data: any[]) => {
    // Don't override the local POID data with POID6Years data
    // We should store this separately but never use it for the main POID list
    // NEVER DO: setPoidData(data);
    
    // Since POID data should only come from localIdVerifications.json,
    // we'll reset poidData to initialPoidData if it's been corrupted
    if (poidData.length !== initialPoidData.length) {
      setPoidData(initialPoidData);
    }
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
        loadingScreen.style.transition = 'opacity 0.5s';
        loadingScreen.style.opacity = '0';
        setTimeout(() => loadingScreen.remove(), 500);
      }
    };

    if (teamsContext && userData && enquiries && matters) {
      closeLoadingScreen();
    }
  }, [teamsContext, userData, enquiries, matters]);

  // Listen for navigation events from child components
  useEffect(() => {
    const handleNavigateToInstructions = () => {
      setActiveTab('instructions');
    };
    const handleNavigateToEnquiries = () => {
      setActiveTab('enquiries');
    };
    const handleNavigateToReporting = () => {
      setActiveTab('reporting');
    };
    const handleNavigateToMatter = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.matterId) {
        setPendingMatterId(detail.matterId);
      }
      setActiveTab('matters');
    };

    window.addEventListener('navigateToInstructions', handleNavigateToInstructions);
    window.addEventListener('navigateToEnquiries', handleNavigateToEnquiries);
    window.addEventListener('navigateToReporting', handleNavigateToReporting);
    window.addEventListener('navigateToMatter', handleNavigateToMatter);

    return () => {
      window.removeEventListener('navigateToInstructions', handleNavigateToInstructions);
      window.removeEventListener('navigateToEnquiries', handleNavigateToEnquiries);
      window.removeEventListener('navigateToReporting', handleNavigateToReporting);
      window.removeEventListener('navigateToMatter', handleNavigateToMatter);
    };
  }, []);

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

  // Fetch instruction data lazily when Instructions tab is opened.
  // Enquiries and Matters also need access to this dataset for InlineWorkbench expansion.
  useEffect(() => {
    const currentUser = userData?.[0] || null;
    const hasAccess = hasInstructionsAccess(currentUser);

    // Only fetch instructions when Instructions/Enquiries/Matters are active.
    if (activeTab !== 'instructions' && activeTab !== 'enquiries' && activeTab !== 'matters') {
      return;
    }

    // Don't attempt to fetch instruction data for users without access.
    if (!hasAccess) {
      return;
    }

    // Skip fetch if data already loaded
    if (instructionData.length > 0 || allInstructionData.length > 0) {
      return;
    }

    const useLocalData =
      process.env.REACT_APP_USE_LOCAL_DATA === "true" ||
      (process.env.REACT_APP_USE_LOCAL_DATA !== "false" && window.location.hostname === "localhost");

    async function fetchInstructionData() {
      const pilotUsers = ["AC", "JW", "KW", "BL", "LZ"];
      // Use the actual user's initials for filtering, not LZ's
      const targetInitials = userInitials;
      const isAdmin = isAdminUser(currentUser);

      if (useLocalData) {

        // Merge local instruction data with ID verification data
        const instructionsWithIdVerifications = (localInstructionData as InstructionData[]).map(prospect => ({
          ...prospect,
          // Add ID verifications to prospect level
          idVerifications: (localIdVerifications as any[]).filter(
            (idv: any) => prospect.instructions?.some((inst: any) => inst.InstructionRef === idv.InstructionRef)
          ),
          // Also add to instructions level for easier access
          instructions: prospect.instructions?.map(inst => ({
            ...inst,
            idVerifications: (localIdVerifications as any[]).filter(
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
  }, [activeTab, userInitials, userData, instructionData.length, allInstructionData.length, instructionRefreshTrigger]);

  // Tabs visible to all users start with the Enquiries tab.
  // Instructions tab is available to admins plus BR, LA, SP
  // Only show the Reports tab to admins.
  const tabs: Tab[] = useMemo(() => {
    const currentUser = userData?.[0] || null;
    const isAdmin = isAdminUser(currentUser);
    const viewAsProd = Boolean(featureToggles?.viewAsProd);
    
    const showInstructionsTab = hasInstructionsAccess(currentUser);
    const showReportsTab = isAdmin;

    return [
      { key: 'enquiries', text: 'Prospects' },
      ...(showInstructionsTab ? [{ key: 'instructions', text: 'Clients' }] : []),
      { key: 'matters', text: 'Matters' },
      { key: 'forms', text: 'Forms', disabled: true }, // Disabled tab that triggers modal
      { key: 'resources', text: 'Resources', disabled: true }, // Disabled tab that triggers modal
      ...(showReportsTab ? [{ key: 'reporting', text: 'Reports' }] : []),
    ];
  }, [userData, featureToggles?.viewAsProd, isLocalDev]);

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

  // Ensure Navigator content is cleared when navigating away from Home
  React.useEffect(() => {
    if (activeTab !== 'home') {
      setContent(null);
    }
  }, [activeTab, setContent]);

  const renderContent = () => {
    switch (activeTab) {
      case 'home':
        return (
          <Home
            context={teamsContext}
            userData={userData}
            enquiries={enquiries}
            matters={matters}
            instructionData={instructionData}
            onAllMattersFetched={handleAllMattersFetched}
            onOutstandingBalancesFetched={handleOutstandingBalancesFetched}
            onPOID6YearsFetched={handlePOID6YearsFetched}
            onTransactionsFetched={handleTransactionsFetched}
            onBoardroomBookingsFetched={handleBoardroomBookingsFetched}
            onSoundproofBookingsFetched={handleSoundproofBookingsFetched}
            teamData={teamData}
            isInMatterOpeningWorkflow={isInMatterOpeningWorkflow}
            onImmediateActionsChange={setHasImmediateActions}
            originalAdminUser={originalAdminUser}
            featureToggles={featureToggles}
            demoModeEnabled={demoModeEnabled}
          />
        );
      case 'enquiries':
        return (
          <Enquiries
            context={teamsContext}
            userData={userData}
            enquiries={enquiries}
            teamData={teamData}
            poidData={poidData}
            setPoidData={setPoidData}
            onRefreshEnquiries={onRefreshEnquiries}
            onOptimisticClaim={onOptimisticClaim}
            instructionData={allInstructionData}
            featureToggles={featureToggles}
            demoModeEnabled={demoModeEnabled}
            isActive={activeTab === 'enquiries'}
            onTeamWideEnquiriesLoaded={setTeamWideEnquiries}
          />
        );
      case 'instructions':
        return (
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
        );
      case 'matters':
        return (
          <Matters
            matters={matters}
            isLoading={isLoading}
            error={error}
            userData={userData}
            teamData={teamData}
            enquiries={(teamWideEnquiries && teamWideEnquiries.length > 0) ? teamWideEnquiries : enquiries}
            workbenchByInstructionRef={workbenchByInstructionRef}
            pendingMatterId={pendingMatterId}
            onPendingMatterHandled={() => setPendingMatterId(null)}
            demoModeEnabled={demoModeEnabled}
          />
        );
      case 'reporting':
        return <ReportingHome userData={userData} teamData={teamData} demoModeEnabled={demoModeEnabled} />;
      default:
        return (
          <Home
            context={teamsContext}
            userData={userData}
            enquiries={enquiries}
            matters={matters}
            onAllMattersFetched={handleAllMattersFetched}
            onOutstandingBalancesFetched={handleOutstandingBalancesFetched}
            onPOID6YearsFetched={handlePOID6YearsFetched}
            onTransactionsFetched={handleTransactionsFetched}
            onBoardroomBookingsFetched={handleBoardroomBookingsFetched}
            onSoundproofBookingsFetched={handleSoundproofBookingsFetched}
            teamData={teamData}
            onImmediateActionsChange={setHasImmediateActions}
            originalAdminUser={originalAdminUser}
            featureToggles={featureToggles}
            demoModeEnabled={demoModeEnabled}
            isSwitchingUser={isLoading}
          />
        );
    }
  };

  if (!teamsContext || !userData || !enquiries || !matters) {
    return (
      <Loading
        message="Loading your workspace..."
        detailMessages={workspaceLoadingMessages}
        isDarkMode={isDarkMode}
      />
    );
  }

  return (
    <NavigatorProvider>
      <ThemeProvider isDarkMode={isDarkMode || false}>
        <ToastProvider isDarkMode={isDarkMode} position="bottom-right">
        <div
          style={{
            backgroundColor: isDarkMode ? colours.websiteBlue : colours.light.background,
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
            onHomeClick={() => setActiveTab('home')}
            tabs={tabs}
            ariaLabel="Main Navigation Tabs"
            user={userData[0]}
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
          {/* Navigator wrapper ensures correct layering and clickability */}
          <div className="app-navigator">
            <Navigator />
          </div>
          
          {/* Production Preview Mode Indicator */}
          {isLocalDev && featureToggles.viewAsProd && (
            <div
              style={{
                position: 'fixed',
                bottom: 16,
                left: 16,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                background: 'rgba(234, 179, 8, 0.95)',
                color: '#000',
                fontSize: 11,
                fontWeight: 600,
                zIndex: 9999,
                boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                cursor: 'pointer',
              }}
              onClick={() => handleFeatureToggle('viewAsProd', false)}
              title="Click to disable Production Preview mode"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 8v4M12 16h.01"/>
              </svg>
              PRODUCTION PREVIEW
            </div>
          )}
          
          {/* App-level Immediate Actions Bar */}
          {activeTab === 'home' && (
            <div
              id="app-level-immediate-actions"
              className="immediate-actions-portal"
              style={{
                position: 'relative',
                zIndex: 1,
                paddingInline: '16px',
                color: 'inherit',
              } as React.CSSProperties}
            />
          )}
          
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
            demoModeEnabled={demoModeEnabled}
            isLocalDev={isLocalDev}
            viewAsProd={Boolean(featureToggles?.viewAsProd)}
          />
          <MaintenanceNotice
            state={serviceHealth}
            isDarkMode={Boolean(isDarkMode)}
            onDismiss={dismissMaintenance}
          />
          
          <div className="app-scroll-region">
            <Suspense fallback={<ThemedSuspenseFallback /> }>
              {renderContent()}
            </Suspense>
          </div>
        </div>
        </ToastProvider>
      </ThemeProvider>
    </NavigatorProvider>
  );
};

export default App;