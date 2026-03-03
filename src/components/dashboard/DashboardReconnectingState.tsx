import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw, Wifi } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { refreshAccountToken } from "@/lib/mlTokenRefresh";
import { useActiveAccount } from "@/contexts/ActiveAccountContext";

const MICROCOPY_MESSAGES = [
  "Validando credenciais...",
  "Atualizando permissões...",
  "Preparando métricas...",
  "Restabelecendo conexão...",
];

const MAX_AUTO_RETRIES = 3;
const AUTO_TIMEOUT_MS = 8000;

interface DashboardReconnectingStateProps {
  accountId: string;
  onReconnected: () => void;
}

export function DashboardReconnectingState({ accountId, onReconnected }: DashboardReconnectingStateProps) {
  const { refreshAccounts } = useActiveAccount();
  const [microcopyIndex, setMicrocopyIndex] = useState(0);
  const [progress, setProgress] = useState(10);
  const [autoFailed, setAutoFailed] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [forceLoading, setForceLoading] = useState(false);
  const retriesRef = useRef(0);
  const attemptedRef = useRef(false);

  // Rotate microcopy every 2s
  useEffect(() => {
    if (autoFailed) return;
    const interval = setInterval(() => {
      setMicrocopyIndex(prev => (prev + 1) % MICROCOPY_MESSAGES.length);
      setProgress(prev => Math.min(prev + 15, 90));
    }, 2000);
    return () => clearInterval(interval);
  }, [autoFailed]);

  // Auto-reconnect on mount
  const attemptReconnect = useCallback(async () => {
    if (retriesRef.current >= MAX_AUTO_RETRIES) {
      setAutoFailed(true);
      setErrorMessage("Limite de tentativas atingido. Use o botão abaixo para reconectar manualmente.");
      return;
    }

    retriesRef.current += 1;
    console.info(`[DashboardReconnecting] Auto attempt ${retriesRef.current}/${MAX_AUTO_RETRIES} for account ${accountId}`);

    try {
      const result = await Promise.race([
        refreshAccountToken(accountId),
        new Promise<{ success: false; error: string }>((_, reject) =>
          setTimeout(() => reject({ success: false, error: "Timeout de reconexão (8s)" }), AUTO_TIMEOUT_MS)
        ),
      ]);

      if (result.success) {
        console.info("[DashboardReconnecting] Auto reconnect succeeded");
        setProgress(100);
        await refreshAccounts();
        onReconnected();
      } else {
        console.warn("[DashboardReconnecting] Auto reconnect failed:", result.error);
        if (retriesRef.current < MAX_AUTO_RETRIES) {
          // Retry after a short delay
          setTimeout(attemptReconnect, 1500);
        } else {
          setAutoFailed(true);
          setErrorMessage("Não foi possível reconectar automaticamente.");
        }
      }
    } catch (err: any) {
      console.error("[DashboardReconnecting] Error:", err);
      if (retriesRef.current < MAX_AUTO_RETRIES) {
        setTimeout(attemptReconnect, 1500);
      } else {
        setAutoFailed(true);
        setErrorMessage(err?.message || "Erro inesperado na reconexão.");
      }
    }
  }, [accountId, onReconnected, refreshAccounts]);

  useEffect(() => {
    if (!attemptedRef.current) {
      attemptedRef.current = true;
      attemptReconnect();
    }
  }, [attemptReconnect]);

  const handleForceReconnect = async () => {
    setForceLoading(true);
    setErrorMessage(null);
    retriesRef.current = 0;
    setAutoFailed(false);
    setProgress(10);

    console.info("[DashboardReconnecting] Manual force reconnect for account:", accountId);

    try {
      const result = await refreshAccountToken(accountId);
      if (result.success) {
        setProgress(100);
        await refreshAccounts();
        onReconnected();
      } else {
        setErrorMessage(result.error || "Falha na reconexão manual.");
        setAutoFailed(true);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || "Erro inesperado.");
      setAutoFailed(true);
    } finally {
      setForceLoading(false);
    }
  };

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="max-w-md w-full text-center space-y-6 p-8">
        {/* Animated icon */}
        <div className="relative mx-auto w-20 h-20">
          <div className="absolute inset-0 rounded-full bg-primary/10 animate-ping" style={{ animationDuration: "2s" }} />
          <div className="relative w-20 h-20 rounded-full bg-primary/15 flex items-center justify-center">
            <Wifi className="w-9 h-9 text-primary animate-pulse" />
          </div>
        </div>

        {/* Title */}
        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-foreground">
            Reconectando sua conta...
          </h2>
          <p className="text-sm text-muted-foreground">
            Estamos restabelecendo a conexão com o Mercado Livre.
            {!autoFailed && " Isso leva apenas alguns segundos."}
          </p>
        </div>

        {/* Progress */}
        {!autoFailed && (
          <div className="space-y-2">
            <Progress value={progress} className="h-1.5" />
            <p className="text-xs text-muted-foreground/70 transition-opacity duration-500">
              {MICROCOPY_MESSAGES[microcopyIndex]}
            </p>
          </div>
        )}

        {/* Error message */}
        {errorMessage && (
          <p className="text-sm text-destructive">
            {errorMessage}
          </p>
        )}

        {/* Force reconnect */}
        <div className="space-y-2">
          {autoFailed && (
            <Button onClick={handleForceReconnect} disabled={forceLoading} className="w-full">
              {forceLoading ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              Forçar reconexão
            </Button>
          )}
          {!autoFailed && (
            <p className="text-xs text-muted-foreground/60">
              Caso demore mais que o esperado, você pode forçar a reconexão.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
