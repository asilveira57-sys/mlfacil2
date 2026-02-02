import { useTranslation } from "react-i18next";
import { Section, SectionHeader } from "./Section";
import { FeatureCard } from "./FeatureCard";
import { 
  ClipboardList,
  TrendingUp,
  Users,
  CheckCircle,
  Calculator,
  FileText
} from "lucide-react";

export function LandingModules() {
  const { t } = useTranslation('landing');

  const modules = [
    {
      icon: ClipboardList,
      title: t('modules.item1.title'),
      description: t('modules.item1.description'),
      href: "#"
    },
    {
      icon: TrendingUp,
      title: t('modules.item2.title'),
      description: t('modules.item2.description'),
      href: "#"
    },
    {
      icon: Users,
      title: t('modules.item3.title'),
      description: t('modules.item3.description'),
      href: "#"
    },
    {
      icon: CheckCircle,
      title: t('modules.item4.title'),
      description: t('modules.item4.description'),
      href: "#"
    },
    {
      icon: Calculator,
      title: t('modules.item5.title'),
      description: t('modules.item5.description'),
      href: "#"
    },
    {
      icon: FileText,
      title: t('modules.item6.title'),
      description: t('modules.item6.description'),
      href: "#"
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
