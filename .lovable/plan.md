

## Plano: Botão "Importar 30 dias" + Remover Passo 2

### Contexto
A aba Sincronização do módulo de Custos (`CostSettings.tsx`) possui hoje:
- **Step 0**: Botão "Importar Pedidos (1 ano)" — chama `orders-historical-import` com `days_back: 365`
- **Step 1**: Sincronizar Taxas (Billing) — `ml-sync-billing-details`
- **Step 2**: Calcular Custos Reais — `ml-sync-real-costs` (causa sobreposição de dados)

### Alterações

#### 1. Adicionar botão "Importar Pedidos (30 dias)"
**Arquivo: `src/components/custos/CostSettings.tsx`**

- Criar `handleStartHistoricalImport30d` — igual ao existente mas com `days_back: 30`
- Adicionar estado `startingHistorical30d` para loading independente
- No Card do Step 0, adicionar um segundo botão "Importar Pedidos (30 dias)" ao lado do botão de 1 ano
- O botão de 30 dias fica **sempre habilitado** (respeitando apenas loading e job running)
- O botão de 1 ano fica **desabilitado** enquanto o usuário estiver em trial (sem assinatura paga)

#### 2. Regra de habilitação do botão de 1 ano
- Importar o hook `useUserAccessState` no componente
- Ler `flags.has_active_subscription` para determinar se o usuário já pagou
- Se `has_active_subscription === false`, desabilitar o botão de 1 ano e mostrar tooltip/texto: *"Disponível após ativação do plano"*
- Se `has_active_subscription === true`, botão habilitado normalmente

#### 3. Remover Passo 2 (Opção A)
- Remover todo o bloco JSX do Card "Passo 2: Calcular Custos Reais" (linhas ~557-606)
- Remover estados e funções relacionados que ficam órfãos:
  - `realCostsState`, `coverage`, `backfillState`, `syncScope`
  - `loadRealCostsStatus`, `loadBackfillState`
  - `handleBackfillMissing`, `handleStartSync`, `handleContinueSync`, `handlePauseSync`, `handleResetSync`, `handleResetProgressOnly`
  - `getStatusBadge`, `formatLastActivity`
  - Variáveis derivadas: `progressPercent`, `isRunningOrPaused`, `canStart`, `allComplete`
  - Dialogs de reset (`showResetConfirm`, `showResetProgressConfirm`)
- Remover referências a `ml-sync-real-costs` do polling no `useEffect`
- **Manter** o Passo 1 (Billing) intacto — ele é seguro e alimenta o cache de billing

### Resultado esperado
A aba Sincronização terá:
1. **Importar Pedidos** — com dois botões: "30 dias" (sempre disponível) e "1 ano" (bloqueado em trial)
2. **Passo 1: Sincronizar Taxas (Billing)** — mantido como está
3. ~~Passo 2~~ — removido

