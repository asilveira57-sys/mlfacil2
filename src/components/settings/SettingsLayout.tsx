import { useSearchParams } from "react-router-dom";
import {
  User, Shield, Activity, Globe, Bell,
  Users, Palette, LayoutTemplate, ShieldCheck,
  Wrench, CreditCard, Receipt, Building2,
  Headphones, MessageSquare, Settings, LucideIcon,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageContainer } from "@/components/layout/PageContainer";

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

interface SettingsTab {
  id: string;
  label: string;
  icon: LucideIcon;
  component: React.ComponentType | null;
}

const settingsTabs: SettingsTab[] = [
  { id: "perfil", label: "Perfil", icon: User, component: SettingsProfile },
  { id: "seguranca", label: "Segurança", icon: Shield, component: SettingsSecurity },
  { id: "sessoes-ativas", label: "Sessões", icon: Activity, component: null },
  { id: "idioma", label: "Idioma", icon: Globe, component: SettingsLanguage },
  { id: "notificacoes", label: "Notificações", icon: Bell, component: null },
  { id: "colaboradores", label: "Colaboradores", icon: Users, component: CollaboratorsCard },
  { id: "perfis-acesso", label: "Perfis de Acesso", icon: ShieldCheck, component: SettingsAccessProfiles },
  { id: "personalizacao", label: "Personalização", icon: Palette, component: SettingsCustomization },
  { id: "aparencia", label: "Aparência", icon: LayoutTemplate, component: SettingsTemplates },
  { id: "privacidade-lgpd", label: "Privacidade", icon: ShieldCheck, component: SettingsPrivacy },
  { id: "utilidades", label: "Utilidades", icon: Wrench, component: SettingsUtilities },
  { id: "plano", label: "Plano", icon: CreditCard, component: SettingsPlan },
  { id: "faturamento", label: "Faturamento", icon: Receipt, component: SettingsBilling },
  { id: "empresas-contas", label: "Empresas", icon: Building2, component: SettingsCompanies },
  { id: "abrir-chamado", label: "Suporte", icon: Headphones, component: SettingsSupport },
  { id: "mensagem-do-dia", label: "Msg do Dia", icon: MessageSquare, component: SettingsDailyMessage },
];

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
  const activeSlug = searchParams.get("section") || "perfil";

  const setActiveSlug = (slug: string) => {
    setSearchParams({ section: slug }, { replace: true });
  };

  const activeTab = settingsTabs.find((t) => t.id === activeSlug) || settingsTabs[0];
  const ActiveComponent = activeTab.component;

  return (
    <PageContainer title="Configurações" subtitle="Gerencie sua conta e preferências">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <Tabs value={activeSlug} onValueChange={setActiveSlug}>
          <TabsList className="h-auto p-1 flex flex-wrap gap-1 bg-muted/50">
            {settingsTabs.map((tab) => (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm"
              >
                <tab.icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{tab.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {ActiveComponent ? (
          <ActiveComponent />
        ) : (
          <PlaceholderContent name={activeTab.label} />
        )}
      </div>
    </PageContainer>
  );
}
