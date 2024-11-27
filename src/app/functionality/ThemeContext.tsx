// src/app/functionality/ThemeContext.tsx

import React, { createContext, useContext } from 'react';

interface ThemeContextProps {
  isDarkMode: boolean;
}

const ThemeContext = createContext<ThemeContextProps>({
  isDarkMode: false, // Default value
});

// Custom hook for easy access to the ThemeContext
export const useTheme = () => useContext(ThemeContext);

// ThemeProvider component to wrap your app
interface ThemeProviderProps {
  isDarkMode: boolean;
  children: React.ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ isDarkMode, children }) => {
  return (
    <ThemeContext.Provider value={{ isDarkMode }}>
      {children}
    </ThemeContext.Provider>
  );
};
