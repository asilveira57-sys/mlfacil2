import { useTranslation } from "react-i18next";
import { Section, SectionHeader } from "./Section";
import { 
  Boxes, 
  LineChart, 
  Zap, 
  BellRing, 
  History, 
  Target 
} from "lucide-react";

export function LandingBenefits() {
  const { t } = useTranslation('landing');

  const benefits = [
    {
      icon: Boxes,
      title: t('benefits.item1.title'),
      description: t('benefits.item1.description')
    },
    {
      icon: LineChart,
      title: t('benefits.item2.title'),
      description: t('benefits.item2.description')
    },
    {
      icon: Zap,
      title: t('benefits.item3.title'),
      description: t('benefits.item3.description')
    },
    {
      icon: BellRing,
      title: t('benefits.item4.title'),
      description: t('benefits.item4.description')
    },
    {
      icon: History,
      title: t('benefits.item5.title'),
      description: t('benefits.item5.description')
    },
    {
      icon: Target,
      title: t('benefits.item6.title'),
      description: t('benefits.item6.description')
    }
  ];

  return (
    <Section id="beneficios" variant="muted">
      <SectionHeader
        title={t('benefits.title')}
        subtitle={t('benefits.subtitle')}
      />

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
        {benefits.map((benefit, index) => (
          <div
            key={index}
            className="flex items-start gap-4 p-6 bg-card rounded-xl border border-border hover:shadow-md transition-shadow"
          >
            <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
              <benefit.icon className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground mb-1">
                {benefit.title}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {benefit.description}
              </p>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}
