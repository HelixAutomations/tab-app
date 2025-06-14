// src/app/App.tsx
import React, { useState, useEffect, lazy, Suspense } from 'react';
import CustomTabs from './styles/CustomTabs';
import { ThemeProvider } from './functionality/ThemeContext';
import { colours } from './styles/colours';
import * as microsoftTeams from '@microsoft/teams-js';
import { Context as TeamsContextType } from '@microsoft/teams-js';
import { Matter, UserData, Enquiry, Tab, TeamData, POID, Transaction, BoardroomBooking, SoundproofPodBooking } from './functionality/types';

const Home = lazy(() => import('../tabs/home/Home'));
const Forms = lazy(() => import('../tabs/forms/Forms'));
const Resources = lazy(() => import('../tabs/resources/Resources'));
const Enquiries = lazy(() => import('../tabs/enquiries/Enquiries'));
const Instructions = lazy(() => import('../tabs/instructions/Instructions'));
const Matters = lazy(() => import('../tabs/matters/Matters'));
const Roadmap = lazy(() => import('../tabs/roadmap/Roadmap'));
const ReportingHome = lazy(() => import('../tabs/Reporting/ReportingHome')); // Replace ReportingCode with ReportingHome

interface AppProps {
  teamsContext: TeamsContextType | null;
  userData: UserData[] | null;
  enquiries: Enquiry[] | null;
  matters: Matter[] | null;
  fetchMatters: (fullName: string) => Promise<Matter[]>;
  isLoading: boolean;
  error: string | null;
  teamData?: TeamData[] | null;
}

const App: React.FC<AppProps> = ({
  teamsContext,
  userData,
  enquiries,
  matters,
  fetchMatters,
  isLoading,
  error,
  teamData,
}) => {
  const [activeTab, setActiveTab] = useState('home');
  const isDarkMode = teamsContext?.theme === 'dark';

  // Existing state and callbacks (unchanged)
  const [poidData, setPoidData] = useState<POID[]>([]);
  const [allMattersFromHome, setAllMattersFromHome] = useState<Matter[] | null>(null);
  const [outstandingBalances, setOutstandingBalances] = useState<any>(null);
  const [transactions, setTransactions] = useState<Transaction[] | undefined>(undefined);
  const [boardroomBookings, setBoardroomBookings] = useState<BoardroomBooking[] | null>(null);
  const [soundproofBookings, setSoundproofBookings] = useState<SoundproofPodBooking[] | null>(null);

  const handleAllMattersFetched = (fetchedMatters: Matter[]) => {
    setAllMattersFromHome(fetchedMatters);
  };

  const handleOutstandingBalancesFetched = (data: any) => {
    setOutstandingBalances(data);
  };

  const handlePOID6YearsFetched = (data: any[]) => {
    setPoidData(data);
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

  // Determine the current user's initials
  const userInitials = userData?.[0]?.Initials?.toUpperCase() || '';

  // Tabs visible to all users
  const baseTabs: Tab[] = [
    { key: 'home', text: 'Home' },
    { key: 'forms', text: 'Forms' },
    { key: 'resources', text: 'Resources' },
    { key: 'enquiries', text: 'Enquiries' },
  ];

  // Add the Instructions tab only for Luke (LZ) and Alex (AC).
  // Make it always visible when developing locally (hostname === 'localhost').
  const instructionsUsers = ['LZ', 'AC'];
  const isLocalhost = window.location.hostname === 'localhost';
  const showInstructionsTab =
    instructionsUsers.includes(userInitials) || isLocalhost;

  const tabsWithInstructions = showInstructionsTab
    ? [...baseTabs, { key: 'instructions', text: 'Instructions' }]
    : baseTabs;

  const tabs: Tab[] = [
    ...tabsWithInstructions,
    { key: 'matters', text: 'Matters' },
    { key: 'roadmap', text: 'Roadmap' },
    { key: 'reporting', text: 'Reports' },
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
          />
        );
      case 'forms':
        return <Forms userData={userData} matters={allMattersFromHome || []} />;
      case 'resources':
        return <Resources />;
      case 'enquiries':
        return (
          <Enquiries
            context={teamsContext}
            userData={userData}
            enquiries={enquiries}
            poidData={poidData}
            setPoidData={setPoidData}
            teamData={teamData}
          />
        );
      case 'instructions':
        return <Instructions />;
      case 'matters':
        return (
          <Matters
            matters={allMattersFromHome || []}
            transactions={transactions}
            fetchMatters={fetchMatters}
            isLoading={isLoading}
            error={error}
            userData={userData}
            teamData={teamData}
            outstandingBalances={outstandingBalances}
            poidData={poidData || []}
            setPoidData={setPoidData}
          />
        );
      case 'roadmap':
        return <Roadmap userData={userData} />;
      case 'reporting':
        return isAuthorized ? (
          <ReportingHome userData={userData} teamData={teamData} />
        ) : (
          <div style={{ padding: '20px', textAlign: 'center' }}>
            <h2>Access Denied</h2>
            <p>You do not have permission to view the Reports dashboard.</p>
          </div>
        );
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
          onLinkClick={(item) => setActiveTab(item?.props.itemKey || 'home')}
          tabs={tabs}
          ariaLabel="Main Navigation Tabs"
        />
        <Suspense fallback={<div>Loading...</div>}>
          {renderContent()}
        </Suspense>
      </div>
    </ThemeProvider>
  );
};

export default App;