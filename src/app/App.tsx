// src/app/App.tsx
import React, { useState, useEffect, lazy, Suspense } from 'react';
import CustomTabs from './styles/CustomTabs';
import { ThemeProvider } from './functionality/ThemeContext';
import { colours } from './styles/colours';
import * as microsoftTeams from '@microsoft/teams-js';
import { Context as TeamsContextType } from '@microsoft/teams-js';
import { Matter, UserData, Enquiry, Tab, TeamData } from './functionality/types';

const Home = lazy(() => import('../tabs/home/Home'));
const Forms = lazy(() => import('../tabs/forms/Forms'));
const Resources = lazy(() => import('../tabs/resources/Resources'));
const Enquiries = lazy(() => import('../tabs/enquiries/Enquiries'));
const Matters = lazy(() => import('../tabs/matters/Matters'));
const Roadmap = lazy(() => import('../tabs/roadmap/Roadmap'));
const ReportingCode = lazy(() => import('../tabs/Reporting/ReportingCode'));

interface AppProps {
  teamsContext: TeamsContextType | null;
  userData: UserData[] | null;
  enquiries: Enquiry[] | null;
  matters: Matter[] | null;  // User-specific matters from index.tsx
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
  const [poidData, setPoidData] = useState<any[] | null>(null);

  // NEW: Store the "all matters" that Home fetches
  const [allMattersFromHome, setAllMattersFromHome] = useState<Matter[] | null>(null);

  // NEW: State to hold outstanding client balances
  const [outstandingBalances, setOutstandingBalances] = useState<any>(null);

  // Callback that Home can call to pass us the new "all matters" data
  const handleAllMattersFetched = (fetchedMatters: Matter[]) => {
    setAllMattersFromHome(fetchedMatters);
  };

  // NEW: Callback to accept outstanding balances from Home
  const handleOutstandingBalancesFetched = (data: any) => {
    setOutstandingBalances(data);
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

    // Once we have the main pieces of data, hide the custom loading screen
    if (teamsContext && userData && enquiries && matters) {
      closeLoadingScreen();
    }
  }, [teamsContext, userData, enquiries, matters]);

  const tabs: Tab[] = [
    { key: 'home', text: 'Home' },
    { key: 'forms', text: 'Forms' },
    { key: 'resources', text: 'Resources' },
    { key: 'enquiries', text: 'Enquiries' },
    { key: 'matters', text: 'Matters' },
    { key: 'roadmap', text: 'Roadmap' },
    { key: 'reporting', text: 'Reports' },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'home':
        return (
          <Home
            context={teamsContext}
            userData={userData}
            enquiries={enquiries}
            // Pass the callback so Home can forward the "all matters" data here
            onAllMattersFetched={handleAllMattersFetched}
            // NEW: Pass the outstanding balances callback
            onOutstandingBalancesFetched={handleOutstandingBalancesFetched}
          />
        );
      case 'forms':
        // Here we pass matters from allMattersFromHome (or an empty array if not yet available)
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
      case 'matters':
        // Use the allMattersFromHome here instead of user-specific matters
        return (
          <Matters
            matters={allMattersFromHome || []}
            fetchMatters={fetchMatters}
            isLoading={isLoading}
            error={error}
            userData={userData}
            teamData={teamData}
            // NEW: Pass outstandingBalances so that the Matters component can also access it
            outstandingBalances={outstandingBalances}
          />
        );
      case 'roadmap':
        return <Roadmap userData={userData} />;
      case 'reporting':
        return <ReportingCode />;
      default:
        return (
          <Home
            context={teamsContext}
            userData={userData}
            enquiries={enquiries}
            onAllMattersFetched={handleAllMattersFetched}
            onOutstandingBalancesFetched={handleOutstandingBalancesFetched}
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
        <Suspense fallback={<div>Loading...</div>}>{renderContent()}</Suspense>
      </div>
    </ThemeProvider>
  );
};

export default App;
