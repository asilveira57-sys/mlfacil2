
# Plano: Corrigir Sincronização do Mercado ADS

## Diagnóstico

A conta possui campanhas de Product Ads ativas (conforme screenshot: R$214,20 de investimento, 489 cliques, ROAS 16,03x), porém a sincronização não está trazendo os dados.

**Causa raiz identificada:**
- A Edge Function `ads-sync` utiliza um endpoint incorreto da API do Mercado Livre
- URL atual: `/advertising/advertisers/${sellerId}/campaigns` → Retorna **404**
- URL correta: `/marketplace/advertising/${siteId}/advertisers/${sellerId}/product_ads/campaigns/search`

## Solução Proposta

### 1. Atualizar Edge Function `ads-sync`

Modificar a função para:
- Buscar o `site_id` (ex: MLB) da tabela `ml_accounts`
- Utilizar a estrutura correta de URLs da API Product Ads v2
- Adicionar o header obrigatório `api-version: 2`
- Implementar a extração correta das métricas da resposta

**Endpoints atualizados:**
```text
Campanhas: /marketplace/advertising/{site_id}/advertisers/{seller_id}/product_ads/campaigns/search
Items/Anúncios: /marketplace/advertising/{site_id}/advertisers/{seller_id}/product_ads/items/search
```

### 2. Mudanças Técnicas

**Arquivo:** `supabase/functions/ads-sync/index.ts`

- Adicionar busca do `country_id` (site_id) da `ml_accounts`
- Atualizar função `fetchCampaigns()`:
  - Nova URL com path `/marketplace/advertising/...`
  - Header `api-version: 2`
  - Parâmetros de data e métricas
- Atualizar função `fetchCampaignAds()`:
  - Usar endpoint `/product_ads/items/search` 
  - Extrair métricas como clicks, prints, cost, roas, acos
- Melhorar logs para debugging

### 3. Estrutura da Nova Request

```text
GET https://api.mercadolibre.com/marketplace/advertising/MLB/advertisers/66043362/product_ads/campaigns/search
Headers:
  - Authorization: Bearer {token}
  - api-version: 2
Query Params:
  - date_from: 2025-12-28
  - date_to: 2026-01-27
  - metrics: clicks,prints,cost,cpc,acos,roas,total_amount
```

## Resumo de Arquivos

| Arquivo | Ação |
|---------|------|
| `supabase/functions/ads-sync/index.ts` | Modificar endpoints e adicionar headers |

## Resultado Esperado

Após a implementação:
- Botão "Sincronizar" irá puxar campanhas e métricas corretamente
- Dashboard exibirá os valores reais (investimento, cliques, ROAS, etc.)
- Gráficos de evolução diária serão populados
