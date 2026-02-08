import type { ReactNode } from 'react';
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";

interface FeatureCardProps {
  icon: LucideIcon;
  title: ReactNode;
  description: ReactNode;
  href?: string;
  className?: string;
  iconClassName?: string;
}

export function FeatureCard({
  icon: Icon,
  title,
  description,
  href,
  className,
  iconClassName
}: FeatureCardProps) {
  const { t } = useTranslation('landing');

  return (
    <div className={cn(
      "group bg-card p-6 md:p-8 rounded-2xl border border-border",
      "hover:shadow-lg hover:border-primary/20 transition-all duration-300",
      className
    )}>
      <div className={cn(
        "w-12 h-12 md:w-14 md:h-14 rounded-xl flex items-center justify-center mb-5",
        "bg-primary/10",
        iconClassName
      )}>
        <Icon className="w-6 h-6 md:w-7 md:h-7 text-primary" />
      </div>
      
      <h3 className="text-lg md:text-xl font-semibold text-card-foreground mb-2">
        {title}
      </h3>
      
      <p className="text-muted-foreground text-sm md:text-base leading-relaxed mb-4">
        {description}
      </p>
      
      {href && (
        <Link 
          to={href}
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:gap-2 transition-all"
        >
          {t('modules.view_more', 'Ver mais')}
          <ArrowRight className="w-4 h-4" />
        </Link>
      )}
    </div>
  );
}
