import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

/**
 * ProtectedRoute wraps dashboard/private routes:
 * - No session → redirect to /auth
 * - Session → render children (Welcome Cards handle onboarding via modal)
 */
export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const location = useLocation();
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

  // Onboarding is now handled by Welcome Cards modal on the Dashboard.
  // No forced redirect to /primeiro-acesso anymore.
  return <>{children}</>;
}
