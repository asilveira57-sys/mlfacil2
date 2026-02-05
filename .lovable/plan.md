
# Plano de Correção: Loops Infinitos e Inconsistências de Sincronização

## Diagnóstico Confirmado

### Problema 1: Loop infinito no Dashboard
A conta `MLFACIL_CONSULTORIA` (sem vendas) está causando loop infinito porque:
- RPC retorna `cachedOrdersCount: 0`
- Código interpreta isso como "conta nova que precisa de onboarding"
- `startProgressiveSync` é chamado repetidamente
- Ao final de cada sync, `fetchSalesData(true)` re-verifica a condição
- Como continua 0 (conta sem vendas), o ciclo recomeça

### Problema 2: Estado `isFirstLoad` não reseta ao trocar conta
Quando troca de conta via seletor global, o estado `isFirstLoad` não é resetado, causando comportamento inconsistente.

### Problema 3: "Sincronizando..." eterno em Vendas
Pedidos mostram status "pendente_sync" quando `shipment_id` existe mas não há registro em `meli_shipments_cache`. Se a sync não completa, fica travado.

### Problema 4: Dia atual incluído nos filtros
O filtro de 7/30 dias inclui o dia de hoje, mas você solicitou que exclua o dia atual (dados incompletos).

---

## Correções Propostas

### Correção 1: Eliminar loop infinito para contas sem vendas

**Arquivo:** `src/components/SalesDashboard.tsx`

1. Adicionar ref para controlar se já tentou sync para a conta atual
2. Mudar condição de onboarding para verificar se é conta **genuinamente nova** vs **conta sem vendas**
3. Não re-executar `fetchSalesData()` dentro de `startProgressiveSync` final para evitar re-trigger

```typescript
// Antes da função fetchSalesData
const hasSyncedForSellerRef = useRef<string | null>(null);

// Na condição de onboarding (linhas 273-278)
if (
  isFirstLoad && 
  debug?.cachedOrdersCount === 0 && 
  activeSellerId &&
  hasSyncedForSellerRef.current !== activeSellerId // NOVO: evita re-sync
) {
  hasSyncedForSellerRef.current = activeSellerId;
  setShowOnboarding(true);
  startProgressiveSync(activeSellerId, session.access_token);
}
```

### Correção 2: Reset de estados ao trocar conta

**Arquivo:** `src/components/SalesDashboard.tsx`

Adicionar efeito que reseta estados quando `activeSellerId` muda:

```typescript
// Reset quando troca de conta
useEffect(() => {
  setIsFirstLoad(true);
  setShowOnboarding(false);
  setIsSyncing(false);
  setSalesData(null);
  setError(null);
  hasSyncedForSellerRef.current = null;
}, [activeSellerId]);
```

### Correção 3: Excluir dia de hoje dos filtros padrão

**Arquivo:** `src/components/SalesDashboard.tsx`

Modificar `getInitial30DayFilter` para usar **ontem** como data final:

```typescript
const getInitial30DayFilter = (): DateFilter => {
  const now = new Date();
  const spOffset = -3 * 60;
  const localOffset = now.getTimezoneOffset();
  const diff = spOffset - localOffset;
  const spNow = new Date(now.getTime() + diff * 60 * 1000);
  
  // Usar ONTEM como data final (dia não fechado)
  const yesterday = new Date(spNow.getFullYear(), spNow.getMonth(), spNow.getDate() - 1);
  const thirtyDaysAgo = new Date(yesterday);
  thirtyDaysAgo.setDate(yesterday.getDate() - 29); // 30 dias antes de ontem
  
  return {
    dateFrom: format(thirtyDaysAgo, 'yyyy-MM-dd'),
    dateTo: format(yesterday, 'yyyy-MM-dd'),
  };
};
```

### Correção 4: Limitar tentativas de sync em contas sem dados

**Arquivo:** `src/components/SalesDashboard.tsx`

No final de `startProgressiveSync`, não chamar `fetchSalesData` se não encontrou dados:

```typescript
// Após todas as phases completarem
if (syncJob && syncJob.processed_records > 0) {
  fetchSalesData(undefined, true); // Só atualiza se processou algo
}
```

### Correção 5: Invalidar cache de sales ao trocar conta

**Arquivo:** `src/hooks/useAccountChangeInvalidation.ts`

Adicionar invalidação do cache de vendas:

```typescript
// Dentro do handleAccountChange
// Limpar cache de sales data
const cacheHook = useSalesDataCache();
cacheHook.clearAll(); // Se disponível globalmente

// Ou invalidar via evento
window.dispatchEvent(new CustomEvent('clear_sales_cache'));
```

---

## Detalhes Técnicos

### Fluxo Corrigido

```text
┌─────────────────────────────────────────────────────────────┐
│ Usuário troca conta no seletor global                       │
├─────────────────────────────────────────────────────────────┤
│ 1. ActiveAccountContext dispara active_account_changed      │
│ 2. AccountChangeInvalidator limpa caches React Query        │
│ 3. SalesDashboard detecta mudança de activeSellerId         │
│ 4. Reset: isFirstLoad=true, hasSyncedRef=null, salesData=null│
│ 5. fetchSalesData() é chamado                               │
│ 6. Se cachedOrdersCount=0 E hasSyncedRef !== seller:        │
│    → Marca hasSyncedRef = seller                            │
│    → Inicia onboarding sync UMA VEZ                         │
│ 7. Sync completa → NÃO chama fetchSalesData novamente       │
│ 8. Usuário vê Dashboard (com ou sem dados)                  │
└─────────────────────────────────────────────────────────────┘
```

### Arquivos a Modificar

1. `src/components/SalesDashboard.tsx`
   - Adicionar `hasSyncedForSellerRef`
   - Reset de estados ao trocar conta
   - Modificar `getInitial30DayFilter` para excluir hoje
   - Ajustar condição de onboarding
   - Ajustar final de `startProgressiveSync`

2. `src/hooks/useAccountChangeInvalidation.ts`
   - Adicionar invalidação de caches adicionais se necessário

### Critérios de Aceite

- [ ] Dashboard não entra em loop ao selecionar conta sem vendas
- [ ] Dashboard exibe corretamente "Nenhum dado" para contas sem vendas
- [ ] Trocar conta reseta o estado e carrega dados da nova conta
- [ ] Filtros de 7/30 dias excluem o dia atual
- [ ] Página de Vendas não fica travada em "Sincronizando..." eternamente
- [ ] Cache é limpo ao trocar de conta

### Riscos e Mitigação

- **Risco:** Contas novas legítimas podem não iniciar sync automático
  - **Mitigação:** A verificação `hasSyncedRef !== seller` garante que cada conta nova tem UMA tentativa de sync

- **Risco:** Dados de ontem podem parecer "atrasados" para usuários
  - **Mitigação:** Manter filtro "Hoje" disponível para consulta manual quando necessário
