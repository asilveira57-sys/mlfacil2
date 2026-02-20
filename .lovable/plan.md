
# Corrigir: Hora de Corte nao aparece

## Problema Raiz

O card de Hora de Corte nao aparece porque o hook `useShippingCutoff` depende de `activeCompanyId` vindo de `useUserContext()`, mas o campo `active_company_id` na tabela `user_context` esta **nulo** para o usuario logado.

Fluxo atual:
1. `useShippingCutoff` chama `useUserContext()` para obter `activeCompanyId`
2. `activeCompanyId` retorna `null` (campo vazio no banco)
3. O guard `if (!activeCompanyId || !sellerId || !mlUserId) return;` impede a chamada
4. `data` permanece `null`, e o componente retorna `null` (invisivel)

A conta ML (`ADECONEX.SP`) tem `company_id` preenchido no banco (`331c2e24-...`), mas esse valor nunca foi populado em `user_context`.

## Solucao

Modificar o hook `useShippingCutoff` para **derivar o `company_id` diretamente da conta ML ativa** em vez de depender do `user_context`. Isso elimina a dependencia fragil e garante que funcione para todos os usuarios.

### Alteracoes

**1. `src/hooks/useShippingCutoff.ts`**
- Adicionar um novo parametro `companyId` na interface `UseShippingCutoffOptions`
- Remover a dependencia de `useUserContext()` dentro do hook
- Usar o `companyId` recebido diretamente como parametro

**2. `src/pages/ShippingLabels.tsx`**
- Buscar o `company_id` da conta ativa (`activeAccount`) que ja esta disponivel no contexto
- Passar como parametro para `useShippingCutoff`

**3. `src/contexts/ActiveAccountContext.tsx`**
- Expor `companyId` da conta ativa no contexto (o campo `company_id` ja existe em `ml_accounts` mas nao esta mapeado no tipo `ActiveAccount`)

### Detalhes Tecnicos

No `ActiveAccount` interface, adicionar o campo `companyId`:
```typescript
export interface ActiveAccount {
  // ... campos existentes
  companyId: string | null;
}
```

No `loadAccounts`, mapear:
```typescript
companyId: acc.companyId ?? null,
```

Sera necessario verificar se `accountUnification.ts` ja retorna esse campo e, se nao, adiciona-lo.

No `useShippingCutoff`, a interface muda para:
```typescript
interface UseShippingCutoffOptions {
  sellerId: string | null;
  mlUserId: string | null;
  companyId: string | null;
}
```

E o hook usa `companyId` diretamente em vez de `useUserContext().activeCompanyId`.

Na pagina `ShippingLabels.tsx`:
```typescript
useShippingCutoff({
  sellerId: activeAccount?.id || null,
  mlUserId: sellerId || null,
  companyId: activeAccount?.companyId || null,
});
```

### Bonus: Corrigir `user_context` para o futuro

Tambem sera necessario garantir que o `active_company_id` seja populado no `user_context` quando o usuario seleciona uma conta, para que outros modulos que dependam dele funcionem. Isso sera feito no `persistActiveAccount` do `ActiveAccountContext`, derivando o `company_id` da conta selecionada.
