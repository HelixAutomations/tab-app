import React, { useState, useEffect, lazy, Suspense } from 'react';
import CustomTabs from '../app/styles/CustomTabs';
import { ThemeProvider } from '../app/functionality/ThemeContext';
import { colours } from '../app/styles/colours';
import * as microsoftTeams from '@microsoft/teams-js';
import { Context as TeamsContextType } from '@microsoft/teams-js';

const Home = lazy(() => import('../tabs/home/Home'));
const Forms = lazy(() => import('../tabs/forms/Forms'));
const Resources = lazy(() => import('../tabs/resources/Resources'));
const Enquiries = lazy(() => import('../tabs/enquiries/Enquiries'));
const Matters = lazy(() => import('../tabs/matters/Matters'));

interface AppProps {
  teamsContext: TeamsContextType | null;
  userData: any;
  enquiries: any[] | null;
}

const App: React.FC<AppProps> = ({ teamsContext, userData, enquiries }) => {
  const [activeTab, setActiveTab] = useState('home');
  const isDarkMode = teamsContext?.theme === 'dark';

  useEffect(() => {
    const closeLoadingScreen = () => {
      const loadingScreen = document.getElementById('loading-screen');
      if (loadingScreen) {
        loadingScreen.style.transition = 'opacity 0.5s';
        loadingScreen.style.opacity = '0';
        setTimeout(() => loadingScreen.remove(), 500);
      }
    };

    // Wait until all required props are available
    if (teamsContext && userData && enquiries) {
      closeLoadingScreen();
    }
  }, [teamsContext, userData, enquiries]);

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
        return <Enquiries context={teamsContext} enquiries={enquiries} />;
      case 'matters':
        return <Matters />;
      default:
        return <Home context={teamsContext} userData={userData} enquiries={enquiries} />;
    }
  };

  if (!teamsContext || !userData || !enquiries) {
    return <div>Loading or Error...</div>; // Add proper loading/error UI here if needed
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
