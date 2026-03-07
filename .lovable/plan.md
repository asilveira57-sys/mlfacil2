

## Diagnóstico Completo

### Causa Raiz: A tabela `tenants` está VAZIA

O motor de retrospectivas (`retrospective-engine`) segue este fluxo:
1. Busca tenants ativos → **0 resultados** → retorna "No active tenants" → nada é gerado
2. Para cada tenant, busca companies com `tenant_id = tenant.id`
3. Para cada company, busca seller_id via `marketplace_accounts` ou `ml_accounts`

O problema é que **nenhuma company tem `tenant_id` preenchido** — todas estão com `tenant_id = NULL`. E a tabela `tenants` nunca foi populada. Logo o motor não encontra nenhum dado para processar.

Além disso, as RLS policies usam `is_tenant_member(auth.uid(), tenant_id)`, que também retorna `false` pois não existe tenant vinculado. Isso explica por que a busca no admin também não mostra resultados.

### Dados Atuais no Banco

| Tabela | Registros | Problema |
|--------|-----------|----------|
| `tenants` | **0** | Nunca populada |
| `companies` | 5 (todas com `tenant_id = NULL`) | Sem vínculo com tenants |
| `ml_accounts` | 4 (com `company_id` válido) | OK |
| `marketplace_accounts` | **0** | Tabela vazia (fallback para ml_accounts funciona) |
| `retrospectives` | **0** | Motor nunca gerou nada |
| `retrospective_snapshots` | **0** | Idem |
| `retrospective_rules` | 10 | OK, todas ativas |

### O que está quebrando a cadeia

```text
tenants (vazio) → motor sai imediatamente
companies.tenant_id (null) → JOIN com tenants falha
RLS: is_tenant_member(uid, tenant_id) → tenant_id é null → acesso negado
```

---

## Plano de Correção

### 1. Migration: Popular tenants e vincular companies

Criar um tenant para cada `user_id` distinto na tabela `companies`, usando os dados de trial que já existem nas companies. Depois, atualizar `companies.tenant_id` com o tenant correspondente.

```sql
-- Para cada user_id distinto em companies, criar um tenant
INSERT INTO tenants (id, name, owner_user_id, status, trial_started_at, trial_ends_at, created_at, updated_at)
SELECT
  gen_random_uuid(),
  c.display_name,
  c.user_id,
  'active',
  c.trial_started_at,
  c.trial_ends_at,
  c.created_at,
  now()
FROM companies c
WHERE c.is_primary = true AND c.user_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Atualizar tenant_id nas companies
UPDATE companies c SET tenant_id = t.id
FROM tenants t WHERE t.owner_user_id = c.user_id AND c.tenant_id IS NULL;
```

### 2. Migration: Criar tenant_members para os owners

```sql
INSERT INTO tenant_members (tenant_id, user_id, role)
SELECT id, owner_user_id, 'owner'
FROM tenants
ON CONFLICT DO NOTHING;
```

Isso resolve tanto o motor quanto as RLS policies.

### 3. Trigger: Auto-criar tenant no signup de novos usuários

Criar um trigger (ou ajustar o existente `handle_new_user_setup`) para que ao criar uma company, se não existir tenant, crie automaticamente e vincule.

### 4. Atualizar o engine para fallback sem tenant

Como medida de resiliência, ajustar o engine para também buscar companies sem tenant (usando `user_id` direto) caso o tenant não exista — evitando que o motor fique silenciosamente parado novamente.

### 5. Ajustar RLS para admin acessar todas as retrospectivas

Adicionar policy que permita admin (via `has_role`) ler todas as retrospectivas, independente de tenant:

```sql
CREATE POLICY "admin_read_all" ON retrospectives FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));
```

Mesma policy para `retrospective_snapshots`, `retrospective_targets`.

---

## Resumo de Alterações

| Componente | Mudança |
|------------|---------|
| **Migration SQL** | Popular `tenants` a partir de `companies`, vincular `tenant_id`, criar `tenant_members` |
| **Migration SQL** | Trigger para auto-criar tenant ao criar company |
| **Migration SQL** | RLS admin para retrospectives, snapshots, targets |
| **Edge Function** `retrospective-engine` | Fallback para buscar companies sem tenant |

### Resultado Esperado
Após a migration, o botão "Forçar Geração" no admin vai encontrar os tenants, as companies vinculadas, os seller_ids via `ml_accounts`, e gerar as retrospectivas. O admin também poderá visualizar todos os resultados.

