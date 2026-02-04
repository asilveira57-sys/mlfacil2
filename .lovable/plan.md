
# Plano: Corrigir Módulo de Custos - Sincronização de Conta Ativa

## Diagnóstico Confirmado

O módulo de Custos está apresentando "Nenhum pedido encontrado" porque está usando o `seller_id` errado. O problema tem duas causas:

### Causa 1: Página Custos.tsx não usa o ActiveAccountContext
A página tem um **dropdown local independente** que carrega contas de `ml_accounts` sem ordem definida. Quando o Supabase retorna MLFACIL_CONSULTORIA (1667452966) como primeira na lista, essa conta é automaticamente selecionada.

```
Linha 48: setSelectedSellerId(accounts[0].ml_user_id);  // Ordem indefinida!
```

### Causa 2: MLFACIL_CONSULTORIA não tem pedidos sincronizados
Essa conta foi criada em 31/01/2026 e **nunca teve seus pedidos sincronizados**:
- `meli_orders_cache` → 0 registros para seller_id 1667452966
- `order_cost_breakdown_cache` → 0 registros
- Quando o cost-engine tenta calcular, encontra 0 pedidos

### Evidência nos logs:
```
[cost-engine] Starting calculation for seller 1667452966, period 30 days
[cost-engine] Found 0 orders to process
[cost-engine] Found 0 orders with real billing data
[cost-engine] Calculation completed: 0 orders processed
```

---

## Solução Proposta

### 1. Integrar Custos.tsx com ActiveAccountContext

Modificar a página para usar o contexto global de conta ativa ao invés do dropdown local independente. Isso garante que:
- O módulo de custos use a mesma conta que está selecionada no header
- A troca de conta seja sincronizada em todo o sistema
- A ordem das contas seja consistente

**Mudanças:**
- Importar `useActiveAccount` do contexto global
- Substituir o estado local `selectedSellerId` pelo `sellerId` do contexto
- Usar `setActiveAccount` para alternar contas
- Remover a query duplicada de `ml_accounts`

### 2. Disparar recálculo de custos após sincronização de pedidos

Atualmente os custos só são recalculados quando o usuário clica "Recalcular". Mas os pedidos já foram sincronizados até 03/02/2026, enquanto os custos pararam em 28/01/2026.

**Mudança:** No hook de sincronização, após completar a sync de pedidos, disparar automaticamente o recálculo de custos.

### 3. Garantir ordem consistente na listagem de contas

Se a página precisar manter um dropdown local (para casos específicos), adicionar `ORDER BY created_at ASC` na query para que a conta mais antiga (ADECONEXVV) seja sempre a primeira.

---

## Arquivos a serem modificados

| Arquivo | Mudança |
|---------|---------|
| `src/pages/Custos.tsx` | Integrar com `ActiveAccountContext` |
| `src/components/custos/CostOrders.tsx` | Verificar se usa o sellerId correto |
| `src/components/custos/CostCatalog.tsx` | Verificar consistência |
| `src/components/custos/CostSettings.tsx` | Verificar consistência |
| `src/components/custos/CostAbcProfit.tsx` | Verificar consistência |

---

## Detalhes Técnicos

### Antes (Custos.tsx - problemático):
```typescript
const [selectedSellerId, setSelectedSellerId] = useState<string | null>(null);

const { data: accounts } = await supabase
  .from('ml_accounts')
  .select('id, ml_user_id, nickname')
  .eq('is_active', true);  // Ordem indefinida!

setSelectedSellerId(accounts[0].ml_user_id);  // Pode pegar conta errada
```

### Depois (Custos.tsx - corrigido):
```typescript
import { useActiveAccount } from '@/contexts/ActiveAccountContext';

const { sellerId, activeAccount, accounts, setActiveAccount } = useActiveAccount();

// sellerId já vem do contexto global, sincronizado com o header
// Se precisar mudar, usa setActiveAccount(accountId) que atualiza globalmente
```

---

## Critérios de Aceite

1. Ao entrar no módulo de Custos, a conta exibida no dropdown corresponde à conta ativa no header
2. Ao trocar conta no módulo de Custos, o header também atualiza (e vice-versa)
3. A conta ADECONEXVV (que tem pedidos) é exibida corretamente com seus dados
4. Clicar em "Recalcular" processa os pedidos da conta correta e exibe os resultados
