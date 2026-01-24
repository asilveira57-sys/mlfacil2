import { Section, SectionHeader } from "./Section";
import { Link2, BarChart3, Rocket } from "lucide-react";
import { useSiteContentContext } from "@/contexts/SiteContentContext";

export function LandingHowItWorks() {
  const { getText } = useSiteContentContext();

  const steps = [
    {
      number: "01",
      icon: Link2,
      titleKey: 'home.howitworks.step1.title',
      descriptionKey: 'home.howitworks.step1.description'
    },
    {
      number: "02",
      icon: BarChart3,
      titleKey: 'home.howitworks.step2.title',
      descriptionKey: 'home.howitworks.step2.description'
    },
    {
      number: "03",
      icon: Rocket,
      titleKey: 'home.howitworks.step3.title',
      descriptionKey: 'home.howitworks.step3.description'
    }
  ];

  return (
    <Section id="como-funciona" variant="muted">
      <SectionHeader
        title={getText('home.howitworks.title')}
        subtitle={getText('home.howitworks.subtitle')}
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
                {getText(step.titleKey)}
              </h3>
              
              <p className="text-muted-foreground text-sm max-w-xs">
                {getText(step.descriptionKey)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}
