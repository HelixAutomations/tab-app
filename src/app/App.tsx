// src/App.tsx

import React, { useState, useEffect, Suspense, lazy } from 'react';
import CustomTabs from '../app/styles/CustomTabs';
import { FeProvider } from '../app/functionality/FeContext';
import { TeamsProvider } from '../app/functionality/TeamsContext';
import { colours } from '../app/styles/colours';
import * as microsoftTeams from '@microsoft/teams-js';
import { ThemeProvider } from '../app/functionality/ThemeContext';
import Loading from './styles/Loading'; // Import the Loading component

const Home = lazy(() => import('../tabs/home/Home'));
const Forms = lazy(() => import('../tabs/forms/Forms'));
const Workspace = lazy(() => import('../tabs/workspace/Workspace'));
const Resources = lazy(() => import('../tabs/resources/Resources'));
const Enquiries = lazy(() => import('../tabs/enquiries/Enquiries'));
const Matters = lazy(() => import('../tabs/matters/Matters'));

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState('home');
  const [context, setContext] = useState<microsoftTeams.Context | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    // Initialise Microsoft Teams
    microsoftTeams.initialize();
    microsoftTeams.getContext((ctx) => {
      setContext(ctx);
      setIsDarkMode(ctx.theme === 'dark');
    });
  }, []);

  const tabs = [
    { key: 'home', text: 'Home' },
    { key: 'forms', text: 'Forms' },
    { key: 'workspace', text: 'Workspace' },
    { key: 'resources', text: 'Resources' },
    { key: 'enquiries', text: 'Enquiries' },
    { key: 'matters', text: 'Matters' },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'home':
        return <Home context={context} />;
      case 'forms':
        return <Forms />;
      case 'workspace':
        return <Workspace />;
      case 'resources':
        return <Resources />;
      case 'enquiries':
        return <Enquiries />;
      case 'matters':
        return <Matters />;
      default:
        return <Home context={context} />;
    }
  };

  return (
    <TeamsProvider>
      <FeProvider>
        <ThemeProvider isDarkMode={isDarkMode}>
          <div
            style={{
              backgroundColor: isDarkMode ? colours.dark.background : colours.light.background,
              minHeight: '100vh',
              transition: 'background-color 0.3s',
            }}
          >
            {/* Navigation Tabs */}
            <CustomTabs
              selectedKey={activeTab}
              onLinkClick={(item) => setActiveTab(item?.props.itemKey || 'home')}
              tabs={tabs}
              ariaLabel="Main Navigation Tabs"
            />

            {/* Main Content */}
            <Suspense fallback={<Loading />}>
              {renderContent()}
            </Suspense>
          </div>
        </ThemeProvider>
      </FeProvider>
    </TeamsProvider>
  );
};

export default App;
