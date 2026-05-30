import { useEffect, useState } from "react";
import Autoplay from "embla-carousel-autoplay";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from "@/components/ui/carousel";
import { EditableImage } from "@/components/admin/EditableImage";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  Package,
  Clock,
  Activity,
  Megaphone,
  Tag,
  BarChart3,
} from "lucide-react";
import dashboardPreview from "@/assets/dashboard-preview.jpg";
import screenLinhaTempo from "@/assets/landing/screen-linha-tempo.png";
import screenPromocoes from "@/assets/landing/screen-promocoes.png";
import screenRadiografia from "@/assets/landing/screen-radiografia.png";
import screenRadiografiaDetalhe from "@/assets/landing/screen-radiografia-detalhe.png";
import screenEtiquetas from "@/assets/landing/screen-etiquetas.png";
import screenAds from "@/assets/landing/screen-ads.png";

type Slide = {
  contentKey: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  alt: string;
  fallback?: string;
};

const SLIDES: Slide[] = [
  {
    contentKey: "home.hero.dashboard_image",
    label: "Dashboard de Vendas",
    icon: LayoutDashboard,
    alt: "Tela do Dashboard de Vendas no MKTP Fácil",
    fallback: dashboardPreview,
  },
  {
    contentKey: "home.hero.screen_etiquetas",
    label: "Etiquetas de Envio",
    icon: Package,
    alt: "Tela de Etiquetas de Envio no MKTP Fácil",
  },
  {
    contentKey: "home.hero.screen_linha_tempo",
    label: "Linha do Tempo",
    icon: Clock,
    alt: "Tela da Linha do Tempo no MKTP Fácil",
    fallback: screenLinhaTempo,
  },
  {
    contentKey: "home.hero.screen_radiografia",
    label: "Radiografia",
    icon: Activity,
    alt: "Tela de Radiografia de anúncios no MKTP Fácil",
    fallback: screenRadiografia,
  },
  {
    contentKey: "home.hero.screen_radiografia_detalhe",
    label: "Diagnóstico do Anúncio",
    icon: BarChart3,
    alt: "Drawer de detalhes do anúncio no MKTP Fácil",
  },
  {
    contentKey: "home.hero.screen_promocoes",
    label: "Promoções",
    icon: Tag,
    alt: "Tela de Promoções no MKTP Fácil",
    fallback: screenPromocoes,
  },
  {
    contentKey: "home.hero.screen_ads",
    label: "Publicidade / ADS",
    icon: Megaphone,
    alt: "Tela de Publicidade ADS no MKTP Fácil",
  },
];

export function HeroScreensCarousel() {
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (!api) return;
    setCurrent(api.selectedScrollSnap());
    const onSelect = () => setCurrent(api.selectedScrollSnap());
    api.on("select", onSelect);
    return () => {
      api.off("select", onSelect);
    };
  }, [api]);

  return (
    <div className="mt-16 relative">
      {/* Soft glow */}
      <div className="absolute -inset-8 bg-gradient-to-tr from-primary/10 via-transparent to-accent/10 blur-3xl -z-10" />

      <Carousel
        setApi={setApi}
        opts={{ loop: true, align: "start" }}
        plugins={[
          Autoplay({
            delay: 5500,
            stopOnInteraction: true,
            stopOnMouseEnter: true,
          }),
        ]}
        className="relative group"
        aria-label="Telas do sistema MKTP Fácil"
      >
        {/* Gradient ring frame */}
        <div className="rounded-2xl md:rounded-3xl bg-gradient-to-br from-primary/40 via-border to-accent/40 p-[1.5px] shadow-2xl">
          <div className="rounded-2xl md:rounded-[1.4rem] bg-card border border-border overflow-hidden">
            {/* Browser chrome */}
            <div className="bg-muted/50 border-b border-border px-4 py-3 flex items-center gap-2">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-destructive/50" />
                <div className="w-3 h-3 rounded-full bg-warning/50" />
                <div className="w-3 h-3 rounded-full bg-success/50" />
              </div>
              <div className="flex-1 flex justify-center">
                <div className="bg-muted px-4 py-1 rounded-md text-xs text-muted-foreground truncate max-w-xs">
                  dashboard.mktpfacil.com
                </div>
              </div>
              <div className="w-12" />
            </div>

            {/* Slides */}
            <div className="relative">
              <CarouselContent className="-ml-0">
                {SLIDES.map((slide, idx) => {
                  const Icon = slide.icon;
                  return (
                    <CarouselItem key={slide.contentKey + idx} className="pl-0 basis-full">
                      <div className="relative aspect-video bg-muted">
                        <EditableImage
                          contentKey={slide.contentKey}
                          className="w-full h-full object-cover"
                          alt={slide.alt}
                          placeholder={
                            slide.fallback ? (
                              <img
                                src={slide.fallback}
                                alt={slide.alt}
                                className="w-full h-full object-cover"
                                loading={idx === 0 ? "eager" : "lazy"}
                                decoding="async"
                              />
                            ) : (
                              <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-muted to-muted/50 text-muted-foreground">
                                <Icon className="w-12 h-12 opacity-40" />
                                <span className="text-sm font-medium">{slide.label}</span>
                                <span className="text-xs opacity-70">
                                  Faça upload desta tela pelo admin
                                </span>
                              </div>
                            )
                          }
                        />

                        {/* Module badge */}
                        <div className="absolute top-3 left-3 inline-flex items-center gap-1.5 bg-background/90 backdrop-blur-sm border border-border text-foreground px-3 py-1.5 rounded-full text-xs font-semibold shadow-md">
                          <Icon className="w-3.5 h-3.5 text-primary" />
                          {slide.label}
                        </div>
                      </div>
                    </CarouselItem>
                  );
                })}
              </CarouselContent>

              {/* Arrows */}
              <Button
                type="button"
                size="icon"
                variant="secondary"
                onClick={() => api?.scrollPrev()}
                aria-label="Tela anterior"
                className="absolute left-3 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-background/80 backdrop-blur-sm border border-border shadow-lg opacity-0 group-hover:opacity-100 transition-opacity md:flex hidden"
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="secondary"
                onClick={() => api?.scrollNext()}
                aria-label="Próxima tela"
                className="absolute right-3 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-background/80 backdrop-blur-sm border border-border shadow-lg opacity-0 group-hover:opacity-100 transition-opacity md:flex hidden"
              >
                <ChevronRight className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>

        {/* Mobile arrows (always visible) */}
        <div className="flex md:hidden justify-center gap-2 mt-4">
          <Button
            type="button"
            size="icon"
            variant="outline"
            onClick={() => api?.scrollPrev()}
            aria-label="Tela anterior"
            className="h-9 w-9 rounded-full"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="outline"
            onClick={() => api?.scrollNext()}
            aria-label="Próxima tela"
            className="h-9 w-9 rounded-full"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Dots */}
        <div className="flex justify-center gap-2 mt-5">
          {SLIDES.map((slide, idx) => {
            const active = current === idx;
            return (
              <button
                key={slide.contentKey + "dot"}
                type="button"
                onClick={() => api?.scrollTo(idx)}
                aria-label={`Ir para tela ${idx + 1}: ${slide.label}`}
                aria-current={active}
                className={cn(
                  "h-2 rounded-full transition-all duration-300",
                  active
                    ? "w-8 bg-primary"
                    : "w-2 bg-muted-foreground/30 hover:bg-muted-foreground/60"
                )}
              />
            );
          })}
        </div>
      </Carousel>
    </div>
  );
}
