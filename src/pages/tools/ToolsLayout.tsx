import { ReactNode } from "react";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { SiteContentProvider } from "@/contexts/SiteContentContext";

interface ToolsLayoutProps {
  children: ReactNode;
}

export function ToolsLayout({ children }: ToolsLayoutProps) {
  return (
    <SiteContentProvider>
      <div className="min-h-screen bg-background">
        <LandingHeader />
        <main className="pt-20 pb-16">
          {children}
        </main>
        <LandingFooter />
      </div>
    </SiteContentProvider>
  );
}
