import { useTranslation } from "react-i18next";
import { Section, SectionHeader } from "./Section";
import { FAQList } from "./FAQItem";

export function LandingFAQ() {
  const { t } = useTranslation('landing');

  const faqItems = [
    {
      question: t('faq.item1.question'),
      answer: t('faq.item1.answer')
    },
    {
      question: t('faq.item2.question'),
      answer: t('faq.item2.answer')
    },
    {
      question: t('faq.item3.question'),
      answer: t('faq.item3.answer')
    },
    {
      question: t('faq.item4.question'),
      answer: t('faq.item4.answer')
    },
    {
      question: t('faq.item5.question'),
      answer: t('faq.item5.answer')
    },
    {
      question: t('faq.item6.question'),
      answer: t('faq.item6.answer')
    }
  ];

  return (
    <Section id="faq">
      <SectionHeader
        title={t('faq.title')}
        subtitle={t('faq.subtitle')}
      />

      <FAQList items={faqItems} />
    </Section>
  );
}
