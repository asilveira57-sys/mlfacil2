import { Card, CardContent } from "@/components/ui/card";
import { Package, TrendingUp, DollarSign, Users } from "lucide-react";

interface SummaryCard {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  description?: string;
  trend?: {
    value: number;
    label: string;
  };
}

interface AbcSummaryCardsProps {
  cards: SummaryCard[];
}

const formatValue = (value: string | number): string => {
  if (typeof value === "number") {
    return new Intl.NumberFormat("pt-BR").format(value);
  }
  return value;
};

export function AbcSummaryCards({ cards }: AbcSummaryCardsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card, index) => (
        <Card key={index} className="relative overflow-hidden">
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{card.label}</p>
                <p className="text-2xl font-bold">{formatValue(card.value)}</p>
                {card.description && (
                  <p className="text-xs text-muted-foreground">{card.description}</p>
                )}
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                {card.icon}
              </div>
            </div>
            {card.trend && (
              <div className="mt-3 flex items-center gap-1 text-sm">
                <span
                  className={
                    card.trend.value >= 0 ? "text-success" : "text-destructive"
                  }
                >
                  {card.trend.value >= 0 ? "+" : ""}
                  {card.trend.value.toFixed(1)}%
                </span>
                <span className="text-muted-foreground">{card.trend.label}</span>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function createProductsSummary(data: {
  totalProducts: number;
  totalUnits: number;
  totalRevenue: number;
  classACount: number;
}) {
  return [
    {
      label: "Produtos Únicos",
      value: data.totalProducts,
      icon: <Package className="h-5 w-5 text-primary" />,
      description: `${data.classACount} na classe A`,
    },
    {
      label: "Unidades Vendidas",
      value: data.totalUnits,
      icon: <TrendingUp className="h-5 w-5 text-primary" />,
    },
    {
      label: "Faturamento Total",
      value: new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
      }).format(data.totalRevenue),
      icon: <DollarSign className="h-5 w-5 text-primary" />,
    },
  ];
}

export function createCustomersSummary(data: {
  totalCustomers: number;
  totalOrders: number;
  totalRevenue: number;
  classACount: number;
}) {
  return [
    {
      label: "Clientes Únicos",
      value: data.totalCustomers,
      icon: <Users className="h-5 w-5 text-primary" />,
      description: `${data.classACount} na classe A`,
    },
    {
      label: "Total de Pedidos",
      value: data.totalOrders,
      icon: <Package className="h-5 w-5 text-primary" />,
    },
    {
      label: "Valor Total",
      value: new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
      }).format(data.totalRevenue),
      icon: <DollarSign className="h-5 w-5 text-primary" />,
    },
  ];
}
