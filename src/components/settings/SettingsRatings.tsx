import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SystemRatingSummaryCard } from "@/components/ratings/SystemRatingSummaryCard";
import { ModuleRatingSummaryCard } from "@/components/ratings/ModuleRatingSummaryCard";
import { SettingsConsentCenter } from "@/components/ratings/SettingsConsentCenter";
import { useSystemModules } from "@/hooks/useSystemModules";
import { Separator } from "@/components/ui/separator";

export function SettingsRatings() {
  const [user, setUser] = useState<{ id: string; email?: string; user_metadata?: any } | null>(null);
  const { modules, isLoading: modulesLoading } = useSystemModules();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });
  }, []);

  if (!user) return null;

  const userName = user.user_metadata?.full_name || user.email?.split("@")[0] || "Usuário";
  const userCompany = user.user_metadata?.company || undefined;

  return (
    <div className="space-y-8">
      {/* System Rating */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Avaliação Geral</h2>
          <p className="text-sm text-muted-foreground">Avalie sua experiência com a plataforma</p>
        </div>
        <SystemRatingSummaryCard userId={user.id} userName={userName} userCompany={userCompany} />
      </section>

      <Separator />

      {/* Module Ratings */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Avaliação por Módulo</h2>
          <p className="text-sm text-muted-foreground">Avalie individualmente cada módulo do sistema</p>
        </div>
        {modulesLoading ? (
          <p className="text-sm text-muted-foreground">Carregando módulos...</p>
        ) : modules.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum módulo ativo encontrado.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {modules.map((mod) => (
              <ModuleRatingSummaryCard
                key={mod.key}
                moduleId={mod.key}
                moduleName={mod.label}
                userId={user.id}
              />
            ))}
          </div>
        )}
      </section>

      <Separator />

      {/* Consent Center */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Consentimentos</h2>
          <p className="text-sm text-muted-foreground">Gerencie suas permissões de uso de depoimentos</p>
        </div>
        <SettingsConsentCenter userId={user.id} />
      </section>
    </div>
  );
}
