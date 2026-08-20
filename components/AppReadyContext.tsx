"use client";

import { createContext, useContext, useState, ReactNode } from "react";

type AppReadyContextValue = {
  ready: boolean;
  setReady: () => void;
};

const AppReadyContext = createContext<AppReadyContextValue | null>(null);

export function AppReadyProvider({ children }: { children: ReactNode }) {
  const [ready, setReadyState] = useState(false);
  return (
    <AppReadyContext.Provider value={{ ready, setReady: () => setReadyState(true) }}>
      {children}
    </AppReadyContext.Provider>
  );
}

// Falls back to "always ready" if used outside the provider, so a page
// that forgets to wrap in AppReadyProvider fails open (no splash) rather
// than crashing.
export function useAppReady(): AppReadyContextValue {
  const ctx = useContext(AppReadyContext);
  return ctx || { ready: true, setReady: () => {} };
}
