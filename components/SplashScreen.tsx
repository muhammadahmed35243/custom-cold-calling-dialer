"use client";

import { useEffect, useState } from "react";
import { BrandedLoader } from "./BrandedLoader";
import { useAppReady } from "./AppReadyContext";

// Every page's own auth-check/data-load runs on its own schedule -- a bare
// 2s timer meant the splash could disappear before that finished, dropping
// the user onto a plain "Loading..." fallback underneath. Waiting on the
// shared "ready" signal keeps the splash up until the real page is ready,
// while the minimum-2s floor keeps the brand moment from flashing by
// instantly on fast connections. The 8s safety cap prevents a page that
// forgets to call setReady() from leaving the splash stuck forever. This
// only covers the very first cold load of a session -- subsequent page
// navigations render BrandedLoader directly from each page's own loading
// state, without this minimum-wait floor.
export function SplashScreen() {
  const { ready } = useAppReady();
  const [minTimeElapsed, setMinTimeElapsed] = useState(false);
  const [safetyElapsed, setSafetyElapsed] = useState(false);

  useEffect(() => {
    const minTimer = setTimeout(() => setMinTimeElapsed(true), 2000);
    const safetyTimer = setTimeout(() => setSafetyElapsed(true), 8000);
    return () => {
      clearTimeout(minTimer);
      clearTimeout(safetyTimer);
    };
  }, []);

  const isVisible = !((minTimeElapsed && ready) || safetyElapsed);

  if (!isVisible) return null;

  return <BrandedLoader />;
}
