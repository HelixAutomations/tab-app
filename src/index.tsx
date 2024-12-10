import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import './app/styles/index.css';
import App from './app/App';
import { createTheme, ThemeProvider } from '@fluentui/react';
import { colours } from './app/styles/colours';
import * as microsoftTeams from '@microsoft/teams-js';
import { FeProvider, useFeContext } from './app/functionality/FeContext'; // Import FeProvider and useFeContext

// Define the custom Fluent UI theme
const customTheme = createTheme({
  palette: {
    themePrimary: colours.blue,
    themeDark: colours.darkBlue,
    themeLighter: colours.highlight,
    accent: colours.accent,
    neutralLight: colours.grey,
    redDark: colours.cta,
    neutralPrimary: colours.websiteBlue,
  },
  fonts: {
    small: { fontFamily: 'Raleway, sans-serif' },
    medium: { fontFamily: 'Raleway, sans-serif' },
    large: { fontFamily: 'Raleway, sans-serif' },
    xLarge: { fontFamily: 'Raleway, sans-serif' },
  },
});

// Wrapper to provide Teams context and fetch required data
const AppWithContext: React.FC = () => {
  const [teamsContext, setTeamsContext] = useState<microsoftTeams.Context | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { fetchEnquiries, fetchUserData, fetchEnquiriesError, fetchUserDataError } = useFeContext(); // Use context
  const [userData, setUserData] = useState<any | null>(null);
  const [enquiries, setEnquiries] = useState<any[] | null>(null);

  useEffect(() => {
    const initializeTeamsAndFetchData = async () => {
      try {
        // Initialize Teams SDK and fetch context
        microsoftTeams.initialize();
        microsoftTeams.getContext(async (ctx) => {
          setTeamsContext(ctx);

          const email = ctx.userPrincipalName || '';
          const objectId = ctx.userObjectId || '';

          if (email && objectId) {
            try {
              // Fetch user data using FeContext's fetchUserData
              const userDataResponse = await fetchUserData(objectId); 
              setUserData(userDataResponse);

              // Fetch all enquiries by passing 'anyone' to fetchEnquiries
              const enquiriesResponse = await fetchEnquiries('anyone', '2023-01-01', '2023-12-31'); // Use 'anyone' to fetch all enquiries
              setEnquiries(enquiriesResponse);

            } catch (fetchError) {
              console.error('Error fetching data:', fetchError);
              setError('Failed to fetch data.');
            }
          } else {
            setError('Invalid Teams context: Missing objectId or email.');
          }
        });
      } catch (initError) {
        console.error('Error initializing Teams or fetching context:', initError);
        setError('Failed to initialise Teams context.');
      } finally {
        setLoading(false);
      }
    };

    initializeTeamsAndFetchData();
  }, [fetchEnquiries, fetchUserData]);

  if (loading) {
    return <div>Loading...</div>;
  }

  if (error || fetchEnquiriesError || fetchUserDataError) {
    return <div>Error: {error || fetchEnquiriesError || fetchUserDataError}</div>;
  }

  return <App teamsContext={teamsContext} userData={userData} enquiries={enquiries} />;
};

// Render the App
ReactDOM.render(
  <React.StrictMode>
    <ThemeProvider theme={customTheme}>
      <FeProvider>
        <AppWithContext />
      </FeProvider>
    </ThemeProvider>
  </React.StrictMode>,
  document.getElementById('root')
);
