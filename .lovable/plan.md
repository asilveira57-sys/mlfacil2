
# Plano: Remover Limite de 1000 Registros em Todo o Sistema

## Diagnóstico

O Supabase possui um **limite padrão de 1000 registros** para consultas que não especificam `.limit()`. Isso está afetando várias partes do sistema, incluindo:

- Módulo de Custos (Pedidos) - exibindo exatamente 1000 pedidos quando há mais
- Etiquetas de Envio
- Análises ABC
- Sincronizações de dados
- Diversas consultas em Edge Functions

## Arquivos a Modificar

### Edge Functions (Backend)

| Arquivo | Problema | Solução |
|---------|----------|---------|
| `supabase/functions/cost-engine/index.ts` | Linhas 353-359: Query sem limit em `order_cost_breakdown_cache` | Adicionar paginação ou remover limite implícito |
| `supabase/functions/trends-api/index.ts` | Linha 612: `.limit(500)` em trends data | Remover limite ou implementar paginação |
| `supabase/functions/trends-api/index.ts` | Linha 726: `.limit(50)` em alerts | Remover limite |
| `supabase/functions/radiography-engine/index.ts` | Linha 300: `.limit(90)` em snapshots | Remover limite |
| `supabase/functions/radiography-engine/index.ts` | Linha 427: `.limit(10)` em critical events | Remover limite |
| `supabase/functions/radiography-engine/index.ts` | Linha 514: `.limit(100)` em listing events | Remover limite |
| `supabase/functions/ads-ai-consultant/index.ts` | Linha 251: `.limit(100)` em ads alerts | Remover limite |
| `supabase/functions/ads-ai-consultant/index.ts` | Linha 286: `.limit(50)` em ads tasks | Remover limite |
| `supabase/functions/cost-engine/index.ts` | Linhas 979, 988: `.limit(10)` em top products | Manter (caso de uso específico: TOP 10) |
| `supabase/functions/competitor-engine/index.ts` | Linha 845: `.limit(5)` em alerts | Remover limite |
| `supabase/functions/ml-sync-financial/index.ts` | Linha 1205-1209: Query sem limit | Adicionar paginação ou fetch completo |
| `supabase/functions/automation-processor/index.ts` | Linhas 240-244: Query sem limit em tasks | Adicionar fetch completo |

### Hooks do Frontend

| Arquivo | Problema | Solução |
|---------|----------|---------|
| `src/hooks/useAdsConnections.ts` | Linha 270: `.limit(20)` em sync jobs | Remover limite |
| `src/hooks/useAdsConnections.ts` | Linha 291: `.limit(50)` em sync logs | Remover limite |
| `src/hooks/usePromotionSyncLogs.ts` | Linha 43: `.limit(10)` em logs | Remover limite |
| `src/hooks/useNotifications.ts` | Linha 36: `.limit(100)` em notifications | Remover limite |
| `src/hooks/useNotifications.ts` | Linha 149: `.limit(100)` em system events | Remover limite |
| `src/hooks/useAdsTasksHistory.ts` | Linha 43: `.limit(100)` em tasks history | Remover limite |
| `src/hooks/useTrendsController.ts` | Linha 229: `.limit(20)` em subcategories | Remover limite |
| `src/hooks/usePrintHistory.ts` | Linha 28: `.limit(50)` em print history | Remover limite |
| `src/hooks/useAdsRules.ts` | Linha 239: `.limit(50)` em alerts | Remover limite |
| `src/hooks/useSellerCategories.ts` | Linha 54: `.limit(12)` em categories | Remover limite |
| `src/hooks/useSellerCategoryMetrics.ts` | Linha 155: `.limit(5)` em snapshots | Remover limite |
| `src/hooks/useZPLTimeEstimate.ts` | Linha 39: `.limit(20)` em conversion history | Remover limite |
| `src/hooks/useShippingLabels.ts` | Linhas 227-232, 563-567, 814-817: Queries sem limit | Adicionar fetch completo |
| `src/hooks/useAutomationRules.ts` | Linhas 33-36: Query sem limit | Adicionar fetch completo |
| `src/hooks/useCategoryEligibility.ts` | Linhas 469-474: Query sem limit | Adicionar fetch completo |
| `src/hooks/useTrendsStatus.ts` | Linhas 44-47: Query sem limit | Adicionar fetch completo |
| `src/hooks/useAbcAnalysis.ts` | Múltiplas queries sem limit | Adicionar fetch completo |
| `src/hooks/useTasks.ts` | Linha 48-52: Query sem limit | Adicionar fetch completo |

### Componentes

| Arquivo | Problema | Solução |
|---------|----------|---------|
| `src/components/trends/SubcategoriesHighlightCard.tsx` | Linha 44: `.limit(12)` | Remover limite |
| `src/components/trends/TrendingSubcategoriesGrid.tsx` | Linha 62: `.limit(12)` | Remover limite |
| `src/components/trends/SubcategoriesSection.tsx` | Linha 52: `.limit(12)` | Remover limite |
| `src/components/trends/TrendsHistoryTab.tsx` | Linha 99: `.limit(50)` | Remover limite |
| `src/pages/Blog.tsx` | Linha 73: `.limit(20)` em posts | Remover limite |
| `src/components/custos/CostOrderDiagnostic.tsx` | Linhas 91-96: Query sem limit | Adicionar fetch completo |

## Estratégia de Implementação

### 1. Criação de Helper para Fetch Completo

Criar uma função utilitária reutilizável que busca todos os registros usando paginação interna:

```typescript
// src/lib/supabaseHelpers.ts
export async function fetchAllRows<T>(
  query: PostgrestFilterBuilder<any, any, any>
): Promise<T[]> {
  const PAGE_SIZE = 1000;
  let allData: T[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await query.range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) {
      hasMore = false;
    } else {
      allData = [...allData, ...data];
      from += PAGE_SIZE;
      hasMore = data.length === PAGE_SIZE;
    }
  }

  return allData;
}
```

### 2. Aplicar a Todas as Consultas

- Remover todos os `.limit()` explícitos (exceto onde faz sentido, como TOP 10)
- Usar `.range(0, 10000)` ou a função helper para queries que podem ter muitos registros
- Para Edge Functions: usar loop de paginação

### 3. Exceções Mantidas (Limites Intencionais)

Alguns limites são intencionais e devem ser **mantidos**:

- **TOP 10 produtos** (lucro/prejuízo) - faz sentido ter limite
- **Paginação de interface** (PAGE_SIZE) - necessário para performance da UI
- **Rankings específicos** - onde o limite é parte da lógica de negócio

## Ordem de Implementação

1. Criar helper `fetchAllRows` em `src/lib/supabaseHelpers.ts`
2. Corrigir `cost-engine/index.ts` (maior impacto - Módulo de Custos)
3. Corrigir `useShippingLabels.ts` (Etiquetas)
4. Corrigir `useAbcAnalysis.ts` (Análise ABC)
5. Corrigir demais hooks do frontend
6. Corrigir Edge Functions restantes
7. Corrigir componentes

## Resultado Esperado

- Módulo de Custos exibirá **todos os pedidos** (não apenas 1000)
- Todas as listagens do sistema terão **dados completos**
- Sincronizações processarão **todos os registros** disponíveis

## Observação Técnica

O Supabase limita retornos a 1000 por padrão. Para buscar mais, é necessário:
- Usar `.range(from, to)` com paginação
- Ou usar `.limit(X)` com X > 1000 (máximo 10000 por request)

A solução mais robusta é paginação interna automática.
