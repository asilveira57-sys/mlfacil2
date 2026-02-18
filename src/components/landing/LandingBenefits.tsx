import { useTranslation } from "react-i18next";
import { Section, SectionHeader } from "./Section";
import { EditableText } from "@/components/admin/EditableText";
import { 
  History, 
  BarChart3, 
  Clock, 
  Tag, 
  Printer, 
  ClipboardList, 
  Users, 
  ShieldCheck, 
  Wrench 
} from "lucide-react";

export function LandingBenefits() {
  const { t } = useTranslation('landing');

  const benefits = [
    { icon: History, key: 'item1' },
    { icon: BarChart3, key: 'item2' },
    { icon: Clock, key: 'item3' },
    { icon: Tag, key: 'item4' },
    { icon: Printer, key: 'item5' },
    { icon: ClipboardList, key: 'item6' },
    { icon: Users, key: 'item7' },
    { icon: ShieldCheck, key: 'item8' },
    { icon: Wrench, key: 'item9' }
  ];

  return (
    <Section id="beneficios" variant="muted">
      <SectionHeader
        title={
          <EditableText contentKey="home.benefits.title" as="span">
            {t('benefits.title')}
          </EditableText>
        }
        subtitle={
          <EditableText contentKey="home.benefits.subtitle" as="span" multiline>
            {t('benefits.subtitle')}
          </EditableText>
        }
      />

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
        {benefits.map((benefit) => (
          <div
            key={benefit.key}
            className="flex items-start gap-4 p-6 bg-card rounded-xl border border-border hover:shadow-md transition-shadow"
          >
            <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
              <benefit.icon className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground mb-1">
                <EditableText contentKey={`home.benefits.${benefit.key}.title`} as="span">
                  {t(`benefits.${benefit.key}.title`)}
                </EditableText>
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                <EditableText contentKey={`home.benefits.${benefit.key}.description`} as="span" multiline>
                  {t(`benefits.${benefit.key}.description`)}
                </EditableText>
              </p>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}
