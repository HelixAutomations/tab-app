// src/app/functionality/ThemeContext.tsx

import React, { createContext, useContext, useState, ReactNode } from 'react';

interface ThemeContextProps {
  isDarkMode: boolean;
  toggleTheme: () => void;
}

export const ThemeContext = createContext<ThemeContextProps>({
  isDarkMode: false, // Default value
  toggleTheme: () => {},
});

// Custom hook for easy access to the ThemeContext
export const useTheme = () => useContext(ThemeContext);

// ThemeProvider component to wrap your app
interface ThemeProviderProps {
  isDarkMode: boolean;
  children: ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ isDarkMode: initialIsDarkMode, children }) => {
  const [isDarkMode, setIsDarkMode] = useState(initialIsDarkMode);

  const toggleTheme = () => {
    setIsDarkMode((prevMode) => !prevMode);
  };

  return (
    <ThemeContext.Provider value={{ isDarkMode, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};
