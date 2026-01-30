

## Problema Identificado

A Edge Function `ad-action-execute` **não está registrada no `supabase/config.toml`**.

### Diagnóstico

| Componente | Status |
|------------|--------|
| Código da função (`supabase/functions/ad-action-execute/index.ts`) | ✅ Correto - contém toda a lógica de MLBU que implementamos |
| Registro no config.toml | ❌ **FALTANDO** - a função não está listada |
| Outras funções relacionadas | ❌ `ad-item-snapshot` e `ad-timeline-recalculate` também faltam |

### Fluxo atual do "Clonar por Link"

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ 1. Usuário cola link e clica "Criar Rascunho"                                │
│    └─> CloneByLinkDialog.tsx                                                 │
│        └─> Insere registro DRAFT em ad_lifecycle_actions                     │
│            (funciona corretamente ✓)                                         │
├──────────────────────────────────────────────────────────────────────────────┤
│ 2. Usuário vai em "Rascunhos" e clica "Executar"                             │
│    └─> AdActionsCenter.tsx > handleConfirmExecute()                          │
│        └─> useExecuteAction() mutation (src/hooks/useAdTimeline.ts:303)      │
│            └─> supabase.functions.invoke('ad-action-execute', {...})         │
│                └─> Edge Function (pode estar desatualizada!)                 │
└──────────────────────────────────────────────────────────────────────────────┘
```

O código no frontend chama a função corretamente, e o código da Edge Function está correto. 
**O problema é que a função pode não estar deployada com as últimas alterações** porque não está no `config.toml`.

---

## Solução

Adicionar as 3 funções de ad-lifecycle ao `supabase/config.toml`:

```toml
[functions.ad-action-execute]
verify_jwt = false

[functions.ad-item-snapshot]
verify_jwt = false

[functions.ad-timeline-recalculate]
verify_jwt = false
```

### Por que `verify_jwt = false`?

A autenticação JWT já é validada **dentro** da própria função (linha 146-162 do `index.ts`), que:
1. Lê o header `Authorization`
2. Chama `supabase.auth.getUser(token)` para validar
3. Rejeita com 401 se inválido

Essa abordagem é consistente com as outras Edge Functions do projeto e permite maior flexibilidade no tratamento de erros.

---

## Verificação de Segurança

O código atual já implementa:

1. **Autenticação**: Valida token JWT manualmente (linhas 146-162)
2. **Autorização**: Busca ação pelo ID e verifica status (linhas 174-196)
3. **Limite diário**: Conta ações executadas hoje e bloqueia se exceder limite (linhas 221-238)
4. **Confirmação dupla**: Requer `confirm: true` antes de executar (linhas 207-218)

---

## Ações a Executar

1. **Editar `supabase/config.toml`** - Adicionar as 3 entradas de função
2. **Redeploy** - O sistema fará o deploy automaticamente após a edição
3. **Testar** - Executar novamente o fluxo de clonagem MLBU para validar

---

## Arquivos a Modificar

| Arquivo | Ação |
|---------|------|
| `supabase/config.toml` | Adicionar entradas para `ad-action-execute`, `ad-item-snapshot`, `ad-timeline-recalculate` |

---

## Teste Recomendado

Após o deploy:
1. Criar um novo rascunho com link MLBU
2. Ir em Rascunhos > Executar
3. Verificar nos logs da Edge Function se aparecem os logs:
   - `[ad-action-execute] Detected CATALOG ID: MLBU...`
   - `[ad-action-execute] /products/MLBU... status: ...`
   - `[ad-action-execute] buy_box_winner.item_id resolved: MLB...`

