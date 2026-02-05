
# Diagnóstico e Correção: Perguntas, Conta Ativa e Ícone de Atenção

## 3 Problemas Identificados com Causa Raiz

### Problema 1: Perguntas nao sincronizam (0 perguntas)
**Causa raiz:** A funcao `ml-token-refresh` NAO ESTA DEPLOYADA (retorna 404). Alem disso, o `ml-sync-questions` chama essa funcao com `{ seller_id }`, mas ela espera `{ accountId }` (UUID). Resultado: o token nunca e renovado, a API do ML retorna 403, zero perguntas sao importadas.

Evidencia dos logs:
```
ML API error for unanswered: 403
Total questions to sync: 0
```

Tambem: `ml-token-refresh` ainda usa `import from "https://esm.sh/..."` que causa timeout no deploy.

### Problema 2: Conta ativa nao e salva entre sessoes
**Causa raiz:** No `ActiveAccountContext.tsx` linha 218:
```typescript
let active = loadedAccounts.find(a => a.id === persistedId && a.status === 'connected');
```
Como ambas as contas tem tokens expirados, o `mapMlAccountToUnified` muda o status de `connected` para `attention`. Resultado: a busca por `status === 'connected'` falha, o sistema ignora a conta salva e pega a primeira da lista.

### Problema 3: Icone de exclamacao (Atencao)
**Causa raiz:** Em `accountUnification.ts` linha 315-319, se o token esta expirado (`token_expires_at < now()`), o status e sobrescrito de `connected` para `attention`. Como o `ml-token-refresh` nunca roda com sucesso (404), os tokens ficam permanentemente expirados e o icone de alerta aparece em todas as contas.

Os 3 problemas sao consequencia da MESMA causa raiz: **a funcao de refresh de token nao esta funcionando**.

---

## Correcoes

### Correcao 1: Corrigir e deployar `ml-token-refresh`

**Arquivo:** `supabase/functions/ml-token-refresh/index.ts`

- Trocar `import { createClient } from "https://esm.sh/@supabase/supabase-js@2"` por `import { createClient } from "npm:@supabase/supabase-js@2"` (resolve timeout no deploy)
- Manter a logica existente que ja funciona corretamente

### Correcao 2: Corrigir chamada do token refresh em `ml-sync-questions`

**Arquivo:** `supabase/functions/ml-sync-questions/index.ts`

O codigo atual (linhas 128-143):
```typescript
const refreshResponse = await fetch(`${supabaseUrl}/functions/v1/ml-token-refresh`, {
  body: JSON.stringify({ seller_id }),  // ERRADO - funcao espera { accountId }
});
if (refreshData.access_token) {  // ERRADO - funcao retorna { accessToken }
```

Corrigir para:
```typescript
const refreshResponse = await fetch(`${supabaseUrl}/functions/v1/ml-token-refresh`, {
  body: JSON.stringify({ accountId: account_id }),  // UUID correto
});
if (refreshData.accessToken) {  // Campo correto do response
  accessToken = refreshData.accessToken;
}
```

Tambem adicionar log quando o refresh falhar para facilitar debug futuro.

### Correcao 3: Aceitar status `attention` na recuperacao da conta persistida

**Arquivo:** `src/contexts/ActiveAccountContext.tsx`

Alterar linha 218 de:
```typescript
let active = loadedAccounts.find(a => a.id === persistedId && a.status === 'connected');
```
Para:
```typescript
let active = loadedAccounts.find(a => a.id === persistedId && (a.status === 'connected' || a.status === 'attention'));
```

E alterar o fallback na linha 222 de:
```typescript
active = loadedAccounts.find(a => a.status === 'connected');
```
Para:
```typescript
active = loadedAccounts.find(a => a.status === 'connected' || a.status === 'attention');
```

Isso garante que a conta escolhida pelo usuario seja mantida mesmo com token expirado (ja que o sistema renova o token automaticamente ao usar).

### Correcao 4: Tratar resposta "0 perguntas" com campo `pending` correto

**Arquivo:** `supabase/functions/ml-sync-questions/index.ts`

O retorno antecipado quando nao ha perguntas (linha ~180) nao inclui o campo `pending`, causando "undefined pendente(s)" no toast:
```typescript
// Antes:
return { success: true, synced: 0, message: "No questions to sync" }
// Depois:
return { success: true, synced: 0, pending: 0, answered: 0, message: "No questions to sync" }
```

---

## Resumo dos Arquivos a Modificar

1. `supabase/functions/ml-token-refresh/index.ts` - Corrigir import esm.sh para npm:
2. `supabase/functions/ml-sync-questions/index.ts` - Passar `accountId` (UUID) no refresh + corrigir campo de resposta + incluir `pending` no retorno vazio
3. `src/contexts/ActiveAccountContext.tsx` - Aceitar `attention` ao recuperar conta persistida

## Fluxo Corrigido

```text
  Usuario abre Perguntas e clica "Atualizar"
       |
       v
  ml-sync-questions recebe (seller_id + account_id)
       |
       v
  Chama ml-token-refresh com { accountId: UUID }
       |
       v
  Token renovado com sucesso -> token_expires_at atualizado
       |
       v
  API ML chamada com token valido -> perguntas retornadas
       |
       v
  Perguntas upserted no banco -> UI atualizada
       |
       v
  connection_status volta para 'connected' -> icone de atencao some
```

## Resultado Esperado

- Perguntas sincronizam normalmente ao clicar "Atualizar"
- A conta selecionada e lembrada entre sessoes
- O icone de atencao desaparece apos o primeiro refresh de token bem-sucedido
- Toast mostra "X pergunta(s) sincronizada(s). Y pendente(s)." sem "undefined"
