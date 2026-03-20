

# Diagnóstico e Correção: Sementes do ADECONEX.SP

## Diagnóstico

**As sementes NÃO foram perdidas.** Elas estão vinculadas à conta seller **ADECONEXVV** (66043362), não à **ADECONEX.SP** (1411095727).

Dados atuais no banco:

| Conta | Seller ID | Seeds disponíveis | Seeds usadas | Itens plantados |
|---|---|---|---|---|
| ADECONEXVV | 66043362 | 5 | 5 | 5 itens (dormantes) |
| ADECONEX.SP | 1411095727 | 5 | 0 | 0 |

O módulo Seed filtra por `seller_id` — quando o usuário troca para ADECONEX.SP na interface, vê o jardim vazio porque os plantios estão na outra conta.

**Causa provável:** O usuário plantou na conta ADECONEXVV e depois trocou a conta ativa para ADECONEX.SP, dando a impressão de perda.

## Correções

### 1. Adicionar tabelas Seed ao `admin-delete-user`

Incluir as seguintes tabelas na rotina de exclusão, antes da fase de exclusão de `profiles`:

```text
Nova fase (Seed + Pricing):
- send_metrics_snapshots (FK → send_planted_items)
- send_item_history
- send_planted_items
- send_seed_balance
- send_aplus_candidates
- send_seed_purchases
- pricing_simulation_results (via simulation_id)
- pricing_simulation_inputs (via simulation_id)
- pricing_simulations
```

### 2. (Opcional) Indicar na UI qual conta tem sementes plantadas

Sem mudança proposta agora — apenas comunicar ao usuário que as sementes estão na conta ADECONEXVV.

### Arquivo modificado
- `supabase/functions/admin-delete-user/index.ts`

