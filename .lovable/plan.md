

# Correcao de Performance e Filtro de Etiquetas de Envio

## Problemas Identificados

### 1. Lentidao extrema ao carregar/trocar filtros
A query principal (`useQuery` linha 273) usa `fetchAllRowsPaginated` para buscar **TODOS** os pedidos do periodo, depois faz joins com shipments e invoices **em JavaScript**, e so entao filtra e pagina. Para 30 dias com centenas de pedidos, isso significa multiplas queries sequenciais ao banco, processamento pesado no navegador e travamento da UI.

### 2. Filtro "Hoje" induz ao erro
O filtro "Hoje" filtra por `created_at_meli` (data de criacao do pedido), mas o que importa para operacao e **quais envios precisam de acao hoje** -- incluindo pedidos de ontem apos o horario de corte. O ML usa o conceito de "Envios de hoje" baseado no deadline de despacho, nao na data do pedido.

### 3. API do ML nao tem filtro "envios de hoje" direto
A API `orders/search` suporta filtros como `shipping.status=ready_to_ship` e `order.status=paid`, mas nao tem um filtro equivalente ao "TAB_TODAY" da interface web do ML. O conceito de "envios de hoje" e determinado internamente pelo ML baseado no horario de corte e logistica. A solucao e filtrar localmente por shipments com status ativo (`ready_to_ship` com substatus `invoice_pending` ou `ready_to_print`).

---

## Solucao

### Parte 1: Mudar filtro padrao para 7 dias

**Arquivo:** `src/hooks/useShippingLabels.ts`

- Alterar `useState<PeriodFilter>('today')` para `useState<PeriodFilter>('7d')` (linha 194)
- Isso garante que ao abrir a pagina, o usuario ve todos os pedidos da semana, incluindo os de ontem que ainda precisam de acao

### Parte 2: Query otimizada com paginacao no banco

**Arquivo:** `src/hooks/useShippingLabels.ts`

Refatorar a query principal para:
1. **Criar uma view ou RPC no banco** que faz o JOIN de `meli_orders_cache` + `meli_shipments_cache` + `meli_invoices_cache` e calcula o `final_status` direto no SQL
2. A RPC recebe: `seller_id`, `date_from`, `date_to`, `status_filter`, `search_query`, `sort_field`, `sort_dir`, `page`, `page_size`
3. Retorna apenas os registros da pagina solicitada + `total_count` (via `COUNT(*) OVER()`)
4. Isso elimina: fetch de todos os registros, joins em JS, filtragem em JS, paginacao em JS

A RPC fara:
- LEFT JOIN entre as 3 tabelas
- CASE/WHEN para calcular `final_status` no SQL (mesma logica das linhas 362-406)
- Deduplicacao por `shipment_id` com `DISTINCT ON` ou `ROW_NUMBER()`
- Filtros de status, busca (ILIKE), e periodo aplicados no WHERE
- `ORDER BY` e `LIMIT/OFFSET` no SQL
- Retorno de `status_counts` (contagem por status) numa segunda query ou CTE

### Parte 3: Contagem de status sem recarregar tudo

A RPC tambem retornara as contagens por status (`pronta`, `aguardando_nf`, `reimprimir`, etc.) calculadas sobre o periodo inteiro (sem paginacao), para exibir nos badges de filtro. Isso sera feito com um CTE separado na mesma chamada.

### Parte 4: Cache com placeholderData (ja existente, manter)

O `placeholderData: (prev) => prev` ja esta implementado (linha 509). Com a RPC otimizada, a troca de periodo sera quase instantanea pois:
- Dados anteriores ficam visiveis enquanto a nova query roda
- A nova query sera rapida (SQL paginado em vez de fetch-all + JS processing)

---

## Detalhes Tecnicos

### RPC: `get_shipping_orders`

```text
Parametros:
  p_seller_id TEXT
  p_date_from TIMESTAMPTZ
  p_date_to TIMESTAMPTZ  
  p_status_filter TEXT (default 'all')
  p_search_query TEXT (default '')
  p_sort_field TEXT (default 'created_at_meli')
  p_sort_dir TEXT (default 'desc')
  p_page INT (default 1)
  p_page_size INT (default 30)

Retorno:
  orders: JSONB[] (pagina atual)
  total_count: INT
  status_counts: JSONB {all, pronta, aguardando_nf, reimprimir, ...}
```

Logica SQL do `final_status`:
```text
CASE
  WHEN s.shipment_id IS NULL AND o.shipment_id IS NOT NULL THEN 'pendente_sync'
  WHEN o.shipment_id IS NULL THEN 'outros'
  WHEN s.logistic_type IN ('fulfillment','cross_docking') THEN 'full'
  WHEN s.shipment_status IN ('delivered','shipped','not_delivered') THEN 'enviado'
  WHEN s.shipment_substatus = 'printed' THEN 'reimprimir'
  WHEN s.shipment_substatus = 'invoice_pending' THEN 'aguardando_nf'
  WHEN s.shipment_substatus = 'ready_to_print' AND s.label_available THEN 'pronta'
  ELSE 'outros'
END
```

### Impacto nos Arquivos

| Arquivo | Acao |
|---------|------|
| Migration SQL | Criar RPC `get_shipping_orders` |
| `src/hooks/useShippingLabels.ts` | Substituir fetch-all + JS joins por chamada RPC; mudar default para '7d' |

### Resultado Esperado

- Troca de periodo: de 3-10 segundos para menos de 500ms
- Carregamento inicial: de 5+ segundos para menos de 1 segundo
- Filtro padrao 7 dias mostra todos os envios pendentes da semana
- Contagens de status sempre atualizadas sem recarregar dados

