import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  HeartPulse,
  Scan,
  RefreshCw,
  Zap,
  Loader2,
} from "lucide-react";
import { useActiveAccount } from "@/contexts/ActiveAccountContext";
import { PageContainer } from "@/components/layout/PageContainer";
import { useModuleFeedbackIntegration } from "@/hooks/useModuleFeedbackIntegration";
import { FeedbackPromptCard } from "@/components/feedback";
import { useRadiographyData, PeriodDays, HealthCurrentItem } from "@/hooks/useRadiographyData";
import { RadiographyDiagnosticCards } from "@/components/radiography/RadiographyDiagnosticCards";
import { RadiographyItemList } from "@/components/radiography/RadiographyItemList";
import { RadiographyDetailPanel } from "@/components/radiography/RadiographyDetailPanel";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function Radiografia() {
  const { sellerId } = useActiveAccount();
  const feedback = useModuleFeedbackIntegration("radiografia-seed");
  const { toast } = useToast();

  const {
    items,
    itemsLoading,
    diagnostics,
    diagnosticsLoading,
    fetchItemHistory,
    triggerUpdate,
    refetchItems,
  } = useRadiographyData(sellerId);

  const [selectedPeriod, setSelectedPeriod] = useState<PeriodDays>(30);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [updating, setUpdating] = useState(false);

  const selectedItem = useMemo(() => {
    if (!selectedItemId) return null;
    return items.find((i) => i.item_id === selectedItemId) || null;
  }, [items, selectedItemId]);

  const handleSelectItem = (itemId: string) => {
    setSelectedItemId(itemId);
    setDrawerOpen(true);
  };

  const handleUpdate = async () => {
    setUpdating(true);
    try {
      await triggerUpdate();
      toast({
        title: "Atualização em processamento",
        description: "Os dados serão atualizados em alguns minutos.",
      });
      // Refetch after a short delay
      setTimeout(() => {
        refetchItems();
        setUpdating(false);
      }, 5000);
    } catch {
      toast({
        title: "Erro ao solicitar atualização",
        description: "Tente novamente mais tarde.",
        variant: "destructive",
      });
      setUpdating(false);
    }
  };

  const lastUpdate = diagnostics?.lastCollectionAt;

  return (
    <PageContainer title="Radiografia" subtitle="Diagnóstico clínico dos seus anúncios">
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
        {/* Scan lines overlay */}
        <div
          className="fixed inset-0 pointer-events-none opacity-[0.02]"
          style={{
            backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,255,0.1) 2px, rgba(0,255,255,0.1) 4px)`,
          }}
        />

        <div className="container max-w-7xl mx-auto py-6 px-4 relative space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="h-14 w-14 rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center">
                  <Scan className="h-7 w-7 text-cyan-400" />
                </div>
                <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-slate-900 border border-cyan-500/30 flex items-center justify-center">
                  <HeartPulse className="h-3 w-3 text-cyan-400" />
                </div>
              </div>
              <div>
                <h2 className="text-2xl font-bold text-slate-100">Diagnóstico Clínico</h2>
                <p className="text-slate-400">
                  {lastUpdate
                    ? `Dados atualizados ${formatDistanceToNow(new Date(lastUpdate), { addSuffix: true, locale: ptBR })}`
                    : "Exame interno da saúde dos seus anúncios"}
                </p>
              </div>
            </div>
            <Button
              onClick={handleUpdate}
              disabled={updating}
              className="gap-2 bg-cyan-600 hover:bg-cyan-500 text-white border-0"
            >
              {updating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Zap className="h-4 w-4" />
              )}
              {updating ? "Processando..." : "Atualizar Dados"}
            </Button>
          </div>

          {/* No seller state */}
          {!sellerId ? (
            <Card className="bg-slate-900/50 border-slate-700/50">
              <CardContent className="py-8 text-center text-slate-400">
                Conecte uma conta do Mercado Livre para usar a Radiografia.
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Diagnostic Cards */}
              <RadiographyDiagnosticCards data={diagnostics} loading={diagnosticsLoading} />

              {/* Item List / Prontuários */}
              <RadiographyItemList
                items={items}
                loading={itemsLoading}
                onSelectItem={handleSelectItem}
                selectedPeriod={selectedPeriod}
                onPeriodChange={setSelectedPeriod}
                collectionStatus={diagnostics?.lastCollectionStatus ?? null}
                collectionError={diagnostics?.lastCollectionError ?? null}
              />

              {/* Detail Panel */}
              <RadiographyDetailPanel
                item={selectedItem}
                open={drawerOpen}
                onClose={() => {
                  setDrawerOpen(false);
                  setSelectedItemId(null);
                }}
                fetchHistory={fetchItemHistory}
                selectedPeriod={selectedPeriod}
              />

              {/* Feedback */}
              {feedback.ready && (
                <FeedbackPromptCard
                  kind="module"
                  moduleSlug="radiografia-seed"
                  moduleName="Radiografia"
                  userId={feedback.userId!}
                  sellerId={feedback.sellerId!}
                />
              )}
            </>
          )}
        </div>
      </div>
    </PageContainer>
  );
}
