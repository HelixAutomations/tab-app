import React, { useState, useEffect, lazy, Suspense } from 'react';
import CustomTabs from './styles/CustomTabs';
import { ThemeProvider } from './functionality/ThemeContext';
import Navigator from '../components/Navigator';
import FormsSidebar from '../components/FormsSidebar';
import ResourcesSidebar from '../components/ResourcesSidebar';
import { NavigatorProvider } from './functionality/NavigatorContext';
import { colours } from './styles/colours';
import * as microsoftTeams from '@microsoft/teams-js';
import { Context as TeamsContextType } from '@microsoft/teams-js';
import { Matter, UserData, Enquiry, Tab, TeamData, POID, Transaction, BoardroomBooking, SoundproofPodBooking, InstructionData, NormalizedMatter } from './functionality/types';
import { hasActiveMatterOpening } from './functionality/matterOpeningUtils';
import localIdVerifications from '../localData/localIdVerifications.json';
import localInstructionData from '../localData/localInstructionData.json';
import { getProxyBaseUrl } from '../utils/getProxyBaseUrl';
import { ADMIN_USERS } from './admin';

const proxyBaseUrl = getProxyBaseUrl();

const Home = lazy(() => import('../tabs/home/Home'));
const Forms = lazy(() => import('../tabs/forms/Forms'));
const Enquiries = lazy(() => import('../tabs/enquiries/Enquiries'));
const Instructions = lazy(() => import('../tabs/instructions/Instructions'));
const Matters = lazy(() => import('../tabs/matters/Matters'));
const ReportingHome = lazy(() => import('../tabs/Reporting/ReportingHome')); // Replace ReportingCode with ReportingHome
const CallHub = lazy(() => import('../tabs/CallHub/CallHub'));

