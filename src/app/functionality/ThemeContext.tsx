// src/app/functionality/ThemeContext.tsx
// invisible change 2

import React, { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, ReactNode } from 'react';

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
  const [isDarkMode, setIsDarkMode] = useState(() => {
    try {
      const saved = typeof window !== 'undefined' ? window.localStorage.getItem('helix_theme') : null;
      if (saved === 'dark') return true;
      if (saved === 'light') return false;
    } catch {}
    return initialIsDarkMode;
  });

  const lastBroadcastThemeRef = useRef<string | null>(null);

  const applyThemeToDocument = React.useCallback((nextIsDarkMode: boolean, shouldBroadcast = true) => {
    const themeName = nextIsDarkMode ? 'dark' : 'light';
    try {
      if (typeof document !== 'undefined') {
        const html = document.documentElement;
        html.dataset.theme = themeName;
        html.classList.toggle('theme-dark', nextIsDarkMode);
        html.classList.toggle('theme-light', !nextIsDarkMode);

        const body = document.body;
        if (body) {
          body.dataset.theme = themeName;
          body.classList.toggle('theme-dark', nextIsDarkMode);
          body.classList.toggle('theme-light', !nextIsDarkMode);
        }
      }
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('helix_theme', themeName);
        if (shouldBroadcast && lastBroadcastThemeRef.current !== themeName) {
          lastBroadcastThemeRef.current = themeName;
          window.dispatchEvent(new CustomEvent('helix-theme-changed', { detail: { theme: themeName } }));
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    setIsDarkMode(initialIsDarkMode);
  }, [initialIsDarkMode]);

  // Reflect on <body> and persist
  useLayoutEffect(() => {
    applyThemeToDocument(isDarkMode);
  }, [applyThemeToDocument, isDarkMode]);

  const toggleTheme = React.useCallback(() => {
    const nextIsDarkMode = !isDarkMode;
    applyThemeToDocument(nextIsDarkMode);
    setIsDarkMode(nextIsDarkMode);
  }, [applyThemeToDocument, isDarkMode]);

  return (
    <ThemeContext.Provider value={{ isDarkMode, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};
