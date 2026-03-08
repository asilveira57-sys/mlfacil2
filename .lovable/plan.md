

## Diagnóstico

Dois problemas distintos identificados:

### Problema 1: Erros `seller_id is required`

O componente `CostSettings` recebe `sellerId` como prop (que vem como `""` de `Custos.tsx` via `sellerId || ''`). O `useEffect` na linha 61 executa imediatamente e chama `loadBillingStatus()` e `loadHistoricalJobStatus()` com `seller_id: ""`. Além disso, o polling de 3 segundos continua chamando com string vazia.

**Correção**: Adicionar guard `if (!sellerId) return;` nas funções `loadBillingStatus` e `loadHistoricalJobStatus`, e no useEffect.

### Problema 2: Restrição de trial nos botões de billing

Atualmente existem dois botões: "Últimos 12 Meses" e "Histórico Completo". Durante o período de teste, ambos devem ficar desabilitados. Deve existir um botão "Últimos 30 Dias" que fica ativo durante trial.

O componente já tem `hasActiveSubscription` via `useUserAccess()`.

---

## Plano

### Arquivo: `src/components/custos/CostSettings.tsx`

**1. Guard contra seller_id vazio**

- `loadBillingStatus`: adicionar `if (!sellerId) return;` no início
- `loadHistoricalJobStatus`: adicionar `if (!sellerId) return;` no início
- `useEffect` (linha 61): adicionar `if (!sellerId) return;` antes das chamadas

**2. Botões de billing com restrição de trial**

Substituir os dois botões atuais (linhas 514-521) por três botões:

| Botão | Scope | Trial | Assinatura ativa |
|-------|-------|-------|-----------------|
| Últimos 30 Dias | `"30d"` (novo) | Ativo | Ativo |
| Últimos 12 Meses | `"recent"` | Desabilitado + ícone Lock | Ativo |
| Histórico Completo | `"history"` | Desabilitado + ícone Lock | Ativo |

- Tooltip nos botões desabilitados: "Disponível após ativar um plano"
- `handleSyncBilling` já passa o `scope` para a edge function

**3. Edge function `ml-sync-billing-details`**: Verificar se o scope `"30d"` é tratado. Se não, adicionar lógica para limitar o range a 30 dias quando `scope === "30d"`.

### Arquivo: `supabase/functions/ml-sync-billing-details/index.ts`

Adicionar tratamento para `scope === "30d"` — limitar a busca aos últimos 30 dias de períodos de billing (em vez dos 12 meses do "recent").

