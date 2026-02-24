

# Corrigir limite diario artificial no ml-worker-process

## Diagnostico

O worker (`ml-worker-process/index.ts`, linha 191) impoe um limite de **500 eventos/dia por conta**:

```
const dailyLimit = featureFlags.daily_event_limit || 500;
```

A ADECONEXVV (seller 66043362) ja atingiu 500/500 hoje e o worker esta reagendando todos os eventos para amanha 6h. Isso causa dados obsoletos no Sandbox e em todos os modulos que dependem do cache.

A API do Mercado Livre **nao tem esse limite**. Ela usa rate limit por requisicao (HTTP 429), que o worker ja trata com retry/backoff. O limite de 500 e uma trava artificial do codigo.

## Solucao

### 1. Aumentar o limite padrao

No arquivo `supabase/functions/ml-worker-process/index.ts`, linha 191:

**De:**
```typescript
const dailyLimit = featureFlags.daily_event_limit || 500;
```

**Para:**
```typescript
const dailyLimit = featureFlags.daily_event_limit || 5000;
```

Isso permite ate 5000 eventos/dia por conta como padrao, suficiente para contas de alto volume.

### 2. Resetar o contador da ADECONEXVV agora

Executar um UPDATE no banco para zerar o `daily_events_count` da ADECONEXVV, desbloqueando o processamento imediatamente sem esperar amanha:

```sql
UPDATE ml_integrations
SET daily_events_count = 0,
    daily_events_reset_at = now()
WHERE ml_user_id = '66043362';
```

### 3. Atualizar o feature_flags da conta para limite maior (opcional)

Se quiser um limite especifico por conta (ex: ADECONEXVV precisa de mais que outras):

```sql
UPDATE ml_integrations
SET feature_flags = feature_flags || '{"daily_event_limit": 10000}'::jsonb
WHERE ml_user_id = '66043362';
```

## Arquivos alterados

| Arquivo | Mudanca |
|---------|---------|
| `supabase/functions/ml-worker-process/index.ts` | Limite padrao de 500 para 5000 |

## Resultado esperado

- ADECONEXVV volta a processar eventos imediatamente apos o reset
- O Sandbox e demais modulos recebem dados atualizados
- Contas de alto volume nao sao mais bloqueadas prematuramente

