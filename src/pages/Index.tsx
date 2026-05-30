import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SiteContentProvider } from "@/contexts/SiteContentContext";
import { AdminEditModeIndicator } from "@/components/admin/AdminEditModeIndicator";
import {
  LandingHeader,
  LandingHero,
  LandingStats,
  LandingBenefits,
  LandingModules,
  LandingHowItWorks,
  LandingIntegrations,
  LandingDemo,
  LandingPricing,
  LandingFAQ,
  LandingCTA,
  LandingFooter
} from "@/components/landing";

const Index = () => {
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate("/dashboard");
      }
    });
  }, [navigate]);

  return (
    <SiteContentProvider>
      <div className="min-h-screen bg-background">
        <LandingHeader />
        <main>
          <LandingHero />
          <LandingStats />
          <LandingBenefits />
          <LandingModules />
          <LandingHowItWorks />
          <LandingIntegrations />
          <LandingDemo />
          <LandingPricing />
          <LandingFAQ />
          <LandingCTA />
        </main>
        <LandingFooter />
        <AdminEditModeIndicator />
      </div>
    </SiteContentProvider>
  );
};

export default Index;
