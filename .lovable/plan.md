
# Plano: Corrigir Carregamento de Dados de Vendas na Linha do Tempo

## Diagnóstico

O problema **não é erro ou limite de API do Mercado Livre**. A causa raiz foi identificada como um **limite de paginação do banco de dados**.

### Dados Identificados:
- **6.694 vendas** existem no cache (`meli_order_items_cache`)
- **442 itens únicos** têm vendas registradas
- **Limite padrão do Supabase**: 1.000 linhas por query

### Problema:
A Edge Function `ad-timeline-recalculate` executa uma query sem especificar limite:
```javascript
let salesQuery = supabase
  .from("meli_order_items_cache")
  .select("item_id, created_at_meli, seller_id")
  .eq("user_id", userId)
  // ... SEM LIMITE EXPLÍCITO
```

O Supabase aplica automaticamente o limite de 1.000 linhas. Como a query ordena por `created_at_meli ASC` (vendas mais antigas primeiro), apenas as primeiras 1.000 vendas são processadas, cobrindo apenas **198 itens**.

**Resultado**: 
- 198 itens → `120D` (vendas antigas processadas)
- 576 itens → `NO_SALES` (incluindo 244 itens que têm vendas, mas não foram processadas)

## Solução

Implementar **paginação** para buscar todas as 6.694+ vendas do cache antes de processá-las.

## Alterações Necessárias

### 1. Edge Function `ad-timeline-recalculate`

Adicionar lógica de paginação para buscar todos os registros:

```text
Arquivo: supabase/functions/ad-timeline-recalculate/index.ts

Modificações:
1. Criar função helper de paginação que busca em lotes de 1000
2. Substituir a query única por loop de paginação
3. Agregar todos os resultados antes de processar
```

---

## Detalhes Técnicos

### Lógica de Paginação

```text
Pseudo-código:

const PAGE_SIZE = 1000;
let allSalesData = [];
let offset = 0;
let hasMore = true;

while (hasMore) {
  const { data, error } = await supabase
    .from("meli_order_items_cache")
    .select("item_id, created_at_meli, seller_id")
    .eq("user_id", userId)
    .eq("seller_id", sellerIdFilter)
    .not("created_at_meli", "is", null)
    .order("created_at_meli", { ascending: true })
    .range(offset, offset + PAGE_SIZE - 1);
  
  if (error) throw error;
  
  allSalesData = allSalesData.concat(data || []);
  hasMore = (data?.length || 0) === PAGE_SIZE;
  offset += PAGE_SIZE;
}

// Processar allSalesData com todos os registros
```

### Pontos de Atenção
- **Limite de memória**: Com 7.000+ registros, manter arrays em memória é seguro (< 1MB)
- **Timeout**: Cada página adiciona ~100-200ms, mas ainda dentro do limite de 30s
- **Retro-compatibilidade**: Sem alteração na interface da função

## Resultado Esperado

Após a correção:
- **442 itens** com vendas serão corretamente processados
- Buckets serão recalculados com dados precisos:
  - `OK`: Itens vendendo normalmente
  - `30D/60D/90D/120D`: Itens sem venda nos respectivos períodos
  - `NO_SALES`: Apenas os ~325 itens que realmente nunca venderam

## Arquivos a Modificar

| Arquivo | Tipo de Alteração |
|---------|-------------------|
| `supabase/functions/ad-timeline-recalculate/index.ts` | Adicionar paginação na busca de vendas |

## Impacto

- **Baixo risco**: Apenas melhoria na consulta, sem alteração de schema
- **Performance**: Adiciona ~1-2 segundos ao recálculo total (aceitável)
- **Sem downtime**: Alteração transparente para usuários
