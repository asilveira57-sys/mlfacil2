import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, Play, Shield, Users, Zap, CheckCircle2 } from "lucide-react";
import { useSiteContentContext } from "@/contexts/SiteContentContext";
import { EditableImage } from "@/components/admin/EditableImage";
import { EditableText } from "@/components/admin/EditableText";
import dashboardPreview from "@/assets/dashboard-preview.jpg";

export function LandingHero() {
  const navigate = useNavigate();
  const { t } = useTranslation('landing');
  const { getText } = useSiteContentContext();

  const dashboardImageUrl = getText('home.hero.dashboard_image');
  const hasDashboardImage = dashboardImageUrl && !dashboardImageUrl.startsWith('home.');

  return (
    <section className="relative pt-24 md:pt-32 pb-16 md:pb-24 overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 bg-gradient-to-b from-muted/50 via-background to-background -z-10" />
      <div className="absolute top-20 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl -z-10" />
      <div className="absolute top-40 right-1/4 w-80 h-80 bg-accent/5 rounded-full blur-3xl -z-10" />
      
      <div className="container mx-auto px-4 md:px-6">
        <div className="max-w-5xl mx-auto">
          {/* Badge */}
          <div className="flex justify-center mb-6">
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full text-sm font-medium">
              <Zap className="w-4 h-4" />
              <EditableText contentKey="home.hero.badge" as="span">
                {t('hero.badge')}
              </EditableText>
            </div>
          </div>

          {/* Headline */}
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-center text-foreground mb-6 leading-tight">
            <EditableText contentKey="home.hero.title" as="span">
              {t('hero.title')}
            </EditableText>
          </h1>

          {/* Subheadline */}
          <p className="text-lg md:text-xl text-muted-foreground text-center max-w-3xl mx-auto mb-8">
            <EditableText contentKey="home.hero.subtitle" as="span" multiline>
              {t('hero.subtitle')}
            </EditableText>
          </p>

          {/* Checklist differentials */}
          <div className="flex flex-col sm:flex-row flex-wrap items-center justify-center gap-3 sm:gap-6 mb-10">
            {(['check1', 'check2', 'check3'] as const).map((key) => (
              <div key={key} className="flex items-center gap-2 text-sm md:text-base text-foreground/80">
                <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
                <EditableText contentKey={`home.hero.${key}`} as="span">
                  {t(`hero.${key}`)}
                </EditableText>
              </div>
            ))}
          </div>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
            <Button
              size="lg"
              className="text-base px-8 py-6 gap-2"
              onClick={() => navigate("/auth")}
            >
              {t('hero.cta_primary')}
              <ArrowRight className="w-5 h-5" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="text-base px-8 py-6 gap-2"
              onClick={() => {
                const el = document.querySelector("#como-funciona") || document.querySelector("#demo");
                if (el) el.scrollIntoView({ behavior: "smooth" });
              }}
            >
              <Play className="w-5 h-5" />
              {t('hero.cta_secondary')}
            </Button>
          </div>

          {/* Trust badges */}
          <div className="flex flex-wrap items-center justify-center gap-6 md:gap-10">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Shield className="w-5 h-5 text-success" />
              <EditableText contentKey="home.hero.trust_mercadopago" as="span">
                {t('hero.trust_mercadopago')}
              </EditableText>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="w-5 h-5 text-primary" />
              <EditableText contentKey="home.hero.trust_multiconta" as="span">
                {t('hero.trust_multiconta')}
              </EditableText>
            </div>
          </div>

          {/* Dashboard mockup / Editable Image */}
          <div className="mt-16 relative">
            <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent z-10 pointer-events-none" />
            
            {hasDashboardImage ? (
              <EditableImage
                contentKey="home.hero.dashboard_image"
                className="w-full rounded-xl md:rounded-2xl shadow-2xl border border-border"
                alt="Dashboard Preview"
                aspectRatio="video"
              />
            ) : (
              <EditableImage
                contentKey="home.hero.dashboard_image"
                className="w-full"
                alt="Dashboard Preview"
                aspectRatio="video"
                placeholder={
                  <div className="bg-card border border-border rounded-xl md:rounded-2xl shadow-2xl overflow-hidden">
                    {/* Browser chrome header */}
                    <div className="bg-muted/50 border-b border-border px-4 py-3 flex items-center gap-2">
                      <div className="flex gap-1.5">
                        <div className="w-3 h-3 rounded-full bg-destructive/50" />
                        <div className="w-3 h-3 rounded-full bg-warning/50" />
                        <div className="w-3 h-3 rounded-full bg-success/50" />
                      </div>
                      <div className="flex-1 flex justify-center">
                        <div className="bg-muted px-4 py-1 rounded-md text-xs text-muted-foreground">
                          dashboard.mktpfacil.com
                        </div>
                      </div>
                    </div>
                    {/* Real dashboard screenshot */}
                    <img
                      src={dashboardPreview}
                      alt="MKTP Fácil Dashboard"
                      className="w-full h-auto block"
                    />
                  </div>
                }
              />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
