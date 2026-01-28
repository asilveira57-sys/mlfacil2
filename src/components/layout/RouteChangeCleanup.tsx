import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

/**
 * Passive cleanup component - only fixes genuinely stuck UI states.
 * Does NOT run cleanup on every route change to avoid "flash" effects.
 */
export function RouteChangeCleanup() {
  const { pathname } = useLocation();
  const lastPathRef = useRef<string>(pathname);
  const lastCleanupAtRef = useRef<number>(0);

  useEffect(() => {
    const from = lastPathRef.current;
    if (from === pathname) return;
    lastPathRef.current = pathname;
    lastCleanupAtRef.current = Date.now();

    // REMOVED: Aggressive cleanup on every route change was causing "flash" effects.
    // The periodic orphan detection below handles genuine stuck states without
    // disrupting normal navigation.
  }, [pathname]);

  // Periodic check for orphaned scroll locks (every 5s - only fixes genuine stuck states)
  // Does NOT run on route change, only as a background safety net
  useEffect(() => {
    const interval = window.setInterval(() => {
      const hasScrollLock = document.body.hasAttribute("data-scroll-locked");
      const hasPointerEventsNone = document.body.style.pointerEvents === "none";
      
      // Skip if no issues detected
      if (!hasScrollLock && !hasPointerEventsNone) return;
      
      // Only clean if nothing is actually open
      const hasAnyOpen = !!(
        document.querySelector('[data-radix-portal] [data-state="open"]') ||
        document.querySelector('[data-radix-select-content][data-state="open"]') ||
        document.querySelector('[data-radix-dialog-content][data-state="open"]') ||
        document.querySelector('[data-radix-popover-content][data-state="open"]')
      );
      
      if (!hasAnyOpen) {
        document.body.removeAttribute("data-scroll-locked");
        document.body.style.overflow = "";
        document.body.style.paddingRight = "";
        document.body.style.pointerEvents = "";
      }
    }, 5000);

    return () => window.clearInterval(interval);
  }, []);

  return null;
}
