import { MessageSquare, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function QaHeader() {
  return (
    <div className="space-y-4">
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
