import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { User, Receipt, Building2, CreditCard, Palette, Users, Globe } from "lucide-react";
import SettingsProfile from "@/components/settings/SettingsProfile";
import SettingsBilling from "@/components/settings/SettingsBilling";
import SettingsCompanies from "@/components/settings/SettingsCompanies";
import SettingsSubscription from "@/components/settings/SettingsSubscription";
import SettingsCustomization from "@/components/settings/SettingsCustomization";
import { CollaboratorsCard } from "@/components/settings/collaborators";
import { PageContainer } from "@/components/layout/PageContainer";
import { SettingsLanguage } from "@/components/settings/SettingsLanguage";

const Settings = () => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("profile");

  // Memoize tabs array to prevent re-creation on each render
  const tabs = useMemo(() => [
    { id: "profile", label: t('common:profile'), icon: User },
    { id: "language", label: t('common:language'), icon: Globe },
    { id: "collaborators", label: t('nav:collaborators'), icon: Users },
    { id: "customization", label: t('nav:customization'), icon: Palette },
    { id: "billing", label: t('nav:billing'), icon: Receipt },
    { id: "companies", label: t('nav:companies'), icon: Building2 },
    { id: "subscription", label: t('nav:subscription'), icon: CreditCard },
  ], [t]);

  return (
    <PageContainer 
      title={t('nav:settings')} 
      subtitle={t('nav:settings_subtitle')}
    >
      <div className="container mx-auto py-6 px-4 max-w-6xl">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 lg:grid-cols-7 h-auto p-1 bg-muted/50">
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
            {activeTab === "collaborators" && <CollaboratorsCard />}
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

          <TabsContent value="subscription" className="mt-6">
            <SettingsSubscription />
          </TabsContent>
        </Tabs>
      </div>
    </PageContainer>
  );
};

export default Settings;
