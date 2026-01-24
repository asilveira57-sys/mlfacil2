import { Section, SectionHeader } from "./Section";
import { Star, Quote } from "lucide-react";

const testimonials = [
  {
    name: "Carlos Silva",
    role: "Seller há 5 anos",
    content: "Finalmente uma ferramenta que entende as dores de quem vende no Mercado Livre. Consegui aumentar minhas vendas em 40% nos primeiros 3 meses.",
    avatar: "CS"
  },
  {
    name: "Ana Martins",
    role: "Loja de eletrônicos",
    content: "O módulo de concorrência me ajudou a ajustar preços de forma inteligente. Hoje tenho uma visão muito mais clara do mercado.",
    avatar: "AM"
  },
  {
    name: "Roberto Santos",
    role: "Full Commerce",
    content: "A gestão multiconta era um pesadelo antes. Agora gerencio 8 contas em um só painel sem perder nenhum detalhe.",
    avatar: "RS"
  }
];

const stats = [
  { value: "2.500+", label: "Sellers ativos" },
  { value: "15M+", label: "Análises realizadas" },
  { value: "R$ 80M", label: "GMV monitorado" },
  { value: "98%", label: "Satisfação" }
];

export function LandingTestimonials() {
  return (
    <Section id="depoimentos" variant="muted">
      <SectionHeader
        title="O que nossos clientes dizem"
        subtitle="Histórias reais de sellers que transformaram seus negócios com nossa plataforma."
      />

      {/* Testimonials grid */}
      <div className="grid md:grid-cols-3 gap-6 md:gap-8 mb-16">
        {testimonials.map((testimonial, index) => (
          <div
            key={index}
            className="bg-card border border-border rounded-xl p-6 relative"
          >
            <Quote className="w-8 h-8 text-primary/20 absolute top-4 right-4" />
            
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-primary/10 text-primary font-semibold rounded-full flex items-center justify-center">
                {testimonial.avatar}
              </div>
              <div>
                <p className="font-semibold text-foreground">{testimonial.name}</p>
                <p className="text-sm text-muted-foreground">{testimonial.role}</p>
              </div>
            </div>
            
            <div className="flex gap-0.5 mb-3">
              {[1, 2, 3, 4, 5].map((star) => (
                <Star key={star} className="w-4 h-4 fill-warning text-warning" />
              ))}
            </div>
            
            <p className="text-muted-foreground text-sm leading-relaxed">
              "{testimonial.content}"
            </p>
          </div>
        ))}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8">
        {stats.map((stat, index) => (
          <div key={index} className="text-center">
            <div className="text-3xl md:text-4xl font-bold text-primary mb-1">
              {stat.value}
            </div>
            <div className="text-sm text-muted-foreground">
              {stat.label}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}
