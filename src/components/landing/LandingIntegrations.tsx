import { useTranslation } from "react-i18next";
import { Section, SectionHeader } from "./Section";
import { 
  CreditCard, 
  FileCheck, 
  Shield, 
  Users,
  Check
} from "lucide-react";

export function LandingIntegrations() {
  const { t } = useTranslation('landing');

  const integrations = [
    {
      icon: CreditCard,
      title: t('integrations.item1.title'),
      description: t('integrations.item1.description')
    },
    {
      icon: FileCheck,
      title: t('integrations.item2.title'),
      description: t('integrations.item2.description')
    },
    {
      icon: Shield,
      title: t('integrations.item3.title'),
      description: t('integrations.item3.description')
    },
    {
      icon: Users,
      title: t('integrations.item4.title'),
      description: t('integrations.item4.description')
    }
  ];

  const securityBadges = [
    t('integrations.badge1'),
    t('integrations.badge2'),
    t('integrations.badge3'),
    t('integrations.badge4')
  ];

  return (
    <Section id="integracoes">
      <SectionHeader
        title={t('integrations.title')}
        subtitle={t('integrations.subtitle')}
      />

      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
        {integrations.map((item, index) => (
          <div
            key={index}
            className="bg-card border border-border rounded-xl p-6 text-center hover:shadow-md transition-shadow"
          >
            <div className="w-14 h-14 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-4">
              <item.icon className="w-7 h-7 text-primary" />
            </div>
            <h3 className="font-semibold text-foreground mb-2">
              {item.title}
            </h3>
            <p className="text-sm text-muted-foreground">
              {item.description}
            </p>
          </div>
        ))}
      </div>

      {/* Security badges */}
      <div className="mt-12 flex flex-wrap items-center justify-center gap-8">
        {securityBadges.map((badge, index) => (
          <div key={index} className="flex items-center gap-2 text-muted-foreground">
            <Check className="w-5 h-5 text-success" />
            <span className="text-sm">{badge}</span>
          </div>
        ))}
      </div>
    </Section>
  );
}
