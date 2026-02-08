import { useTranslation } from "react-i18next";
import { Section, SectionHeader } from "./Section";
import { EditableText } from "@/components/admin/EditableText";
import { 
  CreditCard, 
  Globe, 
  Shield, 
  Users,
  Check
} from "lucide-react";

export function LandingIntegrations() {
  const { t } = useTranslation('landing');

  const integrations = [
    { icon: CreditCard, key: 'item1' },
    { icon: Globe, key: 'item2' },
    { icon: Shield, key: 'item3' },
    { icon: Users, key: 'item4' }
  ];

  const badgeKeys = ['badge1', 'badge2', 'badge3', 'badge4'];

  return (
    <Section id="integracoes">
      <SectionHeader
        title={
          <EditableText contentKey="home.integrations.title" as="span">
            {t('integrations.title')}
          </EditableText>
        }
        subtitle={
          <EditableText contentKey="home.integrations.subtitle" as="span" multiline>
            {t('integrations.subtitle')}
          </EditableText>
        }
      />

      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
        {integrations.map((item) => (
          <div
            key={item.key}
            className="bg-card border border-border rounded-xl p-6 text-center hover:shadow-md transition-shadow"
          >
            <div className="w-14 h-14 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-4">
              <item.icon className="w-7 h-7 text-primary" />
            </div>
            <h3 className="font-semibold text-foreground mb-2">
              <EditableText contentKey={`home.integrations.${item.key}.title`} as="span">
                {t(`integrations.${item.key}.title`)}
              </EditableText>
            </h3>
            <p className="text-sm text-muted-foreground">
              <EditableText contentKey={`home.integrations.${item.key}.description`} as="span" multiline>
                {t(`integrations.${item.key}.description`)}
              </EditableText>
            </p>
          </div>
        ))}
      </div>

      {/* Security badges */}
      <div className="mt-12 flex flex-wrap items-center justify-center gap-8">
        {badgeKeys.map((badgeKey) => (
          <div key={badgeKey} className="flex items-center gap-2 text-muted-foreground">
            <Check className="w-5 h-5 text-success" />
            <EditableText contentKey={`home.integrations.${badgeKey}`} as="span">
              {t(`integrations.${badgeKey}`)}
            </EditableText>
          </div>
        ))}
      </div>
    </Section>
  );
}
