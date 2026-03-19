

## Plano: Corrigir Canal Oficial — Comunicados retroativos e segmentação

### Dois problemas identificados

**Problema 1**: Comunicados globais (`target_seller_id = NULL`) aparecem para **todos os sellers**, inclusive novos que entram meses depois. Acumulação infinita — em 1 ano poderiam ser 100+ mensagens retroativas na caixa de um seller novo.

**Problema 2**: O comunicado do agente de promoções ("Agente aderiu a 5 produtos") usa `target_seller_id = sellerId` (ML user ID numérico), mas o filtro no frontend compara com `external_user_id` da `marketplace_accounts`. Se o match funcionar, ok, mas precisa garantir que **só o seller dono** vê.

---

### Solução

#### 1. Comunicados globais viram "snapshot no tempo"

Adicionar coluna `published_at` na tabela `mktpfacil_announcements`. No filtro do frontend, comunicados globais só aparecem para sellers cujo `profiles.created_at` é **anterior** ao `published_at` do comunicado.

Regra: se o seller entrou depois que o comunicado foi publicado, ele **não vê**.

| Mudança | Detalhe |
|---|---|
| Migration SQL | Adicionar coluna `published_at timestamptz DEFAULT now()` |
| Migration SQL | Preencher `published_at = created_at` nos comunicados existentes |
| `useOfficialChannel.ts` | No filtro de globais, buscar `profiles.created_at` do user e comparar com `published_at` |

#### 2. Segmentação por seller continua funcionando

O `target_seller_id` já funciona — o agente de promoções grava o ML seller ID e o frontend compara com `external_user_id`. Apenas confirmar que o match está correto (ambos usam o mesmo ID numérico do ML).

#### 3. Auto-desativar comunicados antigos (opcional mas recomendado)

Adicionar coluna `expires_at timestamptz NULL`. Comunicados com `expires_at < now()` são automaticamente filtrados no frontend. Isso evita acúmulo mesmo para sellers antigos.

| Mudança | Detalhe |
|---|---|
| Migration SQL | Adicionar coluna `expires_at timestamptz NULL` |
| `useOfficialChannel.ts` | Filtrar `expires_at IS NULL OR expires_at > now()` |
| Admin Canal Oficial | Campo opcional "Expira em" no formulário de criação |

---

### Arquivos afetados

| Arquivo | Mudança |
|---|---|
| Migration SQL | `published_at`, `expires_at` colunas novas + backfill |
| `src/hooks/useOfficialChannel.ts` | Filtro: globais só para sellers criados antes do `published_at`; respeitar `expires_at` |
| `src/pages/admin/AdminCanalOficial.tsx` | Campo "Expira em" no formulário |
| `supabase/functions/promotion-agent-run/index.ts` | Nenhuma mudança necessária — já segmenta corretamente |

### Resultado

- Seller novo entra → caixa vazia (zero mensagens retroativas)
- Comunicado global → entregue apenas a quem estava no sistema no momento
- Comunicado do agente → continua indo só pro seller alvo
- Comunicados antigos → expiram automaticamente se configurado

