import {
  ClipboardList,
  BarChart3,
  Calculator,
  Activity,
  TrendingUp,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface ModulePage {
  slug: string;
  icon: LucideIcon;
  /** i18n key prefix inside 'modules' namespace, e.g. "gestao_anuncios" */
  i18nKey: string;
  /** Number of feature items (used for iteration) */
  featureCount: number;
  /** Number of FAQ items */
  faqCount: number;
}

export const MODULE_PAGES: ModulePage[] = [
  {
    slug: "gestao-anuncios",
    icon: ClipboardList,
    i18nKey: "gestao_anuncios",
    featureCount: 6,
    faqCount: 3,
  },
  {
    slug: "dashboard-analises",
    icon: BarChart3,
    i18nKey: "dashboard_analises",
    featureCount: 6,
    faqCount: 3,
  },
  {
    slug: "precificacao-custos",
    icon: Calculator,
    i18nKey: "precificacao_custos",
    featureCount: 6,
    faqCount: 3,
  },
  {
    slug: "radiografia-seed",
    icon: Activity,
    i18nKey: "radiografia_seed",
    featureCount: 6,
    faqCount: 3,
  },
  {
    slug: "tendencias-concorrencia",
    icon: TrendingUp,
    i18nKey: "tendencias_concorrencia",
    featureCount: 6,
    faqCount: 3,
  },
  {
    slug: "automacoes-alertas",
    icon: Zap,
    i18nKey: "automacoes_alertas",
    featureCount: 6,
    faqCount: 3,
  },
];

export function getModuleBySlug(slug: string): ModulePage | undefined {
  return MODULE_PAGES.find((m) => m.slug === slug);
}
