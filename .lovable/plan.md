## Diagnóstico — instabilidade real encontrada

Lovable Cloud (banco/auth) está **saudável**. Mas o log do Postgres mostra 3 erros se repetindo nos últimos minutos, e dois deles explicam direto o que o cliente está sentindo:

| # | Erro no banco | Frequência | Impacto |
|---|---|---|---|
| 1 | `column ml_accounts.seller_id does not exist` | recorrente | **Bloqueia o sync automático de vendas no login** |
| 2 | `column meli_shipments_cache.date_created does not exist` | mais frequente (~20/min) | Quebra revalidação de envios travados + polui logs |
| 3 | `invalid input syntax for type uuid: "1411095727"` | menor | Algum lugar passando ML user_id numérico onde se espera UUID |

### Causa #1 — por que as vendas não puxam

`src/hooks/usePostLoginPrefetch.ts` (linha 109) consulta:
```ts
.from('ml_accounts').select('id, seller_id, nickname')
```
A coluna correta é **`ml_user_id`** (confirmei no schema). A consulta retorna erro, o array `accounts` fica vazio, e o disparo de `ml-sync-orders` no login **simplesmente nunca acontece** — exatamente o sintoma do cliente.

### Causa #2 — flood de erros no banco

`supabase/functions/shipping-status-sync/index.ts` (linha 283):
```ts
.or(`last_sync_at.lt.${stale24hCutoff},date_created.lt.${created5dCutoff}`)
```
A tabela `meli_shipments_cache` **não tem `date_created`** (só `last_sync_at`). Cada execução do cron de envios derruba a query.

### Sobre o `/ajuste-preco` não carregar

A edge function `ml-price-adjustment` está **correta** (usa `ml_user_id`). O motivo provável de "0 de 0" é que o cliente está com filtro/conta sem retorno OU o token ML expirou. Vou validar isso após o fix #1, porque o pre-fetch quebrado também invalida caches em cascata.

---

## Correção cirúrgica (mínima, só o necessário)

### Fix 1 — `src/hooks/usePostLoginPrefetch.ts`
Trocar `seller_id` por `ml_user_id` no `select` e no acesso `account.seller_id` → `account.ml_user_id`. Nenhuma outra alteração de lógica.

### Fix 2 — `supabase/functions/shipping-status-sync/index.ts`
Remover o trecho `,date_created.lt.${created5dCutoff}` do `.or(...)` na linha 283, mantendo apenas `last_sync_at.lt.${stale24hCutoff}`. Remover também a variável `created5dCutoff` se ficar órfã.

### Fix 3 — investigação do UUID "1411095727"
Após aplicar os dois acima, observar 10 min de logs. Esse erro pode ser efeito colateral do #1 (algum hook caindo num fallback ruim). Se persistir, abro fix dedicado — não vou mexer às cegas agora.

---

## Validação

1. Após deploy, abrir logs Postgres: os 2 erros de coluna devem zerar.
2. Conferir nos edge logs que `ml-sync-orders` é invocado no próximo login do cliente.
3. Pedir ao cliente para recarregar `/ajuste-preco` — se ainda vier "0 de 0", checo conexão ML dele (token/conta titular).

Mudanças são pontuais e não tocam regra de negócio nem RLS.