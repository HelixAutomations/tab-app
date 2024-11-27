import React, { createContext, useState, useEffect, ReactNode } from 'react';
import * as microsoftTeams from '@microsoft/teams-js';

// Define the structure of the TeamsContext
interface TeamsContextProps {
  context: microsoftTeams.Context | null;
  isLoading: boolean; // Add isLoading property
}

// Create a Context for Teams with default values
export const TeamsContext = createContext<TeamsContextProps>({
  context: null,
  isLoading: true, // Default to loading
});

// Define the provider's props to include children
interface TeamsProviderProps {
  children: ReactNode;
}

// Create a TeamsProvider component to provide the Teams context
export const TeamsProvider: React.FC<TeamsProviderProps> = ({ children }) => {
  const [context, setContext] = useState<microsoftTeams.Context | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    // Initialize Microsoft Teams SDK
    microsoftTeams.initialize();

    // Get Teams context
    microsoftTeams.getContext((teamsContext) => {
      console.log('Teams Context:', teamsContext); // Debugging Statement
      setContext(teamsContext);
      setIsLoading(false); // Set loading to false once context is retrieved
    });
  }, []);

  return (
    <TeamsContext.Provider value={{ context, isLoading }}>
      {children}
    </TeamsContext.Provider>
  );
};
