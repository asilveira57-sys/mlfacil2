import { MessageSquareText, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function PostSaleHeader() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <MessageSquareText className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Mensagem Pós-Venda</h1>
          <p className="text-sm text-muted-foreground">
            Orientação, prevenção de problemas e suporte ao comprador
          </p>
        </div>
      </div>

      <Alert variant="default" className="border-amber-500/50 bg-amber-500/10">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        <AlertDescription className="text-amber-800 dark:text-amber-200">
          Este módulo é destinado a suporte e orientação. Uso promocional pode gerar penalizações no marketplace.
        </AlertDescription>
      </Alert>
    </div>
  );
}
