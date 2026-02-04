
# Plano: Corrigir Erro de UUID na Clonagem de Anúncios

## Diagnóstico

O erro `"invalid input syntax for type uuid: '66043362'"` ocorre porque:

1. A página `AdTimelineRadar.tsx` obtém o `sellerId` do contexto `useActiveAccount()` (linha 149)
2. Este `sellerId` é o **ID numérico** do vendedor no Mercado Livre (ex: "66043362")
3. Ao criar uma ação de clonagem, o código passa este ID numérico diretamente para o campo `ml_account_id` da tabela `ad_lifecycle_actions`
4. A tabela `ad_lifecycle_actions` exige um **UUID** (ex: "997e5eb2-8abd-4a08-9c17-977acbce7cc1")

## Fluxo Atual (com bug)

```text
useActiveAccount() → sellerId = "66043362" (numérico)
                          ↓
handleConfirmAction() → createActionMutation({ mlAccountId: "66043362" })
                          ↓
useCreateAction() → INSERT ml_account_id = "66043362" ← ERRO!
```

## Fluxo Corrigido

```text
useActiveAccount() → sellerId = "66043362" (numérico)
                          ↓
handleConfirmAction() → createActionMutation({ mlAccountId: "66043362" })
                          ↓
useCreateAction() → resolveMlAccountUuid("66043362") → UUID
                          ↓
                   INSERT ml_account_id = "997e5eb2-..." ← OK!
```

---

## Alteração Necessária

### Arquivo: `src/hooks/useAdTimeline.ts`

Modificar a função `useCreateAction` para:
1. Chamar `resolveMlAccountUuid(mlAccountId)` antes do insert
2. Usar o UUID resolvido no campo `ml_account_id`

**Código atual (linhas 306-322):**
```javascript
const { data, error } = await supabase
  .from('ad_lifecycle_actions')
  .insert([{
    workspace_id: workspaceId,
    ml_account_id: mlAccountId,  // ← BUG: ID numérico
    item_id: itemId,
    ...
  }])
```

**Código corrigido:**
```javascript
// Resolver seller_id numérico para UUID
const mlAccountUuid = await resolveMlAccountUuid(mlAccountId);
if (!mlAccountUuid) {
  throw new Error('Conta do Mercado Livre não encontrada');
}

const { data, error } = await supabase
  .from('ad_lifecycle_actions')
  .insert([{
    workspace_id: workspaceId,
    ml_account_id: mlAccountUuid,  // ← CORRETO: UUID
    item_id: itemId,
    ...
  }])
```

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/hooks/useAdTimeline.ts` | Adicionar resolução de UUID em `useCreateAction` |

---

## Impacto

- **Baixo risco**: Apenas uma linha de código + validação
- **Sem alteração de schema**: A tabela já espera UUID
- **Consistência**: Segue o mesmo padrão usado em `useAdTimelineStats` e `useAdTimelineBucketCounts`

## Resultado Esperado

Após a correção:
- Clonagem de anúncios funcionará corretamente
- O rascunho será criado com o UUID correto no campo `ml_account_id`
- Compatibilidade com políticas RLS mantida
