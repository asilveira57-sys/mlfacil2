import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { RefreshCw, Wifi, BarChart3 } from "lucide-react";

const MICROCOPY = [
  "Verificando sua sessão...",
  "Validando credenciais...",
  "Restaurando seu acesso...",
  "Preparando o ambiente...",
];

const MAX_RETRIES = 3;

const Reconnecting = () => {
  const navigate = useNavigate();
  const [progress, setProgress] = useState(10);
  const [msgIndex, setMsgIndex] = useState(0);
  const [failed, setFailed] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [forceLoading, setForceLoading] = useState(false);
  const retriesRef = useRef(0);
  const attemptedRef = useRef(false);

  // Rotate microcopy
  useEffect(() => {
    if (failed) return;
    const interval = setInterval(() => {
      setMsgIndex((prev) => (prev + 1) % MICROCOPY.length);
      setProgress((prev) => Math.min(prev + 18, 90));
    }, 2000);
    return () => clearInterval(interval);
  }, [failed]);

  const attemptReconnect = useCallback(async () => {
    if (retriesRef.current >= MAX_RETRIES) {
      console.warn("[Reconnecting] Max retries reached");
      setFailed(true);
      setErrorMsg("Não foi possível restaurar sua sessão automaticamente.");
      return;
    }

    retriesRef.current += 1;
    console.info(`[Reconnecting] Attempt ${retriesRef.current}/${MAX_RETRIES}`);

    try {
      const { data, error } = await supabase.auth.refreshSession();
      
      if (error || !data.session) {
        console.warn("[Reconnecting] Refresh failed:", error?.message);
        if (retriesRef.current < MAX_RETRIES) {
          setTimeout(attemptReconnect, 1500);
        } else {
          setFailed(true);
          setErrorMsg("Sessão expirada. Faça login novamente.");
        }
        return;
      }

      console.info("[Reconnecting] Session restored successfully");
      setProgress(100);
      // Small delay for UX
      setTimeout(() => navigate("/dashboard", { replace: true }), 500);
    } catch (err: any) {
      console.error("[Reconnecting] Error:", err);
      if (retriesRef.current < MAX_RETRIES) {
        setTimeout(attemptReconnect, 1500);
      } else {
        setFailed(true);
        setErrorMsg(err?.message || "Erro inesperado na reconexão.");
      }
    }
  }, [navigate]);

  useEffect(() => {
    if (!attemptedRef.current) {
      attemptedRef.current = true;
      attemptReconnect();
    }
  }, [attemptReconnect]);

  const handleForceReconnect = async () => {
    setForceLoading(true);
    setErrorMsg(null);
    setFailed(false);
    setProgress(10);
    retriesRef.current = 0;
    console.info("[Reconnecting] Manual force reconnect");

    try {
      const { data, error } = await supabase.auth.refreshSession();
      if (error || !data.session) {
        setFailed(true);
        setErrorMsg("Não foi possível reconectar. Faça login novamente.");
      } else {
        setProgress(100);
        setTimeout(() => navigate("/dashboard", { replace: true }), 500);
      }
    } catch (err: any) {
      setFailed(true);
      setErrorMsg(err?.message || "Erro inesperado.");
    } finally {
      setForceLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted to-background flex flex-col">
      {/* Minimal header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center">
            <BarChart3 className="w-6 h-6 text-primary-foreground" />
          </div>
          <h1 className="text-xl font-bold text-foreground">MKTP Fácil</h1>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 flex items-center justify-center p-8">
        <div className="max-w-md w-full text-center space-y-6">
          {/* Animated icon */}
          <div className="relative mx-auto w-20 h-20">
            <div className="absolute inset-0 rounded-full bg-primary/10 animate-ping" style={{ animationDuration: "2s" }} />
            <div className="relative w-20 h-20 rounded-full bg-primary/15 flex items-center justify-center">
              <Wifi className="w-9 h-9 text-primary animate-pulse" />
            </div>
          </div>

          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-foreground">
              Reconectando sua conta...
            </h2>
            <p className="text-sm text-muted-foreground">
              Estamos reconectando sua conta automaticamente.
              {!failed && " Em alguns segundos você vai continuar de onde parou."}
            </p>
          </div>

          {/* Progress */}
          {!failed && (
            <div className="space-y-2">
              <Progress value={progress} className="h-1.5" />
              <p className="text-xs text-muted-foreground/70 transition-opacity duration-500">
                {MICROCOPY[msgIndex]}
              </p>
            </div>
          )}

          {/* Error */}
          {errorMsg && (
            <p className="text-sm text-destructive">{errorMsg}</p>
          )}

          {/* Actions */}
          <div className="space-y-3">
            {failed && (
              <>
                <Button onClick={handleForceReconnect} disabled={forceLoading} className="w-full">
                  {forceLoading ? (
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4 mr-2" />
                  )}
                  Forçar reconexão
                </Button>
                <Button variant="outline" onClick={() => navigate("/auth", { replace: true })} className="w-full">
                  Voltar ao login
                </Button>
              </>
            )}
            {!failed && (
              <p className="text-xs text-muted-foreground/60">
                Caso demore mais que o esperado, você pode forçar a reconexão.
              </p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default Reconnecting;
