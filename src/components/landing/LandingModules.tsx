import { useTranslation } from "react-i18next";
import { Section, SectionHeader } from "./Section";
import { FeatureCard } from "./FeatureCard";
import { EditableText } from "@/components/admin/EditableText";
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
    { icon: ClipboardList, key: 'item1', href: "/modulo/gestao-anuncios" },
    { icon: BarChart3, key: 'item2', href: "/modulo/dashboard-analises" },
    { icon: Calculator, key: 'item3', href: "/modulo/precificacao-custos" },
    { icon: Activity, key: 'item4', href: "/modulo/radiografia-seed" },
    { icon: TrendingUp, key: 'item5', href: "/modulo/tendencias-concorrencia" },
    { icon: Zap, key: 'item6', href: "/modulo/automacoes-alertas" }
  ];

  return (
    <Section id="recursos">
      <SectionHeader
        title={
          <EditableText contentKey="home.modules.title" as="span">
            {t('modules.title')}
          </EditableText>
        }
        subtitle={
          <EditableText contentKey="home.modules.subtitle" as="span" multiline>
            {t('modules.subtitle')}
          </EditableText>
        }
      />

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
        {modules.map((module) => (
          <FeatureCard
            key={module.key}
            icon={module.icon}
            title={
              <EditableText contentKey={`home.modules.${module.key}.title`} as="span">
                {t(`modules.${module.key}.title`)}
              </EditableText>
            }
            description={
              <EditableText contentKey={`home.modules.${module.key}.description`} as="span" multiline>
                {t(`modules.${module.key}.description`)}
              </EditableText>
            }
            href={module.href}
          />
        ))}
      </div>
    </Section>
  );
}
