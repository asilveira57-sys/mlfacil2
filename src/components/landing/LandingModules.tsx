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
import { useSiteContentContext } from "@/contexts/SiteContentContext";

export function LandingModules() {
  const { getText } = useSiteContentContext();

  const modules = [
    {
      icon: ClipboardList,
      titleKey: 'home.modules.item1.title',
      descriptionKey: 'home.modules.item1.description',
      href: "#"
    },
    {
      icon: TrendingUp,
      titleKey: 'home.modules.item2.title',
      descriptionKey: 'home.modules.item2.description',
      href: "#"
    },
    {
      icon: Users,
      titleKey: 'home.modules.item3.title',
      descriptionKey: 'home.modules.item3.description',
      href: "#"
    },
    {
      icon: CheckCircle,
      titleKey: 'home.modules.item4.title',
      descriptionKey: 'home.modules.item4.description',
      href: "#"
    },
    {
      icon: Calculator,
      titleKey: 'home.modules.item5.title',
      descriptionKey: 'home.modules.item5.description',
      href: "#"
    },
    {
      icon: FileText,
      titleKey: 'home.modules.item6.title',
      descriptionKey: 'home.modules.item6.description',
      href: "#"
    }
  ];

  return (
    <Section id="recursos">
      <SectionHeader
        title={getText('home.modules.title')}
        subtitle={getText('home.modules.subtitle')}
      />

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
        {modules.map((module, index) => (
          <FeatureCard
            key={index}
            icon={module.icon}
            title={getText(module.titleKey)}
            description={getText(module.descriptionKey)}
            href={module.href}
          />
        ))}
      </div>
    </Section>
  );
}
