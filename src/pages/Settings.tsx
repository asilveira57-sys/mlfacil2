import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { User, Receipt, Building2, Plug, CreditCard, Palette, Users, Globe } from "lucide-react";
import SettingsProfile from "@/components/settings/SettingsProfile";
import SettingsBilling from "@/components/settings/SettingsBilling";
import SettingsCompanies from "@/components/settings/SettingsCompanies";
import SettingsIntegrations from "@/components/settings/SettingsIntegrations";
import SettingsSubscription from "@/components/settings/SettingsSubscription";
import SettingsCustomization from "@/components/settings/SettingsCustomization";
import { CollaboratorsCard } from "@/components/settings/collaborators";
import { PageContainer } from "@/components/layout/PageContainer";
import { SettingsLanguage } from "@/components/settings/SettingsLanguage";

const Settings = () => {
  const { t, i18n } = useTranslation();
  const currentLanguage = i18n.language;
  const [activeTab, setActiveTab] = useState("profile");

  const tabs = [
    { id: "profile", label: t('common:profile'), icon: User },
    { id: "language", label: t('common:language'), icon: Globe },
    { id: "collaborators", label: t('nav:collaborators'), icon: Users },
    { id: "customization", label: "Personalização", icon: Palette },
    { id: "billing", label: t('nav:billing'), icon: Receipt },
    { id: "companies", label: "Empresas e Contas", icon: Building2 },
    { id: "integrations", label: t('nav:integrations'), icon: Plug },
    { id: "subscription", label: "Assinatura", icon: CreditCard },
  ];

  return (
    <PageContainer 
      title={t('nav:settings')} 
      subtitle={currentLanguage === 'pt-BR' 
        ? "Gerencie seu perfil, idioma, empresas e integrações"
        : currentLanguage === 'en'
        ? "Manage your profile, language, companies and integrations"
        : "Gestiona tu perfil, idioma, empresas e integraciones"
      }
    >
      <div className="container mx-auto py-6 px-4 max-w-6xl">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 lg:grid-cols-8 h-auto p-1 bg-muted/50">
            {tabs.map((tab) => (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className="flex items-center gap-2 py-3 px-2 data-[state=active]:bg-background data-[state=active]:shadow-sm"
              >
                <tab.icon className="h-4 w-4" />
                <span className="hidden sm:inline text-xs">{tab.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="profile" className="mt-6">
            <SettingsProfile />
          </TabsContent>

          <TabsContent value="language" className="mt-6">
            <SettingsLanguage />
          </TabsContent>

          <TabsContent value="collaborators" className="mt-6">
            <CollaboratorsCard />
          </TabsContent>

          <TabsContent value="customization" className="mt-6">
            <SettingsCustomization />
          </TabsContent>

          <TabsContent value="billing" className="mt-6">
            <SettingsBilling />
          </TabsContent>

          <TabsContent value="companies" className="mt-6">
            <SettingsCompanies />
          </TabsContent>

          <TabsContent value="integrations" className="mt-6">
            <SettingsIntegrations />
          </TabsContent>

          <TabsContent value="subscription" className="mt-6">
            <SettingsSubscription />
          </TabsContent>
        </Tabs>
      </div>
    </PageContainer>
  );
};

export default Settings;
