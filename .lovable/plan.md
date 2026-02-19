
# Corrigir Dados Zerados no Performance ADS e Detalhes

## Diagnostico

A Edge Function `ads-period-metrics` esta chamando a API do ML para 165 itens em lotes paralelos, mas **todas as chamadas retornam metricas zeradas**. Isso acontece porque:

1. O rate limit da API do ML continua ativo apos as tentativas anteriores de carga massiva
2. A funcao nao registra logs dos status HTTP das respostas da API, entao erros 429/403 sao silenciosamente ignorados
3. O frontend prefere o resultado da Edge Function (zeros) sobre o fallback que TEM dados reais na tabela `ads_items` (R$ 1.789 gasto, R$ 49.175 receita)

**Evidencia dos logs:**
```
spent=0, seller_revenue=54730.48
NOT caching: all metrics zero but 165 items found (likely rate limit)
0 campaigns
```

Isso acontece em TODAS as chamadas (7d, 14d, 30d, 60d).

## Solucao em 2 Partes

### Parte 1: Corrigir o Frontend (resultado imediato)

**Arquivo:** `src/pages/Publicidade.tsx` (linha 127)

Hoje:
```typescript
const summary = periodError ? fallbackSummary 
  : (periodLoading && fallbackSummary.total_spent > 0 
    ? fallbackSummary : periodSummary);
```

Problema: quando a Edge Function retorna zeros sem erro, o frontend usa os zeros. O fallback so e usado durante loading ou em caso de erro explicito.

**Correcao:** Se a Edge Function retornar `total_spent === 0` E o fallback tiver dados reais (`total_spent > 0`), usar o fallback:

```typescript
const summary = (() => {
  if (periodError) return fallbackSummary;
  if (periodLoading && fallbackSummary.total_spent > 0) return fallbackSummary;
  // Se edge function retornou zeros mas o fallback tem dados reais, usar fallback
  if (periodSummary.total_spent === 0 && fallbackSummary.total_spent > 0) return fallbackSummary;
  return periodSummary;
})();
```

Isso garante que os cards Performance ADS e Detalhes mostrem dados reais imediatamente, independente do estado da API do ML.

### Parte 2: Adicionar Logging na Edge Function (diagnostico)

**Arquivo:** `supabase/functions/ads-period-metrics/index.ts`

Adicionar logs nas funcoes `fetchItemMetricsBatch` e `fetchCampaigns` para registrar:
- Status HTTP de cada resposta
- Primeiros 200 caracteres do corpo da resposta
- Contagem de respostas nao-ok vs ok

Isso permitira entender exatamente por que a API retorna zeros e corrigir o problema de forma definitiva na proxima iteracao, sem bloquear o usuario agora.

### Parte 3: Mesclar dados seller + fallback ADS nos cards

Como o `fallbackSummary` vem da tabela `ads_items` (dados acumulados da ultima sincronizacao), ele ja contem `total_spent`, `total_revenue` (de ADS), `avg_acos`, `avg_roas`, etc. Porem, nao contem dados de faturamento total do vendedor (`total_seller_revenue`, `total_seller_orders`).

Para manter a secao "Visao do Negocio" funcional enquanto usa o fallback para "Performance ADS", mesclar os dois:
- Dados de faturamento/organico: vem do `periodSummary` (que busca de `meli_orders_cache` com sucesso)
- Dados de ADS (gasto, ROAS, CPC, ACOS): vem do `fallbackSummary` quando `periodSummary` retorna zeros

Isso sera feito criando um `mergedSummary` que combina o melhor dos dois:

```typescript
const summary = useMemo(() => {
  if (periodError) return fallbackSummary;
  if (periodLoading && fallbackSummary.total_spent > 0) return fallbackSummary;
  
  // Se period tem dados de seller mas nao de ADS, mesclar com fallback
  if (periodSummary.total_spent === 0 && fallbackSummary.total_spent > 0) {
    return {
      ...periodSummary,                    // seller data (faturamento, organico)
      total_spent: fallbackSummary.total_spent,
      total_revenue: fallbackSummary.total_revenue,
      total_clicks: fallbackSummary.total_clicks,
      total_impressions: fallbackSummary.total_impressions,
      total_conversions: fallbackSummary.total_conversions,
      avg_acos: fallbackSummary.avg_acos,
      avg_roas: fallbackSummary.avg_roas,
      avg_cpc: fallbackSummary.avg_cpc,
      products_at_loss: fallbackSummary.products_at_loss,
      products_scalable: fallbackSummary.products_scalable,
      // Recalcular metricas cruzadas
      organic_revenue: Math.max(0, periodSummary.total_seller_revenue - fallbackSummary.total_revenue),
      tacos_total: periodSummary.total_seller_revenue > 0 
        ? (fallbackSummary.total_spent / periodSummary.total_seller_revenue) * 100 : 0,
      cost_per_sale_general: periodSummary.total_seller_orders > 0 
        ? fallbackSummary.total_spent / periodSummary.total_seller_orders : 0,
      cost_per_sale_ads: fallbackSummary.total_conversions > 0 
        ? fallbackSummary.total_spent / fallbackSummary.total_conversions : 0,
    };
  }
  return periodSummary;
}, [periodError, periodLoading, periodSummary, fallbackSummary]);
```

## Resumo do impacto

- **Imediato**: Os cards Performance ADS e Detalhes voltam a mostrar dados reais usando os dados ja sincronizados na tabela `ads_items`
- **Sem risco**: Se a Edge Function voltar a funcionar corretamente (rate limits liberados), os dados dela terao prioridade automaticamente
- **Diagnostico**: Logs detalhados permitirao corrigir a integracao com a API do ML na proxima iteracao

## Arquivos afetados

1. `src/pages/Publicidade.tsx` -- logica de selecao do summary (linha 127)
2. `supabase/functions/ads-period-metrics/index.ts` -- adicionar logs de debug nas funcoes de fetch
