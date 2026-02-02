import { useTranslation } from "react-i18next";
import { Section, SectionHeader } from "./Section";
import { Link2, BarChart3, Rocket } from "lucide-react";

export function LandingHowItWorks() {
  const { t } = useTranslation('landing');

  const steps = [
    {
      number: "01",
      icon: Link2,
      title: t('howitworks.step1.title'),
      description: t('howitworks.step1.description')
    },
    {
      number: "02",
      icon: BarChart3,
      title: t('howitworks.step2.title'),
      description: t('howitworks.step2.description')
    },
    {
      number: "03",
      icon: Rocket,
      title: t('howitworks.step3.title'),
      description: t('howitworks.step3.description')
    }
  ];

  return (
    <Section id="como-funciona" variant="muted">
      <SectionHeader
        title={t('howitworks.title')}
        subtitle={t('howitworks.subtitle')}
      />

      <div className="grid md:grid-cols-3 gap-8 md:gap-12">
        {steps.map((step, index) => (
          <div key={index} className="relative text-center">
            {/* Connector line for desktop */}
            {index < steps.length - 1 && (
              <div className="hidden md:block absolute top-16 left-1/2 w-full h-0.5 bg-border" />
            )}
            
            {/* Step content */}
            <div className="relative z-10 flex flex-col items-center">
              <div className="w-16 h-16 bg-primary text-primary-foreground rounded-2xl flex items-center justify-center mb-6 shadow-lg">
                <step.icon className="w-8 h-8" />
              </div>
              
              <div className="text-4xl font-bold text-muted-foreground/20 mb-2">
                {step.number}
              </div>
              
              <h3 className="text-lg font-semibold text-foreground mb-2">
                {step.title}
              </h3>
              
              <p className="text-muted-foreground text-sm max-w-xs">
                {step.description}
              </p>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}
