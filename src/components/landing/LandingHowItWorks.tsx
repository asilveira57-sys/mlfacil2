import { useTranslation } from "react-i18next";
import { Section, SectionHeader } from "./Section";
import { EditableText } from "@/components/admin/EditableText";
import { Link2, BarChart3, Rocket } from "lucide-react";

export function LandingHowItWorks() {
  const { t } = useTranslation('landing');

  const steps = [
    { number: "01", icon: Link2, key: 'step1' },
    { number: "02", icon: BarChart3, key: 'step2' },
    { number: "03", icon: Rocket, key: 'step3' }
  ];

  return (
    <Section id="como-funciona" variant="muted">
      <SectionHeader
        title={
          <EditableText contentKey="home.howitworks.title" as="span">
            {t('howitworks.title')}
          </EditableText>
        }
        subtitle={
          <EditableText contentKey="home.howitworks.subtitle" as="span" multiline>
            {t('howitworks.subtitle')}
          </EditableText>
        }
      />

      <div className="grid md:grid-cols-3 gap-8 md:gap-12">
        {steps.map((step, index) => (
          <div key={step.key} className="relative text-center">
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
                <EditableText contentKey={`home.howitworks.${step.key}.title`} as="span">
                  {t(`howitworks.${step.key}.title`)}
                </EditableText>
              </h3>
              
              <p className="text-muted-foreground text-sm max-w-xs">
                <EditableText contentKey={`home.howitworks.${step.key}.description`} as="span" multiline>
                  {t(`howitworks.${step.key}.description`)}
                </EditableText>
              </p>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}
