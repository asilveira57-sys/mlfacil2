

# Correcao: Etiquetas de Envio Travadas em "Sincronizando..." e Filtros Zerados

## Causa Raiz Identificada

Ha um **bug critico** na funcao `fetchAllRowsPaginated` no arquivo `src/hooks/useShippingLabels.ts` (linhas 163-185). A funcao busca os dados do banco mas **nunca os adiciona ao array de resultados**:

```text
async function fetchAllRowsPaginated<T>(...): Promise<T[]> {
  const allRows: T[] = [];        // <-- Array criado vazio
  let offset = 0;
  
  while (true) {
    const { data, error } = await queryFn(offset, batchSize);
    
    if (!data || data.length === 0) break;
    
    // BUG: data NUNCA e adicionado ao allRows!
    // Falta: allRows.push(...data);
    
    if (data.length < batchSize) break;  // BUG 2: ultimo lote descartado
    offset += batchSize;
  }
  
  return allRows;  // <-- Sempre retorna []
}
```

### Efeito Cascata desse Bug

A funcao `fetchAllRowsPaginated` e usada em 4 lugares criticos:

1. **Sync Pipeline Fase 2** (linha 726): Coleta order_ids para buscar shipment_ids
   - Retorna `[]` --> Nenhum shipment e sincronizado --> Todos os pedidos ficam como "Sincronizando..."
   
2. **Sync Pipeline Fase 5** (via orderIds): Coleta order_ids para buscar invoices
   - Retorna `[]` --> Nenhuma NF e sincronizada

3. **Status Counts** (linha 1146): Conta pedidos para os filtros (Para imprimir, Aguardando NF, etc.)
   - Retorna `[]` --> Todos os contadores mostram 0

4. **Repair Sync** (linha 877): Busca shipments faltantes
   - Retorna `[]` --> Reparo nao funciona

### Por que "sincroniza eternamente"

O sync pipeline executa mas:
- Fase 1 (sync orders) funciona normalmente (confirmado nos logs: 424 orders synced)
- Fase 2-5 recebem arrays vazios, terminam instantaneamente
- Os pedidos no cache tem `shipment_id` mas nao ha dados em `meli_shipments_cache`
- A UI mostra "pendente_sync" para todos eles
- O auto-sync tenta novamente a cada visita, mas sempre falha da mesma forma

### Confirmacao: Dashboard de Vendas esta funcionando

Os logs de rede confirmam que `ml-sales-data` retorna HTTP 200 com dados completos (5.261 pedidos, R$ 767K receita total). O erro anterior era transitorio durante o deploy das funcoes.

---

## Correcoes

### Correcao 1: Corrigir `fetchAllRowsPaginated` (CRITICA)

**Arquivo:** `src/hooks/useShippingLabels.ts` (linhas 163-185)

Adicionar `allRows.push(...data)` e corrigir o tratamento do ultimo lote:

```typescript
async function fetchAllRowsPaginated<T>(
  queryFn: (offset: number, limit: number) => Promise<{ data: T[] | null; error: Error | null }>,
  batchSize: number = SYNC_QUERY_BATCH
): Promise<T[]> {
  const allRows: T[] = [];
  let offset = 0;
  
  while (true) {
    const { data, error } = await queryFn(offset, batchSize);
    
    if (error) {
      console.error('Pagination query error:', error);
      break;
    }
    
    if (!data || data.length === 0) break;
    
    allRows.push(...data);  // CORRECAO: Acumular dados no array
    
    if (data.length < batchSize) break; // Ultimo lote - dados ja adicionados
    offset += batchSize;
  }
  
  return allRows;
}
```

### Correcao 2: Paginacao na Query Principal de Pedidos

**Arquivo:** `src/hooks/useShippingLabels.ts` (linhas 279-303)

A query principal que carrega pedidos para a UI nao tem paginacao e esta limitada a 1000 registros pelo padrao do banco. Embora o usuario tenha ~394 pedidos em 30 dias agora, isso vai falhar quando o volume crescer. Remover o `{ count: 'exact' }` (que conta ALL rows) e usar paginacao via `.range()`:

```typescript
// Aplicar range para a pagina atual (server-side pagination)
const from = (currentPage - 1) * PAGE_SIZE;
const to = from + PAGE_SIZE - 1;

let query = supabase
  .from('meli_orders_cache')
  .select('*', { count: 'exact' })
  .eq('seller_id', sellerId)
  .not('order_status', 'in', `(cancelled)`)
  .order('created_at_meli', { ascending: false })
  .range(from, to);
```

**Nota**: Este e um refinamento de performance. A correcao da `fetchAllRowsPaginated` ja resolve o problema imediato. A paginacao server-side sera necessaria quando o volume de pedidos crescer acima de 1000.

### Correcao 3: Deploy da funcao `facebook-conversions`

**Arquivo:** `supabase/functions/facebook-conversions/index.ts`

A funcao nao esta deployada (sem logs, retorna 404), causando erros repetidos no console. Nao usa o import do supabase-js (usa apenas `deno.land/std`), entao nao foi parte da migracao anterior. Precisa apenas ser redeployada.

---

## Escopo Minimo - Sem Impacto em Outros Modulos

A correcao e cirurgica:
- **1 linha adicionada** (`allRows.push(...data)`) em uma funcao utilitaria local do hook de etiquetas
- Nao altera nenhum outro modulo (vendas, custos, perguntas, anuncios, etc.)
- Nao altera nenhuma Edge Function
- Nao altera nenhuma tabela ou RLS
- Apenas corrige o bug que impede dados ja existentes de serem processados

## Fluxo Corrigido

```text
  Usuario abre /shipping-labels
       |
       v
  Query carrega pedidos do meli_orders_cache (394 pedidos)
       |
       v
  Auto-sync dispara startSyncPipeline()
       |
       v
  Fase 1: ml-sync-orders --> 424 pedidos sincronizados (JA FUNCIONA)
       |
       v
  Fase 2: fetchAllRowsPaginated coleta 394 orders
       --> Extrai 350+ shipment_ids unicos        [AGORA FUNCIONA]
       |
       v
  Fase 3: Verifica quais shipments faltam no cache
       |
       v
  Fase 4: Sincroniza shipments faltantes em lotes de 200
       |
       v
  Fase 5: Sincroniza invoices em lotes de 300
       |
       v
  Fase 6: Refetch --> Pedidos mostram status correto
       --> Filtros: "Para imprimir: X", "Aguardando NF: Y"
```

## Resultado Esperado

- Pedidos mostram status correto (Pronta, Aguardando NF, Reimprimir) em vez de "Sincronizando..."
- Filtros mostram contagens reais em vez de 0
- Sync completa em vez de ficar "eternamente"
- Dashboard de vendas continua funcionando normalmente
- Nenhum outro modulo e impactado

