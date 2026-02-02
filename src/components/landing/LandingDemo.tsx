import { useTranslation } from "react-i18next";
import { Section, SectionHeader } from "./Section";
import { EditableEmbed } from "@/components/admin/EditableEmbed";

export function LandingDemo() {
  const { t } = useTranslation('landing');

  return (
    <Section id="demo" variant="muted">
      <div className="max-w-4xl mx-auto text-center">
        <SectionHeader
          title={t('demo.title')}
          subtitle={t('demo.subtitle')}
        />

        {/* Video container with editable embed */}
        <EditableEmbed
          contentKey="home.demo.youtube_url"
          className="shadow-xl"
        />

        <p className="mt-6 text-muted-foreground">
          {t('demo.duration')}
        </p>
      </div>
    </Section>
  );
}
