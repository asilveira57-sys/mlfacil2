/**
 * MLConnectionCard
 * 
 * 4-state card for Mercado Livre connection management on dashboard.
 * States: FIRST_CONNECTION | RECONNECTING | CONNECTED | RECONNECT_REQUIRED
 */

import { useEffect, useState } from "react";
import { MLOAuthWarningModal } from "@/components/ml/MLOAuthWarningModal";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ShoppingBag,
  Wifi,
  WifiOff,
  CheckCircle2,
  RefreshCw,
  Settings,
  Zap,
  Shield,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useCollaboratorAccess } from "@/hooks/useCollaboratorAccess";
import type { MLConnectionState, MLConnectionInfo } from "@/hooks/useMLConnectionState";

interface MLConnectionCardProps {
  connectionInfo: MLConnectionInfo;
}

export function MLConnectionCard({ connectionInfo }: MLConnectionCardProps) {
  const { state } = connectionInfo;
  const { isCollaborator } = useCollaboratorAccess();

  if (!state) return null;
  if (isCollaborator && (state === "FIRST_CONNECTION" || state === "RECONNECT_REQUIRED")) return null;

  switch (state) {
    case "FIRST_CONNECTION":
      return <FirstConnectionCard />;
    case "RECONNECTING":
      return <ReconnectingCard />;
    case "CONNECTED":
      return <ConnectedCard connectionInfo={connectionInfo} />;
    case "RECONNECT_REQUIRED":
      return <ReconnectRequiredCard />;
    default:
      return null;
  }
}

// ─── FIRST_CONNECTION ──────────────────────────────────────────────────────────

function FirstConnectionCard() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [connecting, setConnecting] = useState(false);
  const [showWarning, setShowWarning] = useState(false);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      let { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({ title: "Sessão expirada", description: "Faça login novamente", variant: "destructive" });
        navigate("/auth");
        return;
      }

      let response = await supabase.functions.invoke("ml-auth-url", {
        body: { frontendOrigin: window.location.origin },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (response.error?.message?.includes("401") || response.error?.status === 401) {
        const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError || !refreshData.session) {
          toast({ title: "Sessão expirada", description: "Faça login novamente", variant: "destructive" });
          navigate("/auth");
          return;
        }
        session = refreshData.session;
        response = await supabase.functions.invoke("ml-auth-url", {
          body: { frontendOrigin: window.location.origin },
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
      }

      if (response.error) throw response.error;
      if (response.data?.authUrl) {
        window.location.href = response.data.authUrl;
      } else {
        throw new Error("URL de autorização não recebida");
      }
    } catch (error: unknown) {
      console.error("[MLConnectionCard] Connect error:", error);
      const message = error instanceof Error ? error.message : "Não foi possível iniciar a conexão";
      toast({
        title: "Erro ao conectar",
        description: message,
        variant: "destructive",
      });
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="min-h-[50vh] flex items-center justify-center">
      <Card className="max-w-md w-full border-2 border-dashed border-primary/25 bg-gradient-to-br from-primary/5 via-background to-background shadow-lg">
        <CardContent className="p-8 text-center space-y-6">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
            <ShoppingBag className="w-8 h-8 text-primary" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-foreground">
              Conecte sua conta do Mercado Livre
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Vincule sua conta para começar a importar vendas, analisar custos,
              acompanhar anúncios e visualizar métricas automaticamente.
            </p>
          </div>
          <Button
            className="w-full gap-2"
            size="lg"
            onClick={() => setShowWarning(true)}
            disabled={connecting}
          >
            {connecting ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Zap className="w-4 h-4" />
            )}
            {connecting ? "Conectando..." : "Conectar Mercado Livre"}
          </Button>
          <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground/70">
            <Shield className="w-3 h-3" />
            <span>Conexão OAuth oficial — pode ser revogada a qualquer momento.</span>
          </div>
        </CardContent>
      </Card>

      <MLOAuthWarningModal
        open={showWarning}
        onClose={() => setShowWarning(false)}
        onConfirm={() => { setShowWarning(false); handleConnect(); }}
        loading={connecting}
      />
    </div>
  );
}

// ─── RECONNECTING ──────────────────────────────────────────────────────────────

const MICROCOPY = [
  "Validando credenciais...",
  "Atualizando permissões...",
  "Preparando métricas...",
  "Restabelecendo conexão...",
];

