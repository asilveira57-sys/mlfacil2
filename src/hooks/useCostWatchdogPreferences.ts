import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "cost_watchdog_enabled";
const UPDATE_EVENT = "cost_watchdog_update";

export function useCostWatchdogPreferences() {
  const [enabled, setEnabledState] = useState(() => {
    return localStorage.getItem(STORAGE_KEY) !== "false";
  });

  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        setEnabledState(e.newValue !== "false");
      }
    };

    const handleUpdateEvent = () => {
      setEnabledState(localStorage.getItem(STORAGE_KEY) !== "false");
    };

    window.addEventListener("storage", handleStorageChange);
    window.addEventListener(UPDATE_EVENT, handleUpdateEvent);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener(UPDATE_EVENT, handleUpdateEvent);
    };
  }, []);

  const setEnabled = useCallback((value: boolean) => {
    localStorage.setItem(STORAGE_KEY, value ? "true" : "false");
    setEnabledState(value);
    window.dispatchEvent(new Event(UPDATE_EVENT));
  }, []);

  return { enabled, setEnabled };
}
