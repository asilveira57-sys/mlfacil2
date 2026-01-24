import { Section, SectionHeader } from "./Section";
import { Button } from "@/components/ui/button";
import { Play } from "lucide-react";
import { useSiteContentContext } from "@/contexts/SiteContentContext";

export function LandingDemo() {
  const { getText } = useSiteContentContext();

  return (
    <Section id="demo" variant="muted">
      <div className="max-w-4xl mx-auto text-center">
        <SectionHeader
          title={getText('home.demo.title')}
          subtitle={getText('home.demo.subtitle')}
        />

        {/* Video container placeholder */}
        <div className="relative aspect-video bg-card border border-border rounded-2xl overflow-hidden shadow-xl">
          {/* Video overlay with play button */}
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
            <Button
              size="lg"
              className="w-20 h-20 rounded-full p-0 shadow-xl hover:scale-105 transition-transform"
            >
              <Play className="w-8 h-8 ml-1" />
            </Button>
          </div>
          
          {/* Placeholder content */}
          <div className="absolute inset-0 flex items-center justify-center opacity-20">
            <div className="text-center">
              <div className="w-32 h-32 bg-muted rounded-full mx-auto mb-4" />
              <p className="text-muted-foreground">Vídeo de demonstração</p>
            </div>
          </div>
        </div>

        <p className="mt-6 text-muted-foreground">
          {getText('home.demo.duration')}
        </p>
      </div>
    </Section>
  );
}