interface AppProps {
  teamsContext: TeamsContextType | null;
  userData: UserData[] | null;
  enquiries: Enquiry[] | null;
  matters: NormalizedMatter[];
  isLoading: boolean;
  error: string | null;
  teamData?: TeamData[] | null;
  isLocalDev?: boolean;
  onAreaChange?: (areas: string[]) => void;
  onUserChange?: (user: UserData) => void;
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
}) => {
  const [activeTab, setActiveTab] = useState('home');
  const isDarkMode = teamsContext?.theme === 'dark';

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
      country_code: v.CountryCode,
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
    // Filter out any invalid entries that don't have required fields
    .filter(poid => 
      poid && 
      poid.poid_id && 
      poid.first && 
      poid.last && 
      // Make sure fields aren't just numbers
      isNaN(Number(poid.first)) && 
      isNaN(Number(poid.last))
    );
  const [poidData, setPoidData] = useState<POID[]>(initialPoidData);
  const [instructionData, setInstructionData] = useState<InstructionData[]>([]);
  const [allMattersFromHome, setAllMattersFromHome] = useState<Matter[] | null>(null);
  const [outstandingBalances, setOutstandingBalances] = useState<any>(null);
  const [transactions, setTransactions] = useState<Transaction[] | undefined>(undefined);
  const [boardroomBookings, setBoardroomBookings] = useState<BoardroomBooking[] | null>(null);
  const [soundproofBookings, setSoundproofBookings] = useState<SoundproofPodBooking[] | null>(null);
  const [formsTabHovered, setFormsTabHovered] = useState(false);
  const [formsSidebarPinned, setFormsSidebarPinned] = useState(false);

  const [resourcesTabHovered, setResourcesTabHovered] = useState(false);
  const [resourcesSidebarPinned, setResourcesSidebarPinned] = useState(false);
  const [hasActiveMatter, setHasActiveMatter] = useState(false);
  const [isInMatterOpeningWorkflow, setIsInMatterOpeningWorkflow] = useState(false);

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

  useEffect(() => {
    if (activeTab === 'forms') {
      setFormsSidebarPinned(true);
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'resources') {
      setResourcesSidebarPinned(true);
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
    console.log('POID6Years data received:', data ? data.length : 0);
    // We should store this separately but never use it for the main POID list
    // NEVER DO: setPoidData(data);
    
    // Since POID data should only come from localIdVerifications.json,
    // we'll reset poidData to initialPoidData if it's been corrupted
    if (poidData.length !== initialPoidData.length) {
      console.log('Resetting POID data to initial values from localIdVerifications.json');
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
    setFormsSidebarPinned((prev) => !prev);
  };

  const handleResourcesTabClick = () => {
    setResourcesSidebarPinned((prev) => !prev);
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

    window.addEventListener('navigateToInstructions', handleNavigateToInstructions);
    window.addEventListener('navigateToEnquiries', handleNavigateToEnquiries);

    return () => {
      window.removeEventListener('navigateToInstructions', handleNavigateToInstructions);
      window.removeEventListener('navigateToEnquiries', handleNavigateToEnquiries);
    };
  }, []);

  // Determine the current user's initials
  const userInitials = userData?.[0]?.Initials?.toUpperCase() || '';

  // Fetch instruction data on app load
  useEffect(() => {
    const useLocalData =
      process.env.REACT_APP_USE_LOCAL_DATA === "true" ||
      window.location.hostname === "localhost";

    async function fetchInstructionData() {
      const pilotUsers = ["AC", "JW", "KW", "BL", "LZ"];
      const targetInitials = pilotUsers.includes(userInitials) ? "LZ" : userInitials;

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
        return;
      }

      const path = process.env.REACT_APP_GET_INSTRUCTION_DATA_PATH;
      const code = process.env.REACT_APP_GET_INSTRUCTION_DATA_CODE;
      if (!path || !code) {
        console.error("Missing env variables for instruction data");
        return;
      }

      try {
        // Request all instruction data; we'll filter client-side
        const url = `${proxyBaseUrl}/${path}?code=${code}`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          const all = Array.isArray(data) ? data : [data];
          // Narrow down to the current user's instructions to preserve existing
          // behaviour while still retrieving the full data set.
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
          console.error("Failed to fetch instructions");
        }
      } catch (err) {
        console.error("Error fetching instructions", err);
      }
    }

    if (userInitials) {
      fetchInstructionData();
    }
  }, [userInitials]);

  // Tabs visible to all users start with the Enquiries tab.
  // Only show the Instructions tab to Alex (AC), Jonathan (JW), Luke (LZ), Kelly (KW), Ben (BL), RC, JWH, and Cass (CB).
  // Keep it visible when developing locally (hostname === 'localhost').
  const instructionsUsers = [...ADMIN_USERS, 'KW', 'BL', 'JW', 'RC', 'JWH'];
  const isLocalhost = window.location.hostname === 'localhost';
  const showInstructionsTab =
    instructionsUsers.includes(userInitials) || isLocalhost;

  const tabs: Tab[] = [
    { key: 'enquiries', text: 'Enquiries' },
    ...(showInstructionsTab
      ? [{ key: 'instructions', text: 'Instructions' }]
      : []),
    { key: 'matters', text: 'Matters' },
    // Removed 'forms' and 'resources' tabs since they are now on the sides
    { key: 'reporting', text: 'Reports' },
    ...(isLocalhost ? [{ key: 'callhub', text: 'Call Hub' }] : []),
    ];

  // Check if the user has authorized initials for the Reporting tab
  const authorizedInitials = ['AC', 'JW', 'LZ', 'BL'];

  const isAuthorized = authorizedInitials.includes(userInitials);

  const renderContent = () => {
    switch (activeTab) {
      case 'home':
        return (
          <Home
            context={teamsContext}
            userData={userData}
            enquiries={enquiries}
            onAllMattersFetched={handleAllMattersFetched}
            onOutstandingBalancesFetched={handleOutstandingBalancesFetched}
            onPOID6YearsFetched={handlePOID6YearsFetched}
            onTransactionsFetched={handleTransactionsFetched}
            onBoardroomBookingsFetched={handleBoardroomBookingsFetched}
            onSoundproofBookingsFetched={handleSoundproofBookingsFetched}
            teamData={teamData}
            isInMatterOpeningWorkflow={isInMatterOpeningWorkflow}
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
          />
        );
      case 'instructions':
        return (
          <Instructions
            userInitials={userInitials}
            instructionData={instructionData}
            setInstructionData={setInstructionData}
            teamData={teamData}
            userData={userData}
            matters={allMattersFromHome || []}
            hasActiveMatter={hasActiveMatter}
            setIsInMatterOpeningWorkflow={setIsInMatterOpeningWorkflow} poidData={[]} setPoidData={function (value: React.SetStateAction<POID[]>): void {
              throw new Error('Function not implemented.');
            } }          />
          );
      case 'matters':
        return (
          <Matters
            matters={matters}
            isLoading={isLoading}
            error={error}
            userData={userData}
          />
        );
      case 'reporting':
        return isAuthorized ? (
          <ReportingHome userData={userData} teamData={teamData} />
        ) : (
          <div style={{ padding: '20px', textAlign: 'center' }}>
            <h2>Access Denied</h2>
            <p>You do not have permission to view the Reports dashboard.</p>
          </div>
        );
      case 'callhub':
        return <CallHub />;
      default:
        return (
          <Home
            context={teamsContext}
            userData={userData}
            enquiries={enquiries}
            onAllMattersFetched={handleAllMattersFetched}
            onOutstandingBalancesFetched={handleOutstandingBalancesFetched}
            onPOID6YearsFetched={handlePOID6YearsFetched}
            onTransactionsFetched={handleTransactionsFetched}
            onBoardroomBookingsFetched={handleBoardroomBookingsFetched}
            onSoundproofBookingsFetched={handleSoundproofBookingsFetched}
            teamData={teamData}
          />
        );
    }
  };

  if (!teamsContext || !userData || !enquiries || !matters) {
    return <div>Loading or Error...</div>;
  }

  return (
    <NavigatorProvider>
      <ThemeProvider isDarkMode={isDarkMode || false}>
        <div
          style={{
            backgroundColor: isDarkMode ? colours.dark.background : colours.light.background,
            minHeight: '100vh',
            transition: 'background-color 0.3s',
          }}
        >
          <CustomTabs
            selectedKey={activeTab}
            onLinkClick={(item) => setActiveTab(item?.props.itemKey || activeTab)}
            onHomeClick={() => setActiveTab('home')}
            tabs={tabs}
            ariaLabel="Main Navigation Tabs"
            user={userData[0]}
            onFormsHover={setFormsTabHovered}
            onFormsClick={handleFormsTabClick}
            onResourcesHover={setResourcesTabHovered}
            onResourcesClick={handleResourcesTabClick}
            hasActiveMatter={hasActiveMatter}
            isInMatterOpeningWorkflow={isInMatterOpeningWorkflow}
            isLocalDev={isLocalDev}
            onAreaChange={onAreaChange}
            teamData={teamData as any}
            onUserChange={onUserChange}
          />
          <Navigator />
          <FormsSidebar
            userData={userData}
            teamData={teamData}
            matters={allMattersFromHome || []}
            activeTab={activeTab}
            hovered={formsTabHovered}
            pinned={formsSidebarPinned}
            setPinned={setFormsSidebarPinned}
          />
          <ResourcesSidebar
            activeTab={activeTab}
            hovered={resourcesTabHovered}
            pinned={resourcesSidebarPinned}
            setPinned={setResourcesSidebarPinned}
          />
          <Suspense fallback={<div>Loading...</div>}>
            {renderContent()}
          </Suspense>
        </div>
      </ThemeProvider>
    </NavigatorProvider>
  );
};

export default App;