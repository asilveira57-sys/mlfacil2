import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

import {
  describeElement,
  isSuspiciousClickBlocker,
  performGlobalUiCleanup,
} from "@/lib/uiRouteCleanup";

/**
 * Global, defensive cleanup to prevent invisible overlays / orphan portals
 * from blocking interactions after route transitions.
 */
export function RouteChangeCleanup() {
  const { pathname } = useLocation();
  const lastPathRef = useRef<string>(pathname);
  const lastCleanupAtRef = useRef<number>(0);

  useEffect(() => {
    if (lastPathRef.current === pathname) return;
    lastPathRef.current = pathname;

    // Run a multi-pass cleanup to catch both immediate leftovers and
    // mid-animation leftovers.
    const now = Date.now();
    lastCleanupAtRef.current = now;

    performGlobalUiCleanup(`route-change:${pathname}`);

    const t1 = window.setTimeout(() => performGlobalUiCleanup(`route-change:post-150ms:${pathname}`), 150);
    const t2 = window.setTimeout(() => performGlobalUiCleanup(`route-change:post-600ms:${pathname}`), 600);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [pathname]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;

    const onPointerDownCapture = (e: PointerEvent) => {
      // If a modal is legitimately open, we don't want noisy logs.
      const hasAnyOpen = !!document.querySelector('[data-radix-portal] [data-state="open"]');
      if (hasAnyOpen) return;

      const topEl = document.elementFromPoint(e.clientX, e.clientY);
      if (!isSuspiciousClickBlocker(topEl)) return;

      // Avoid spamming: log at most once per second, and prefer logs soon after a route change.
      const now = Date.now();
      const recentRouteChange = now - lastCleanupAtRef.current < 10_000;
      if (!recentRouteChange) return;
      if ((window as any).__lastUiBlockerLogAt && now - (window as any).__lastUiBlockerLogAt < 1000) return;
      (window as any).__lastUiBlockerLogAt = now;

      // eslint-disable-next-line no-console
      console.warn(
        "[UI-Cleanup][DEV] Clique está caindo em um possível overlay invisível:",
        describeElement(topEl),
        { x: e.clientX, y: e.clientY },
      );
    };

    window.addEventListener("pointerdown", onPointerDownCapture, true);
    return () => window.removeEventListener("pointerdown", onPointerDownCapture, true);
  }, []);

  return null;
}