function ReconnectingCard() {
  const [msgIndex, setMsgIndex] = useState(0);

  // Rotate microcopy
  useState(() => {
    const interval = setInterval(() => {
      setMsgIndex((prev) => (prev + 1) % MICROCOPY.length);
    }, 2200);
    return () => clearInterval(interval);
  });

  return (
    <div className="min-h-[50vh] flex items-center justify-center">
      <Card className="max-w-md w-full shadow-lg border-primary/10">
        <CardContent className="p-8 text-center space-y-6">
          {/* Animated icon */}
          <div className="relative mx-auto w-20 h-20">
            <div
              className="absolute inset-0 rounded-full bg-primary/10 animate-ping"
              style={{ animationDuration: "2s" }}
            />
            <div className="relative w-20 h-20 rounded-full bg-primary/15 flex items-center justify-center">
              <Wifi className="w-9 h-9 text-primary animate-pulse" />
            </div>
          </div>

          {/* Text */}
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-foreground">
              Restaurando sua conexão
            </h2>
            <p className="text-sm text-muted-foreground">
              Estamos validando sua conta do Mercado Livre e preparando a
              sincronização dos dados.
            </p>
            <p className="text-xs text-muted-foreground/60">
              Isso leva apenas alguns segundos.
            </p>
          </div>

          {/* Indeterminate progress */}
          <div className="space-y-2">
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary animate-pulse"
                style={{
                  width: "60%",
                  animation: "indeterminate 1.5s ease-in-out infinite",
                }}
              />
            </div>
            <p className="text-xs text-muted-foreground/70 transition-opacity duration-500">
              {MICROCOPY[msgIndex]}
            </p>
          </div>

          {/* Trust text */}
          <p className="text-xs text-muted-foreground/50">
            Se a conexão precisar ser renovada, você será avisado automaticamente.
          </p>
        </CardContent>
      </Card>

      {/* CSS for indeterminate animation */}
      <style>{`
        @keyframes indeterminate {
          0% { transform: translateX(-100%); }
          50% { transform: translateX(60%); }
          100% { transform: translateX(200%); }
        }
      `}</style>
    </div>
  );
}

// ─── CONNECTED ─────────────────────────────────────────────────────────────────

function ConnectedCard({ connectionInfo }: { connectionInfo: MLConnectionInfo }) {
  const navigate = useNavigate();
  const { nickname, email, sellerId, lastApiOkAt } = connectionInfo;

  const displayName = nickname || email || sellerId || "Conta ML";
  const lastSync = lastApiOkAt
    ? new Date(lastApiOkAt).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

  return (
    <Card className="border-success/20 bg-success/5">
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          {/* Icon */}
          <div className="w-10 h-10 rounded-xl bg-success/15 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5 text-success" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-foreground">
                Conta conectada
              </h3>
              <Badge variant="outline" className="text-success border-success/30 text-[10px] px-1.5">
                Ativo
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground truncate">
              {displayName}
            </p>
            <p className="text-[11px] text-muted-foreground/60">
              Última sincronização: {lastSync}
            </p>
          </div>

          {/* Action */}
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0"
            onClick={() => navigate("/settings")}
          >
            <Settings className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── RECONNECT_REQUIRED ────────────────────────────────────────────────────────

function ReconnectRequiredCard() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [reconnecting, setReconnecting] = useState(false);
  const [showWarning, setShowWarning] = useState(false);

  const handleReconnect = async () => {
    setReconnecting(true);
    try {
      let { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({ title: "Sessão expirada", description: "Faça login novamente", variant: "destructive" });
        navigate("/auth");
        return;
      }

      let response = await supabase.functions.invoke("ml-auth-url", {
        body: { frontendOrigin: window.location.origin },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (response.error?.message?.includes("401") || response.error?.status === 401) {
        const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError || !refreshData.session) {
          toast({ title: "Sessão expirada", description: "Faça login novamente", variant: "destructive" });
          navigate("/auth");
          return;
        }
        session = refreshData.session;
        response = await supabase.functions.invoke("ml-auth-url", {
          body: { frontendOrigin: window.location.origin },
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
      }

      if (response.error) throw response.error;
      if (response.data?.authUrl) {
        window.location.href = response.data.authUrl;
      } else {
        throw new Error("URL de autorização não recebida");
      }
    } catch (error: unknown) {
      console.error("[MLConnectionCard] Reconnect error:", error);
      const message = error instanceof Error ? error.message : "Não foi possível iniciar a reconexão";
      toast({
        title: "Erro ao reconectar",
        description: message,
        variant: "destructive",
      });
    } finally {
      setReconnecting(false);
    }
  };

  return (
    <div className="min-h-[50vh] flex items-center justify-center">
      <Card className="max-w-md w-full border-destructive/20 shadow-lg">
        <CardContent className="p-8 text-center space-y-6">
          {/* Icon */}
          <div className="mx-auto w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center">
            <WifiOff className="w-8 h-8 text-destructive" />
          </div>

          {/* Text */}
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-foreground">
              Sua conexão precisa ser renovada
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              O acesso à sua conta do Mercado Livre expirou ou foi interrompido.
            </p>
            <p className="text-xs text-muted-foreground/70">
              Para continuar importando vendas e métricas, é necessário renovar a autorização.
            </p>
          </div>

          {/* CTA */}
          <Button
            className="w-full gap-2"
            size="lg"
            onClick={() => setShowWarning(true)}
            disabled={reconnecting}
          >
            {reconnecting ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            {reconnecting ? "Reconectando..." : "Reconectar conta"}
          </Button>

          <p className="text-xs text-muted-foreground/50">
            A reconexão leva poucos segundos e não altera seus dados já importados.
          </p>
        </CardContent>
      </Card>

      <MLOAuthWarningModal
        open={showWarning}
        onClose={() => setShowWarning(false)}
        onConfirm={() => { setShowWarning(false); handleReconnect(); }}
        loading={reconnecting}
      />
    </div>
  );
}
