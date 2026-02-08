import { useTranslation } from "react-i18next";
import { Section, SectionHeader } from "./Section";
import { EditableText } from "@/components/admin/EditableText";
import { Star, Quote } from "lucide-react";

export function LandingTestimonials() {
  const { t } = useTranslation('landing');

  const testimonialKeys = ['item1', 'item2', 'item3'];
  const statKeys = ['stat1', 'stat2', 'stat3', 'stat4'];

  return (
    <Section id="depoimentos" variant="muted">
      <SectionHeader
        title={
          <EditableText contentKey="home.testimonials.title" as="span">
            {t('testimonials.title')}
          </EditableText>
        }
        subtitle={
          <EditableText contentKey="home.testimonials.subtitle" as="span" multiline>
            {t('testimonials.subtitle')}
          </EditableText>
        }
      />

      {/* Testimonials grid */}
      <div className="grid md:grid-cols-3 gap-6 md:gap-8 mb-16">
        {testimonialKeys.map((key) => (
          <div
            key={key}
            className="bg-card border border-border rounded-xl p-6 relative"
          >
            <Quote className="w-8 h-8 text-primary/20 absolute top-4 right-4" />
            
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-primary/10 text-primary font-semibold rounded-full flex items-center justify-center">
                <EditableText contentKey={`home.testimonials.${key}.avatar`} as="span">
                  {t(`testimonials.${key}.avatar`)}
                </EditableText>
              </div>
              <div>
                <p className="font-semibold text-foreground">
                  <EditableText contentKey={`home.testimonials.${key}.name`} as="span">
                    {t(`testimonials.${key}.name`)}
                  </EditableText>
                </p>
                <p className="text-sm text-muted-foreground">
                  <EditableText contentKey={`home.testimonials.${key}.role`} as="span">
                    {t(`testimonials.${key}.role`)}
                  </EditableText>
                </p>
              </div>
            </div>
            
            <div className="flex gap-0.5 mb-3">
              {[1, 2, 3, 4, 5].map((star) => (
                <Star key={star} className="w-4 h-4 fill-warning text-warning" />
              ))}
            </div>
            
            <p className="text-muted-foreground text-sm leading-relaxed">
              "<EditableText contentKey={`home.testimonials.${key}.content`} as="span" multiline>
                {t(`testimonials.${key}.content`)}
              </EditableText>"
            </p>
          </div>
        ))}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8">
        {statKeys.map((key) => (
          <div key={key} className="text-center">
            <div className="text-3xl md:text-4xl font-bold text-primary mb-1">
              <EditableText contentKey={`home.testimonials.${key}.value`} as="span">
                {t(`testimonials.${key}.value`)}
              </EditableText>
            </div>
            <div className="text-sm text-muted-foreground">
              <EditableText contentKey={`home.testimonials.${key}.label`} as="span">
                {t(`testimonials.${key}.label`)}
              </EditableText>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}
