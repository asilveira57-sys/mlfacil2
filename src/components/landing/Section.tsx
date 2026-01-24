import { cn } from "@/lib/utils";

interface SectionProps {
  children: React.ReactNode;
  className?: string;
  id?: string;
  variant?: "default" | "muted" | "gradient";
}

export function Section({ 
  children, 
  className, 
  id, 
  variant = "default" 
}: SectionProps) {
  return (
    <section
      id={id}
      className={cn(
        "py-16 md:py-24",
        variant === "muted" && "bg-muted/50",
        variant === "gradient" && "bg-gradient-to-b from-muted/30 to-background",
        className
      )}
    >
      <div className="container mx-auto px-4 md:px-6">
        {children}
      </div>
    </section>
  );
}

interface SectionHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  centered?: boolean;
  className?: string;
}

export function SectionHeader({ 
  title, 
  subtitle, 
  centered = true,
  className 
}: SectionHeaderProps) {
  return (
    <div className={cn(
      "mb-12 md:mb-16",
      centered && "text-center max-w-3xl mx-auto",
      className
    )}>
      <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
        {title}
      </h2>
      {subtitle && (
        <p className="text-lg text-muted-foreground">
          {subtitle}
        </p>
      )}
    </div>
  );
}
