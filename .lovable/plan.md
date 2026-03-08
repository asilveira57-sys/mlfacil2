

## Diagnóstico Completo: Módulos, Logs, Colaboradores e Permissões

### Situação Atual

**34 módulos ativos** (não-internos, com rota) existem na tabela `system_modules`. O sistema RBAC já funciona com a cadeia: `access_profiles` → `profile_permissions` → `system_features` → `system_modules`.

### Problemas Identificados

**1. MODULE_CATALOG em `src/types/collaborator.ts` está obsoleto**
O arquivo usa keys antigas hardcoded (`vendas`, `tarefas`, `mercado_ads`, etc.) que **não correspondem** às keys reais do banco (`marketplace.sales.orders`, `operacional.tasks`, `marketplace.growth.ads`). Este catálogo é usado pelo `CollaboratorModuleGrid.tsx` mas está desconectado do sistema RBAC real.

**2. MODULE_ROUTE_MAP em `useCollaboratorAccess.ts` está incompleto**
Faltam rotas para vários módulos novos:
- Financeiro (6 módulos: resumo, recebimentos, movimentos, conciliacao, rotinas, integracoes)
- Ferramentas (trends_lite, pricing_calc, commissions_calc, social_calendar, consultant_library)  
- Marketplace: comissões, ajuste de preço, atacado, seed, etiqueta_full
- Início, Sandbox

**3. `operacional.tasks` não tem features (0 registros)**
Único módulo ativo sem nenhuma feature vinculada — colaboradores nunca teriam acesso via RBAC.

**4. `useCollaborators.ts` tem TODOs pendentes**
- `createCollaborator`: "TODO: Assign profile via company_users + profile_permissions"
- `updateModuleAccess`: apenas mostra toast, não faz nada

**5. Desacoplamento menu vs. arquitetura**
O `system_modules` já tem `sort_order`, `parent_module_id`, `name`, `icon_key` que são campos de apresentação. As keys (`marketplace.financial.costs`) são estáveis e usadas para permissões/logs. Renomear/reordenar via Menu Builder já é seguro. Porém, o `MODULE_ROUTE_MAP` hardcoded no frontend cria acoplamento — se uma rota mudar no banco, o guard quebra.

---

### Plano de Implementação

#### Tarefa 1 — Gerar features para `operacional.tasks`
- Migração SQL para inserir features (view, edit, execute) no módulo de Tarefas, igual aos demais módulos.

#### Tarefa 2 — Eliminar MODULE_CATALOG hardcoded
- Remover `MODULE_CATALOG` de `src/types/collaborator.ts`
- `CollaboratorModuleGrid.tsx` deve consumir os módulos dinâmicos do banco via `useSystemModules()` (já existe) ou query direta a `system_modules` (filtrando `is_active=true`, `is_internal_only=false`, com rota)
- Assim, quando o admin adicionar/remover módulos no Menu Builder, o grid de colaboradores reflete automaticamente

#### Tarefa 3 — Tornar MODULE_ROUTE_MAP dinâmico
- Substituir o mapa hardcoded em `useCollaboratorAccess.ts` por uma query ao banco: `system_modules` já tem `key` e `route`
- O `getModuleKeyFromRoute` passará a usar esse mapa dinâmico
- Com isso, renomear rotas no Menu Builder não quebra o guard

#### Tarefa 4 — Completar fluxo de criação de colaborador
- No `useCollaborators.ts`, ao criar colaborador:
  1. Criar registro em `company_users` com `profile_id` selecionado
  2. Remover o TODO e o sistema legado de `collaborator_module_access`
- No `updateModuleAccess`, redirecionar para gestão de perfis (ou permitir troca de perfil do colaborador)

#### Tarefa 5 — Registrar eventos importantes no ledger (`account_events`)
Garantir que os seguintes marcos estejam sendo registrados:
- `first_access` — primeiro login (já existe via onboarding)
- `ml_connected` — conexão ML (verificar se existe)
- `trial_started` / `trial_expired` — início/fim do trial
- `plan_subscribed` — contratação de plano
- `anniversary_30d` — 30 dias de uso (pode ser calculado por cron/retrospectiva)
- Cada módulo deve registrar ações críticas via `useOnboardingEvents` ou equivalente

#### Tarefa 6 — Validar cobertura de logs por módulo
- Auditar se cada módulo está chamando `auditLog` ou `registerEvent` em ações importantes (criar, editar, deletar, importar)
- Criar uma lista de cobertura e adicionar os logs faltantes

---

### Detalhes Técnicos

**Migração SQL (Tarefas 1)**
```sql
-- Gerar features para operacional.tasks
SELECT generate_module_features('operacional.tasks');
-- (usa a função já existente no sistema)
```

**CollaboratorModuleGrid dinâmico (Tarefa 2)**
```typescript
// Buscar módulos do banco em vez de MODULE_CATALOG
const { data: modules } = useQuery({
  queryKey: ['collaborator-modules'],
  queryFn: () => supabase
    .from('system_modules')
    .select('key, name, description, is_internal_only')
    .eq('is_active', true)
    .eq('is_internal_only', false)
    .not('route', 'is', null)
    .order('sort_order')
});
```

**MODULE_ROUTE_MAP dinâmico (Tarefa 3)**
```typescript
// Em useCollaboratorAccess, carregar mapa do banco
const { data } = await supabase
  .from('system_modules')
  .select('key, route')
  .eq('is_active', true)
  .not('route', 'is', null);

const routeMap = new Map<string, string>();
for (const m of data) routeMap.set(m.route, m.key);
```

### Arquivos Envolvidos

| Arquivo | Alteração |
|---------|-----------|
| `src/types/collaborator.ts` | Remover MODULE_CATALOG hardcoded |
| `src/components/settings/collaborators/CollaboratorModuleGrid.tsx` | Consumir módulos do banco |
| `src/hooks/useCollaboratorAccess.ts` | MODULE_ROUTE_MAP dinâmico via query |
| `src/hooks/useCollaborators.ts` | Completar criação com profile_id |
| `src/hooks/useSystemModules.ts` | Expandir para incluir route/description |
| Migração SQL | Features para operacional.tasks + eventos faltantes |

