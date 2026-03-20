

# Plano: Corrigir Nome do Cliente + PDF Completo + Regeneração Individual

## Diagnóstico

### Problema 1 — Nome do cliente sempre "—"
**Causa raiz: RLS.** A tabela `companies` tem política `auth.uid() = user_id` e `profiles` tem `auth.uid() = id`. O admin consegue ler `retrospectives` (tem policy admin), mas NÃO consegue ler `companies` nem `profiles` de OUTROS usuários. O join retorna NULL para tudo que não é do admin logado.

**Evidência no banco:**
- 49 retrospectivas têm `company_id` preenchido, 15 são consolidadas
- Todas as 64 têm `summary_json->>'company_name'` = NULL (engine não gravava esse campo)
- Tenant names existem: "ADX", "Adeconex Etiquetas", "raffaelvon", etc.

### Problema 2 — PDF básico, sem ADS/ABC/Onboarding/Logo
**Causa raiz:** Todas as 64 retrospectivas foram geradas ANTES do código que inclui `onboarding_context`, `ads_snapshot`, `abc_analysis` e `company_logo_url` no `summary_json`. Confirmado: 0 de 64 têm esses campos.

O botão "Regenerar" atual (`useGenerateRetrospectiveReports`) chama `retrospective-report-gen` que apenas regenera HTML/Slides a partir do `summary_json` existente — NÃO recalcula os dados.

### Problema 3 — Assinatura usa "Marketplace Fácil" em vez de "MKTP Fácil"

---

## Correções

### 1. Migration — Admin pode ler companies e profiles de todos

Adicionar policies de SELECT para admin:
```sql
CREATE POLICY "admin_read_all_companies" ON companies FOR SELECT
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "admin_read_all_profiles" ON profiles FOR SELECT
  USING (has_role(auth.uid(), 'admin'));
```

Isso resolve instantaneamente a coluna "Cliente" para o admin.

### 2. Coluna Cliente — fallback para consolidados

No `useAllRetrospectives` (AdminRetrospectives.tsx), para linhas sem `company_id` (consolidadas):
- Mostrar o nome do tenant (já funciona no código, só falhava por RLS)
- Resultado: "ADX", "Adeconex Etiquetas", "raffaelvon", etc.

### 3. Regeneração Individual — re-executar o engine para 1 retrospectiva

Criar botão "Regenerar Dados" que:
1. Chama `retrospective-engine` com `mode: 'force'`, `company_id` e `tenant_id` da retrospectiva
2. O engine já tem skip-duplicate, então precisa **deletar a retrospectiva antiga antes** e re-gerar
3. Como o usuário quer "criar nova versão": manter a original e gerar uma nova com dados atualizados

**Implementação:**
- No `AdminRetrospectives.tsx`, adicionar botão "Regenerar Completo" 
- Chama `useTriggerRetrospectiveEngine` com `{ mode: 'force', tenant_id, company_id }`
- O engine roda `buildSummaryJson` com o código atualizado (que inclui onboarding, ADS, ABC, logo)
- Nova retrospectiva é criada com todos os dados enriquecidos

### 4. Assinatura — trocar para "MKTP Fácil"

Substituir "Marketplace Fácil" por "MKTP Fácil" em:
- `RetrospectiveEnginePdfExporter.ts` (2 ocorrências: header e footer)
- `TrialRetrospectiveViewer.tsx` (1 ocorrência: assinatura no header)
- `retrospective-report-gen/index.ts` (footer do HTML e slides)

### 5. Seção Promoções — mostrar com aviso quando sem dados

No `RetrospectiveEnginePdfExporter.ts`, `TrialRetrospectiveViewer.tsx` e `retrospective-report-gen`:
- Se `summary_json.promotions_snapshot` existir: exibir dados
- Se não existir: exibir seção "Central de Promoções" com texto "Dados de promoções serão incluídos após sincronização do módulo de Promoções."

No `retrospective-engine/index.ts`, adicionar coleta de `promotion_snapshots`:
- Buscar da tabela `promotion_snapshots` por `seller_id` no período
- Incluir no `summary_json` como `promotions_snapshot` com: promoções ativas, tipo, itens, período

### 6. Engine — garantir company_name e logo_url no summary_json

O `buildSummaryJson` já grava `company_name` e `company_logo_url` (linhas 608-609), mas os dados antigos não têm. Após a regeneração, os novos registros terão.

---

## Arquivos modificados

1. **Migration SQL** — admin policies em `companies` e `profiles`
2. **`src/pages/admin/AdminRetrospectives.tsx`** — botão "Regenerar Completo" individual
3. **`src/components/retrospective/RetrospectiveEnginePdfExporter.ts`** — "MKTP Fácil" + seção promoções
4. **`src/components/retrospective/TrialRetrospectiveViewer.tsx`** — "MKTP Fácil" + seção promoções
5. **`supabase/functions/retrospective-engine/index.ts`** — coleta de promoções
6. **`supabase/functions/retrospective-report-gen/index.ts`** — "MKTP Fácil" + seção promoções no HTML/Slides

## Ordem de execução

1. Migration (RLS) — nome aparece imediatamente
2. Assinatura "MKTP Fácil" — rápido
3. Seção promoções no engine + viewers
4. Botão de regeneração individual
5. Deploy edge functions
6. Testar regeneração da ADX

## Resultado esperado

- Admin vê nome do cliente em TODAS as linhas
- Botão de regeneração individual recria com dados completos (ADS, ABC, onboarding, promoções, logo)
- PDF/HTML/Slides com logo do seller + "Desenvolvido por MKTP Fácil"
- Seção de promoções presente (com dados ou aviso)
- Versões anteriores mantidas no histórico

