import { useState, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveAccount } from "@/contexts/ActiveAccountContext";
import { toast } from "sonner";

const THROTTLE_MS = 30_000;
let lastClickAt = 0;

type Target = {
  label: string;
  fn?: string;
  invalidateKeys: string[][];
};

/**
 * Decide o que sincronizar com base na rota atual.
 * Mantém o escopo no módulo visível para não atacar o ML em vão.
 */
function pickTarget(pathname: string): Target {
  const p = pathname.toLowerCase();
  if (p.includes("/pedido") || p.includes("/venda") || p.includes("/order") || p.includes("/sale")) {
    return {
      label: "Vendas/Pedidos",
      fn: "ml-sync-orders",
      invalidateKeys: [["orders"], ["sales"], ["dashboard"]],
    };
  }
  if (p.includes("/mensage") || p.includes("/message") || p.includes("/post-sale")) {
    return {
      label: "Mensagens",
      fn: "ml-sync-messages",
      invalidateKeys: [["post-sale-messages"], ["messages"]],
    };
  }
  if (p.includes("/pergunt") || p.includes("/question") || p.includes("/qa")) {
    return {
      label: "Perguntas",
      fn: "ml-sync-questions",
      invalidateKeys: [["qa-questions"], ["questions"]],
    };
  }
  if (p.includes("/envio") || p.includes("/etiqueta") || p.includes("/shipping") || p.includes("/logist")) {
    return {
      label: "Envios",
      fn: "shipping-labels-sync",
      invalidateKeys: [["shipping"], ["shipments"]],
    };
  }
  // Padrão: dashboard — só re-renderiza queries, sem disparar edge function
  return {
    label: "Dashboard",
    invalidateKeys: [["dashboard"], ["app-notifications"], ["admin-login-activity"]],
  };
}

export function RefreshNowButton() {
  const location = useLocation();
  const queryClient = useQueryClient();
  const { sellerId } = useActiveAccount();
  const [busy, setBusy] = useState(false);

  const onClick = useCallback(async () => {
    const now = Date.now();
    if (now - lastClickAt < THROTTLE_MS) {
      toast.info("Aguarde alguns segundos antes de atualizar novamente.");
      return;
    }
    lastClickAt = now;

    const target = pickTarget(location.pathname);
    setBusy(true);
    const toastId = toast.loading(`Atualizando ${target.label}...`);

    try {
      if (target.fn) {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error("Sessão expirada");
        await supabase.functions.invoke(target.fn, {
          headers: { Authorization: `Bearer ${session.access_token}` },
          body: { seller_id: sellerId, manual: true, source: "manual" },
        });
      }

      await Promise.all(
        target.invalidateKeys.map((key) =>
          queryClient.invalidateQueries({ queryKey: key }),
        ),
      );

      toast.success(`${target.label} atualizado`, { id: toastId });
    } catch (err: any) {
      console.warn("[RefreshNow] erro:", err);
      toast.error(`Falha ao atualizar ${target.label}`, {
        id: toastId,
        description: err?.message?.slice(0, 120),
      });
    } finally {
      setBusy(false);
    }
  }, [location.pathname, queryClient, sellerId]);

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClick}
            disabled={busy}
            aria-label="Atualizar agora"
          >
            <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Atualizar agora</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
