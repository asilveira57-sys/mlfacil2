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
  const { menuGroups, isLoading } = useConfigMenu();
  const { isAdmin } = useUserRole();

  // Flatten all items from all groups for tab navigation
  const groups = Array.isArray(menuGroups) ? menuGroups : [];
  const allItems = groups.flatMap(g => g.items.flatMap(item => [item, ...item.children]));
  
  const activeSlug = searchParams.get("section") || allItems[0]?.slug || "perfil";

  const setActiveSlug = (slug: string) => {
    setSearchParams({ section: slug }, { replace: true });
  };

  const activeItem = allItems.find(i => i.slug === activeSlug);
  const ActiveComponent = activeItem ? COMPONENT_MAP[activeItem.slug] : null;

  return (
    <PageContainer title="Configurações" subtitle="Gerencie sua conta e preferências">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {isLoading ? (
          <Skeleton className="h-10 w-full" />
        ) : (
          <div className="flex items-center gap-2">
            <Tabs value={activeSlug} onValueChange={setActiveSlug} className="flex-1">
              <TabsList className="h-auto p-1 flex flex-wrap gap-1 bg-muted/50">
                {groups.map(group => (
                  group.items.map(item => {
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
                  })
                ))}
              </TabsList>
            </Tabs>
            {isAdmin && <SettingsMenuEditor />}
          </div>
        )}

        {ActiveComponent ? (
          <ActiveComponent />
        ) : (
          <PlaceholderContent name={activeItem?.name || "Configuração"} />
        )}
      </div>
    </PageContainer>
  );
}
