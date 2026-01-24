import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { User, Receipt, Building2, Plug, CreditCard, FileText, ArrowRight } from "lucide-react";
import SettingsProfile from "@/components/settings/SettingsProfile";
import SettingsBilling from "@/components/settings/SettingsBilling";
import SettingsCompanies from "@/components/settings/SettingsCompanies";
import SettingsIntegrations from "@/components/settings/SettingsIntegrations";
import SettingsSubscription from "@/components/settings/SettingsSubscription";

const Settings = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("profile");

  const tabs = [
    { id: "profile", label: "Perfil", icon: User },
    { id: "billing", label: "Faturamento", icon: Receipt },
    { id: "companies", label: "Empresas e Contas", icon: Building2 },
    { id: "integrations", label: "Integrações", icon: Plug },
    { id: "subscription", label: "Assinatura", icon: CreditCard },
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-6 px-4 max-w-6xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">Configurações</h1>
          <p className="text-muted-foreground mt-1">
            Gerencie seu perfil, empresas, integrações e assinatura
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-5 h-auto p-1 bg-muted/50">
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

          <TabsContent value="profile" className="mt-6">
            <SettingsProfile />
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

        {/* Blog Admin Quick Access */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Gerenciamento do Blog
            </CardTitle>
            <CardDescription>
              Crie e gerencie posts e categorias do blog
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate('/admin/blog')} className="gap-2">
              Acessar Admin do Blog
              <ArrowRight className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Settings;
