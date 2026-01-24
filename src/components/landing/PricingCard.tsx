import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface PricingFeature {
  text: string;
  included: boolean;
}

interface PricingCardProps {
  name: string;
  description: string;
  price: string;
  period?: string;
  features: PricingFeature[];
  highlighted?: boolean;
  ctaText?: string;
  ctaHref?: string;
}

export function PricingCard({
  name,
  description,
  price,
  period = "/mês",
  features,
  highlighted = false,
  ctaText = "Escolher plano",
  ctaHref = "/auth"
}: PricingCardProps) {
  const navigate = useNavigate();
  
  return (
    <div className={cn(
      "relative flex flex-col p-6 md:p-8 rounded-2xl border transition-all duration-300",
      highlighted 
        ? "bg-primary text-primary-foreground border-primary shadow-xl scale-105" 
        : "bg-card border-border hover:border-primary/30 hover:shadow-lg"
    )}>
      {highlighted && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-accent text-accent-foreground text-sm font-medium rounded-full">
          Mais popular
        </div>
      )}
      
      <div className="mb-6">
        <h3 className={cn(
          "text-xl font-bold mb-2",
          highlighted ? "text-primary-foreground" : "text-card-foreground"
        )}>
          {name}
        </h3>
        <p className={cn(
          "text-sm",
          highlighted ? "text-primary-foreground/80" : "text-muted-foreground"
        )}>
          {description}
        </p>
      </div>
      
      <div className="mb-6">
        <span className={cn(
          "text-4xl font-bold",
          highlighted ? "text-primary-foreground" : "text-foreground"
        )}>
          {price}
        </span>
        {price !== "A definir" && (
          <span className={cn(
            "text-sm ml-1",
            highlighted ? "text-primary-foreground/70" : "text-muted-foreground"
          )}>
            {period}
          </span>
        )}
      </div>
      
      <ul className="space-y-3 mb-8 flex-1">
        {features.map((feature, i) => (
          <li 
            key={i}
            className={cn(
              "flex items-start gap-3 text-sm",
              !feature.included && "opacity-50"
            )}
          >
            <Check className={cn(
              "w-5 h-5 flex-shrink-0 mt-0.5",
              highlighted ? "text-accent" : "text-success"
            )} />
            <span className={highlighted ? "text-primary-foreground" : "text-card-foreground"}>
              {feature.text}
            </span>
          </li>
        ))}
      </ul>
      
      <Button
        onClick={() => navigate(ctaHref)}
        variant={highlighted ? "secondary" : "default"}
        size="lg"
        className="w-full"
      >
        {ctaText}
      </Button>
    </div>
  );
}
