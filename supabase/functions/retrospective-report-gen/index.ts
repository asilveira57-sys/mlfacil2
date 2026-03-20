import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Formatters ───

function fmt(val: number | null | undefined, decimals = 2): string {
  return Number(val ?? 0).toLocaleString("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function pctStr(val: number | null | undefined): string {
  const n = Number(val ?? 0);
  return `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;
}

// ─── Resolve company name ───

async function resolveCompanyName(supabase: any, companyId: string | null): Promise<string> {
  if (!companyId) return "";
  const { data } = await supabase
    .from("companies")
    .select("display_name")
    .eq("id", companyId)
    .maybeSingle();
  return data?.display_name || "";
}

// ─── HTML Report Generator ───

function generateHtmlReport(retro: any, companyName: string): string {
  const s = retro.summary_json || {};
  const current = s.current || {};
  const baseline = s.baseline;
  const evolution = s.evolution;
  const narrative = s.trial_narrative;
  const title = retro.title || "Retrospectiva";
  const periodStart = retro.period_start;
  const periodEnd = retro.period_end;
  const type = s.type || retro.retrospective_type;
  const isTrialType = type === "trial_conversion" || type === "trial_summary";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; color: #1e293b; line-height: 1.7; -webkit-font-smoothing: antialiased; }
  .container { max-width: 820px; margin: 0 auto; padding: 48px 32px; }
  
  .header { text-align: center; margin-bottom: 48px; padding: 56px 32px; background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #a855f7 100%); border-radius: 20px; color: white; position: relative; overflow: hidden; }
  .header::before { content: ''; position: absolute; top: -50%; right: -50%; width: 100%; height: 200%; background: radial-gradient(circle, rgba(255,255,255,0.08) 0%, transparent 70%); }
  .header .company-name { font-size: 13px; font-weight: 500; letter-spacing: 2px; text-transform: uppercase; opacity: 0.8; margin-bottom: 16px; }
  .header h1 { font-size: 32px; font-weight: 800; margin-bottom: 12px; position: relative; }
  .header .period { font-size: 15px; opacity: 0.75; font-weight: 400; }
  .header .badge { display: inline-block; margin-top: 16px; padding: 6px 16px; background: rgba(255,255,255,0.15); backdrop-filter: blur(4px); border-radius: 24px; font-size: 13px; font-weight: 500; border: 1px solid rgba(255,255,255,0.2); }
  
  .section { margin-bottom: 36px; }
  .section h2 { font-size: 20px; font-weight: 700; margin-bottom: 20px; color: #1e293b; display: flex; align-items: center; gap: 10px; }
  .section h2 .icon { font-size: 22px; }
  .divider { width: 48px; height: 3px; background: linear-gradient(90deg, #4f46e5, #a855f7); border-radius: 2px; margin-top: 8px; }
  
  .kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
  .kpi-card { background: white; border-radius: 14px; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.03); border: 1px solid #f1f5f9; transition: transform 0.2s, box-shadow 0.2s; }
  .kpi-card:hover { transform: translateY(-2px); box-shadow: 0 4px 16px rgba(0,0,0,0.08); }
  .kpi-card .label { font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.8px; font-weight: 600; }
  .kpi-card .value { font-size: 26px; font-weight: 800; margin-top: 6px; color: #1e293b; }
  .kpi-card .value.highlight { background: linear-gradient(135deg, #4f46e5, #7c3aed); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
  .kpi-card .variation { font-size: 12px; margin-top: 6px; font-weight: 600; }
  .kpi-card .variation.positive { color: #059669; }
  .kpi-card .variation.negative { color: #dc2626; }
  
  .baseline-section { background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border-radius: 14px; padding: 24px; margin-bottom: 36px; border: 1px solid #fbbf24; }
  .baseline-section h3 { font-size: 16px; font-weight: 700; color: #92400e; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }
  .baseline-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  .baseline-item { background: rgba(255,255,255,0.7); border-radius: 10px; padding: 16px; text-align: center; }
  .baseline-item .bl-label { font-size: 11px; color: #92400e; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; }
  .baseline-item .bl-value { font-size: 20px; font-weight: 700; color: #78350f; margin-top: 4px; }
  
  .evolution-box { background: white; border-radius: 14px; padding: 28px; box-shadow: 0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.03); display: grid; grid-template-columns: 1fr 1fr; gap: 28px; border: 1px solid #f1f5f9; }
  .evolution-item .label { font-size: 14px; color: #64748b; font-weight: 500; }
  .evolution-item .value { font-size: 36px; font-weight: 800; }
  .evolution-item .value.positive { color: #059669; }
  .evolution-item .value.negative { color: #dc2626; }
  .evolution-item .detail { font-size: 13px; color: #94a3b8; margin-top: 4px; }
  
  .narrative-text { background: white; border-radius: 14px; padding: 28px; box-shadow: 0 1px 3px rgba(0,0,0,0.04); font-size: 15px; color: #475569; line-height: 1.8; border: 1px solid #f1f5f9; }
  .narrative-text p + p { margin-top: 12px; }
  
  .opportunity { background: #fffbeb; border-left: 4px solid #f59e0b; padding: 14px 20px; border-radius: 0 10px 10px 0; margin-bottom: 10px; font-size: 14px; color: #78350f; font-weight: 500; }
  
  .projections-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .projection-card { background: linear-gradient(135deg, rgba(79,70,229,0.06), rgba(168,85,247,0.06)); border-radius: 14px; padding: 24px; border: 1px solid rgba(79,70,229,0.1); }
  .projection-card .label { font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; }
  .projection-card .value { font-size: 24px; font-weight: 800; background: linear-gradient(135deg, #4f46e5, #7c3aed); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; margin-top: 6px; }
  
  .cta-box { text-align: center; background: linear-gradient(135deg, rgba(79,70,229,0.04), rgba(168,85,247,0.06)); border: 2px solid rgba(79,70,229,0.15); border-radius: 20px; padding: 40px; margin-top: 36px; }
  .cta-box h3 { font-size: 22px; font-weight: 800; margin-bottom: 12px; color: #1e293b; }
  .cta-box p { font-size: 15px; color: #475569; margin-bottom: 20px; line-height: 1.7; }
  .cta-box .btn { display: inline-block; padding: 14px 36px; background: linear-gradient(135deg, #4f46e5, #7c3aed); color: white; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 15px; box-shadow: 0 4px 14px rgba(79,70,229,0.3); }
  .cta-points { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; text-align: left; margin: 20px auto; max-width: 500px; }
  .cta-points .point { font-size: 14px; padding: 6px 0; color: #475569; }
  .cta-points .point::before { content: "→ "; color: #4f46e5; font-weight: 700; }
  
  .module-badges { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
  .module-badge { background: #f1f5f9; border-radius: 20px; padding: 6px 14px; font-size: 12px; color: #475569; font-weight: 500; border: 1px solid #e2e8f0; }
  
  .engagement-bar { display: flex; align-items: center; gap: 14px; margin-top: 16px; }
  .engagement-bar .bar { flex: 1; height: 10px; background: #e2e8f0; border-radius: 5px; overflow: hidden; }
  .engagement-bar .bar-fill { height: 100%; background: linear-gradient(90deg, #4f46e5, #a855f7); border-radius: 5px; transition: width 1s ease; }
  .engagement-bar .level { font-size: 13px; font-weight: 700; color: #4f46e5; }
  
  .footer { text-align: center; font-size: 12px; color: #94a3b8; margin-top: 56px; padding-top: 28px; border-top: 1px solid #e2e8f0; }
  .footer .brand { font-weight: 600; color: #64748b; }
  
  @media print { 
    body { background: white; } 
    .container { padding: 20px; } 
    .kpi-card:hover { transform: none; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
  }
  @media (max-width: 600px) {
    .kpi-grid { grid-template-columns: repeat(2, 1fr); }
    .baseline-grid { grid-template-columns: repeat(2, 1fr); }
    .projections-grid { grid-template-columns: 1fr; }
    .evolution-box { grid-template-columns: 1fr; }
    .cta-points { grid-template-columns: 1fr; }
  }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    ${companyName ? `<div class="company-name">${companyName}</div>` : ""}
    <h1>${title}</h1>
    <div class="period">${periodStart} — ${periodEnd}</div>
    ${isTrialType ? `<div class="badge">${type === "trial_conversion" ? "⭐ Período de Teste" : "✅ Plano Ativo"}</div>` : ""}
  </div>

  ${narrative?.opening ? `
  <div class="section">
    <div class="narrative-text">
      <p>${narrative.opening.initial_state}</p>
      <p>${narrative.opening.analysis}</p>
    </div>
  </div>
  ` : ""}

  ${baseline ? `
  <div class="baseline-section">
    <h3>📌 Cenário de Entrada (30 dias anteriores)</h3>
    <div class="baseline-grid">
      <div class="baseline-item">
        <div class="bl-label">Faturamento</div>
        <div class="bl-value">R$ ${fmt(baseline.revenue)}</div>
      </div>
      <div class="baseline-item">
        <div class="bl-label">Pedidos</div>
        <div class="bl-value">${baseline.orders ?? 0}</div>
      </div>
      <div class="baseline-item">
        <div class="bl-label">Ticket Médio</div>
        <div class="bl-value">R$ ${fmt(baseline.ticket)}</div>
      </div>
    </div>
  </div>
  ` : ""}

  <div class="section">
    <h2><span class="icon">📊</span> Indicadores Principais</h2>
    <div class="divider"></div>
    <div class="kpi-grid" style="margin-top: 20px;">
      <div class="kpi-card">
        <div class="label">Faturamento</div>
        <div class="value highlight">R$ ${fmt(current.revenue)}</div>
      </div>
      <div class="kpi-card">
        <div class="label">Pedidos</div>
        <div class="value">${current.orders ?? 0}</div>
      </div>
      <div class="kpi-card">
        <div class="label">Ticket Médio</div>
        <div class="value">R$ ${fmt(current.ticket)}</div>
      </div>
      <div class="kpi-card">
        <div class="label">Margem Média</div>
        <div class="value">${fmt(current.margin, 1)}%</div>
      </div>
      <div class="kpi-card">
        <div class="label">Lucro Estimado</div>
        <div class="value highlight">R$ ${fmt(current.profit)}</div>
      </div>
      <div class="kpi-card">
        <div class="label">Anúncios Ativos</div>
        <div class="value">${current.listings ?? 0}</div>
      </div>
    </div>
  </div>

  ${Number(current.ads_spend) > 0 ? `
  <div class="section">
    <h2><span class="icon">📢</span> Publicidade (ADS)</h2>
    <div class="divider"></div>
    <div class="kpi-grid" style="margin-top: 20px;">
      <div class="kpi-card">
        <div class="label">Investimento</div>
        <div class="value">R$ ${fmt(current.ads_spend)}</div>
      </div>
      <div class="kpi-card">
        <div class="label">ROAS</div>
        <div class="value">${fmt(current.roas, 1)}x</div>
      </div>
      <div class="kpi-card">
        <div class="label">ACOS</div>
        <div class="value">${fmt(current.acos, 1)}%</div>
      </div>
      <div class="kpi-card">
        <div class="label">TACOS</div>
        <div class="value">${fmt(current.tacos, 1)}%</div>
      </div>
    </div>
  </div>
  ` : ""}

  ${evolution ? `
  <div class="section">
    <h2><span class="icon">📈</span> Evolução vs. Baseline</h2>
    <div class="divider"></div>
    <div class="evolution-box" style="margin-top: 20px;">
      ${evolution.orders_growth_pct != null ? `
      <div class="evolution-item">
        <div class="label">Pedidos</div>
        <div class="value ${Number(evolution.orders_growth_pct) >= 0 ? "positive" : "negative"}">${pctStr(evolution.orders_growth_pct)}</div>
        <div class="detail">${evolution.orders_delta > 0 ? "+" : ""}${evolution.orders_delta} pedidos</div>
      </div>` : ""}
      ${evolution.revenue_growth_pct != null ? `
      <div class="evolution-item">
        <div class="label">Faturamento</div>
        <div class="value ${Number(evolution.revenue_growth_pct) >= 0 ? "positive" : "negative"}">${pctStr(evolution.revenue_growth_pct)}</div>
        <div class="detail">${evolution.revenue_delta > 0 ? "+" : ""}R$ ${fmt(evolution.revenue_delta)}</div>
      </div>` : ""}
    </div>
  </div>
  ` : ""}

  ${narrative?.module_usage ? `
  <div class="section">
    <h2><span class="icon">⚡</span> Uso da Plataforma</h2>
    <div class="divider"></div>
    <div class="kpi-grid" style="margin-top: 20px;">
      <div class="kpi-card">
        <div class="label">Ações Realizadas</div>
        <div class="value highlight">${narrative.module_usage.total_actions}</div>
      </div>
      <div class="kpi-card">
        <div class="label">Módulos Utilizados</div>
        <div class="value">${narrative.module_usage.modules_used?.length || 0}</div>
      </div>
    </div>
    <div class="engagement-bar">
      <div class="bar"><div class="bar-fill" style="width:${narrative.module_usage.engagement_level === "alto" ? "90" : narrative.module_usage.engagement_level === "moderado" ? "55" : "25"}%"></div></div>
      <div class="level">${narrative.module_usage.engagement_level === "alto" ? "🔥 Alto" : narrative.module_usage.engagement_level === "moderado" ? "⚡ Moderado" : "🌱 Inicial"}</div>
    </div>
    ${narrative.module_usage.modules_used?.length > 0 ? `
    <div class="module-badges">
      ${narrative.module_usage.modules_used.map((m: string) => `<span class="module-badge">${m} (${narrative.module_usage.breakdown?.[m] || 0})</span>`).join("")}
    </div>` : ""}
  </div>
  ` : ""}

  ${narrative?.discoveries?.opportunities?.length > 0 ? `
  <div class="section">
    <h2><span class="icon">💡</span> Oportunidades Identificadas</h2>
    <div class="divider"></div>
    <div style="margin-top: 20px;">
      ${narrative.discoveries.opportunities.map((o: string) => `<div class="opportunity">${o}</div>`).join("")}
    </div>
  </div>
  ` : ""}

  ${narrative?.projections ? `
  <div class="section">
    <h2><span class="icon">🚀</span> Projeções de Crescimento</h2>
    <div class="divider"></div>
    <div class="projections-grid" style="margin-top: 20px;">
      <div class="projection-card">
        <div class="label">Faturamento Mensal Est.</div>
        <div class="value">R$ ${fmt(narrative.projections.monthly_revenue_estimate)}</div>
      </div>
      <div class="projection-card">
        <div class="label">Faturamento Anual Est.</div>
        <div class="value">R$ ${fmt(narrative.projections.annual_revenue_estimate)}</div>
      </div>
      ${narrative.projections.monthly_profit_estimate != null ? `
      <div class="projection-card">
        <div class="label">Lucro Mensal Est.</div>
        <div class="value">R$ ${fmt(narrative.projections.monthly_profit_estimate)}</div>
      </div>` : ""}
      ${narrative.projections.growth_potential ? `
      <div class="projection-card">
        <div class="label">Potencial</div>
        <div class="value" style="font-size:15px">${narrative.projections.growth_potential}</div>
      </div>` : ""}
    </div>
  </div>
  ` : ""}

  ${narrative?.cta ? `
  <div class="cta-box">
    <h3>${narrative.cta.headline}</h3>
    <p>${narrative.cta.primary_message}</p>
    ${narrative.cta.supporting_points?.length > 0 ? `
    <div class="cta-points">
      ${narrative.cta.supporting_points.map((p: string) => `<div class="point">${p}</div>`).join("")}
    </div>` : ""}
    ${narrative.cta.urgency ? `<p style="color:#dc2626;font-size:13px;font-weight:700">⚠️ ${narrative.cta.urgency}</p>` : ""}
    ${narrative.cta.show_upgrade_button ? `<a href="#" class="btn">👑 Ativar Meu Plano</a>` : ""}
  </div>
  ` : ""}

  <div class="footer">
    <p>Relatório gerado automaticamente pela <span class="brand">MKTP Fácil</span> • ${new Date().getFullYear()}</p>
  </div>
</div>
</body>
</html>`;
}

// ─── Slides Generator ───

function generateSlidesHtml(retro: any, companyName: string): string {
  const s = retro.summary_json || {};
  const current = s.current || {};
  const baseline = s.baseline;
  const evolution = s.evolution;
  const narrative = s.trial_narrative;
  const title = retro.title || "Retrospectiva";
  const periodStart = retro.period_start;
  const periodEnd = retro.period_end;

  const slides: string[] = [];

  // Slide 1: Cover
  slides.push(`
    <div class="slide cover-slide">
      <div class="slide-content">
        <div class="cover-icon">📊</div>
        ${companyName ? `<p class="company-tag">${companyName}</p>` : ""}
        <h1>${title}</h1>
        <p class="subtitle">${periodStart} — ${periodEnd}</p>
        ${narrative?.opening?.headline ? `<p class="tagline">${narrative.opening.headline}</p>` : ""}
      </div>
    </div>
  `);

  // Slide 2: Baseline (if exists)
  if (baseline) {
    slides.push(`
      <div class="slide">
        <div class="slide-content">
          <h2>📌 Cenário de Entrada</h2>
          <p class="slide-subtitle">Dados dos 30 dias anteriores à entrada na plataforma</p>
          <div class="slide-kpi-grid">
            <div class="slide-kpi baseline-kpi"><span class="kpi-icon">💰</span><span class="kpi-val">R$ ${fmt(baseline.revenue)}</span><span class="kpi-label">Faturamento 30d</span></div>
            <div class="slide-kpi baseline-kpi"><span class="kpi-icon">📦</span><span class="kpi-val">${baseline.orders ?? 0}</span><span class="kpi-label">Pedidos 30d</span></div>
            <div class="slide-kpi baseline-kpi"><span class="kpi-icon">🎯</span><span class="kpi-val">R$ ${fmt(baseline.ticket)}</span><span class="kpi-label">Ticket Médio</span></div>
          </div>
        </div>
      </div>
    `);
  }

  // Slide: KPIs
  slides.push(`
    <div class="slide">
      <div class="slide-content">
        <h2>Indicadores Principais</h2>
        <div class="slide-kpi-grid">
          <div class="slide-kpi"><span class="kpi-icon">💰</span><span class="kpi-val">R$ ${fmt(current.revenue)}</span><span class="kpi-label">Faturamento</span></div>
          <div class="slide-kpi"><span class="kpi-icon">📦</span><span class="kpi-val">${current.orders ?? 0}</span><span class="kpi-label">Pedidos</span></div>
          <div class="slide-kpi"><span class="kpi-icon">🎯</span><span class="kpi-val">R$ ${fmt(current.ticket)}</span><span class="kpi-label">Ticket Médio</span></div>
          <div class="slide-kpi"><span class="kpi-icon">📈</span><span class="kpi-val">${fmt(current.margin, 1)}%</span><span class="kpi-label">Margem</span></div>
          <div class="slide-kpi highlight"><span class="kpi-icon">✅</span><span class="kpi-val">R$ ${fmt(current.profit)}</span><span class="kpi-label">Lucro Estimado</span></div>
          <div class="slide-kpi"><span class="kpi-icon">📋</span><span class="kpi-val">${current.listings ?? 0}</span><span class="kpi-label">Anúncios Ativos</span></div>
        </div>
      </div>
    </div>
  `);

  // Slide: ADS
  if (Number(current.ads_spend) > 0) {
    slides.push(`
      <div class="slide">
        <div class="slide-content">
          <h2>Publicidade (ADS)</h2>
          <div class="slide-kpi-grid cols-4">
            <div class="slide-kpi"><span class="kpi-icon">💸</span><span class="kpi-val">R$ ${fmt(current.ads_spend)}</span><span class="kpi-label">Investimento</span></div>
            <div class="slide-kpi"><span class="kpi-icon">🔄</span><span class="kpi-val">${fmt(current.roas, 1)}x</span><span class="kpi-label">ROAS</span></div>
            <div class="slide-kpi"><span class="kpi-icon">📊</span><span class="kpi-val">${fmt(current.acos, 1)}%</span><span class="kpi-label">ACOS</span></div>
            <div class="slide-kpi"><span class="kpi-icon">📉</span><span class="kpi-val">${fmt(current.tacos, 1)}%</span><span class="kpi-label">TACOS</span></div>
          </div>
        </div>
      </div>
    `);
  }

  // Slide: Evolution
  if (evolution) {
    slides.push(`
      <div class="slide">
        <div class="slide-content">
          <h2>Evolução vs. Baseline</h2>
          <div class="evolution-slides">
            ${evolution.orders_growth_pct != null ? `
            <div class="evo-item">
              <span class="evo-label">Pedidos</span>
              <span class="evo-val ${Number(evolution.orders_growth_pct) >= 0 ? "positive" : "negative"}">${pctStr(evolution.orders_growth_pct)}</span>
              <span class="evo-detail">${evolution.orders_delta > 0 ? "+" : ""}${evolution.orders_delta} pedidos</span>
            </div>` : ""}
            ${evolution.revenue_growth_pct != null ? `
            <div class="evo-item">
              <span class="evo-label">Faturamento</span>
              <span class="evo-val ${Number(evolution.revenue_growth_pct) >= 0 ? "positive" : "negative"}">${pctStr(evolution.revenue_growth_pct)}</span>
              <span class="evo-detail">${evolution.revenue_delta > 0 ? "+" : ""}R$ ${fmt(evolution.revenue_delta)}</span>
            </div>` : ""}
          </div>
        </div>
      </div>
    `);
  }

  // Slide: Opportunities
  if (narrative?.discoveries?.opportunities?.length > 0) {
    slides.push(`
      <div class="slide">
        <div class="slide-content">
          <h2>💡 Oportunidades Identificadas</h2>
          <div class="opp-list">
            ${narrative.discoveries.opportunities.map((o: string, i: number) => `<div class="opp-item"><span class="opp-num">${i + 1}</span><span>${o}</span></div>`).join("")}
          </div>
        </div>
      </div>
    `);
  }

  // Slide: Projections
  if (narrative?.projections) {
    slides.push(`
      <div class="slide">
        <div class="slide-content">
          <h2>🚀 Projeções de Crescimento</h2>
          <div class="slide-kpi-grid cols-2">
            <div class="slide-kpi highlight"><span class="kpi-icon">📅</span><span class="kpi-val">R$ ${fmt(narrative.projections.monthly_revenue_estimate)}</span><span class="kpi-label">Faturamento Mensal Est.</span></div>
            <div class="slide-kpi highlight"><span class="kpi-icon">📆</span><span class="kpi-val">R$ ${fmt(narrative.projections.annual_revenue_estimate)}</span><span class="kpi-label">Faturamento Anual Est.</span></div>
          </div>
          ${narrative.projections.growth_potential ? `<p class="growth-msg">${narrative.projections.growth_potential}</p>` : ""}
        </div>
      </div>
    `);
  }

  // Slide: CTA
  if (narrative?.cta) {
    slides.push(`
      <div class="slide cta-slide">
        <div class="slide-content">
          <h2>${narrative.cta.headline}</h2>
          <p class="cta-msg">${narrative.cta.primary_message}</p>
          ${narrative.cta.supporting_points?.length > 0 ? `
          <div class="cta-pts">
            ${narrative.cta.supporting_points.map((p: string) => `<div class="cta-pt">→ ${p}</div>`).join("")}
          </div>` : ""}
          ${narrative.cta.show_upgrade_button ? `<div class="cta-btn-wrap"><a href="#" class="cta-btn">👑 Ativar Meu Plano</a></div>` : ""}
        </div>
      </div>
    `);
  }

  // Slide: Closing
  slides.push(`
    <div class="slide cover-slide">
      <div class="slide-content">
        <div class="cover-icon">🎯</div>
        <h1>Obrigado!</h1>
        ${companyName ? `<p class="subtitle">${companyName}</p>` : ""}
        <p class="tagline">MKTP Fácil • ${new Date().getFullYear()}</p>
      </div>
    </div>
  `);

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} - Apresentação</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f0f23; color: #e2e8f0; overflow: hidden; -webkit-font-smoothing: antialiased; }
  .slides-container { width: 100vw; height: 100vh; position: relative; }
  .slide { width: 100vw; height: 100vh; display: none; align-items: center; justify-content: center; padding: 60px; background: linear-gradient(180deg, #1a1a2e 0%, #16213e 100%); }
  .slide.active { display: flex; animation: fadeIn 0.4s ease; }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
  .slide-content { max-width: 1000px; width: 100%; }
  .slide-content h2 { font-size: 36px; font-weight: 800; margin-bottom: 40px; color: #e2e8f0; }
  .slide-subtitle { font-size: 16px; color: #94a3b8; margin-top: -28px; margin-bottom: 36px; }
  .cover-slide { background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #a855f7 100%); text-align: center; }
  .cover-slide h1 { font-size: 52px; font-weight: 800; color: white; margin-bottom: 16px; }
  .cover-slide .subtitle { font-size: 20px; color: rgba(255,255,255,0.7); }
  .cover-slide .tagline { font-size: 16px; color: rgba(255,255,255,0.5); margin-top: 24px; font-style: italic; }
  .cover-slide .company-tag { font-size: 14px; font-weight: 600; letter-spacing: 3px; text-transform: uppercase; color: rgba(255,255,255,0.6); margin-bottom: 20px; }
  .cover-icon { font-size: 72px; margin-bottom: 28px; }
  .slide-kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
  .slide-kpi-grid.cols-4 { grid-template-columns: repeat(4, 1fr); }
  .slide-kpi-grid.cols-2 { grid-template-columns: repeat(2, 1fr); }
  .slide-kpi { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 18px; padding: 32px; text-align: center; transition: transform 0.3s, border-color 0.3s; }
  .slide-kpi.highlight { border-color: #7c3aed; background: rgba(124,58,237,0.1); }
  .slide-kpi.baseline-kpi { border-color: #f59e0b; background: rgba(245,158,11,0.08); }
  .slide-kpi:hover { transform: translateY(-4px); border-color: rgba(255,255,255,0.2); }
  .kpi-icon { font-size: 32px; display: block; margin-bottom: 12px; }
  .kpi-val { font-size: 32px; font-weight: 800; display: block; color: white; }
  .kpi-label { font-size: 13px; color: #94a3b8; display: block; margin-top: 6px; font-weight: 500; }
  .evolution-slides { display: flex; gap: 48px; justify-content: center; margin-top: 40px; }
  .evo-item { text-align: center; background: rgba(255,255,255,0.04); border-radius: 20px; padding: 48px 64px; border: 1px solid rgba(255,255,255,0.08); }
  .evo-label { font-size: 16px; color: #94a3b8; display: block; margin-bottom: 12px; font-weight: 500; }
  .evo-val { font-size: 52px; font-weight: 800; display: block; }
  .evo-val.positive { color: #10b981; }
  .evo-val.negative { color: #ef4444; }
  .evo-detail { font-size: 14px; color: #64748b; display: block; margin-top: 8px; }
  .opp-list { display: flex; flex-direction: column; gap: 16px; }
  .opp-item { display: flex; align-items: flex-start; gap: 16px; background: rgba(245,158,11,0.08); border-left: 4px solid #f59e0b; padding: 20px 24px; border-radius: 0 14px 14px 0; font-size: 16px; }
  .opp-num { background: #f59e0b; color: #1a1a2e; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 14px; flex-shrink: 0; }
  .growth-msg { text-align: center; font-size: 16px; color: #94a3b8; margin-top: 36px; }
  .cta-slide { background: linear-gradient(135deg, #1a1a2e 0%, #2d1b69 100%); text-align: center; }
  .cta-msg { font-size: 17px; color: #94a3b8; margin-bottom: 36px; max-width: 600px; margin-left: auto; margin-right: auto; line-height: 1.7; }
  .cta-pts { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; text-align: left; max-width: 600px; margin: 0 auto 36px; }
  .cta-pt { font-size: 15px; color: #cbd5e1; padding: 8px 0; }
  .cta-btn-wrap { margin-top: 28px; }
  .cta-btn { display: inline-block; padding: 18px 44px; background: linear-gradient(135deg, #4f46e5, #a855f7); color: white; border-radius: 14px; text-decoration: none; font-weight: 800; font-size: 18px; box-shadow: 0 8px 24px rgba(79,70,229,0.4); }
  .nav { position: fixed; bottom: 28px; left: 50%; transform: translateX(-50%); display: flex; gap: 12px; z-index: 100; }
  .nav button { background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); color: white; padding: 12px 28px; border-radius: 10px; cursor: pointer; font-size: 14px; font-weight: 600; backdrop-filter: blur(12px); transition: all 0.2s; }
  .nav button:hover { background: rgba(255,255,255,0.15); }
  .nav .counter { display: flex; align-items: center; color: #64748b; font-size: 14px; padding: 0 16px; font-weight: 600; }
  @media (max-width: 768px) {
    .slide { padding: 24px; }
    .slide-kpi-grid { grid-template-columns: repeat(2, 1fr); gap: 12px; }
    .slide-kpi-grid.cols-4 { grid-template-columns: repeat(2, 1fr); }
    .evolution-slides { flex-direction: column; gap: 16px; }
    .evo-item { padding: 28px; }
    .evo-val { font-size: 36px; }
    .cover-slide h1 { font-size: 36px; }
  }
</style>
</head>
<body>
<div class="slides-container">
  ${slides.join("\n")}
</div>
<div class="nav">
  <button onclick="prev()">← Anterior</button>
  <div class="counter"><span id="current">1</span> / <span id="total">${slides.length}</span></div>
  <button onclick="next()">Próximo →</button>
</div>
<script>
  let current = 0;
  const allSlides = document.querySelectorAll('.slide');
  const total = allSlides.length;
  function show(i) {
    allSlides.forEach((s, idx) => s.classList.toggle('active', idx === i));
    document.getElementById('current').textContent = i + 1;
  }
  function next() { current = (current + 1) % total; show(current); }
  function prev() { current = (current - 1 + total) % total; show(current); }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); next(); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
    if (e.key === 'f' || e.key === 'F') { document.documentElement.requestFullscreen?.(); }
    if (e.key === 'Escape') { document.exitFullscreen?.(); }
  });
  // Touch swipe support
  let touchStartX = 0;
  document.addEventListener('touchstart', (e) => { touchStartX = e.touches[0].clientX; });
  document.addEventListener('touchend', (e) => {
    const diff = touchStartX - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) { diff > 0 ? next() : prev(); }
  });
  show(0);
</script>
</body>
</html>`;
}

// ─── Main Handler ───

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const retrospectiveId = body.retrospective_id;

    if (!retrospectiveId) {
      return new Response(
        JSON.stringify({ ok: false, error: "retrospective_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[report-gen] Generating reports for retrospective=${retrospectiveId}`);

    // Load retrospective
    const { data: retro, error: retroErr } = await supabase
      .from("retrospectives")
      .select("*")
      .eq("id", retrospectiveId)
      .single();

    if (retroErr || !retro) {
      return new Response(
        JSON.stringify({ ok: false, error: retroErr?.message || "Not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Resolve company name
    const companyName = await resolveCompanyName(supabase, retro.company_id);

    const tenantId = retro.tenant_id;
    const timestamp = Date.now();
    const basePath = `${tenantId}/${retrospectiveId}`;

    const results: Record<string, string | null> = {
      html_url: null,
      presentation_url: null,
    };

    // Generate HTML Report — use TextEncoder to avoid Blob issues in Deno
    try {
      const htmlContent = generateHtmlReport(retro, companyName);
      const htmlPath = `${basePath}/report-${timestamp}.html`;
      const htmlBytes = new TextEncoder().encode(htmlContent);

      const { error: uploadErr } = await supabase.storage
        .from("retrospective-reports")
        .upload(htmlPath, htmlBytes, {
          contentType: "text/html; charset=utf-8",
          upsert: true,
        });

      if (uploadErr) {
        console.error("[report-gen] HTML upload error:", uploadErr.message);
      } else {
        const { data: urlData } = supabase.storage
          .from("retrospective-reports")
          .getPublicUrl(htmlPath);
        results.html_url = urlData?.publicUrl || null;
      }
    } catch (err: any) {
      console.error("[report-gen] HTML generation error:", err.message);
    }

    // Generate Slides
    try {
      const slidesContent = generateSlidesHtml(retro, companyName);
      const slidesPath = `${basePath}/slides-${timestamp}.html`;
      const slidesBytes = new TextEncoder().encode(slidesContent);

      const { error: uploadErr } = await supabase.storage
        .from("retrospective-reports")
        .upload(slidesPath, slidesBytes, {
          contentType: "text/html; charset=utf-8",
          upsert: true,
        });

      if (uploadErr) {
        console.error("[report-gen] Slides upload error:", uploadErr.message);
      } else {
        const { data: urlData } = supabase.storage
          .from("retrospective-reports")
          .getPublicUrl(slidesPath);
        results.presentation_url = urlData?.publicUrl || null;
      }
    } catch (err: any) {
      console.error("[report-gen] Slides generation error:", err.message);
    }

    // Update retrospective with URLs
    const updatePayload: Record<string, unknown> = {};
    if (results.html_url) updatePayload.html_url = results.html_url;
    if (results.presentation_url) updatePayload.presentation_url = results.presentation_url;

    if (Object.keys(updatePayload).length > 0) {
      await supabase
        .from("retrospectives")
        .update(updatePayload)
        .eq("id", retrospectiveId);
    }

    console.log(`[report-gen] Done for ${retrospectiveId}: html=${!!results.html_url} slides=${!!results.presentation_url}`);

    return new Response(
      JSON.stringify({ ok: true, ...results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[report-gen] Fatal error:", error);
    return new Response(
      JSON.stringify({ ok: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
