import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AbcHeader } from "@/components/abc/AbcHeader";
import { AbcProductsTab } from "@/components/abc/AbcProductsTab";
import { AbcCustomersTab } from "@/components/abc/AbcCustomersTab";
import { AbcCitiesTab } from "@/components/abc/AbcCitiesTab";
import { AbcConfigPanel } from "@/components/abc/AbcConfigPanel";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Package, Users, MapPin } from "lucide-react";

export interface AbcFilters {
  dateFrom: string | null;
  dateTo: string | null;
  selectedMonth: string | null;
  orderStatus: string[];
  cancellationFilter: "exclude" | "include" | "only";
}

export interface AbcConfig {
  percentA: number;
  percentB: number;
  percentC: number;
}

const DEFAULT_CONFIG: AbcConfig = {
  percentA: 70,
  percentB: 20,
  percentC: 10,
};

const AbcAnalysis = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [sellerId, setSellerId] = useState<string | null>(null);
  const [sellerNickname, setSellerNickname] = useState<string | null>(null);
  
  const [config, setConfig] = useState<AbcConfig>(DEFAULT_CONFIG);
  const [configOpen, setConfigOpen] = useState(false);
  
  const [filters, setFilters] = useState<AbcFilters>({
    dateFrom: null,
    dateTo: null,
    selectedMonth: null,
    orderStatus: ["paid"],
    cancellationFilter: "exclude",
  });

  const activeTab = searchParams.get("tab") || "products";

  const setActiveTab = (tab: string) => {
    setSearchParams({ tab });
  };

  // Fetch ML account
  const fetchMlAccount = async (userId: string) => {
    const { data, error } = await supabase
      .from("ml_accounts")
      .select("ml_user_id, nickname")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1);

    if (!error && data?.[0]) {
      setSellerId(data[0].ml_user_id);
      setSellerNickname(data[0].nickname);
      await fetchAbcConfig(data[0].ml_user_id);
    }
  };

  // Fetch ABC config
  const fetchAbcConfig = async (sellerIdParam: string) => {
    const { data } = await supabase
      .from("abc_config")
      .select("percent_a, percent_b, percent_c")
      .eq("seller_id", sellerIdParam)
      .maybeSingle();

    if (data) {
      setConfig({
        percentA: data.percent_a,
        percentB: data.percent_b,
        percentC: data.percent_c,
      });
    }
  };

  // Save ABC config
  const saveConfig = async (newConfig: AbcConfig) => {
    if (!user || !sellerId) return;

    const { error } = await supabase
      .from("abc_config")
      .upsert(
        {
          user_id: user.id,
          seller_id: sellerId,
          percent_a: newConfig.percentA,
          percent_b: newConfig.percentB,
          percent_c: newConfig.percentC,
        },
        { onConflict: "seller_id" }
      );

    if (!error) {
      setConfig(newConfig);
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null);
        if (!session) {
          navigate("/auth");
        } else {
          fetchMlAccount(session.user.id);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (!session) {
        navigate("/auth");
      } else {
        fetchMlAccount(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  if (loading) {
    return (
      <DashboardLayout title="Curva ABC">
        <div className="flex items-center justify-center h-64">
          <div className="animate-pulse text-muted-foreground">Carregando...</div>
        </div>
      </DashboardLayout>
    );
  }

  if (!sellerId) {
    return (
      <DashboardLayout title="Curva ABC">
        <div className="flex items-center justify-center h-64">
          <div className="text-center space-y-4">
            <p className="text-muted-foreground">
              Conecte sua conta do Mercado Livre para acessar a Curva ABC.
            </p>
            <button
              onClick={() => navigate("/dashboard")}
              className="text-primary underline"
            >
              Ir para o Dashboard
            </button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const headerContent = (
    <AbcHeader 
      sellerNickname={sellerNickname}
      config={config}
      onOpenConfig={() => setConfigOpen(true)}
      filters={filters}
      onFiltersChange={setFilters}
    />
  );

  return (
    <DashboardLayout 
      title="Curva ABC" 
      subtitle="Análise de produtos, clientes e cidades"
      headerContent={headerContent}
    >
      <div className="flex-1 p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full max-w-md grid-cols-3">
            <TabsTrigger value="products" className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              Produtos
            </TabsTrigger>
            <TabsTrigger value="customers" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Clientes
            </TabsTrigger>
            <TabsTrigger value="cities" className="flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Cidades
            </TabsTrigger>
          </TabsList>

          <TabsContent value="products">
            <AbcProductsTab 
              sellerId={sellerId} 
              filters={filters} 
              config={config} 
            />
          </TabsContent>

          <TabsContent value="customers">
            <AbcCustomersTab 
              sellerId={sellerId} 
              filters={filters} 
              config={config} 
            />
          </TabsContent>

          <TabsContent value="cities">
            <AbcCitiesTab 
              sellerId={sellerId} 
              filters={filters} 
              config={config} 
            />
          </TabsContent>
        </Tabs>
      </div>

      <AbcConfigPanel
        open={configOpen}
        onOpenChange={setConfigOpen}
        config={config}
        onSave={saveConfig}
      />
    </DashboardLayout>
  );
};

export default AbcAnalysis;
