import { useTranslation } from "react-i18next";
import { Section, SectionHeader } from "./Section";
import { FeatureCard } from "./FeatureCard";
import { 
  ClipboardList,
  BarChart3,
  Calculator,
  Activity,
  TrendingUp,
  Zap
} from "lucide-react";

export function LandingModules() {
  const { t } = useTranslation('landing');

  const modules = [
    {
      icon: ClipboardList,
      title: t('modules.item1.title'),
      description: t('modules.item1.description'),
      href: "/modulo/gestao-anuncios"
    },
    {
      icon: BarChart3,
      title: t('modules.item2.title'),
      description: t('modules.item2.description'),
      href: "/modulo/dashboard-analises"
    },
    {
      icon: Calculator,
      title: t('modules.item3.title'),
      description: t('modules.item3.description'),
      href: "/modulo/precificacao-custos"
    },
    {
      icon: Activity,
      title: t('modules.item4.title'),
      description: t('modules.item4.description'),
      href: "/modulo/radiografia-seed"
    },
    {
      icon: TrendingUp,
      title: t('modules.item5.title'),
      description: t('modules.item5.description'),
      href: "/modulo/tendencias-concorrencia"
    },
    {
      icon: Zap,
      title: t('modules.item6.title'),
      description: t('modules.item6.description'),
      href: "/modulo/automacoes-alertas"
    }
  ];

  return (
    <Section id="recursos">
      <SectionHeader
        title={t('modules.title')}
        subtitle={t('modules.subtitle')}
      />

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
        {modules.map((module, index) => (
          <FeatureCard
            key={index}
            icon={module.icon}
            title={module.title}
            description={module.description}
            href={module.href}
          />
        ))}
      </div>
    </Section>
  );
}
