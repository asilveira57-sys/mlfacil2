import { useTranslation } from "react-i18next";
import { Section, SectionHeader } from "./Section";
import { EditableEmbed } from "@/components/admin/EditableEmbed";
import { EditableText } from "@/components/admin/EditableText";

export function LandingDemo() {
  const { t } = useTranslation('landing');

  return (
    <Section id="demo" variant="muted">
      <div className="max-w-4xl mx-auto text-center">
        <SectionHeader
          title={
            <EditableText contentKey="home.demo.title" as="span">
              {t('demo.title')}
            </EditableText>
          }
          subtitle={
            <EditableText contentKey="home.demo.subtitle" as="span" multiline>
              {t('demo.subtitle')}
            </EditableText>
          }
        />

        {/* Video container with editable embed */}
        <EditableEmbed
          contentKey="home.demo.youtube_url"
          className="shadow-xl"
        />

        <p className="mt-6 text-muted-foreground">
          <EditableText contentKey="home.demo.duration" as="span" multiline>
            {t('demo.duration')}
          </EditableText>
        </p>
      </div>
    </Section>
  );
}
