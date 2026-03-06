import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { auditLog } from "../_shared/audit-log.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface Rule {
  id: string;
  name: string;
  period_days: number;
  retrospective_type: string;
  applies_to_scope: string;
  auto_generate: boolean;
  auto_send: boolean;
}

interface Company {
  id: string;
  tenant_id: string;
  display_name: string | null;
}

interface MarketplaceAccount {
  id: string;
  company_id: string;
  external_user_id: string;
}

// ─── Helpers ───

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function toDateStr(d: Date): string {
  return d.toISOString().split("T")[0];
}

/** Fetch all rows with automatic pagination (no LIMIT) */
async function fetchAllRows<T>(
  query: any,
  pageSize = 500
): Promise<T[]> {
  const all: T[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await query.range(offset, offset + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}

// ─── Snapshot Generator ───

async function generateSnapshot(
  supabase: any,
  tenantId: string,
  companyId: string,
  sellerId: string,
  periodStart: string,
  periodEnd: string,
  snapshotType: string
): Promise<Record<string, unknown>> {
  // Orders
  const { data: orders } = await supabase
    .from("meli_orders_cache")
    .select("order_id, total_amount")
    .eq("seller_id", sellerId)
    .eq("order_status", "paid")
    .gte("created_at_meli", periodStart)
    .lte("created_at_meli", periodEnd);

  const ordersCount = orders?.length || 0;
  const revenueTotal = (orders || []).reduce(
    (s: number, o: any) => s + Number(o.total_amount || 0),
    0
  );
  const averageTicket = ordersCount > 0 ? revenueTotal / ordersCount : 0;

  // Cancellations
  const { data: cancellations } = await supabase
    .from("meli_orders_cache")
    .select("order_id, total_amount")
    .eq("seller_id", sellerId)
    .eq("order_status", "cancelled")
    .gte("created_at_meli", periodStart)
    .lte("created_at_meli", periodEnd);

  const cancellationsCount = cancellations?.length || 0;
  const cancellationsValue = (cancellations || []).reduce(
    (s: number, o: any) => s + Number(o.total_amount || 0),
    0
  );

  // Ads
  const { data: adsData } = await supabase
    .from("ads_daily_metrics")
    .select("spent, revenue, acos, roas")
    .eq("seller_id", sellerId)
    .gte("metric_date", periodStart)
    .lte("metric_date", periodEnd);

  const adsSpend = (adsData || []).reduce(
    (s: number, d: any) => s + Number(d.spent || 0),
    0
  );
  const adsRevenue = (adsData || []).reduce(
    (s: number, d: any) => s + Number(d.revenue || 0),
    0
  );
  const acosValues = (adsData || [])
    .filter((d: any) => d.acos != null)
    .map((d: any) => Number(d.acos));
  const roasValues = (adsData || [])
    .filter((d: any) => d.roas != null)
    .map((d: any) => Number(d.roas));
  const acosMedio =
    acosValues.length > 0
      ? acosValues.reduce((s: number, v: number) => s + v, 0) / acosValues.length
      : null;
  const roasMedio =
    roasValues.length > 0
      ? roasValues.reduce((s: number, v: number) => s + v, 0) / roasValues.length
      : null;

  // Active listings
  const { count: activeListings } = await supabase
    .from("analyzed_items")
    .select("*", { count: "exact", head: true })
    .eq("seller_id", sellerId)
    .eq("status", "active");

  // Products count
  const { count: productsCount } = await supabase
    .from("analyzed_items")
    .select("*", { count: "exact", head: true })
    .eq("seller_id", sellerId);

  // Costs (from cost calculation cache if available)
  const { data: costData } = await supabase
    .from("order_cost_cache")
    .select("total_cost, ml_fee_total, estimated_profit")
    .eq("seller_id", sellerId)
    .gte("order_date", periodStart)
    .lte("order_date", periodEnd);

  const totalFees = (costData || []).reduce(
    (s: number, c: any) => s + Number(c.ml_fee_total || 0),
    0
  );
  const totalCost = (costData || []).reduce(
    (s: number, c: any) => s + Number(c.total_cost || 0),
    0
  );
  const estimatedProfit = (costData || []).reduce(
    (s: number, c: any) => s + Number(c.estimated_profit || 0),
    0
  );
  const averageMargin =
    revenueTotal > 0 ? (estimatedProfit / revenueTotal) * 100 : null;

  const tacos =
    revenueTotal > 0 ? (adsSpend / revenueTotal) * 100 : null;

  const snapshot = {
    tenant_id: tenantId,
    company_id: companyId,
    snapshot_type: snapshotType,
    snapshot_date: toDateStr(new Date()),
    period_start: periodStart,
    period_end: periodEnd,
    orders_count: ordersCount,
    revenue_total: revenueTotal,
    average_ticket: averageTicket,
    ads_spend: adsSpend,
    roas: roasMedio,
    acos: acosMedio,
    tacos,
    active_listings: activeListings || 0,
    products_count: productsCount || 0,
    cancellations_count: cancellationsCount,
    cancellations_value: cancellationsValue,
    total_fees: totalFees,
    total_cost: totalCost,
    estimated_profit: estimatedProfit,
    average_margin: averageMargin,
  };

  // Persist snapshot
  const { data: saved, error: snapErr } = await supabase
    .from("retrospective_snapshots")
    .insert(snapshot)
    .select("id")
    .single();

  if (snapErr) throw snapErr;

  return { ...snapshot, id: saved.id };
}

// ─── Build summary JSON for a retrospective ───

async function countModuleUsage(
  supabase: any,
  tenantId: string,
  companyId: string,
  periodStart: string,
  periodEnd: string
): Promise<Record<string, number>> {
  const { data: events } = await supabase
    .from("account_events")
    .select("module, event_type")
    .eq("company_id", companyId)
    .gte("created_at", periodStart)
    .lte("created_at", periodEnd);

  const moduleCounts: Record<string, number> = {};
  for (const e of events || []) {
    const mod = e.module || "geral";
    moduleCounts[mod] = (moduleCounts[mod] || 0) + 1;
  }
  return moduleCounts;
}

function buildTrialNarrative(
  current: Record<string, unknown>,
  baseline: Record<string, unknown> | null,
  moduleUsage: Record<string, number>,
  isConversion: boolean
): Record<string, unknown> {
  const ordersNow = Number(current.orders_count || 0);
  const revenueNow = Number(current.revenue_total || 0);
  const profitNow = Number(current.estimated_profit || 0);
  const listingsNow = Number(current.active_listings || 0);
  const productsNow = Number(current.products_count || 0);
  const marginNow = Number(current.average_margin || 0);

  const ordersBase = Number(baseline?.orders_count || 0);
  const revenueBase = Number(baseline?.revenue_total || 0);

  const totalEvents = Object.values(moduleUsage).reduce((s, v) => s + v, 0);
  const modulesUsed = Object.keys(moduleUsage);

  // Detect opportunities
  const opportunities: string[] = [];
  if (marginNow < 15) opportunities.push("Sua margem está abaixo de 15%. Há espaço para otimizar custos e preços.");
  if (Number(current.ads_spend || 0) === 0) opportunities.push("Você ainda não usa publicidade. Campanhas de ADS podem acelerar suas vendas.");
  if (Number(current.acos || 0) > 30) opportunities.push("Seu ACOS está acima de 30%. Otimizar campanhas pode melhorar o retorno.");
  if (Number(current.cancellations_count || 0) > ordersNow * 0.05) opportunities.push("Taxa de cancelamento acima de 5%. Revisar qualidade e descrições pode reduzir devoluções.");
  if (listingsNow < 20) opportunities.push("Poucos anúncios ativos. Expandir o catálogo pode aumentar a exposição.");

  // Growth projection (30-day extrapolation)
  const dailyRevenue = revenueNow / 14;
  const projectedMonthly = dailyRevenue * 30;
  const projectedAnnual = dailyRevenue * 365;

  // Build narrative sections
  const narrative: Record<string, unknown> = {
    opening: {
      headline: isConversion
        ? "Seus primeiros 14 dias já revelaram o potencial da sua operação"
        : "Resumo dos seus primeiros 14 dias na plataforma",
      initial_state: `Quando você conectou sua conta, sua operação tinha ${ordersBase} pedidos registrados e R$ ${revenueBase.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} em faturamento.`,
      analysis: `O sistema analisou ${productsNow} produtos, ${listingsNow} anúncios ativos e processou ${totalEvents} ações nos módulos da plataforma.`,
    },
    performance: {
      orders_period: ordersNow,
      revenue_period: revenueNow,
      profit_period: profitNow,
      margin_period: marginNow,
      ticket_period: Number(current.average_ticket || 0),
    },
    module_usage: {
      total_actions: totalEvents,
      modules_used: modulesUsed,
      breakdown: moduleUsage,
      engagement_level: totalEvents > 50 ? "alto" : totalEvents > 20 ? "moderado" : "inicial",
    },
    discoveries: {
      products_analyzed: productsNow,
      listings_active: listingsNow,
      opportunities_found: opportunities.length,
      opportunities,
    },
    projections: {
      monthly_revenue_estimate: projectedMonthly,
      annual_revenue_estimate: projectedAnnual,
      monthly_profit_estimate: profitNow > 0 ? (profitNow / 14) * 30 : null,
      growth_potential: ordersBase > 0
        ? `${(((ordersNow - ordersBase) / ordersBase) * 100).toFixed(1)}% de crescimento nos primeiros 14 dias`
        : "Dados iniciais sendo coletados para projeção",
    },
  };

  if (isConversion) {
    narrative.cta = {
      type: "trial_conversion",
      show_upgrade_button: true,
      headline: "Continue transformando dados em resultado",
      primary_message: `Em apenas 14 dias, o sistema já identificou ${opportunities.length} oportunidade(s) de melhoria na sua operação. Continuar usando permite que essas descobertas se transformem em resultado real.`,
      supporting_points: [
        `${productsNow} produtos monitorados em tempo real`,
        `${totalEvents} ações executadas automaticamente`,
        opportunities.length > 0
          ? `${opportunities.length} oportunidade(s) de otimização identificadas`
          : "Operação saudável – manter monitoramento contínuo",
        `Projeção de R$ ${projectedMonthly.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} de faturamento mensal`,
      ],
      urgency: "Seu período de teste está acabando. Ative seu plano para não perder o acompanhamento contínuo da sua operação.",
    };
  } else {
    narrative.cta = {
      type: "trial_summary",
      show_upgrade_button: false,
      headline: "Obrigado por fazer parte da plataforma",
      primary_message: `Aqui está o resumo dos seus primeiros 14 dias. Seu plano já está ativo e o sistema continuará monitorando e otimizando sua operação automaticamente.`,
    };
  }

  return narrative;
}

async function buildSummaryJson(
  supabase: any,
  currentSnapshot: Record<string, unknown>,
  baselineSnapshot: Record<string, unknown> | null,
  rule: Rule,
  trialStatus: string,
  tenantId: string,
  companyId: string,
  periodStart: string,
  periodEnd: string
): Promise<Record<string, unknown>> {
  const summary: Record<string, unknown> = {
    type: rule.retrospective_type,
    period_days: rule.period_days,
    current: {
      orders: currentSnapshot.orders_count,
      revenue: currentSnapshot.revenue_total,
      ticket: currentSnapshot.average_ticket,
      ads_spend: currentSnapshot.ads_spend,
      roas: currentSnapshot.roas,
      acos: currentSnapshot.acos,
      tacos: currentSnapshot.tacos,
      margin: currentSnapshot.average_margin,
      profit: currentSnapshot.estimated_profit,
      listings: currentSnapshot.active_listings,
      products: currentSnapshot.products_count,
      cancellations: currentSnapshot.cancellations_count,
      cancellations_value: currentSnapshot.cancellations_value,
      total_fees: currentSnapshot.total_fees,
      total_cost: currentSnapshot.total_cost,
    },
    trial_status: trialStatus,
  };

  if (baselineSnapshot) {
    const baseOrders = Number(baselineSnapshot.orders_count || 0);
    const baseRevenue = Number(baselineSnapshot.revenue_total || 0);
    const currOrders = Number(currentSnapshot.orders_count || 0);
    const currRevenue = Number(currentSnapshot.revenue_total || 0);

    summary.baseline = {
      orders: baseOrders,
      revenue: baseRevenue,
      ticket: baselineSnapshot.average_ticket,
      ads_spend: baselineSnapshot.ads_spend,
    };
    summary.evolution = {
      orders_delta: currOrders - baseOrders,
      orders_growth_pct:
        baseOrders > 0
          ? ((currOrders - baseOrders) / baseOrders) * 100
          : null,
      revenue_delta: currRevenue - baseRevenue,
      revenue_growth_pct:
        baseRevenue > 0
          ? ((currRevenue - baseRevenue) / baseRevenue) * 100
          : null,
    };
  }

  // Trial-specific enrichment
  const isTrialType = rule.retrospective_type === "trial_conversion" || rule.retrospective_type === "trial_summary";
  if (isTrialType) {
    const moduleUsage = await countModuleUsage(supabase, tenantId, companyId, periodStart, periodEnd);
    const isConversion = rule.retrospective_type === "trial_conversion" && trialStatus === "in_trial";
    summary.trial_narrative = buildTrialNarrative(
      currentSnapshot,
      baselineSnapshot,
      moduleUsage,
      isConversion
    );
  }

  return summary;
}

// ─── Main Handler ───

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const mode = body.mode || "auto"; // auto | manual | force
    const targetTenantId = body.tenant_id || null;
    const targetCompanyId = body.company_id || null;
    const targetRuleId = body.rule_id || null;

    console.log(`[retro-engine] Starting mode=${mode} tenant=${targetTenantId || "all"}`);

    // 1. Load active rules
    let rulesQuery = supabase
      .from("retrospective_rules")
      .select("*")
      .eq("is_active", true);

    if (mode === "auto") {
      rulesQuery = rulesQuery.eq("auto_generate", true);
    }
    if (targetRuleId) {
      rulesQuery = supabase
        .from("retrospective_rules")
        .select("*")
        .eq("id", targetRuleId);
    }

    const { data: rules, error: rulesErr } = await rulesQuery;
    if (rulesErr) throw rulesErr;
    if (!rules || rules.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, message: "No active rules", processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Load tenants
    let tenantsQuery = supabase
      .from("tenants")
      .select("id, name, trial_started_at, trial_ends_at, first_payment_at, status, created_at")
      .eq("status", "active");

    if (targetTenantId) {
      tenantsQuery = supabase
        .from("tenants")
        .select("id, name, trial_started_at, trial_ends_at, first_payment_at, status, created_at")
        .eq("id", targetTenantId);
    }

    const { data: tenants, error: tenErr } = await tenantsQuery;
    if (tenErr) throw tenErr;
    if (!tenants || tenants.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, message: "No active tenants", processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let totalProcessed = 0;
    let totalGenerated = 0;
    let totalSkipped = 0;
    let totalErrors = 0;
    const results: any[] = [];

    for (const tenant of tenants) {
      // 3. Load companies for tenant
      let companiesQuery = supabase
        .from("companies")
        .select("id, tenant_id, display_name")
        .eq("tenant_id", tenant.id)
        .eq("is_active", true);

      if (targetCompanyId) {
        companiesQuery = supabase
          .from("companies")
          .select("id, tenant_id, display_name")
          .eq("id", targetCompanyId);
      }

      const { data: companies } = await companiesQuery;
      if (!companies || companies.length === 0) continue;

      // 4. Get marketplace accounts for companies
      const companyIds = companies.map((c: any) => c.id);
      const { data: accounts } = await supabase
        .from("marketplace_accounts")
        .select("id, company_id, external_user_id")
        .in("company_id", companyIds)
        .eq("is_active", true);

      const companySellerMap = new Map<string, string>();
      (accounts || []).forEach((a: any) => {
        if (a.company_id && a.external_user_id) {
          companySellerMap.set(a.company_id, a.external_user_id);
        }
      });

      // Fallback: ml_accounts
      const { data: mlAccounts } = await supabase
        .from("ml_accounts")
        .select("id, company_id, ml_user_id")
        .in("company_id", companyIds)
        .eq("is_active", true);

      (mlAccounts || []).forEach((a: any) => {
        if (a.company_id && a.ml_user_id && !companySellerMap.has(a.company_id)) {
          companySellerMap.set(a.company_id, a.ml_user_id);
        }
      });

      // Determine trial status
      const now = new Date();
      const trialEnd = tenant.trial_ends_at ? new Date(tenant.trial_ends_at) : null;
      const hasPaid = !!tenant.first_payment_at;
      const trialStatus = hasPaid
        ? "paid"
        : trialEnd && now < trialEnd
        ? "in_trial"
        : trialEnd && now >= trialEnd
        ? "trial_expired"
        : "unknown";

      // Anchor date = trial_started_at or created_at
      const anchorDate = new Date(
        tenant.trial_started_at || tenant.created_at
      );

      const daysSinceAnchor = Math.floor(
        (now.getTime() - anchorDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      for (const rule of rules as Rule[]) {
        // Skip if days since anchor haven't reached the rule's period
        if (mode === "auto" && daysSinceAnchor < rule.period_days) continue;

        // Skip trial_conversion for paid users (generate trial_summary instead)
        if (rule.retrospective_type === "trial_conversion" && hasPaid) continue;

        // Process per-company or consolidated
        const scope = rule.applies_to_scope; // 'company' or 'tenant'

        if (scope === "company") {
          for (const company of companies) {
            totalProcessed++;
            const sellerId = companySellerMap.get(company.id);
            if (!sellerId) {
              totalSkipped++;
              continue;
            }

            try {
              // Check if already generated for this rule + company + period
              const periodStart = toDateStr(anchorDate);
              const periodEnd = toDateStr(
                addDays(anchorDate, rule.period_days)
              );

              const { data: existing } = await supabase
                .from("retrospectives")
                .select("id")
                .eq("tenant_id", tenant.id)
                .eq("company_id", company.id)
                .eq("retrospective_type", rule.retrospective_type)
                .eq("period_start", periodStart)
                .eq("period_end", periodEnd)
                .limit(1);

              if (existing && existing.length > 0) {
                totalSkipped++;
                continue;
              }

              // Check if target already exists
              const { data: existingTarget } = await supabase
                .from("retrospective_targets")
                .select("id, status")
                .eq("tenant_id", tenant.id)
                .eq("company_id", company.id)
                .eq("rule_id", rule.id)
                .in("status", ["pending", "processing", "generated", "sent"])
                .limit(1);

              if (existingTarget && existingTarget.length > 0 && mode === "auto") {
                totalSkipped++;
                continue;
              }

              // Create target
              const { data: target } = await supabase
                .from("retrospective_targets")
                .insert({
                  tenant_id: tenant.id,
                  company_id: company.id,
                  rule_id: rule.id,
                  anchor_date: periodStart,
                  due_date: periodEnd,
                  target_scope: "company",
                  status: "processing",
                })
                .select("id")
                .single();

              // Generate snapshot
              const snapshot = await generateSnapshot(
                supabase,
                tenant.id,
                company.id,
                sellerId,
                periodStart,
                periodEnd,
                rule.retrospective_type
              );

              // Get baseline snapshot (onboarding_initial)
              const { data: baseline } = await supabase
                .from("retrospective_snapshots")
                .select("*")
                .eq("tenant_id", tenant.id)
                .eq("company_id", company.id)
                .eq("snapshot_type", "onboarding_initial")
                .order("created_at", { ascending: true })
                .limit(1)
                .maybeSingle();

              // Build summary
              const summaryJson = await buildSummaryJson(
                supabase,
                snapshot,
                baseline,
                rule,
                trialStatus,
                tenant.id,
                company.id,
                periodStart,
                periodEnd
              );

              // Create retrospective
              const title = `${rule.name} – ${company.display_name || "Empresa"}`;

              const { data: retro, error: retroErr } = await supabase
                .from("retrospectives")
                .insert({
                  tenant_id: tenant.id,
                  company_id: company.id,
                  rule_id: rule.id,
                  retrospective_type: rule.retrospective_type,
                  title,
                  period_start: periodStart,
                  period_end: periodEnd,
                  anchor_start_date: periodStart,
                  anchor_end_date: periodEnd,
                  status: "generated",
                  summary_json: summaryJson,
                  generated_at: new Date().toISOString(),
                })
                .select("id")
                .single();

              if (retroErr) throw retroErr;

              // Update target
              if (target) {
                await supabase
                  .from("retrospective_targets")
                  .update({ status: "generated" })
                  .eq("id", target.id);
              }

              // Register platform event
              await supabase.from("account_events").insert({
                user_id: tenant.id,
                company_id: company.id,
                event_type: "retrospective_generated",
                event_scope: "company",
                module: "retrospectiva",
                event_source: "engine",
                event_date: new Date().toISOString(),
                event_data: {
                  retrospective_id: retro.id,
                  type: rule.retrospective_type,
                  period_days: rule.period_days,
                  period_start: periodStart,
                  period_end: periodEnd,
                },
              });

              totalGenerated++;
              results.push({
                tenant_id: tenant.id,
                company_id: company.id,
                retrospective_id: retro.id,
                type: rule.retrospective_type,
                status: "generated",
              });
            } catch (err: any) {
              totalErrors++;
              console.error(
                `[retro-engine] Error tenant=${tenant.id} company=${company.id} rule=${rule.id}:`,
                err.message
              );
              results.push({
                tenant_id: tenant.id,
                company_id: company.id,
                type: rule.retrospective_type,
                status: "error",
                error: err.message,
              });
            }
          }
        } else if (scope === "tenant") {
          // Consolidated tenant retrospective
          totalProcessed++;
          try {
            const periodStart = toDateStr(anchorDate);
            const periodEnd = toDateStr(addDays(anchorDate, rule.period_days));

            // Check if already generated
            const { data: existing } = await supabase
              .from("retrospectives")
              .select("id")
              .eq("tenant_id", tenant.id)
              .is("company_id", null)
              .eq("retrospective_type", rule.retrospective_type)
              .eq("period_start", periodStart)
              .eq("period_end", periodEnd)
              .limit(1);

            if (existing && existing.length > 0) {
              totalSkipped++;
              continue;
            }

            // Aggregate all company snapshots for this period
            let totalOrders = 0;
            let totalRevenue = 0;
            let totalAdsSpend = 0;
            let totalProfit = 0;

            for (const company of companies) {
              const sellerId = companySellerMap.get(company.id);
              if (!sellerId) continue;

              const snap = await generateSnapshot(
                supabase,
                tenant.id,
                company.id,
                sellerId,
                periodStart,
                periodEnd,
                `${rule.retrospective_type}_partial`
              );

              totalOrders += Number(snap.orders_count || 0);
              totalRevenue += Number(snap.revenue_total || 0);
              totalAdsSpend += Number(snap.ads_spend || 0);
              totalProfit += Number(snap.estimated_profit || 0);
            }

            const summaryJson = {
              type: rule.retrospective_type,
              scope: "tenant",
              period_days: rule.period_days,
              consolidated: {
                orders: totalOrders,
                revenue: totalRevenue,
                ads_spend: totalAdsSpend,
                profit: totalProfit,
                companies_count: companies.length,
              },
            };

            const title = `${rule.name} – Consolidado`;

            const { data: retro, error: retroErr } = await supabase
              .from("retrospectives")
              .insert({
                tenant_id: tenant.id,
                company_id: null,
                rule_id: rule.id,
                retrospective_type: rule.retrospective_type,
                title,
                period_start: periodStart,
                period_end: periodEnd,
                status: "generated",
                summary_json: summaryJson,
                generated_at: new Date().toISOString(),
              })
              .select("id")
              .single();

            if (retroErr) throw retroErr;

            totalGenerated++;
            results.push({
              tenant_id: tenant.id,
              company_id: null,
              retrospective_id: retro.id,
              type: rule.retrospective_type,
              status: "generated",
            });
          } catch (err: any) {
            totalErrors++;
            console.error(
              `[retro-engine] Error consolidated tenant=${tenant.id} rule=${rule.id}:`,
              err.message
            );
          }
        }
      }
    }

    const executionTime = Date.now() - startTime;
    console.log(
      `[retro-engine] Done in ${executionTime}ms – processed=${totalProcessed} generated=${totalGenerated} skipped=${totalSkipped} errors=${totalErrors}`
    );

    await auditLog(supabase, {
      level: "info",
      area: "retrospectiva",
      action: "engine_run",
      success: totalErrors === 0,
      message: `Engine run: ${totalGenerated} generated, ${totalSkipped} skipped, ${totalErrors} errors in ${executionTime}ms`,
      meta: {
        mode,
        processed: totalProcessed,
        generated: totalGenerated,
        skipped: totalSkipped,
        errors: totalErrors,
        execution_time_ms: executionTime,
      },
    });

    return new Response(
      JSON.stringify({
        ok: true,
        processed: totalProcessed,
        generated: totalGenerated,
        skipped: totalSkipped,
        errors: totalErrors,
        execution_time_ms: executionTime,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[retro-engine] Fatal error:", error);
    return new Response(
      JSON.stringify({ ok: false, error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
