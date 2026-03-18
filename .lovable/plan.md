

## Plano: Retrospectiva — Nome do Cliente, Relatórios Funcionais e Baseline

### Problemas Identificados

1. **HTML em branco**: O relatório HTML armazenado no storage está **sem a tag `<head>` e `<style>`** — o conteúdo existe mas sem CSS, aparece branco. Provável problema na geração do template string na edge function `retrospective-report-gen`.

2. **Sem nome do cliente**: A tabela admin mostra título, tenant_id e company_id, mas não resolve para o nome da empresa/cliente. Não há coluna "Cliente" visível.

3. **Baseline 30 dias não está sendo capturado**: O snapshot de onboarding (`onboarding_initial`) registra dados do momento da entrada, mas não faz lookback de 30 dias para capturar o cenário anterior do seller.

4. **PDF não existe**: O campo `pdf_url` existe na tabela mas nunca é preenchido. Apenas HTML e Slides são gerados.

---

### O que será feito

#### 1. Corrigir HTML e Slides (Edge Function `retrospective-report-gen`)
- Debugar e corrigir a função `generateHtmlReport()` — a tag `<head>` com todo o CSS está sendo removida/corrompida durante o upload para o storage
- Validar que o Blob preserva o HTML completo
- Regenerar os relatórios existentes após o fix

#### 2. Adicionar coluna "Cliente" na tabela admin
- Na query `useAllRetrospectives`, fazer JOIN com `companies` para trazer `display_name`
- Adicionar coluna "Cliente" na tabela de retrospectivas do admin
- Permitir busca/filtro pelo nome do cliente no campo de search existente

#### 3. Capturar baseline de 30 dias no onboarding
- Alterar a edge function `retrospective-engine` para, ao gerar o snapshot `onboarding_initial`, buscar os últimos 30 dias de pedidos do seller (`meli_orders_cache`) e salvar como parte do snapshot:
  - Faturamento 30d anteriores
  - Pedidos 30d anteriores  
  - Ticket médio 30d anteriores
- Esses dados serão usados como referência nas retrospectivas futuras

#### 4. Gerar PDF real
- Adicionar geração de PDF na edge function `retrospective-report-gen` usando a mesma estrutura do HTML
- Converter o HTML em PDF server-side (usando a lib `jsPDF` ou renderizando o HTML para PDF via Deno)
- Salvar no storage e preencher o campo `pdf_url`
- Adicionar botão de download PDF na tabela admin

#### 5. Melhorar visual dos relatórios
- Refinar o CSS do HTML report: melhor tipografia, espaçamento, cards mais polidos
- Adicionar seção "Cenário de Entrada" mostrando os dados baseline de 30 dias
- Incluir nome do cliente/empresa no cabeçalho do relatório
- Melhorar o Slides com transições mais suaves e layout mais profissional

---

### Arquivos envolvidos

- `supabase/functions/retrospective-report-gen/index.ts` — Fix HTML/CSS, adicionar PDF, melhorar visual
- `supabase/functions/retrospective-engine/index.ts` — Baseline 30 dias no snapshot
- `src/pages/admin/AdminRetrospectives.tsx` — Coluna cliente, filtro por nome, botão PDF
- `src/hooks/useRetrospectiveEngine.ts` — Tipo atualizado com company_name

### Ordem de execução
1. Fix do HTML (urgente — cliente amanhã)
2. Coluna cliente + filtro
3. Baseline 30 dias
4. PDF
5. Refinamento visual

