import { Section, SectionHeader } from "./Section";
import { 
  Boxes, 
  LineChart, 
  Zap, 
  BellRing, 
  History, 
  Target 
} from "lucide-react";
import { useSiteContentContext } from "@/contexts/SiteContentContext";

export function LandingBenefits() {
  const { getText } = useSiteContentContext();

  const benefits = [
    {
      icon: Boxes,
      titleKey: 'home.benefits.item1.title',
      descriptionKey: 'home.benefits.item1.description'
    },
    {
      icon: LineChart,
      titleKey: 'home.benefits.item2.title',
      descriptionKey: 'home.benefits.item2.description'
    },
    {
      icon: Zap,
      titleKey: 'home.benefits.item3.title',
      descriptionKey: 'home.benefits.item3.description'
    },
    {
      icon: BellRing,
      titleKey: 'home.benefits.item4.title',
      descriptionKey: 'home.benefits.item4.description'
    },
    {
      icon: History,
      titleKey: 'home.benefits.item5.title',
      descriptionKey: 'home.benefits.item5.description'
    },
    {
      icon: Target,
      titleKey: 'home.benefits.item6.title',
      descriptionKey: 'home.benefits.item6.description'
    }
  ];

  return (
    <Section id="beneficios" variant="muted">
      <SectionHeader
        title={getText('home.benefits.title')}
        subtitle={getText('home.benefits.subtitle')}
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
                {getText(benefit.titleKey)}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {getText(benefit.descriptionKey)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}
