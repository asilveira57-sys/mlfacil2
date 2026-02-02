import { useTranslation } from "react-i18next";
import { Section, SectionHeader } from "./Section";
import { Star, Quote } from "lucide-react";

export function LandingTestimonials() {
  const { t } = useTranslation('landing');

  const testimonials = [
    {
      name: t('testimonials.item1.name'),
      role: t('testimonials.item1.role'),
      content: t('testimonials.item1.content'),
      avatar: t('testimonials.item1.avatar')
    },
    {
      name: t('testimonials.item2.name'),
      role: t('testimonials.item2.role'),
      content: t('testimonials.item2.content'),
      avatar: t('testimonials.item2.avatar')
    },
    {
      name: t('testimonials.item3.name'),
      role: t('testimonials.item3.role'),
      content: t('testimonials.item3.content'),
      avatar: t('testimonials.item3.avatar')
    }
  ];

  const stats = [
    { value: t('testimonials.stat1.value'), label: t('testimonials.stat1.label') },
    { value: t('testimonials.stat2.value'), label: t('testimonials.stat2.label') },
    { value: t('testimonials.stat3.value'), label: t('testimonials.stat3.label') },
    { value: t('testimonials.stat4.value'), label: t('testimonials.stat4.label') }
  ];

  return (
    <Section id="depoimentos" variant="muted">
      <SectionHeader
        title={t('testimonials.title')}
        subtitle={t('testimonials.subtitle')}
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
