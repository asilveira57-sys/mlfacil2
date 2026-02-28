

## Diagnóstico e Plano de Correção

### Problema 1: Conta ML mostrando "Desconectada" após reconexão

**Causa raiz:** O fluxo de OAuth (`ml-oauth-callback`) ao reconectar define `connection_status: 'connected'` e `is_active: true`, mas **não define `is_connected: true`**. O fluxo de desconexão (`SettingsCompanies.tsx` linha 341) define `is_connected: false`. Após reconectar, `is_connected` permanece `false`.

Dado confirmado no banco:
```text
ADECONEXVV (66043362):
  is_connected: false    ← errado
  connection_status: connected
  is_active: true
  token_expires_at: 2026-02-28 19:00  ← válido
```

**Correção:**
- Adicionar `is_connected: true` no `updateData` do `ml-oauth-callback/index.ts` (linha 126-141) para reconexões
- Adicionar `is_connected: true` no `insertData` (linha 161-175) para novas contas
- Corrigir o registro atual no banco via migration: `UPDATE ml_accounts SET is_connected = true WHERE is_active = true AND connection_status = 'connected'`

---

### Problema 2: Mensagem do Dia ignorando tema configurado

**Causa raiz:** No `useDailyMessage.ts`, a query da mensagem (`daily-message`) tem `enabled: !!userId && preferences?.exibir_mensagem !== false`. Como `undefined !== false` é `true`, a query roda **antes** das preferências carregarem. Nesse momento `preferences?.tema_preferido` é `undefined`, então o filtro `if (tema)` não é aplicado, e uma mensagem aleatória de qualquer tema é escolhida e gravada no `message_daily_log`.

Dado confirmado:
```text
Preferência: tema_preferido = 'crista'
Mensagem ontem: tema = 'raul_inspirado' (errado)
Mensagem anteontem: tema = 'atitude' (errado)
```

**Correção:**
- No `useDailyMessage.ts`, alterar a condição `enabled` da query `daily-message` para exigir que as preferências tenham sido carregadas: `enabled: !!userId && preferences !== undefined && preferences?.exibir_mensagem !== false`
- Isso garante que o `tema_preferido` já está disponível quando a mensagem é selecionada

---

### Resumo das alterações

| Arquivo | Alteração |
|---|---|
| `supabase/functions/ml-oauth-callback/index.ts` | Adicionar `is_connected: true` no update e insert |
| `src/hooks/useDailyMessage.ts` | Aguardar preferências carregarem antes de buscar mensagem |
| Migration SQL | Corrigir registros existentes com `is_connected = false` mas `connection_status = 'connected'` |

