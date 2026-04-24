// src/tabs/roadmap/ActivityContext.tsx — lightweight context exposing layout controls to children
//
// Allows panels (rail layers, alerts strip, focal sub-components) to call
// `useActivityContext().focusLens('trace', { sessionId })` without prop drilling.

import React, { createContext, useContext } from 'react';
import type { ActivityLayoutControls } from './hooks/useActivityLayout';

const ActivityContextInternal = createContext<ActivityLayoutControls | null>(null);

export const ActivityProvider: React.FC<{
  value: ActivityLayoutControls;
  children: React.ReactNode;
}> = ({ value, children }) => (
  <ActivityContextInternal.Provider value={value}>{children}</ActivityContextInternal.Provider>
);

export function useActivityContext(): ActivityLayoutControls {
  const ctx = useContext(ActivityContextInternal);
  if (!ctx) {
    throw new Error('useActivityContext must be used within ActivityProvider');
  }
  return ctx;
}

export function useOptionalActivityContext(): ActivityLayoutControls | null {
  return useContext(ActivityContextInternal);
}
