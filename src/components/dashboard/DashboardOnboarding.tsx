import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, ExternalLink, BarChart3 } from "lucide-react";

interface DashboardOnboardingProps {
  onConnectML: () => void;
}

export function DashboardOnboarding({ onConnectML }: DashboardOnboardingProps) {
  return (
    <div className="max-w-4xl mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-foreground mb-2">
          Bem-vindo ao Mktpfacil
        </h2>
        <p className="text-muted-foreground">
          Configure sua conta para começar a analisar seus anúncios
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="p-6 hover:shadow-lg transition-all duration-300 border-2 border-dashed border-primary/30 hover:border-primary/50 bg-gradient-to-br from-primary/5 to-transparent">
          <div className="flex flex-col items-center text-center">
            <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center mb-4">
              <Plus className="w-7 h-7 text-primary" />
            </div>
            <span className="text-xs font-medium text-primary/60 mb-2">Passo 1</span>
            <h3 className="text-lg font-semibold text-foreground mb-2">
              Conecte sua Conta
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Vincule sua conta do Mercado Livre para começar a analisar seus anúncios automaticamente.
            </p>
            <Button className="w-full" onClick={onConnectML}>
              Conectar Mercado Livre
            </Button>
          </div>
        </Card>

        <Card className="p-6 hover:shadow-lg transition-all duration-300 opacity-60">
          <div className="flex flex-col items-center text-center">
            <div className="w-14 h-14 bg-success/10 rounded-2xl flex items-center justify-center mb-4">
              <ExternalLink className="w-7 h-7 text-success" />
            </div>
            <span className="text-xs font-medium text-muted-foreground mb-2">Passo 2</span>
            <h3 className="text-lg font-semibold text-foreground mb-2">
              Instale a Extensão
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Baixe e instale a extensão do Chrome para análise em tempo real nas páginas do ML.
            </p>
            <Button variant="outline" className="w-full" disabled>
              Baixar Extensão
            </Button>
          </div>
        </Card>

        <Card className="p-6 hover:shadow-lg transition-all duration-300 opacity-60">
          <div className="flex flex-col items-center text-center">
            <div className="w-14 h-14 bg-warning/10 rounded-2xl flex items-center justify-center mb-4">
              <BarChart3 className="w-7 h-7 text-warning" />
            </div>
            <span className="text-xs font-medium text-muted-foreground mb-2">Passo 3</span>
            <h3 className="text-lg font-semibold text-foreground mb-2">
              Analise Produtos
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Navegue até qualquer anúncio no ML e veja análises detalhadas no painel lateral.
            </p>
            <Button variant="secondary" className="w-full" disabled>
              Aguardando Setup
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
