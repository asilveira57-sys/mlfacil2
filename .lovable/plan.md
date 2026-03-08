

## Diagnóstico Confirmado

Os logs mostram exatamente o problema:

```
WARNING [cost-engine] ml-sync-real-costs failed for order 2000015449858040: 401 {"error":"Invalid token"}
WARNING [cost-engine] ml-sync-real-costs failed for order 2000015443111264: 401 {"error":"Invalid token"}
WARNING [cost-engine] ml-sync-real-costs failed for order 2000015442117152: 401 {"error":"Invalid token"}
```

**Causa**: O `cost-engine` chama `ml-sync-real-costs` com `Authorization: Bearer ${serviceKey}` (chave de serviço). Mas o `ml-sync-real-costs` tenta autenticar como JWT de usuário via `auth.getUser()` — que falha porque service role key não é um token de usuário. Resultado: 401 em todas as chamadas, dados nunca são atualizados.

---

## Plano de Correção

### 1. Adicionar autenticação interna ao `ml-sync-real-costs`

**Arquivo:** `supabase/functions/ml-sync-real-costs/index.ts`

Antes da verificação de auth (linha 24-42), adicionar detecção de chamada interna:

```text
Se header 'x-internal-key' === SUPABASE_SERVICE_ROLE_KEY:
  → user_id vem do body (body.user_id)
  → pula auth.getUser()
  → continua normalmente
Senão:
  → fluxo atual com JWT do usuário
```

Isso é o mesmo padrão já usado no `cost-engine` (linha 29-36) para suas rotas internas.

### 2. Ajustar chamada no `cost-engine`

**Arquivo:** `supabase/functions/cost-engine/index.ts` (linhas 1993-2005)

Trocar o header de `Authorization: Bearer ${serviceKey}` para `x-internal-key: ${serviceKey}`, e garantir que `user_id` vai no body.

### Resultado

A cadeia fica:
```text
Usuário seleciona pedidos → "Atualizar selecionados"
  → cost-engine cria job (resync)
  → processChunkAndContinue chama ml-sync-real-costs com x-internal-key
  → ml-sync-real-costs reconhece chamada interna, usa user_id do body
  → busca billing/shipping real na API do ML
  → calculateSingleOrder consolida
  → dados atualizados ✅
```

