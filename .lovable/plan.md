
# Modal de Campanha ADS + Acoes (Pausar, Ativar, Gerenciar Produtos)

## Resumo

Ao clicar em uma campanha na tabela, em vez de expandir inline, abre um **modal completo** com:
- Header com nome da campanha, status e acoes (pausar/ativar)
- KPIs do periodo (ACOS, ROAS, TACOS, CPC, Gasto, Receita)
- Mini-grafico de performance
- Tabela de produtos com acoes individuais (pausar/ativar/remover)
- Busca para adicionar produto a campanha
- Botao de pausar/ativar campanha **que funciona de verdade** via API ML

## Problema Atual do Pausar

O botao "Pausar" no dropdown da tabela **nao faz nada** -- e apenas um `<DropdownMenuItem>` sem `onClick`. Precisa:
1. Chamar a API do Mercado Livre: `PUT /advertising/product_ads_2/campaigns/{campaign_id}` com `{"status": "paused"}`
2. Para ativar: mesma URL com `{"status": "active"}`
3. Para anuncios individuais: `PUT /advertising/product_ads/ads/{item_id}` com `{"status": "paused"|"active"}`

## Arquitetura

```text
Clique na campanha (tabela)
  -> Abre Dialog/Modal (AdsCampaignDetailModal)
     -> Header: nome, status badge, toggle pausar/ativar
     -> KPI Cards: Gasto, Receita, CPC, ACOS, TACOS, ROAS (do precomputedMetrics)
     -> Mini chart: gasto/receita do periodo (dados do periodDaily filtrados)
     -> Tabela de produtos (AdsCampaignProducts refatorado)
        -> Cada produto: pausar/ativar individual, remover
     -> Busca + adicionar produto (pesquisa em meli_listings_cache)
```

## Mudancas

### 1. Nova Edge Function: `ads-campaign-manage`

Endpoint centralizado para acoes de campanha e produto:

- **Pausar/Ativar campanha**: `PUT /advertising/product_ads_2/campaigns/{campaign_id}` com `{"status": "paused"|"active"}`
- **Pausar/Ativar anuncio individual**: `PUT /advertising/product_ads/ads/{item_id}` com `{"status": "paused"|"active"}`
- **Adicionar produto a campanha**: `POST /advertising/product_ads/ads` com `{"campaign_id": id, "item_id": "MLB..."}`
- **Remover produto da campanha**: `DELETE /advertising/product_ads/ads/{item_id}`

Apos cada acao, atualiza o status local no banco (`ads_campaigns` / `ads_items`).

```text
Request body:
{
  "seller_id": "123",
  "action": "pause_campaign" | "activate_campaign" | "pause_ad" | "activate_ad" | "add_ad" | "remove_ad",
  "campaign_id": "223493019",    // para acoes de campanha
  "item_id": "MLB123456"         // para acoes de anuncio
}
```

### 2. Novo componente: `AdsCampaignDetailModal`

Modal (Dialog) que abre ao clicar na campanha, contendo:

- **Header**: Nome da campanha, badge de status, botoes Pausar/Ativar
- **KPI Cards** (6 cards em grid 3x2):
  - Gasto total, Receita, CPC, ACOS, TACOS, ROAS
  - Dados vindos de `precomputedMetrics` (ja calculados)
- **Grafico mini**: linha simples de gasto vs receita (usando dados `periodDaily` filtrados pela campanha, se disponivel, ou omitido na V1)
- **Tabela de produtos**: Reutiliza `AdsCampaignProducts` refatorado
  - Cada linha: botao pausar/ativar individual + remover
  - Status badge por produto
- **Barra de busca**: para adicionar produto
  - Busca em `meli_listings_cache` por titulo, SKU, item_id
  - Botao "Adicionar" ao lado de cada resultado

### 3. Refatorar `AdsCampaignsTable.tsx`

- Ao clicar na linha, em vez de expandir inline, abre o modal
- Remove a logica de `expandedId` / `AdsCampaignProducts` inline
- Mantem o dropdown com "Pausar/Ativar" como atalho rapido (agora funcional)

### 4. Refatorar `AdsCampaignProducts.tsx`

- Adicionar coluna de acoes (pausar/ativar/remover produto)
- Integrar com edge function `ads-campaign-manage`

### 5. Hook: `useAdsCampaignActions`

Hook para gerenciar acoes de campanha e produto:
- `pauseCampaign(campaignId)` / `activateCampaign(campaignId)`
- `pauseAd(itemId)` / `activateAd(itemId)`
- `addAd(campaignId, itemId)` / `removeAd(itemId)`
- Cada acao chama a edge function e invalida os queries relevantes

### 6. `Publicidade.tsx`

- Passa props extras para `AdsCampaignsTable`: `onOpenCampaign`, `precomputedMetrics`, `periodDaily`
- Renderiza `AdsCampaignDetailModal` controlado por estado

## Arquivos

| Arquivo | Acao |
|---------|------|
| `supabase/functions/ads-campaign-manage/index.ts` | **Novo** - Edge function para pausar/ativar campanha e anuncios |
| `src/components/ads/AdsCampaignDetailModal.tsx` | **Novo** - Modal completo de campanha |
| `src/hooks/useAdsCampaignActions.ts` | **Novo** - Hook para acoes via edge function |
| `src/components/ads/AdsCampaignsTable.tsx` | Refatorar: click abre modal, pausar funcional |
| `src/components/ads/AdsCampaignProducts.tsx` | Adicionar acoes por produto (pausar/ativar/remover) |
| `src/pages/Publicidade.tsx` | Integrar modal, passar props |
| `src/components/ads/index.ts` | Exportar novo componente |

## API Mercado Livre - Endpoints Confirmados

| Acao | Metodo | URL |
|------|--------|-----|
| Pausar/Ativar campanha | PUT | `/advertising/product_ads_2/campaigns/{id}` |
| Pausar/Ativar anuncio | PUT | `/advertising/product_ads/ads/{item_id}` |
| Adicionar anuncio | POST | `/advertising/product_ads/ads` |
| Remover anuncio | DELETE | `/advertising/product_ads/ads/{item_id}` |

## Prioridade

1. **Edge function `ads-campaign-manage`** - pausar/ativar campanha (urgente, usuario precisa hoje)
2. **Hook + botao funcional** na tabela existente (corrigir o pausar que nao funciona)
3. **Modal completo** com KPIs, produtos e acoes individuais
4. **Busca e adicao** de produtos na campanha
