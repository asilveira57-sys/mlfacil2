import { useState } from "react";
import { MessageSquare, AlertTriangle, RefreshCw } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useActiveAccount } from "@/contexts/ActiveAccountContext";
import { useQueryClient } from "@tanstack/react-query";
import { AutoSyncBadge } from "@/components/shared/AutoSyncBadge";

export function QaHeader() {
  const { activeAccount, sellerId } = useActiveAccount();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSync = async () => {
    if (!sellerId || isSyncing) return;

    setIsSyncing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error("Não autenticado");
      }

      // Sync unanswered questions - pass account_id for proper lookup
      const response = await supabase.functions.invoke("ml-sync-questions", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { 
          seller_id: sellerId, 
          account_id: activeAccount?.id,
          status: "UNANSWERED", 
          limit: 100 
        },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      const data = response.data;

      if (data.success) {
        toast({
          title: "Sincronização concluída",
          description: `${data.synced} pergunta(s) sincronizada(s). ${data.pending} pendente(s).`,
        });
        
        // Invalidate queries to refresh UI
        queryClient.invalidateQueries({ queryKey: ["qa-questions"] });
        queryClient.invalidateQueries({ queryKey: ["qa-pending-count"] });
      } else {
        throw new Error(data.error || "Erro desconhecido");
      }
    } catch (error) {
      console.error("Sync error:", error);
      toast({
        title: "Erro na sincronização",
        description: error instanceof Error ? error.message : "Erro ao sincronizar perguntas",
        variant: "destructive",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 bg-gradient-to-br from-primary to-primary/80 rounded-lg flex items-center justify-center">
            <MessageSquare className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              Perguntas e Respostas
            </h1>
            <p className="text-sm text-muted-foreground">
              Gerencie perguntas dos anúncios com segurança e agilidade
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <AutoSyncBadge />
          <Button
            variant="outline"
            size="sm"
            onClick={handleSync}
            disabled={isSyncing || !sellerId}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
            {isSyncing ? "Sincronizando..." : "Atualizar"}
          </Button>
        </div>
      </div>

      <Alert variant="default" className="border-amber-500/30 bg-amber-500/5">
        <AlertTriangle className="h-4 w-4 text-amber-500" />
        <AlertDescription className="text-sm text-muted-foreground">
          <strong className="text-foreground">Atenção:</strong> Este módulo é destinado a suporte e orientação. 
          Respostas com contatos externos, pedidos de avaliação ou promoções são bloqueadas automaticamente 
          para proteger sua conta no marketplace.
        </AlertDescription>
      </Alert>
    </div>
  );
}
