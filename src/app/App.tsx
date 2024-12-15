// src/app/App.tsx

import React, { useState, useEffect, lazy, Suspense } from 'react';
import CustomTabs from './styles/CustomTabs';
import { ThemeProvider } from './functionality/ThemeContext';
import { colours } from './styles/colours';
import * as microsoftTeams from '@microsoft/teams-js';
import { Context as TeamsContextType } from '@microsoft/teams-js';
import { Matter, UserData, Enquiry } from './functionality/types';

const Home = lazy(() => import('../tabs/home/Home'));
const Forms = lazy(() => import('../tabs/forms/Forms'));
const Resources = lazy(() => import('../tabs/resources/Resources'));
const Enquiries = lazy(() => import('../tabs/enquiries/Enquiries'));
const Matters = lazy(() => import('../tabs/matters/Matters'));

interface AppProps {
  teamsContext: TeamsContextType | null;
  userData: UserData[] | null;
  enquiries: Enquiry[] | null;
  matters: Matter[] | null;
  fetchMatters: (fullName: string) => Promise<Matter[]>;
  isLoading: boolean;
  error: string | null;
}

const App: React.FC<AppProps> = ({
  teamsContext,
  userData,
  enquiries,
  matters,
  fetchMatters,
  isLoading,
  error,
}) => {
  const [activeTab, setActiveTab] = useState('home');
  const isDarkMode = teamsContext?.theme === 'dark';
  const [poidData, setPoidData] = useState<any[] | null>(null);

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

  const tabs = [
    { key: 'home', text: 'Home' },
    { key: 'forms', text: 'Forms' },
    { key: 'resources', text: 'Resources' },
    { key: 'enquiries', text: 'Enquiries' },
    { key: 'matters', text: 'Matters' },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'home':
        return <Home context={teamsContext} userData={userData} enquiries={enquiries} />;
      case 'forms':
        return <Forms />;
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
          />
        );
      case 'matters':
        return (
          <Matters
            matters={matters || []}
            fetchMatters={fetchMatters}
            isLoading={isLoading}
            error={error}
            userData={userData}
          />
        );
      default:
        return <Home context={teamsContext} userData={userData} enquiries={enquiries} />;
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
        <Suspense fallback={<div />}>{renderContent()}</Suspense>
      </div>
    </ThemeProvider>
  );
};

export default App;
