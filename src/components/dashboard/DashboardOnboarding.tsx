import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

interface DashboardOnboardingProps {
  onConnectML: () => void;
}

export function DashboardOnboarding({ onConnectML }: DashboardOnboardingProps) {
  return (
    <div className="max-w-lg mx-auto mt-12">
      <Card className="p-8 text-center border-2 border-dashed border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
        <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Plus className="w-7 h-7 text-primary" />
        </div>
        <h2 className="text-xl font-semibold text-foreground mb-2">
          Conecte sua conta do Mercado Livre
        </h2>
        <p className="text-sm text-muted-foreground mb-6">
          Vincule sua conta para começar a analisar vendas, custos e anúncios automaticamente.
        </p>
        <Button className="w-full" onClick={onConnectML}>
          Conectar Mercado Livre
        </Button>
      </Card>
    </div>
  );
}
