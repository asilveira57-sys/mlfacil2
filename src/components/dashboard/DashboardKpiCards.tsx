import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Package,
  AlertTriangle,
  Megaphone,
  TrendingUp,
  DollarSign,
  ShoppingCart,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface KpiData {
  totalOrders: number;
  pendingAlerts: number;
  activePromotions: number;
  activeCampaigns: number;
  loading: boolean;
}

export function DashboardKpiCards({ sellerId }: { sellerId?: string }) {
  const [data, setData] = useState<KpiData>({
    totalOrders: 0,
    pendingAlerts: 0,
    activePromotions: 0,
    activeCampaigns: 0,
    loading: true,
  });

  useEffect(() => {
    const fetchKpis = async () => {
      if (!sellerId) {
        setData(prev => ({ ...prev, loading: false }));
        return;
      }

      try {
        // Fetch pending alerts
        const { count: alertsCount } = await supabase
          .from("ads_alerts")
          .select("*", { count: "exact", head: true })
          .eq("seller_id", sellerId)
          .eq("is_dismissed", false);

        // Fetch active campaigns
        const { count: campaignsCount } = await supabase
          .from("ads_campaigns")
          .select("*", { count: "exact", head: true })
          .eq("seller_id", sellerId)
          .eq("status", "active");

        // For orders count, we'll use a simpler approach - just show campaigns for now
        // Orders count can be added when the ml_orders_cache table is properly typed
        setData({
          totalOrders: 0, // Will show as synced from ML
          pendingAlerts: alertsCount || 0,
          activePromotions: 0, // Placeholder for promotions module
          activeCampaigns: campaignsCount || 0,
          loading: false,
        });
      } catch (error) {
        console.error("Error fetching KPIs:", error);
        setData(prev => ({ ...prev, loading: false }));
      }
    };

    fetchKpis();
  }, [sellerId]);

  const kpis = [
    {
      title: "Pedidos (30d)",
      value: data.totalOrders,
      icon: ShoppingCart,
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
    },
    {
      title: "Alertas Pendentes",
      value: data.pendingAlerts,
      icon: AlertTriangle,
      color: "text-amber-500",
      bgColor: "bg-amber-500/10",
    },
    {
      title: "Campanhas Ativas",
      value: data.activeCampaigns,
      icon: Megaphone,
      color: "text-pink-500",
      bgColor: "bg-pink-500/10",
    },
    {
      title: "Promoções Ativas",
      value: data.activePromotions,
      icon: TrendingUp,
      color: "text-emerald-500",
      bgColor: "bg-emerald-500/10",
    },
  ];

  if (data.loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="p-4">
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-lg" />
              <div className="space-y-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-6 w-12" />
              </div>
            </div>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {kpis.map((kpi) => (
        <Card key={kpi.title} className="p-4 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3">
            <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${kpi.bgColor}`}>
              <kpi.icon className={`h-5 w-5 ${kpi.color}`} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{kpi.title}</p>
              <p className="text-2xl font-bold text-foreground">
                {kpi.value.toLocaleString("pt-BR")}
              </p>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
