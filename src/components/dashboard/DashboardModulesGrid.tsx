import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
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
  BookOpen,
} from "lucide-react";

interface Module {
  titleKey: string;
  descriptionKey: string;
  icon: React.ElementType;
  route: string;
  color: string;
  bgColor: string;
  borderColor: string;
  badge?: string;
}

const modules: Module[] = [
  {
    titleKey: "dashboard:modules.radiography",
    descriptionKey: "dashboard:modules.radiography_desc",
    icon: Activity,
    route: "/radiografia",
    color: "text-violet-500",
    bgColor: "bg-violet-500/10",
    borderColor: "border-violet-500/20 hover:border-violet-500/40",
  },
  {
    titleKey: "dashboard:modules.trends",
    descriptionKey: "dashboard:modules.trends_desc",
    icon: TrendingUp,
    route: "/tendencias",
    color: "text-orange-500",
    bgColor: "bg-orange-500/10",
    borderColor: "border-orange-500/20 hover:border-orange-500/40",
  },
  {
    titleKey: "dashboard:modules.market",
    descriptionKey: "dashboard:modules.market_desc",
    icon: Store,
    route: "/mercado",
    color: "text-emerald-500",
    bgColor: "bg-emerald-500/10",
    borderColor: "border-emerald-500/20 hover:border-emerald-500/40",
  },
  {
    titleKey: "dashboard:modules.competition",
    descriptionKey: "dashboard:modules.competition_desc",
    icon: Target,
    route: "/concorrencia",
    color: "text-red-500",
    bgColor: "bg-red-500/10",
    borderColor: "border-red-500/20 hover:border-red-500/40",
  },
  {
    titleKey: "dashboard:modules.abc_curve",
    descriptionKey: "dashboard:modules.abc_curve_desc",
    icon: BarChart3,
    route: "/abc-analysis",
    color: "text-cyan-500",
    bgColor: "bg-cyan-500/10",
    borderColor: "border-cyan-500/20 hover:border-cyan-500/40",
  },
  {
    titleKey: "dashboard:modules.costs",
    descriptionKey: "dashboard:modules.costs_desc",
    icon: DollarSign,
    route: "/custos",
    color: "text-green-500",
    bgColor: "bg-green-500/10",
    borderColor: "border-green-500/20 hover:border-green-500/40",
  },
  {
    titleKey: "dashboard:modules.ads",
    descriptionKey: "dashboard:modules.ads_desc",
    icon: Megaphone,
    route: "/publicidade",
    color: "text-pink-500",
    bgColor: "bg-pink-500/10",
    borderColor: "border-pink-500/20 hover:border-pink-500/40",
  },
  {
    titleKey: "dashboard:modules.tasks",
    descriptionKey: "dashboard:modules.tasks_desc",
    icon: ListChecks,
    route: "/tarefas",
    color: "text-amber-500",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/20 hover:border-amber-500/40",
  },
  {
    titleKey: "dashboard:modules.post_sale",
    descriptionKey: "dashboard:modules.post_sale_desc",
    icon: MessageSquareText,
    route: "/mensagens",
    color: "text-sky-500",
    bgColor: "bg-sky-500/10",
    borderColor: "border-sky-500/20 hover:border-sky-500/40",
  },
  {
    titleKey: "dashboard:modules.timeline",
    descriptionKey: "dashboard:modules.timeline_desc",
    icon: History,
    route: "/anuncios/linha-do-tempo",
    color: "text-indigo-500",
    bgColor: "bg-indigo-500/10",
    borderColor: "border-indigo-500/20 hover:border-indigo-500/40",
  },
  {
    titleKey: "dashboard:modules.products",
    descriptionKey: "dashboard:modules.products_desc",
    icon: BookOpen,
    route: "/produtos",
    color: "text-teal-500",
    bgColor: "bg-teal-500/10",
    borderColor: "border-teal-500/20 hover:border-teal-500/40",
    badge: "Novo",
  },
  {
    titleKey: "dashboard:modules.labels",
    descriptionKey: "dashboard:modules.labels_desc",
    icon: Package,
    route: "/shipping-labels",
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/20 hover:border-blue-500/40",
  },
  {
    titleKey: "dashboard:modules.zpl_converter",
    descriptionKey: "dashboard:modules.zpl_converter_desc",
    icon: Printer,
    route: "/zpl-converter",
    color: "text-slate-500",
    bgColor: "bg-slate-500/10",
    borderColor: "border-slate-500/20 hover:border-slate-500/40",
  },
  {
    titleKey: "dashboard:modules.settings",
    descriptionKey: "dashboard:modules.settings_desc",
    icon: Settings,
    route: "/settings",
    color: "text-muted-foreground",
    bgColor: "bg-muted",
    borderColor: "border-muted-foreground/20 hover:border-muted-foreground/40",
  },
];

export function DashboardModulesGrid() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">{t('dashboard:your_modules')}</h3>
          <p className="text-sm text-muted-foreground">
            {t('dashboard:your_modules_desc')}
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {modules.map((module) => (
          <Card
            key={module.titleKey}
            className={`group p-4 cursor-pointer transition-all duration-200 hover:shadow-lg border-2 ${module.borderColor}`}
            onClick={() => navigate(module.route)}
          >
            <div className="flex items-start gap-4">
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${module.bgColor}`}>
                <module.icon className={`h-5 w-5 ${module.color}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="font-semibold text-sm text-foreground">{t(module.titleKey)}</h4>
                  {module.badge && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      {module.badge}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                  {t(module.descriptionKey)}
                </p>
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1 text-muted-foreground group-hover:text-primary"
              >
                {t('dashboard:access')}
                <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
