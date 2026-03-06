import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { SiteContentProvider } from "@/contexts/SiteContentContext";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { getModuleBySlug, MODULE_PAGES } from "@/content/modulePages";
import NotFound from "./NotFound";

const ModuloDetalhe = () => {
  const { slug } = useParams<{ slug: string }>();
  const { t } = useTranslation("modules");
  const navigate = useNavigate();

  const modulePage = slug ? getModuleBySlug(slug) : undefined;

  if (!modulePage) {
    return <NotFound />;
  }

  const { icon: Icon, i18nKey, featureCount, faqCount } = modulePage;

  // Build features array from i18n
  const features = Array.from({ length: featureCount }, (_, i) => ({
    title: t(`${i18nKey}.feature${i + 1}.title`),
    description: t(`${i18nKey}.feature${i + 1}.description`),
  }));

  // Build FAQ array from i18n
  const faqItems = Array.from({ length: faqCount }, (_, i) => ({
    question: t(`${i18nKey}.faq${i + 1}.question`),
    answer: t(`${i18nKey}.faq${i + 1}.answer`),
  }));

  // Find adjacent modules for navigation
  const currentIndex = MODULE_PAGES.findIndex((m) => m.slug === slug);
  const prevModule = currentIndex > 0 ? MODULE_PAGES[currentIndex - 1] : null;
  const nextModule =
    currentIndex < MODULE_PAGES.length - 1
      ? MODULE_PAGES[currentIndex + 1]
      : null;

  return (
    <SiteContentProvider>
      <div className="min-h-screen bg-background">
        <LandingHeader />

        <main>
          {/* Hero */}
          <section className="relative pt-24 md:pt-32 pb-16 md:pb-24 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-b from-muted/50 via-background to-background -z-10" />
            <div className="absolute top-20 right-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl -z-10" />

            <div className="container mx-auto px-4 md:px-6">
              {/* Back link */}
              <button
                onClick={() => navigate("/")}
                className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
              >
                <ArrowLeft className="w-4 h-4" />
                {t("back_to_home")}
              </button>

              <div className="flex items-start gap-6 max-w-4xl">
                <div className="w-16 h-16 md:w-20 md:h-20 bg-primary/10 rounded-2xl flex items-center justify-center flex-shrink-0">
                  <Icon className="w-8 h-8 md:w-10 md:h-10 text-primary" />
                </div>
                <div>
                  <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mb-4 leading-tight">
                    {t(`${i18nKey}.title`)}
                  </h1>
                  <p className="text-lg md:text-xl text-muted-foreground max-w-3xl">
                    {t(`${i18nKey}.subtitle`)}
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Features */}
          <section className="py-16 md:py-24 bg-muted/30">
            <div className="container mx-auto px-4 md:px-6">
              <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-12 text-center">
                {t("features_title")}
              </h2>

              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8 max-w-6xl mx-auto">
                {features.map((feature, index) => (
                  <div
                    key={index}
                    className="bg-card border border-border rounded-xl p-6 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start gap-3 mb-3">
                      <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Check className="w-4 h-4 text-primary" />
                      </div>
                      <h3 className="font-semibold text-foreground text-lg">
                        {feature.title}
                      </h3>
                    </div>
                    <p className="text-muted-foreground text-sm leading-relaxed pl-11">
                      {feature.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* FAQ */}
          <section className="py-16 md:py-24">
            <div className="container mx-auto px-4 md:px-6 max-w-3xl">
              <h2 className="text-2xl md:text-3xl font-bold text-center text-foreground mb-12">
                {t("faq_title")}
              </h2>

              <Accordion type="single" collapsible className="space-y-3">
                {faqItems.map((item, index) => (
                  <AccordionItem
                    key={index}
                    value={`item-${index}`}
                    className="bg-card border border-border rounded-xl px-6"
                  >
                    <AccordionTrigger className="text-left font-medium text-foreground hover:no-underline py-5">
                      {item.question}
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground pb-5">
                      {item.answer}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          </section>

          {/* Module Navigation */}
          <section className="py-8 border-t border-border">
            <div className="container mx-auto px-4 md:px-6">
              <div className="flex items-center justify-between max-w-3xl mx-auto">
                {prevModule ? (
                  <button
                    onClick={() => navigate(`/modulo/${prevModule.slug}`)}
                    className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    {t(`${prevModule.i18nKey}.title`)}
                  </button>
                ) : (
                  <div />
                )}
                {nextModule ? (
                  <button
                    onClick={() => navigate(`/modulo/${nextModule.slug}`)}
                    className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {t(`${nextModule.i18nKey}.title`)}
                    <ArrowRight className="w-4 h-4" />
                  </button>
                ) : (
                  <div />
                )}
              </div>
            </div>
          </section>

          {/* CTA */}
          <section className="py-20 md:py-28 bg-primary">
            <div className="container mx-auto px-4 md:px-6 text-center">
              <h2 className="text-3xl md:text-4xl font-bold text-primary-foreground mb-4">
                {t("cta_title")}
              </h2>
              <p className="text-lg text-primary-foreground/80 max-w-2xl mx-auto mb-10">
                {t("cta_subtitle")}
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Button
                  size="lg"
                  variant="secondary"
                  className="text-base px-8 py-6 gap-2"
                  onClick={() => navigate("/criar-acesso")}
                >
                  {t("cta_button")}
                  <ArrowRight className="w-5 h-5" />
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="text-base px-8 py-6 bg-transparent border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10"
                  onClick={() => navigate("/#recursos")}
                >
                  {t("cta_secondary")}
                </Button>
              </div>
            </div>
          </section>
        </main>

        <LandingFooter />
      </div>
    </SiteContentProvider>
  );
};

export default ModuloDetalhe;
