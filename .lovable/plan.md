
# Correcao: Campanhas faltando + Colunas de participacao

## Problema 1: Apenas 7 de 11 campanhas aparecem

O banco de dados tem 11 promocoes sincronizadas, mas a UI so mostra 7. Motivo: o hook `usePromotions` divide as promocoes em 3 grupos:
- **Ativas** = status `started` (7 promocoes)
- **Terminando em 48h** = status `started` + end_at proximo (subconjunto das ativas)
- **Finalizadas** = status `finished` (0 promocoes)

As 4 promocoes com status **`pending`** (ainda nao iniciadas) nao aparecem em nenhuma aba. Sao elas:
- Liquida Outlet (DEAL)
- Aumente suas vendas (SMART, 22/fev-14/mar)
- Impulsione suas vendas (SMART, 22/fev-14/mar)
- 03.03 e Dia do Consumidor (DEAL)

**Solucao:** Adicionar uma aba "Pendentes" no hook e na UI para exibir promocoes com status `pending`.

## Problema 2: Coluna unica "Itens" nao mostra participacao

Atualmente a tabela so tem uma coluna "Itens" com o total (`items_count`). O Mercado Livre mostra "X elegiveis | Y participando" em cada card.

Os dados ja existem no banco (`promotion_items_snapshots`) com contagens por `item_status`:
- `started` = participando
- `candidate`/`pending` = elegiveis (a participar)

**Solucao:** Substituir a coluna unica "Itens" por duas colunas: "Participando" e "Elegiveis". Buscar essas contagens do banco junto com a query de promocoes.

---

## Implementacao

### 1. Hook `usePromotions.ts`
- Adicionar `pendingPromotions` como computed view: `promotions.filter(p => p.status === 'pending')`
- Retornar `pendingPromotions` no resultado do hook

### 2. Buscar contagens por status de item
- Ao carregar promocoes, fazer uma segunda query em `promotion_items_snapshots` agrupando por `promotion_id` e `item_status`
- Criar um mapa `{ promotion_id: { participating: N, eligible: M } }`
- Expor esse mapa no hook ou como campos adicionais no `PromotionSnapshot`

### 3. Pagina `Promocoes.tsx`
- Adicionar aba "Pendentes" nas tabs, entre "Ativas" e "Terminando"
- Consumir `pendingPromotions` do hook e exibir na nova aba

### 4. Componente `PromotionsTable`
- Substituir coluna "Itens" por duas colunas: "Participando" e "Elegiveis"
- "Participando": mostra contagem de itens com `item_status = 'started'` (cor verde)
- "Elegiveis": mostra contagem de itens com `item_status IN ('candidate', 'pending')` (cor azul/cinza)
- Receber o mapa de contagens como prop

---

## Detalhes Tecnicos

### Query de contagens por promocao

```text
SELECT 
  promotion_id,
  COUNT(*) FILTER (WHERE item_status = 'started') as participating,
  COUNT(*) FILTER (WHERE item_status IN ('candidate', 'pending')) as eligible
FROM promotion_items_snapshots
WHERE workspace_id = ? AND seller_id = ?
GROUP BY promotion_id
```

Como o Supabase JS SDK nao suporta FILTER diretamente, a alternativa e buscar todos os itens com `select('promotion_id, item_status')` e agrupar no frontend, ou usar uma RPC/view. A abordagem mais simples e agrupar no frontend a partir dos dados ja disponiveis.

### Mudanca no hook `usePromotions`

Adicionar uma query separada para buscar `promotion_id` e `item_status` de todos os itens do workspace/seller, e computar as contagens no frontend:

```text
const { data: itemStatuses } = await supabase
  .from('promotion_items_snapshots')
  .select('promotion_id, item_status')
  .eq('workspace_id', workspaceId)
  .eq('seller_id', sellerId);

// Agrupar: { promoId: { participating: N, eligible: M } }
```

### Mudanca na PromotionsTable

Receber prop `itemCounts: Map<string, { participating: number, eligible: number }>` e renderizar:

```text
<TableHead>Participando</TableHead>
<TableHead>Elegiveis</TableHead>
...
<TableCell>
  <Badge variant="default" className="bg-green-100 text-green-800">{counts.participating}</Badge>
</TableCell>
<TableCell>
  <Badge variant="secondary">{counts.eligible}</Badge>
</TableCell>
```

### Impacto nos arquivos

| Arquivo | Acao |
|---------|------|
| `src/hooks/usePromotions.ts` | Adicionar `pendingPromotions`; buscar contagens de itens por status |
| `src/pages/Promocoes.tsx` | Adicionar aba "Pendentes"; atualizar PromotionsTable com 2 colunas |
