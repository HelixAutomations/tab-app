// src/index.tsx

import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import './app/styles/index.css';
import App from './app/App';
import { createTheme, ThemeProvider } from '@fluentui/react';
import { colours } from './app/styles/colours';
import * as microsoftTeams from '@microsoft/teams-js';
import { Matter, UserData, Enquiry } from './app/functionality/types';

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

// Helper function to calculate the date range
const getDateRange = () => {
  const now = new Date();
  const startOfPreviousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const today = now;

  return {
    dateFrom: startOfPreviousMonth.toISOString().split('T')[0],
    dateTo: today.toISOString().split('T')[0],
  };
};

// Fetch functions
const fetchUserData = async (objectId: string): Promise<UserData[]> => {
  const response = await fetch(
    `${process.env.REACT_APP_PROXY_BASE_URL}/${process.env.REACT_APP_GET_USER_DATA_PATH}?code=${process.env.REACT_APP_GET_USER_DATA_CODE}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userObjectId: objectId }),
    }
  );
  if (!response.ok) throw new Error(`Failed to fetch user data: ${response.status}`);
  return response.json();
};

const fetchEnquiries = async (email: string, dateFrom: string, dateTo: string): Promise<Enquiry[]> => {
  const response = await fetch(
    `${process.env.REACT_APP_PROXY_BASE_URL}/${process.env.REACT_APP_GET_ENQUIRIES_PATH}?code=${process.env.REACT_APP_GET_ENQUIRIES_CODE}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, dateFrom, dateTo }),
    }
  );
  if (!response.ok) throw new Error(`Failed to fetch enquiries: ${response.status}`);
  return response.json();
};

const fetchMatters = async (fullName: string): Promise<Matter[]> => {
  const response = await fetch(
    `${process.env.REACT_APP_PROXY_BASE_URL}/${process.env.REACT_APP_GET_MATTERS_PATH}?code=${process.env.REACT_APP_GET_MATTERS_CODE}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName }),
    }
  );
  if (!response.ok) throw new Error(`Failed to fetch matters: ${response.status}`);
  const data = await response.json();
  
  const mapData = (items: any[]): Matter[] => {
    return items.map((item) => ({
      DisplayNumber: item["Display Number"] || '',
      OpenDate: item["Open Date"] || '',
      MonthYear: item["MonthYear"] || '',
      YearMonthNumeric: item["YearMonthNumeric"] || 0,
      ClientID: item["Client ID"] || '',
      ClientName: item["Client Name"] || '',
      ClientPhone: item["Client Phone"] || '',
      ClientEmail: item["Client Email"] || '',
      Status: item["Status"] || '',
      UniqueID: item["Unique ID"] || '',
      Description: item["Description"] || '',
      PracticeArea: item["Practice Area"] || '',
      Source: item["Source"] || '',
      Referrer: item["Referrer"] || '',
      ResponsibleSolicitor: item["Responsible Solicitor"] || '',
      OriginatingSolicitor: item["Originating Solicitor"] || '',
      SupervisingPartner: item["Supervising Partner"] || '',
      Opponent: item["Opponent"] || '',
      OpponentSolicitor: item["Opponent Solicitor"] || '',
      CloseDate: item["Close Date"] || '',
      ApproxValue: item["Approx. Value"] || '',
      mod_stamp: item["mod_stamp"] || '',
      method_of_contact: item["method_of_contact"] || '',
      CCL_date: item["CCL_date"] || null,
      Rating: item["Rating"] as 'Good' | 'Neutral' | 'Poor' | undefined,
    }));
  };

  let fetchedMatters: Matter[] = [];

  if (Array.isArray(data)) {
    fetchedMatters = mapData(data);
  } else if (Array.isArray(data.matters)) {
    fetchedMatters = mapData(data.matters);
  } else {
    console.warn('Unexpected data format:', data);
  }

  return fetchedMatters;
};

// Main component
const AppWithContext: React.FC = () => {
  const [teamsContext, setTeamsContext] = useState<microsoftTeams.Context | null>(null);
  const [userData, setUserData] = useState<UserData[] | null>(null);
  const [enquiries, setEnquiries] = useState<Enquiry[] | null>(null);
  const [matters, setMatters] = useState<Matter[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchMattersError, setFetchMattersError] = useState<string | null>(null);

  useEffect(() => {
    const initializeTeamsAndFetchData = async () => {
      try {
        // Initialize Teams SDK and fetch context
        microsoftTeams.initialize();
        microsoftTeams.getContext(async (ctx) => {
          setTeamsContext(ctx);

          const objectId = ctx.userObjectId || '';
          if (!objectId) throw new Error('Missing Teams context objectId.');

          const { dateFrom, dateTo } = getDateRange();

          // Fetch user data
          const userDataResponse = await fetchUserData(objectId);
          setUserData(userDataResponse);

          // Fetch enquiries
          const enquiriesResponse = await fetchEnquiries('anyone', dateFrom, dateTo);
          setEnquiries(enquiriesResponse);

          // Fetch matters (using full name from user data if available)
          const fullName = `${userDataResponse[0]?.First} ${userDataResponse[0]?.Last}`;
          const mattersResponse = await fetchMatters(fullName);
          setMatters(mattersResponse);
        });
      } catch (error: any) {
        console.error('Error initializing or fetching data:', error);
        setError(error.message || 'Unknown error occurred.');
      } finally {
        setLoading(false);
      }
    };

    initializeTeamsAndFetchData();
  }, []);

  return (
    <App
      teamsContext={teamsContext}
      userData={userData}
      enquiries={enquiries}
      matters={matters}
      fetchMatters={fetchMatters}
      isLoading={loading}
      error={error}
    />
  );
};

// Render the app
ReactDOM.render(
  <React.StrictMode>
    <ThemeProvider theme={customTheme}>
      <AppWithContext />
    </ThemeProvider>
  </React.StrictMode>,
  document.getElementById('root')
);
