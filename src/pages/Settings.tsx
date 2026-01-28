import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { User, Receipt, Building2, Plug, CreditCard, Palette } from "lucide-react";
import SettingsProfile from "@/components/settings/SettingsProfile";
import SettingsBilling from "@/components/settings/SettingsBilling";
import SettingsCompanies from "@/components/settings/SettingsCompanies";
import SettingsIntegrations from "@/components/settings/SettingsIntegrations";
import SettingsSubscription from "@/components/settings/SettingsSubscription";
import SettingsCustomization from "@/components/settings/SettingsCustomization";
import { CollaboratorsCard } from "@/components/settings/collaborators";
import { DashboardLayout } from "@/components/layout/DashboardLayout";

const Settings = () => {
  const [activeTab, setActiveTab] = useState("profile");

  const tabs = [
    { id: "profile", label: "Perfil", icon: User },
    { id: "customization", label: "Personalização", icon: Palette },
    { id: "billing", label: "Faturamento", icon: Receipt },
    { id: "companies", label: "Empresas e Contas", icon: Building2 },
    { id: "integrations", label: "Integrações", icon: Plug },
    { id: "subscription", label: "Assinatura", icon: CreditCard },
  ];

  return (
    <DashboardLayout 
      title="Configurações" 
      subtitle="Gerencie seu perfil, empresas, integrações e assinatura"
    >
      <div className="container mx-auto py-6 px-4 max-w-6xl">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-6 h-auto p-1 bg-muted/50">
            {tabs.map((tab) => (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className="flex items-center gap-2 py-3 px-4 data-[state=active]:bg-background data-[state=active]:shadow-sm"
              >
                <tab.icon className="h-4 w-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="profile" className="mt-6 space-y-6">
            <SettingsProfile />
            {/* Collaborators Card - Only visible for workspace admins */}
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
    </DashboardLayout>
  );
};

export default Settings;
