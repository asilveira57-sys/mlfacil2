import { useSearchParams } from "react-router-dom";
import { Settings, LucideIcon } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageContainer } from "@/components/layout/PageContainer";
import { useConfigMenu } from "@/hooks/useConfigMenu";
import { useUserRole } from "@/hooks/useUserRole";
import { Skeleton } from "@/components/ui/skeleton";
import { SettingsMenuEditor } from "@/components/settings/SettingsMenuEditor";
import * as LucideIcons from "lucide-react";

import SettingsProfile from "@/components/settings/SettingsProfile";
import SettingsSecurity from "@/components/settings/SettingsSecurity";
import SettingsBilling from "@/components/settings/SettingsBilling";
import SettingsCompanies from "@/components/settings/SettingsCompanies";
import SettingsPlan from "@/components/settings/SettingsPlan";
import SettingsCustomization from "@/components/settings/SettingsCustomization";
import { CollaboratorsCard } from "@/components/settings/collaborators";
import { SettingsLanguage } from "@/components/settings/SettingsLanguage";
import { SettingsUtilities } from "@/components/settings/SettingsUtilities";
import { SettingsSupport } from "@/components/settings/SettingsSupport";
import { SettingsTemplates } from "@/components/settings/SettingsTemplates";
import { SettingsPrivacy } from "@/components/settings/SettingsPrivacy";
import { SettingsAccessProfiles } from "@/components/settings/SettingsAccessProfiles";
import { SettingsDailyMessage } from "@/components/settings/SettingsDailyMessage";
import { SettingsNotifications } from "@/components/settings/SettingsNotifications";

// Static map: slug from DB → React component
const COMPONENT_MAP: Record<string, React.ComponentType> = {
  "perfil": SettingsProfile,
  "seguranca": SettingsSecurity,
  "idioma": SettingsLanguage,
  "notificacoes": SettingsNotifications,
  "colaboradores": CollaboratorsCard,
  "perfis-acesso": SettingsAccessProfiles,
  "personalizacao": SettingsCustomization,
  "aparencia": SettingsTemplates,
  "privacidade-lgpd": SettingsPrivacy,
  "utilidades": SettingsUtilities,
  "plano": SettingsPlan,
  "faturamento": SettingsBilling,
  "empresas-contas": SettingsCompanies,
  "abrir-chamado": SettingsSupport,
  "mensagem-do-dia": SettingsDailyMessage,
};

// Static fallback tabs when DB returns empty (error case only)
const FALLBACK_ITEMS: { slug: string; name: string; icon: string }[] = [
  { slug: "perfil", name: "Perfil", icon: "User" },
  { slug: "empresas-contas", name: "Empresas / Contas", icon: "Building2" },
  { slug: "seguranca", name: "Segurança", icon: "Shield" },
  { slug: "notificacoes", name: "Notificações", icon: "Bell" },
  { slug: "idioma", name: "Idioma", icon: "Globe" },
  { slug: "colaboradores", name: "Colaboradores", icon: "Users" },
  { slug: "perfis-acesso", name: "Perfis de Acesso", icon: "Key" },
  { slug: "aparencia", name: "Aparência", icon: "Paintbrush" },
  { slug: "plano", name: "Plano", icon: "CreditCard" },
  { slug: "faturamento", name: "Faturamento", icon: "Receipt" },
  { slug: "abrir-chamado", name: "Suporte", icon: "HelpCircle" },
  { slug: "mensagem-do-dia", name: "Mensagem do Dia", icon: "MessageSquare" },
];

function getIcon(iconName: string): LucideIcon {
  const icon = (LucideIcons as Record<string, unknown>)[iconName];
  return (icon as LucideIcon) || Settings;
}

function PlaceholderContent({ name }: { name: string }) {
  return (
    <div className="flex items-center justify-center h-64 border border-dashed border-border rounded-lg bg-muted/30">
      <div className="text-center space-y-2">
        <Settings className="h-10 w-10 mx-auto text-muted-foreground" />
        <p className="text-sm text-muted-foreground font-medium">{name}</p>
        <p className="text-xs text-muted-foreground/70">Em breve</p>
      </div>
    </div>
  );
}

export function SettingsLayout() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { menuItems, isLoading, error } = useConfigMenu();
  const { isAdmin } = useUserRole();

  // Use DB items (flat, already sorted with mensagem-do-dia last)
  // Fallback only on actual error
  const useFallback = !isLoading && menuItems.length === 0;
  const tabItems = useFallback
    ? FALLBACK_ITEMS.map(f => ({ id: f.slug, slug: f.slug, name: f.name, icon: f.icon }))
    : menuItems.map(i => ({ id: i.id, slug: i.slug, name: i.name, icon: i.icon }));

  const activeSlug = searchParams.get("section") || tabItems[0]?.slug || "perfil";

  const setActiveSlug = (slug: string) => {
    setSearchParams({ section: slug }, { replace: true });
  };

  const ActiveComponent = COMPONENT_MAP[activeSlug] || null;
  const activeName = tabItems.find(i => i.slug === activeSlug)?.name || "Configuração";

  return (
    <PageContainer title="Configurações" subtitle="Gerencie sua conta e preferências">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {isLoading && tabItems.length === 0 ? (
          <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <Tabs value={activeSlug} onValueChange={setActiveSlug} className="flex-1">
                <TabsList className="h-auto p-1 flex flex-wrap gap-1 bg-muted/50">
                  {tabItems.map(item => {
                    const Icon = getIcon(item.icon);
                    return (
                      <TabsTrigger
                        key={item.id}
                        value={item.slug}
                        className="flex items-center gap-1.5 text-xs px-3 py-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm"
                      >
                        <Icon className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">{item.name}</span>
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
              </Tabs>
              {isAdmin && <SettingsMenuEditor />}
            </div>

            {ActiveComponent ? (
              <ActiveComponent />
            ) : (
              <PlaceholderContent name={activeName} />
            )}
          </>
        )}
      </div>
    </PageContainer>
  );
}
