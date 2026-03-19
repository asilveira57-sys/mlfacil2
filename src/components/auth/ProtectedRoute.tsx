import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useUserAccess } from "@/contexts/UserAccessContext";
import { Loader2 } from "lucide-react";

// Routes that should NOT trigger the onboarding redirect
const ONBOARDING_BYPASS = ["/primeiro-acesso", "/sincronizando", "/reconnecting"];

/**
 * ProtectedRoute wraps dashboard/private routes:
 * - No session → redirect to /auth
 * - Session + onboarding pending → redirect to /primeiro-acesso
 * - Session + onboarding done → render children
 */
export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [sessionChecked, setSessionChecked] = useState(false);
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const { requiresOnboarding, loading: accessLoading } = useUserAccess();

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

  // Still checking session
  if (!sessionChecked || accessLoading) {
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
  const isBypassRoute = ONBOARDING_BYPASS.some((p) => location.pathname.startsWith(p));
  if (requiresOnboarding && !isBypassRoute) {
    console.info("[ProtectedRoute] Onboarding pending, redirecting to /primeiro-acesso from:", location.pathname);
    return <Navigate to="/primeiro-acesso" replace />;
  }

  return <>{children}</>;
}
