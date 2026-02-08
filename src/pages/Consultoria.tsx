import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { 
  ArrowRight, 
  Sparkles, 
  Search, 
  Target, 
  BarChart3, 
  Award,
  Check,
  Calendar,
  ClipboardList,
  Rocket,
  MessageCircle
} from "lucide-react";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { SiteContentProvider } from "@/contexts/SiteContentContext";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const Consultoria = () => {
  const { t } = useTranslation('consultoria');
  const navigate = useNavigate();

  const benefits = [
    { icon: Search, title: t('benefits.item1.title'), description: t('benefits.item1.description') },
    { icon: Target, title: t('benefits.item2.title'), description: t('benefits.item2.description') },
    { icon: BarChart3, title: t('benefits.item3.title'), description: t('benefits.item3.description') },
    { icon: Award, title: t('benefits.item4.title'), description: t('benefits.item4.description') },
  ];

  const processSteps = [
    { icon: Calendar, number: "01", title: t('process.step1.title'), description: t('process.step1.description') },
    { icon: Search, number: "02", title: t('process.step2.title'), description: t('process.step2.description') },
    { icon: ClipboardList, number: "03", title: t('process.step3.title'), description: t('process.step3.description') },
    { icon: Rocket, number: "04", title: t('process.step4.title'), description: t('process.step4.description') },
  ];

  const packages = [
    {
      key: 'basic',
      name: t('packages.basic.name'),
      description: t('packages.basic.description'),
      price: t('packages.basic.price'),
      duration: t('packages.basic.duration'),
      features: t('packages.basic.features', { returnObjects: true }) as string[],
      cta: t('packages.basic.cta'),
      highlighted: false,
    },
    {
      key: 'pro',
      name: t('packages.pro.name'),
      badge: t('packages.pro.badge'),
      description: t('packages.pro.description'),
      price: t('packages.pro.price'),
      duration: t('packages.pro.duration'),
      features: t('packages.pro.features', { returnObjects: true }) as string[],
      cta: t('packages.pro.cta'),
      highlighted: true,
    },
    {
      key: 'enterprise',
      name: t('packages.enterprise.name'),
      description: t('packages.enterprise.description'),
      price: t('packages.enterprise.price'),
      duration: t('packages.enterprise.duration'),
      features: t('packages.enterprise.features', { returnObjects: true }) as string[],
      cta: t('packages.enterprise.cta'),
      highlighted: false,
    },
  ];

  const faqItems = [
    { question: t('faq.item1.question'), answer: t('faq.item1.answer') },
    { question: t('faq.item2.question'), answer: t('faq.item2.answer') },
    { question: t('faq.item3.question'), answer: t('faq.item3.answer') },
    { question: t('faq.item4.question'), answer: t('faq.item4.answer') },
  ];

  // TODO: Replace with actual Mercado Pago payment links
  const handlePackageClick = (packageKey: string) => {
    const whatsappNumber = "5511999999999"; // Replace with actual number
    const message = encodeURIComponent(`Olá! Tenho interesse no pacote de consultoria: ${packageKey}`);
    window.open(`https://wa.me/${whatsappNumber}?text=${message}`, '_blank');
  };

  return (
    <SiteContentProvider>
      <div className="min-h-screen bg-background">
        <LandingHeader />
        
        <main>
          {/* Hero */}
          <section className="relative pt-24 md:pt-32 pb-16 md:pb-24 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-b from-muted/50 via-background to-background -z-10" />
            <div className="absolute top-20 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl -z-10" />
            
            <div className="container mx-auto px-4 md:px-6 text-center">
              <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full text-sm font-medium mb-6">
                <MessageCircle className="w-4 h-4" />
                <span>{t('hero.badge')}</span>
              </div>
              
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-foreground mb-6 leading-tight max-w-4xl mx-auto">
                {t('hero.title')}
              </h1>
              
              <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto mb-10">
                {t('hero.subtitle')}
              </p>
              
              <Button
                size="lg"
                className="text-base px-8 py-6 gap-2"
                onClick={() => {
                  const el = document.querySelector("#pacotes");
                  if (el) el.scrollIntoView({ behavior: "smooth" });
                }}
              >
                {t('hero.cta')}
                <ArrowRight className="w-5 h-5" />
              </Button>
            </div>
          </section>

          {/* Benefits */}
          <section className="py-16 md:py-24 bg-muted/30">
            <div className="container mx-auto px-4 md:px-6">
              <h2 className="text-3xl md:text-4xl font-bold text-center text-foreground mb-4">
                {t('benefits.title')}
              </h2>
              
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mt-12">
                {benefits.map((benefit, index) => (
                  <div key={index} className="bg-card border border-border rounded-xl p-6 text-center hover:shadow-md transition-shadow">
                    <div className="w-14 h-14 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-4">
                      <benefit.icon className="w-7 h-7 text-primary" />
                    </div>
                    <h3 className="font-semibold text-foreground mb-2">{benefit.title}</h3>
                    <p className="text-sm text-muted-foreground">{benefit.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Packages */}
          <section id="pacotes" className="py-16 md:py-24">
            <div className="container mx-auto px-4 md:px-6">
              <h2 className="text-3xl md:text-4xl font-bold text-center text-foreground mb-4">
                {t('packages.title')}
              </h2>
              <p className="text-lg text-muted-foreground text-center max-w-2xl mx-auto mb-12">
                {t('packages.subtitle')}
              </p>
              
              <div className="grid md:grid-cols-3 gap-6 md:gap-8 max-w-5xl mx-auto items-start">
                {packages.map((pkg) => (
                  <div
                    key={pkg.key}
                    className={`relative bg-card border rounded-2xl p-6 md:p-8 transition-shadow hover:shadow-lg ${
                      pkg.highlighted
                        ? 'border-primary shadow-lg ring-2 ring-primary/20'
                        : 'border-border'
                    }`}
                  >
                    {pkg.highlighted && pkg.badge && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <span className="inline-flex items-center gap-1 bg-primary text-primary-foreground text-xs font-semibold px-3 py-1 rounded-full">
                          <Sparkles className="w-3 h-3" />
                          {pkg.badge}
                        </span>
                      </div>
                    )}
                    
                    <h3 className="text-xl font-bold text-foreground mb-1">{pkg.name}</h3>
                    <p className="text-sm text-muted-foreground mb-4">{pkg.description}</p>
                    
                    <div className="mb-2">
                      <span className="text-3xl font-bold text-foreground">{pkg.price}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mb-6">{pkg.duration}</p>
                    
                    <ul className="space-y-3 mb-8">
                      {Array.isArray(pkg.features) && pkg.features.map((feature, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <Check className="w-4 h-4 text-success mt-0.5 flex-shrink-0" />
                          <span className="text-muted-foreground">{feature}</span>
                        </li>
                      ))}
                    </ul>
                    
                    <Button
                      className="w-full"
                      variant={pkg.highlighted ? 'default' : 'outline'}
                      onClick={() => handlePackageClick(pkg.key)}
                    >
                      {pkg.cta}
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Process */}
          <section className="py-16 md:py-24 bg-muted/30">
            <div className="container mx-auto px-4 md:px-6">
              <h2 className="text-3xl md:text-4xl font-bold text-center text-foreground mb-12">
                {t('process.title')}
              </h2>
              
              <div className="grid md:grid-cols-4 gap-8 max-w-4xl mx-auto">
                {processSteps.map((step, index) => (
                  <div key={index} className="relative text-center">
                    {index < processSteps.length - 1 && (
                      <div className="hidden md:block absolute top-8 left-1/2 w-full h-0.5 bg-border" />
                    )}
                    <div className="relative z-10 flex flex-col items-center">
                      <div className="w-16 h-16 bg-primary text-primary-foreground rounded-2xl flex items-center justify-center mb-4 shadow-lg">
                        <step.icon className="w-7 h-7" />
                      </div>
                      <div className="text-3xl font-bold text-muted-foreground/20 mb-2">{step.number}</div>
                      <h3 className="text-lg font-semibold text-foreground mb-2">{step.title}</h3>
                      <p className="text-sm text-muted-foreground">{step.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* FAQ */}
          <section className="py-16 md:py-24">
            <div className="container mx-auto px-4 md:px-6 max-w-3xl">
              <h2 className="text-3xl md:text-4xl font-bold text-center text-foreground mb-12">
                {t('faq.title')}
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

          {/* CTA */}
          <section className="py-20 md:py-28 bg-primary">
            <div className="container mx-auto px-4 md:px-6 text-center">
              <h2 className="text-3xl md:text-4xl font-bold text-primary-foreground mb-4">
                {t('cta.title')}
              </h2>
              <p className="text-lg text-primary-foreground/80 max-w-2xl mx-auto mb-10">
                {t('cta.subtitle')}
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Button
                  size="lg"
                  variant="secondary"
                  className="text-base px-8 py-6 gap-2"
                  onClick={() => handlePackageClick('geral')}
                >
                  {t('cta.btn_primary')}
                  <ArrowRight className="w-5 h-5" />
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="text-base px-8 py-6 bg-transparent border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10"
                  onClick={() => navigate("/")}
                >
                  {t('cta.btn_secondary')}
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

export default Consultoria;
