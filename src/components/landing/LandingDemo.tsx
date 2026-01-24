import { Section, SectionHeader } from "./Section";
import { useSiteContentContext } from "@/contexts/SiteContentContext";
import { EditableText } from "@/components/admin/EditableText";
import { EditableEmbed } from "@/components/admin/EditableEmbed";

export function LandingDemo() {
  const { getText } = useSiteContentContext();

  return (
    <Section id="demo" variant="muted">
      <div className="max-w-4xl mx-auto text-center">
        <SectionHeader
          title={getText('home.demo.title')}
          subtitle={getText('home.demo.subtitle')}
        />

        {/* Video container with editable embed */}
        <EditableEmbed
          contentKey="home.demo.youtube_url"
          className="shadow-xl"
        />

        <EditableText 
          contentKey="home.demo.duration" 
          as="p"
          className="mt-6 text-muted-foreground"
          multiline
        />
      </div>
    </Section>
  );
}
