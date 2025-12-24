import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SalesMetricsCard } from "./SalesMetricsCard";
import { SalesChart } from "./SalesChart";
import { TopProductsTable } from "./TopProductsTable";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DollarSign,
  ShoppingCart,
  TrendingUp,
  Package,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface DailySale {
  date: string;
  revenue: number;
  orders: number;
}

interface Product {
  id: string;
  title: string;
  quantity: number;
  revenue: number;
}

interface SalesMetrics {
  totalRevenue: number;
  totalOrders: number;
  revenueToday: number;
  ordersToday: number;
  revenue7d: number;
  orders7d: number;
  revenue30d: number;
  orders30d: number;
  averageTicket: number;
  averageTicket30d: number;
}

interface SalesData {
  metrics: SalesMetrics;
  dailySales: DailySale[];
  topProducts: Product[];
  seller: {
    nickname: string;
    email: string;
  };
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

export function SalesDashboard() {
  const [salesData, setSalesData] = useState<SalesData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchSalesData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase.functions.invoke("ml-sales-data");

      if (error) {
        throw error;
      }

      if (data.error === "No ML account connected") {
        setError("connect");
        return;
      }

      if (data.error) {
        throw new Error(data.error);
      }

      setSalesData(data);
    } catch (err) {
      console.error("Error fetching sales data:", err);
      setError("Erro ao carregar dados de vendas");
      toast({
        title: "Erro",
        description: "Não foi possível carregar os dados de vendas",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSalesData();
  }, []);

  if (error === "connect") {
    return (
      <Card className="p-8 text-center">
        <AlertCircle className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
        <h3 className="text-xl font-semibold mb-2">Conta não conectada</h3>
        <p className="text-muted-foreground mb-4">
          Conecte sua conta do Mercado Livre para ver o Dashboard de Vendas
        </p>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="p-8 text-center">
        <AlertCircle className="w-12 h-12 mx-auto mb-4 text-destructive" />
        <h3 className="text-xl font-semibold mb-2">Erro ao carregar</h3>
        <p className="text-muted-foreground mb-4">{error}</p>
        <Button onClick={fetchSalesData} variant="outline">
          <RefreshCw className="w-4 h-4 mr-2" />
          Tentar novamente
        </Button>
      </Card>
    );
  }

  const metrics = salesData?.metrics;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-2xl font-bold text-foreground">Dashboard de Vendas</h3>
          {salesData?.seller && (
            <p className="text-muted-foreground">
              Conta: {salesData.seller.nickname || salesData.seller.email}
            </p>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchSalesData}
          disabled={isLoading}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {/* Metrics Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <SalesMetricsCard
          title="Receita Hoje"
          value={isLoading ? "..." : formatCurrency(metrics?.revenueToday || 0)}
          subtitle={`${metrics?.ordersToday || 0} pedidos`}
          icon={<DollarSign className="w-6 h-6 text-primary" />}
        />
        <SalesMetricsCard
          title="Receita 7 Dias"
          value={isLoading ? "..." : formatCurrency(metrics?.revenue7d || 0)}
          subtitle={`${metrics?.orders7d || 0} pedidos`}
          icon={<TrendingUp className="w-6 h-6 text-primary" />}
        />
        <SalesMetricsCard
          title="Receita 30 Dias"
          value={isLoading ? "..." : formatCurrency(metrics?.revenue30d || 0)}
          subtitle={`${metrics?.orders30d || 0} pedidos`}
          icon={<ShoppingCart className="w-6 h-6 text-primary" />}
        />
        <SalesMetricsCard
          title="Ticket Médio"
          value={isLoading ? "..." : formatCurrency(metrics?.averageTicket30d || 0)}
          subtitle="últimos 30 dias"
          icon={<Package className="w-6 h-6 text-primary" />}
        />
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SalesChart 
            data={salesData?.dailySales || []} 
            isLoading={isLoading} 
          />
        </div>
        <div className="lg:col-span-1">
          <TopProductsTable 
            products={salesData?.topProducts || []} 
            isLoading={isLoading} 
          />
        </div>
      </div>
    </div>
  );
}
