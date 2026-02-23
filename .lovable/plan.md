
# Filtros Avancados na Pesquisa de Produtos (Central de Promocoes)

## Problemas Atuais

1. **Sem filtro de status nos resultados de produto**: Quando voce pesquisa um produto, aparecem todas as campanhas misturadas — "Participando" e "Participar" juntos, sem como separar.
2. **Co-participacao nao filtra resultados de produto**: O botao "Co-participacao ML" so filtra a lista de campanhas abaixo, mas nao afeta os resultados da pesquisa por produto.
3. **Sem filtro de desconto**: Nao existe como filtrar por percentual de desconto (ex: "mostrar apenas com desconto inferior a 10%").

## Solucao

Adicionar 3 novos filtros que se aplicam tanto a lista de campanhas quanto aos resultados de pesquisa por produto:

### Filtro 1: Status do Item (Select)
- "Todos os status" (padrao)
- "Participando" — itens com `item_status === 'started'`
- "Participar" — itens com `item_status === 'candidate' || 'pending'`

### Filtro 2: Co-participacao ML (Botao toggle — ja existe, precisa funcionar nos resultados de produto)
- Filtra para mostrar apenas promocoes que tem `meli_percentage > 0`

### Filtro 3: Desconto Maximo (Input numerico)
- Campo para digitar percentual maximo de desconto
- Ex: digitar "10" mostra apenas itens com desconto ate 10%

## Alteracoes Tecnicas

### Arquivo: `src/pages/Promocoes.tsx`

**Novos estados de filtro** (junto aos existentes na linha 83-85):

```typescript
const [statusFilter, setStatusFilter] = useState<string>('all'); // 'all' | 'participating' | 'candidate'
const [maxDiscountFilter, setMaxDiscountFilter] = useState<string>(''); // percentual maximo
```

**Filtro aplicado aos productResults** (novo useMemo apos linha 150):

```typescript
const filteredProductResults = useMemo(() => {
  return productResults.map(product => {
    const filteredPromos = product.promotions.filter(promo => {
      // Status filter
      if (statusFilter === 'participating' && promo.item_status !== 'started') return false;
      if (statusFilter === 'candidate' && promo.item_status !== 'candidate' && promo.item_status !== 'pending') return false;
      
      // Co-participation filter
      if (coParticipationFilter && !(promo.meli_percentage && promo.meli_percentage > 0)) return false;
      
      // Discount filter
      if (maxDiscountFilter) {
        const pct = (promo.meli_percentage || 0) + (promo.seller_percentage || 0);
        const pctFromPrice = promo.original_price && promo.promo_price && promo.original_price > 0
          ? ((promo.original_price - promo.promo_price) / promo.original_price) * 100
          : 0;
        const discount = pct > 0 ? pct : pctFromPrice;
        if (discount > Number(maxDiscountFilter)) return false;
      }
      
      return true;
    });
    return { ...product, promotions: filteredPromos };
  }).filter(product => product.promotions.length > 0);
}, [productResults, statusFilter, coParticipationFilter, maxDiscountFilter]);
```

**Novos controles na barra de filtros** (apos o botao Co-participacao, linha 497):

```
[Select: Status do item]     [Input: Desconto max %]
```

- Select com opcoes: "Todos os status", "Participando", "Participar"
- Input numerico com placeholder "Desconto max %"

**Renderizacao**: Trocar `productResults` por `filteredProductResults` na secao de resultados (linha 501-541).

### Resumo dos arquivos alterados

| Arquivo | Alteracao |
|---------|-----------|
| `src/pages/Promocoes.tsx` | Novos estados, filtro de productResults, novos controles UI |

Nenhuma alteracao no backend ou hook de busca — toda filtragem e feita client-side sobre os dados ja carregados.
