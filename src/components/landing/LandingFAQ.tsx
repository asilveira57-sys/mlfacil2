import { Section, SectionHeader } from "./Section";
import { FAQList } from "./FAQItem";
import { useSiteContentContext } from "@/contexts/SiteContentContext";

export function LandingFAQ() {
  const { getText } = useSiteContentContext();

  const faqItems = [
    {
      question: getText('home.faq.item1.question'),
      answer: getText('home.faq.item1.answer')
    },
    {
      question: getText('home.faq.item2.question'),
      answer: getText('home.faq.item2.answer')
    },
    {
      question: getText('home.faq.item3.question'),
      answer: getText('home.faq.item3.answer')
    },
    {
      question: getText('home.faq.item4.question'),
      answer: getText('home.faq.item4.answer')
    },
    {
      question: getText('home.faq.item5.question'),
      answer: getText('home.faq.item5.answer')
    },
    {
      question: getText('home.faq.item6.question'),
      answer: getText('home.faq.item6.answer')
    }
  ];

  return (
    <Section id="faq">
      <SectionHeader
        title={getText('home.faq.title')}
        subtitle={getText('home.faq.subtitle')}
      />

      <FAQList items={faqItems} />
    </Section>
  );
}
