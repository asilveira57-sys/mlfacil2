import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface FAQItemProps {
  question: string;
  answer: string;
  value: string;
}

export function FAQItem({ question, answer, value }: FAQItemProps) {
  return (
    <AccordionItem value={value} className="border-b border-border">
      <AccordionTrigger className="text-left text-foreground hover:text-primary py-5">
        {question}
      </AccordionTrigger>
      <AccordionContent className="text-muted-foreground pb-5">
        {answer}
      </AccordionContent>
    </AccordionItem>
  );
}

interface FAQListProps {
  items: { question: string; answer: string }[];
}

export function FAQList({ items }: FAQListProps) {
  return (
    <Accordion type="single" collapsible className="w-full max-w-3xl mx-auto">
      {items.map((item, index) => (
        <FAQItem
          key={index}
          value={`item-${index}`}
          question={item.question}
          answer={item.answer}
        />
      ))}
    </Accordion>
  );
}
