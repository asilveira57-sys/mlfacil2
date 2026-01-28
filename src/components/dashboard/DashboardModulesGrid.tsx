import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp,
  Activity,
  Store,
  Target,
  BarChart3,
  DollarSign,
  Megaphone,
  ListChecks,
  Package,
  Printer,
  Settings,
  ArrowRight,
  MessageSquareText,
  History,
} from "lucide-react";

interface Module {
  title: string;
  description: string;
  icon: React.ElementType;
  route: string;
  color: string;
  bgColor: string;
  borderColor: string;
  badge?: string;
}

const modules: Module[] = [
  {
    title: "Radiografia",
    description: "Análise profunda de anúncios com score, eventos e sugestões de otimização.",
    icon: Activity,
    route: "/radiografia",
    color: "text-violet-500",
    bgColor: "bg-violet-500/10",
    borderColor: "border-violet-500/20 hover:border-violet-500/40",
  },
  {
    title: "Tendências",
    description: "Produtos em alta, mais vendidos e oportunidades por categoria.",
    icon: TrendingUp,
    route: "/tendencias",
    color: "text-orange-500",
    bgColor: "bg-orange-500/10",
    borderColor: "border-orange-500/20 hover:border-orange-500/40",
  },
  {
    title: "Mercado",
    description: "Dashboard premium de analytics com navegação por categorias.",
    icon: Store,
    route: "/mercado",
    color: "text-emerald-500",
    bgColor: "bg-emerald-500/10",
    borderColor: "border-emerald-500/20 hover:border-emerald-500/40",
  },
  {
    title: "Concorrência",
    description: "Monitore preços, posições e estratégias dos concorrentes.",
    icon: Target,
    route: "/concorrencia",
    color: "text-red-500",
    bgColor: "bg-red-500/10",
    borderColor: "border-red-500/20 hover:border-red-500/40",
  },
  {
    title: "Curva ABC",
    description: "Identifique produtos, clientes e regiões mais importantes.",
    icon: BarChart3,
    route: "/abc-analysis",
    color: "text-cyan-500",
    bgColor: "bg-cyan-500/10",
    borderColor: "border-cyan-500/20 hover:border-cyan-500/40",
  },
  {
    title: "Custos",
    description: "Análise financeira com margens, impostos e lucro líquido.",
    icon: DollarSign,
    route: "/custos",
    color: "text-green-500",
    bgColor: "bg-green-500/10",
    borderColor: "border-green-500/20 hover:border-green-500/40",
  },
  {
    title: "Mercado ADS",
    description: "Analytics e automação de campanhas publicitárias.",
    icon: Megaphone,
    route: "/publicidade",
    color: "text-pink-500",
    bgColor: "bg-pink-500/10",
    borderColor: "border-pink-500/20 hover:border-pink-500/40",
  },
  {
    title: "Tarefas",
    description: "Central de tarefas, promoções e automações.",
    icon: ListChecks,
    route: "/tarefas",
    color: "text-amber-500",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/20 hover:border-amber-500/40",
  },
  {
    title: "Pós-Venda",
    description: "Mensagens de orientação e suporte ao comprador.",
    icon: MessageSquareText,
    route: "/mensagens",
    color: "text-sky-500",
    bgColor: "bg-sky-500/10",
    borderColor: "border-sky-500/20 hover:border-sky-500/40",
  },
  {
    title: "Linha do Tempo",
    description: "Radar de anúncios sem vendas e ações de republicação/clonagem.",
    icon: History,
    route: "/anuncios/linha-do-tempo",
    color: "text-indigo-500",
    bgColor: "bg-indigo-500/10",
    borderColor: "border-indigo-500/20 hover:border-indigo-500/40",
  },
  {
    title: "Etiquetas",
    description: "Gerencie e imprima etiquetas em PDF ou ZPL.",
    icon: Package,
    route: "/shipping-labels",
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/20 hover:border-blue-500/40",
  },
  {
    title: "ZPL Converter",
    description: "Converta etiquetas para formato ZPL de impressoras térmicas.",
    icon: Printer,
    route: "/zpl-converter",
    color: "text-slate-500",
    bgColor: "bg-slate-500/10",
    borderColor: "border-slate-500/20 hover:border-slate-500/40",
  },
  {
    title: "Configurações",
    description: "Perfil, empresas, integrações e assinatura.",
    icon: Settings,
    route: "/settings",
    color: "text-muted-foreground",
    bgColor: "bg-muted",
    borderColor: "border-muted-foreground/20 hover:border-muted-foreground/40",
  },
];

export function DashboardModulesGrid() {
  const navigate = useNavigate();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Seus Módulos</h3>
          <p className="text-sm text-muted-foreground">
            Acesse todas as funcionalidades do sistema
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {modules.map((module) => (
          <Card
            key={module.title}
            className={`group p-4 cursor-pointer transition-all duration-200 hover:shadow-lg border-2 ${module.borderColor}`}
            onClick={() => navigate(module.route)}
          >
            <div className="flex items-start gap-4">
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${module.bgColor}`}>
                <module.icon className={`h-5 w-5 ${module.color}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="font-semibold text-sm text-foreground">{module.title}</h4>
                  {module.badge && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      {module.badge}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                  {module.description}
                </p>
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1 text-muted-foreground group-hover:text-primary"
              >
                Acessar
                <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
