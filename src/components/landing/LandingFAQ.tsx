import { useTranslation } from "react-i18next";
import { Section, SectionHeader } from "./Section";
import { FAQList } from "./FAQItem";
import { EditableText } from "@/components/admin/EditableText";

export function LandingFAQ() {
  const { t } = useTranslation('landing');

  const faqKeys = ['item1', 'item2', 'item3', 'item4', 'item5', 'item6'];

  const faqItems = faqKeys.map((key) => ({
    question: (
      <EditableText contentKey={`home.faq.${key}.question`} as="span">
        {t(`faq.${key}.question`)}
      </EditableText>
    ),
    answer: (
      <EditableText contentKey={`home.faq.${key}.answer`} as="span" multiline>
        {t(`faq.${key}.answer`)}
      </EditableText>
    )
  }));

  return (
    <Section id="faq">
      <SectionHeader
        title={
          <EditableText contentKey="home.faq.title" as="span">
            {t('faq.title')}
          </EditableText>
        }
        subtitle={
          <EditableText contentKey="home.faq.subtitle" as="span" multiline>
            {t('faq.subtitle')}
          </EditableText>
        }
      />

      <FAQList items={faqItems} />
    </Section>
  );
}
