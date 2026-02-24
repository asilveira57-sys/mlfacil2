
# Mega Plano de Melhorias do Modulo ADS

## Resumo das Mudancas

6 melhorias para tornar o modulo ADS mais informativo e visual, alinhado com o que o Mercado Livre mostra.

---

## 1. Contagem de Anuncios por Campanha na Tabela

**Onde**: Coluna "Campanha" em `AdsCampaignsTable.tsx`

Onde hoje aparece `product_ads` abaixo do nome da campanha, exibir tambem a contagem de anuncios. Exemplo:

```
1803 Delivery 6R
product_ads - 13 anuncios
```

**Como obter**: Fazer um COUNT por campanha via join `ads_items` agrupando por `campaign_id` no `raw_data`. Criar um hook ou query auxiliar que retorna `Map<ml_campaign_id, number>` e passar para a tabela. Alternativamente, contar no frontend a partir dos items ja carregados no `useAdsItems`.

---

## 2. Ordenacao por Quantidade de Anuncios

**Onde**: `AdsCampaignsTable.tsx`

Adicionar coluna de sort `ads_count` no tipo `SortColumn`. Ao clicar no header ou usar os filtros, ordenar por mais ou menos anuncios por campanha. Os chips de filtro de status ja existem; a ordenacao sera pelo header da coluna (clicavel como as demais).

---

## 3. Filtro de Data dentro do Modal

**Onde**: `AdsCampaignDetailModal.tsx`

Adicionar seletor de periodo (7d, 14d, 30d, personalizado) no topo do modal, ao lado do titulo. Ao mudar o periodo, recalcular os KPIs e a tabela de produtos daquela campanha para o periodo selecionado. Usar os `precomputedMetrics` filtrados pelo periodo escolhido.

---

## 4. Botao de Adicionar Anuncio no Modal (Ja Existe)

O modal ja tem a secao "Adicionar Produto" com busca e botao. Vou apenas tornar mais visivel: adicionar um botao `+ Adicionar Anuncio` ao lado do titulo "Produtos da Campanha" que faz scroll ate a secao de busca, ou abre um mini-formulario inline.

---

## 5. Tags de Catalogo e Full nos Anuncios

**Onde**: `AdsCampaignProducts.tsx` (modal) e `AdsProductsTable.tsx` (tab Produtos)

Para cada anuncio, cruzar o `item_id` com a tabela `meli_listings_cache` para buscar:
- `catalog_product_id` != null -> Tag **Catalogo**
- `logistic_type` = 'fulfillment' -> Tag **Full**

Exibir as tags como badges ao lado do titulo do produto.

---

## 6. Anuncios Pausados ou Sem Estoque Acinzentados

**Onde**: `AdsCampaignProducts.tsx` e `AdsProductsTable.tsx`

Para cada produto:
- Se `status = 'paused'` -> linha com `opacity-50` e badge "Pausado"
- Se `available_quantity = 0` no `meli_listings_cache` -> linha com `opacity-50` e badge "Sem Estoque"

Cruzar com `meli_listings_cache` para pegar `available_quantity` e `status` do anuncio.

---

## Detalhamento Tecnico

### Arquivos a Modificar

| Arquivo | Mudanca |
|---------|---------|
| `src/components/ads/AdsCampaignsTable.tsx` | Adicionar contagem de anuncios por campanha na coluna "Campanha", novo sortColumn `ads_count` |
| `src/components/ads/AdsCampaignDetailModal.tsx` | Seletor de periodo (7d/14d/30d/custom), botao "+ Adicionar" visivel no header de produtos |
| `src/components/ads/AdsCampaignProducts.tsx` | Cruzar com `meli_listings_cache` para tags Catalogo/Full, acinzentar pausados/sem estoque |
| `src/pages/Publicidade.tsx` | Passar contagem de anuncios por campanha como prop para `AdsCampaignsTable` |

### Estrategia de Cruzamento com meli_listings_cache

Na `AdsCampaignProducts`, apos buscar os items de `ads_items`, fazer uma segunda query:

```text
SELECT item_id, catalog_product_id, logistic_type, available_quantity, status
FROM meli_listings_cache
WHERE seller_id = ? AND item_id IN (lista_de_item_ids)
```

Isso retorna em ~50ms e permite enriquecer cada produto com as tags e status de estoque.

### Contagem de Anuncios por Campanha

Na `Publicidade.tsx`, apos carregar `items` do `useEnrichedAdsItems`, computar um `Map<campaign_id, number>`:

```text
const adCountMap = useMemo(() => {
  const map = new Map<string, number>();
  for (const item of items) {
    const cId = String(item.raw_data?.campaign_id || '');
    map.set(cId, (map.get(cId) || 0) + 1);
  }
  return map;
}, [items]);
```

Passar como prop para `AdsCampaignsTable`.

### Seletor de Periodo no Modal

Reutilizar o mesmo pattern de periodo da pagina principal (7d, 14d, 30d, custom). Ao mudar, filtrar os `precomputedMetrics` para o periodo selecionado ou, se nao houver dados pre-computados, chamar a Edge Function `ads-period-metrics` para o periodo.

### Visual dos Anuncios Acinzentados

```text
<TableRow className={cn(
  "hover:bg-muted/40",
  (product.status === 'paused' || product.outOfStock) && "opacity-50"
)}>
  ...
  {product.isCatalog && <Badge variant="outline" className="text-[9px]">Catalogo</Badge>}
  {product.isFull && <Badge variant="outline" className="text-[9px] border-blue-500 text-blue-500">Full</Badge>}
  {product.status === 'paused' && <Badge variant="secondary" className="text-[9px]">Pausado</Badge>}
  {product.outOfStock && <Badge variant="destructive" className="text-[9px]">Sem Estoque</Badge>}
```
