"use client";

import { useEffect } from "react";
import { useAppReady } from "./AppReadyContext";

// For static pages with nothing to load: tells the first-load splash the page
// is ready straight away.
export function MarkReady() {
  const { setReady } = useAppReady();
  useEffect(() => {
    setReady();
  }, [setReady]);
  return null;
}
