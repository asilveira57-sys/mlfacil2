

## Plano: Novo botão "Atualizar 1 a 1 (seguro)" com seleção à direita

### Problema
Os 3 fluxos existentes (batch à esquerda, reimport, e "Atualizar selecionados") continuam zerando dados. O usuário precisa de um modo alternativo que processe pedido a pedido via `resync_single` (que funciona, embora lento) -- controlado por seleção à direita.

### Solução
Criar um segundo sistema de seleção (checkboxes à direita, na coluna de ações) com um botão "Atualizar 1 a 1" que processa sequencialmente usando `resync_single` + `calculateSingleOrder` no frontend, sem passar pelo sistema de bulk jobs do backend.

### Implementação

**Arquivo: `src/components/custos/CostOrders.tsx`**

1. **Novo estado de seleção à direita** (separado do `selectedOrders` existente à esquerda):
   - `safeSelectedOrders: Set<string>` -- checkboxes na coluna de ações (direita)
   - `safeProcessing: boolean`, `safeProgress: { current, total, currentOrderId, errors }` -- progresso
   - Checkbox em cada linha na coluna de ações + checkbox "selecionar todos da página" no header da coluna de ações

2. **"Selecionar todos" com suporte a todas as páginas**:
   - Checkbox na página seleciona os 50 da página
   - Banner "Selecionar todos os X pedidos" aparece quando toda a página está marcada (reutiliza API `ids_only`)
   - Ambos os modos disponíveis conforme solicitado

3. **Barra de ação fixa** (aparece quando `safeSelectedOrders.size > 0`):
   - Botão: "Atualizar 1 a 1 (seguro)" -- processa sequencialmente
   - Progress bar com contador `3/50` e nome do pedido atual
   - Botão "Cancelar" para parar a qualquer momento
   - Botão "Limpar seleção"

4. **Lógica de processamento sequencial** (roda no frontend, `handleSafeResync`):
   - Para cada pedido:
     a. Chama `supabase.functions.invoke('ml-sync-real-costs', { body: { action: 'resync_single', seller_id, order_id } })`
     b. A cada 10 pedidos processados, chama `cost-engine/calculate-order` para consolidar custos
     c. Atualiza progresso na UI
   - **Em caso de erro**: retry até 2x com delay de 2s; se continuar falhando, registra erro e continua para o próximo
   - **Cancelamento**: flag `cancelledRef` que é verificada antes de processar o próximo pedido
   - **No final**: recalcula os pedidos restantes (que não foram recalculados no lote de 10), invalida cache, recarrega lista

5. **UI da coluna de ações** (direita):
   - Adicionar checkbox antes dos botões existentes (RotateCw e Trash2)
   - Header da coluna: checkbox de "selecionar todos da página"
   - Os botões individuais (RotateCw, Trash2) permanecem inalterados

### Detalhes Técnicos

```text
Fluxo por pedido:
  1. resync_single (ML API → financials_cache + shipment_cache)
  2. A cada 10: calculateSingleOrder (consolida breakdown com impostos/embalagem/custo)
  3. No final: recalcula pedidos restantes do último bloco incompleto

Retry:
  Erro → espera 2s → retry 1 → espera 2s → retry 2 → pula e registra

Cancelamento:
  cancelRef.current = true → loop para no próximo pedido
```

### Arquivos modificados
- `src/components/custos/CostOrders.tsx` -- novo sistema de seleção à direita, barra de ação, lógica sequencial

Nenhuma alteração no backend. Usa endpoints existentes (`resync_single` + `calculate-order`).

