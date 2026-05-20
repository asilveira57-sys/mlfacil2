import { useEffect, useRef, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useUserAccess } from "@/contexts/UserAccessContext";
import { useCollaboratorAccess } from "@/hooks/useCollaboratorAccess";
import { Loader2 } from "lucide-react";

// Routes that should NOT trigger the onboarding redirect
const ONBOARDING_BYPASS = ["/primeiro-acesso", "/sincronizando", "/reconnecting"];

/**
 * ProtectedRoute wraps dashboard/private routes:
 * - No session → redirect to /auth
 * - Session + onboarding pending → redirect to /primeiro-acesso
 * - Session + onboarding done → render children
 *
 * Collaborators never go through /primeiro-acesso — they inherit the
 * titular's company context and land straight on the dashboard.
 */
export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [sessionChecked, setSessionChecked] = useState(false);
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const { requiresOnboarding, loading: accessLoading } = useUserAccess();
  const { isCollaborator } = useCollaboratorAccess();
  const lastDecisionRef = useRef<string | null>(null);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    console.log("[MOUNT] ProtectedRoute");
    return () => console.log("[UNMOUNT] ProtectedRoute");
  }, []);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    console.log("[ACCESS_LOADING_CHANGED]", accessLoading);
  }, [accessLoading]);

  // Check session on mount
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setHasSession(!!session);
      setSessionChecked(true);
    });
  }, []);

  // Clean up stale onboarding localStorage when onboarding is done
  useEffect(() => {
    if (!requiresOnboarding && hasSession) {
      const staleKey = "mktp_onboarding_progress";
      if (localStorage.getItem(staleKey)) {
        localStorage.removeItem(staleKey);
        console.info("[ProtectedRoute] Cleared stale onboarding localStorage");
      }
    }
  }, [requiresOnboarding, hasSession]);

  const isBypassRoute = ONBOARDING_BYPASS.some((p) => location.pathname.startsWith(p));
  const decision = !sessionChecked
    ? "checking_session"
    : !hasSession
      ? "redirect_auth"
      : requiresOnboarding && !isBypassRoute && !isCollaborator
        ? "redirect_onboarding"
        : "render_children";

  if (import.meta.env.DEV && lastDecisionRef.current !== decision) {
    lastDecisionRef.current = decision;
    console.log("[PROTECTED_ROUTE_DECISION]", decision, { pathname: location.pathname, accessLoading, hasSession });
  }

  // Still checking session (initial load only)
  if (!sessionChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // No session at all
  if (!hasSession) {
    console.info("[ProtectedRoute] No session, redirecting to /auth from:", location.pathname);
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  // Onboarding still pending — redirect to /primeiro-acesso unless already there
  // Collaborators are exempt: they inherit the titular's onboarding state.
  if (requiresOnboarding && !isBypassRoute && !isCollaborator) {
    console.info("[ProtectedRoute] Onboarding pending, redirecting to /primeiro-acesso from:", location.pathname);
    return <Navigate to="/primeiro-acesso" replace />;
  }

  return <>{children}</>;
}
