import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Activity, List } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { RadiographyOverview } from "@/components/radiography/RadiographyOverview";
import { RadiographyItemList } from "@/components/radiography/RadiographyItemList";
import { RadiographyDetailDrawer } from "@/components/radiography/RadiographyDetailDrawer";
import { DashboardLayout } from "@/components/layout/DashboardLayout";

export default function Radiografia() {
  const [sellerId, setSellerId] = useState<string | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => {
    async function loadSellerId() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: accounts } = await supabase
        .from("ml_accounts")
        .select("ml_user_id")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .limit(1);

      if (accounts?.[0]) {
        setSellerId(accounts[0].ml_user_id);
      }
    }
    loadSellerId();
  }, []);

  const handleSelectItem = (itemId: string) => {
    setSelectedItemId(itemId);
    setDrawerOpen(true);
  };

  return (
    <DashboardLayout 
      title="Radiografia de Anúncios" 
      subtitle="Monitoramento de saúde e performance dos seus anúncios"
    >
      <div className="container max-w-7xl mx-auto py-6 px-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="overview" className="gap-2">
              <Activity className="h-4 w-4" />
              Visão Geral
            </TabsTrigger>
            <TabsTrigger value="items" className="gap-2">
              <List className="h-4 w-4" />
              Anúncios
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <RadiographyOverview 
              sellerId={sellerId} 
              onSelectItem={handleSelectItem}
            />
          </TabsContent>

          <TabsContent value="items">
            <RadiographyItemList 
              sellerId={sellerId}
              onSelectItem={handleSelectItem}
            />
          </TabsContent>
        </Tabs>

        <RadiographyDetailDrawer
          sellerId={sellerId}
          itemId={selectedItemId}
          open={drawerOpen}
          onClose={() => {
            setDrawerOpen(false);
            setSelectedItemId(null);
          }}
        />
      </div>
    </DashboardLayout>
  );
}
