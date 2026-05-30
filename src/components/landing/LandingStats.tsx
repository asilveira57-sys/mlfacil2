import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { DollarSign, ShoppingCart, TrendingUp, Package } from "lucide-react";
import { Section, SectionHeader } from "./Section";
import { supabase } from "@/integrations/supabase/client";

interface Stats {
  total_valor_30d: number;
  total_pedidos_30d: number;
  ticket_medio_30d: number;
  pedidos_por_dia_30d: number;
  updated_at: string;
}

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v || 0);

const fmtInt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(v || 0);

export function LandingStats() {
  const { t } = useTranslation("landing");
  const [stats, setStats] = useState<Stats | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("landing_public_stats")
      .select("total_valor_30d,total_pedidos_30d,ticket_medio_30d,pedidos_por_dia_30d,updated_at")
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        if (data && Number(data.total_pedidos_30d) > 0) {
          setStats({
            total_valor_30d: Number(data.total_valor_30d),
            total_pedidos_30d: Number(data.total_pedidos_30d),
            ticket_medio_30d: Number(data.ticket_medio_30d),
            pedidos_por_dia_30d: Number(data.pedidos_por_dia_30d),
            updated_at: data.updated_at,
          });
        }
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loaded || !stats) return null;

  const items = [
    {
      label: t("stats.transacted"),
      value: fmtBRL(stats.total_valor_30d),
      icon: DollarSign,
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
    },
    {
      label: t("stats.orders"),
      value: fmtInt(stats.total_pedidos_30d),
      icon: ShoppingCart,
      color: "text-blue-500",
      bg: "bg-blue-500/10",
    },
    {
      label: t("stats.avg_ticket"),
      value: fmtBRL(stats.ticket_medio_30d),
      icon: TrendingUp,
      color: "text-violet-500",
      bg: "bg-violet-500/10",
    },
    {
      label: t("stats.orders_per_day"),
      value: fmtInt(stats.pedidos_por_dia_30d),
      icon: Package,
      color: "text-amber-500",
      bg: "bg-amber-500/10",
    },
  ];

  const updatedAt = new Date(stats.updated_at).toLocaleDateString("pt-BR");

  return (
    <Section id="stats">
      <SectionHeader
        title={t("stats.title")}
        subtitle={t("stats.subtitle")}
      />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        {items.map((it) => (
          <div
            key={it.label}
            className="bg-card border border-border rounded-xl p-5 md:p-6 hover:shadow-md transition-shadow"
          >
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${it.bg}`}>
              <it.icon className={`w-5 h-5 ${it.color}`} />
            </div>
            <p className="text-xs md:text-sm text-muted-foreground mb-1">{it.label}</p>
            <p className="text-xl md:text-3xl font-bold text-foreground tabular-nums">
              {it.value}
            </p>
          </div>
        ))}
      </div>
      <p className="text-center text-xs text-muted-foreground mt-6">
        {t("stats.updated_at", { date: updatedAt })}
      </p>
    </Section>
  );
}
