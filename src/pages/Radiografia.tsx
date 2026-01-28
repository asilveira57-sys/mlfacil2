import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Activity, List, Scan, HeartPulse } from "lucide-react";
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
      title="Radiografia" 
      subtitle="Diagnóstico clínico dos seus anúncios"
    >
      {/* Clinical Wrapper with X-ray effect */}
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
        {/* Scan lines overlay effect */}
        <div 
          className="fixed inset-0 pointer-events-none opacity-[0.02]"
          style={{
            backgroundImage: `repeating-linear-gradient(
              0deg,
              transparent,
              transparent 2px,
              rgba(0, 255, 255, 0.1) 2px,
              rgba(0, 255, 255, 0.1) 4px
            )`
          }}
        />
        
        <div className="container max-w-7xl mx-auto py-6 px-4 relative">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-6 bg-slate-800/50 border border-slate-700/50">
              <TabsTrigger 
                value="overview" 
                className="gap-2 data-[state=active]:bg-cyan-600 data-[state=active]:text-white"
              >
                <HeartPulse className="h-4 w-4" />
                Visão Clínica
              </TabsTrigger>
              <TabsTrigger 
                value="items" 
                className="gap-2 data-[state=active]:bg-cyan-600 data-[state=active]:text-white"
              >
                <Scan className="h-4 w-4" />
                Prontuários
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
      </div>
    </DashboardLayout>
  );
}
