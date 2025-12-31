import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Loader2, Sparkles } from "lucide-react";

interface OnboardingSyncProps {
  sellerNickname?: string;
  progress: number;
  processedRecords: number;
  totalRecords: number;
  status: string;
}

export function OnboardingSync({
  sellerNickname,
  progress,
  processedRecords,
  totalRecords,
  status,
}: OnboardingSyncProps) {
  const isProcessing = status === "processing";
  const isDone = status === "done";

  return (
    <Card className="p-8 max-w-lg mx-auto">
      <div className="text-center space-y-6">
        {/* Icon */}
        <div className="w-16 h-16 mx-auto bg-primary/10 rounded-full flex items-center justify-center">
          {isProcessing ? (
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          ) : (
            <Sparkles className="w-8 h-8 text-primary" />
          )}
        </div>

        {/* Welcome Message */}
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-foreground">
            {isDone ? "Tudo pronto!" : "Bem-vindo ao ML Analyzer Pro!"}
          </h2>
          {sellerNickname && (
            <p className="text-muted-foreground">
              Conta: <span className="font-medium">{sellerNickname}</span>
            </p>
          )}
        </div>

        {/* Status Message */}
        <div className="space-y-2">
          {isProcessing && (
            <>
              <p className="text-foreground">
                Estamos carregando seus dados do Mercado Livre...
              </p>
              <p className="text-sm text-muted-foreground">
                Isso pode levar alguns minutos dependendo do volume de pedidos.
              </p>
            </>
          )}
          {isDone && (
            <p className="text-foreground">
              Seus dados foram carregados com sucesso!
            </p>
          )}
          {status === "error" && (
            <p className="text-destructive">
              Ocorreu um erro durante a sincronização. Tente novamente.
            </p>
          )}
        </div>

        {/* Progress Bar */}
        {(isProcessing || isDone) && (
          <div className="space-y-3">
            <Progress value={progress} className="h-3" />
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {isProcessing ? "Sincronizando pedidos..." : "Concluído"}
              </span>
              <span className="font-medium text-foreground">
                {processedRecords.toLocaleString("pt-BR")} / {totalRecords.toLocaleString("pt-BR")}
              </span>
            </div>
          </div>
        )}

        {/* Tip */}
        {isProcessing && (
          <div className="bg-muted/50 rounded-lg p-4 text-sm text-muted-foreground">
            <p>
              💡 <strong>Dica:</strong> Você pode navegar para outras páginas enquanto
              a sincronização acontece em segundo plano.
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}
