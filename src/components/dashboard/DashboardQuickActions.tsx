import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  CloudDownload,
  Megaphone,
  TrendingUp,
  DollarSign,
  Package,
  Activity,
} from "lucide-react";

interface QuickAction {
  title: string;
  description: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  route: string;
}

const quickActions: QuickAction[] = [
  {
    title: "Importar Vendas",
    description: "Sincronize pedidos do Mercado Livre",
    icon: CloudDownload,
    color: "text-blue-600",
    bgColor: "bg-blue-500/10 hover:bg-blue-500/20",
    route: "/shipping-labels",
  },
  {
    title: "Mercado ADS",
    description: "Gerencie campanhas publicitárias",
    icon: Megaphone,
    color: "text-pink-600",
    bgColor: "bg-pink-500/10 hover:bg-pink-500/20",
    route: "/publicidade",
  },
  {
    title: "Ver Tendências",
    description: "Produtos em alta por categoria",
    icon: TrendingUp,
    color: "text-orange-600",
    bgColor: "bg-orange-500/10 hover:bg-orange-500/20",
    route: "/tendencias",
  },
  {
    title: "Validar Custos",
    description: "Análise de margens e lucro",
    icon: DollarSign,
    color: "text-emerald-600",
    bgColor: "bg-emerald-500/10 hover:bg-emerald-500/20",
    route: "/custos",
  },
  {
    title: "Radiografia",
    description: "Análise profunda de anúncios",
    icon: Activity,
    color: "text-violet-600",
    bgColor: "bg-violet-500/10 hover:bg-violet-500/20",
    route: "/radiografia",
  },
  {
    title: "Gerar Etiquetas",
    description: "Imprima etiquetas PDF/ZPL",
    icon: Package,
    color: "text-cyan-600",
    bgColor: "bg-cyan-500/10 hover:bg-cyan-500/20",
    route: "/shipping-labels",
  },
];

export function DashboardQuickActions() {
  const navigate = useNavigate();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Acessos Rápidos</h3>
          <p className="text-sm text-muted-foreground">Ações mais utilizadas</p>
        </div>
      </div>
      
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {quickActions.map((action) => (
          <Card
            key={action.title}
            className={`p-4 cursor-pointer transition-all duration-200 hover:shadow-md border-2 border-transparent hover:border-primary/20 ${action.bgColor}`}
            onClick={() => navigate(action.route)}
          >
            <div className="flex flex-col items-center text-center gap-3">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center bg-background/80`}>
                <action.icon className={`h-6 w-6 ${action.color}`} />
              </div>
              <div>
                <h4 className="font-medium text-sm text-foreground">{action.title}</h4>
                <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                  {action.description}
                </p>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
