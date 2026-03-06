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

// ─── HTML Report Generator ───

function generateHtmlReport(retro: any): string {
  const s = retro.summary_json || {};
  const current = s.current || {};
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
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8f9fa; color: #1a1a2e; line-height: 1.6; }
  .container { max-width: 800px; margin: 0 auto; padding: 40px 24px; }
  .header { text-align: center; margin-bottom: 48px; padding: 48px 24px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 16px; color: white; }
  .header h1 { font-size: 28px; font-weight: 700; margin-bottom: 8px; }
  .header .period { font-size: 14px; opacity: 0.85; }
  .header .badge { display: inline-block; margin-top: 12px; padding: 4px 12px; background: rgba(255,255,255,0.2); border-radius: 20px; font-size: 12px; }
  .section { margin-bottom: 32px; }
  .section h2 { font-size: 18px; font-weight: 600; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 2px solid #667eea; display: inline-block; }
  .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 16px; }
  .kpi-card { background: white; border-radius: 12px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
  .kpi-card .label { font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; }
  .kpi-card .value { font-size: 24px; font-weight: 700; margin-top: 4px; }
  .kpi-card .value.highlight { color: #667eea; }
  .kpi-card .variation { font-size: 12px; margin-top: 4px; }
  .kpi-card .variation.positive { color: #10b981; }
  .kpi-card .variation.negative { color: #ef4444; }
  .evolution-box { background: white; border-radius: 12px; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
  .evolution-item .label { font-size: 13px; color: #6b7280; }
  .evolution-item .value { font-size: 28px; font-weight: 700; }
  .evolution-item .value.positive { color: #10b981; }
  .evolution-item .value.negative { color: #ef4444; }
  .evolution-item .detail { font-size: 12px; color: #9ca3af; }
  .narrative-text { background: white; border-radius: 12px; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); font-size: 14px; color: #4b5563; }
  .opportunity { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 16px; border-radius: 0 8px 8px 0; margin-bottom: 8px; font-size: 13px; }
  .projections-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .projection-card { background: linear-gradient(135deg, #667eea15, #764ba215); border-radius: 12px; padding: 20px; }
  .projection-card .label { font-size: 12px; color: #6b7280; }
  .projection-card .value { font-size: 22px; font-weight: 700; color: #667eea; margin-top: 4px; }
  .cta-box { text-align: center; background: linear-gradient(135deg, #667eea10, #764ba210); border: 2px solid #667eea30; border-radius: 16px; padding: 32px; margin-top: 32px; }
  .cta-box h3 { font-size: 20px; font-weight: 700; margin-bottom: 8px; }
  .cta-box p { font-size: 14px; color: #4b5563; margin-bottom: 16px; }
  .cta-box .btn { display: inline-block; padding: 12px 32px; background: linear-gradient(135deg, #667eea, #764ba2); color: white; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px; }
  .cta-points { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; text-align: left; margin: 16px 0; }
  .cta-points .point { font-size: 13px; padding: 4px 0; }
  .cta-points .point::before { content: "→ "; color: #667eea; font-weight: 700; }
  .footer { text-align: center; font-size: 11px; color: #9ca3af; margin-top: 48px; padding-top: 24px; border-top: 1px solid #e5e7eb; }
  .module-badges { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
  .module-badge { background: #f3f4f6; border-radius: 16px; padding: 4px 12px; font-size: 12px; color: #4b5563; }
  .engagement-bar { display: flex; align-items: center; gap: 12px; margin-top: 12px; }
  .engagement-bar .bar { flex: 1; height: 8px; background: #e5e7eb; border-radius: 4px; overflow: hidden; }
  .engagement-bar .bar-fill { height: 100%; background: linear-gradient(90deg, #667eea, #764ba2); border-radius: 4px; }
  .engagement-bar .level { font-size: 12px; font-weight: 600; }
  @media print { body { background: white; } .container { padding: 0; } }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>${title}</h1>
    <div class="period">${periodStart} — ${periodEnd}</div>
    ${isTrialType ? `<div class="badge">${type === "trial_conversion" ? "⭐ Período de Teste" : "✅ Plano Ativo"}</div>` : ""}
  </div>

  ${narrative?.opening ? `
  <div class="section">
    <div class="narrative-text">
      <p>${narrative.opening.initial_state}</p>
      <p style="margin-top:8px">${narrative.opening.analysis}</p>
    </div>
  </div>
  ` : ""}

  <div class="section">
    <h2>📊 Indicadores Principais</h2>
    <div class="kpi-grid">
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
    <h2>📢 Publicidade (ADS)</h2>
    <div class="kpi-grid">
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
    <h2>📈 Evolução vs. Baseline</h2>
    <div class="evolution-box">
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
    <h2>⚡ Uso da Plataforma</h2>
    <div class="kpi-grid">
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
    <h2>💡 Oportunidades Identificadas</h2>
    ${narrative.discoveries.opportunities.map((o: string) => `<div class="opportunity">${o}</div>`).join("")}
  </div>
  ` : ""}

  ${narrative?.projections ? `
  <div class="section">
    <h2>🚀 Projeções de Crescimento</h2>
    <div class="projections-grid">
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
        <div class="value" style="font-size:14px">${narrative.projections.growth_potential}</div>
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
    ${narrative.cta.urgency ? `<p style="color:#ef4444;font-size:12px;font-weight:600">⚠️ ${narrative.cta.urgency}</p>` : ""}
    ${narrative.cta.show_upgrade_button ? `<a href="#" class="btn">👑 Ativar Meu Plano</a>` : ""}
  </div>
  ` : ""}

  <div class="footer">
    Relatório gerado automaticamente pelo Marketplace Fácil • ${new Date().getFullYear()}
  </div>
</div>
</body>
</html>`;
}

// ─── Slides Generator ───

function generateSlidesHtml(retro: any): string {
  const s = retro.summary_json || {};
  const current = s.current || {};
  const evolution = s.evolution;
  const narrative = s.trial_narrative;
  const title = retro.title || "Retrospectiva";
  const periodStart = retro.period_start;
  const periodEnd = retro.period_end;
  const type = s.type || retro.retrospective_type;

  const slides: string[] = [];

  // Slide 1: Cover
  slides.push(`
    <div class="slide cover-slide">
      <div class="slide-content">
        <div class="cover-icon">📊</div>
        <h1>${title}</h1>
        <p class="subtitle">${periodStart} — ${periodEnd}</p>
        ${narrative?.opening?.headline ? `<p class="tagline">${narrative.opening.headline}</p>` : ""}
      </div>
    </div>
  `);

  // Slide 2: KPIs
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

  // Slide 3: ADS (if applicable)
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

  // Slide 4: Evolution
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

  // Slide 5: Opportunities
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

  // Slide 6: Projections
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

  // Slide 7: CTA (if trial)
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
        <p class="subtitle">Marketplace Fácil • ${new Date().getFullYear()}</p>
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
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f0f23; color: #e2e8f0; overflow: hidden; }
  .slides-container { width: 100vw; height: 100vh; position: relative; }
  .slide { width: 100vw; height: 100vh; display: none; align-items: center; justify-content: center; padding: 60px; background: linear-gradient(180deg, #1a1a2e 0%, #16213e 100%); }
  .slide.active { display: flex; }
  .slide-content { max-width: 1000px; width: 100%; }
  .slide-content h2 { font-size: 36px; font-weight: 700; margin-bottom: 40px; color: #e2e8f0; }
  .cover-slide { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); text-align: center; }
  .cover-slide h1 { font-size: 48px; font-weight: 800; color: white; margin-bottom: 16px; }
  .cover-slide .subtitle { font-size: 20px; color: rgba(255,255,255,0.7); }
  .cover-slide .tagline { font-size: 16px; color: rgba(255,255,255,0.6); margin-top: 24px; font-style: italic; }
  .cover-icon { font-size: 64px; margin-bottom: 24px; }
  .slide-kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
  .slide-kpi-grid.cols-4 { grid-template-columns: repeat(4, 1fr); }
  .slide-kpi-grid.cols-2 { grid-template-columns: repeat(2, 1fr); }
  .slide-kpi { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 28px; text-align: center; transition: transform 0.2s; }
  .slide-kpi.highlight { border-color: #667eea; background: rgba(102,126,234,0.1); }
  .slide-kpi:hover { transform: translateY(-2px); }
  .kpi-icon { font-size: 28px; display: block; margin-bottom: 8px; }
  .kpi-val { font-size: 28px; font-weight: 700; display: block; color: white; }
  .kpi-label { font-size: 13px; color: #94a3b8; display: block; margin-top: 4px; }
  .evolution-slides { display: flex; gap: 48px; justify-content: center; margin-top: 40px; }
  .evo-item { text-align: center; background: rgba(255,255,255,0.05); border-radius: 16px; padding: 40px 60px; }
  .evo-label { font-size: 16px; color: #94a3b8; display: block; margin-bottom: 8px; }
  .evo-val { font-size: 48px; font-weight: 800; display: block; }
  .evo-val.positive { color: #10b981; }
  .evo-val.negative { color: #ef4444; }
  .evo-detail { font-size: 14px; color: #64748b; display: block; margin-top: 8px; }
  .opp-list { display: flex; flex-direction: column; gap: 16px; }
  .opp-item { display: flex; align-items: flex-start; gap: 16px; background: rgba(245,158,11,0.1); border-left: 4px solid #f59e0b; padding: 20px; border-radius: 0 12px 12px 0; font-size: 16px; }
  .opp-num { background: #f59e0b; color: #1a1a2e; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; flex-shrink: 0; }
  .growth-msg { text-align: center; font-size: 16px; color: #94a3b8; margin-top: 32px; }
  .cta-slide { background: linear-gradient(135deg, #1a1a2e 0%, #2d1b69 100%); text-align: center; }
  .cta-msg { font-size: 16px; color: #94a3b8; margin-bottom: 32px; max-width: 600px; margin-left: auto; margin-right: auto; }
  .cta-pts { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; text-align: left; max-width: 600px; margin: 0 auto 32px; }
  .cta-pt { font-size: 14px; color: #cbd5e1; padding: 8px 0; }
  .cta-btn-wrap { margin-top: 24px; }
  .cta-btn { display: inline-block; padding: 16px 40px; background: linear-gradient(135deg, #667eea, #764ba2); color: white; border-radius: 12px; text-decoration: none; font-weight: 700; font-size: 18px; }
  .nav { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); display: flex; gap: 12px; z-index: 100; }
  .nav button { background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: white; padding: 10px 24px; border-radius: 8px; cursor: pointer; font-size: 14px; backdrop-filter: blur(8px); }
  .nav button:hover { background: rgba(255,255,255,0.2); }
  .nav .counter { display: flex; align-items: center; color: #64748b; font-size: 13px; padding: 0 12px; }
  @media (max-width: 768px) {
    .slide { padding: 24px; }
    .slide-kpi-grid { grid-template-columns: repeat(2, 1fr); gap: 12px; }
    .slide-kpi-grid.cols-4 { grid-template-columns: repeat(2, 1fr); }
    .evolution-slides { flex-direction: column; gap: 16px; }
    .evo-item { padding: 24px; }
    .evo-val { font-size: 36px; }
    .cover-slide h1 { font-size: 32px; }
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

    const tenantId = retro.tenant_id;
    const timestamp = Date.now();
    const basePath = `${tenantId}/${retrospectiveId}`;

    const results: Record<string, string | null> = {
      html_url: null,
      presentation_url: null,
    };

    // Generate HTML Report
    try {
      const htmlContent = generateHtmlReport(retro);
      const htmlPath = `${basePath}/report-${timestamp}.html`;
      const htmlBlob = new Blob([htmlContent], { type: "text/html" });

      const { error: uploadErr } = await supabase.storage
        .from("retrospective-reports")
        .upload(htmlPath, htmlBlob, {
          contentType: "text/html",
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
      const slidesContent = generateSlidesHtml(retro);
      const slidesPath = `${basePath}/slides-${timestamp}.html`;
      const slidesBlob = new Blob([slidesContent], { type: "text/html" });

      const { error: uploadErr } = await supabase.storage
        .from("retrospective-reports")
        .upload(slidesPath, slidesBlob, {
          contentType: "text/html",
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
