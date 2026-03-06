import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useUserAccess } from "@/contexts/UserAccessContext";
import { Loader2 } from "lucide-react";

/**
 * ProtectedRoute wraps dashboard/private routes:
 * - No session → redirect to /auth
 * - Session + onboarding pending → redirect to /primeiro-acesso
 * - Session + onboarding complete → render children
 */
export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { loading: accessLoading, isAuthenticated, requiresOnboarding } = useUserAccess();
  const [sessionChecked, setSessionChecked] = useState(false);
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setHasSession(!!session);
      setSessionChecked(true);
    });
  }, []);

  // Still checking session
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

  // Wait for access state to load
  if (accessLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Authenticated but onboarding not completed → redirect to /primeiro-acesso
  // (only if user is not already on /primeiro-acesso)
  if (isAuthenticated && requiresOnboarding && location.pathname !== "/primeiro-acesso") {
    console.info("[ProtectedRoute] Onboarding required, redirecting to /primeiro-acesso");
    return <Navigate to="/primeiro-acesso" replace />;
  }

  return <>{children}</>;
}
