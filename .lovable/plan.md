
# Agente de Adesao Automatica a Promocoes

## Visao Geral

Criar um agente visual (robo 3D cromado com olhos que seguem o mouse) na Central de Promocoes que, ao ser clicado, abre um painel de configuracao. Quando ativado, o agente adere automaticamente a campanhas elegiveis conforme regras do seller, registra logs e notifica no Canal Oficial.

---

## 1. Banco de Dados (Migracao SQL)

### Tabela `promotion_agent_config`

```text
id                          UUID PK default gen_random_uuid()
workspace_id                UUID FK -> workspaces (NOT NULL)
seller_id                   TEXT NOT NULL
is_enabled                  BOOLEAN default false
max_seller_discount         NUMERIC default 10
min_total_discount          NUMERIC null
require_copart              BOOLEAN default false
scope_type                  TEXT default 'all'  (all | categories | items)
scope_items                 TEXT[] default '{}'
scope_categories            TEXT[] default '{}'
exclude_items               TEXT[] default '{}'
accepted_types              TEXT[] default '{SMART,DEAL,PRICE_MATCHING}'
accept_unknown_type         BOOLEAN default false
min_stock                   INTEGER default 0
min_margin                  NUMERIC null
allow_when_margin_unknown   BOOLEAN default false
created_at                  TIMESTAMPTZ default now()
updated_at                  TIMESTAMPTZ default now()

UNIQUE(workspace_id, seller_id)
```

### Tabela `promotion_agent_logs`

```text
id                  UUID PK default gen_random_uuid()
workspace_id        UUID FK -> workspaces (NOT NULL)
seller_id           TEXT NOT NULL
run_id              TEXT NOT NULL
triggered_by        TEXT default 'manual'
promotions_affected INTEGER default 0
items_adhered       INTEGER default 0
items_failed        INTEGER default 0
items_skipped       INTEGER default 0
details             JSONB default '{}'
executed_at         TIMESTAMPTZ default now()

UNIQUE(workspace_id, run_id)
INDEX(workspace_id, seller_id, executed_at DESC)
```

### RLS

- `promotion_agent_config`: SELECT/INSERT/UPDATE/DELETE para membros do workspace via `is_workspace_member(auth.uid(), workspace_id)`
- `promotion_agent_logs`: SELECT para membros do workspace; INSERT/UPDATE somente via service role (edge functions)

### Trigger

- `update_updated_at` em `promotion_agent_config` reutilizando a funcao `trigger_set_updated_at` existente

---

## 2. Robo 3D Interativo

### Novo: `src/components/promotions/PromotionAgentBot.tsx`

- Esfera 3D cromada renderizada com CSS puro:
  - `background: radial-gradient(...)` simulando metal cromado com reflexos
  - Sombra `box-shadow` com multiplas camadas para profundidade
  - Pseudo-elemento `::before` para antena com LED pulsante
- Tamanho: 72px (responsivo)
- Posicao: fixo no canto inferior direito dentro do container da Central de Promocoes
- Olhos:
  - Dois `div` circulares brancos com pupila escura
  - Posicao da pupila calculada via angulo entre centro do robo e posicao do mouse
  - `transform: translate(dx, dy)` com limite maximo de ~6px para nao sair do olho
  - `transition: transform 0.15s ease-out` para suavidade
  - Em mobile/touch: olhos em posicao "idle" (centro), com micro-animacao de piscar
- Estados visuais:
  - Desativado: brilho neutro/cinza, sem halo
  - Ativo: halo verde sutil com `box-shadow` verde
  - Executando: halo pulsante via `@keyframes`
- Props: `isEnabled`, `isRunning`, `onClick`, `containerRef` (para capturar mouse)
- O listener `mousemove` sera registrado no container principal da pagina, passando coordenadas via ref/state

---

## 3. Painel de Configuracao

### Novo: `src/components/promotions/PromotionAgentConfig.tsx`

Drawer lateral (Vaul) com secoes:

**Bloco Status**
- Switch Ativar/Desativar com texto de apoio
- Indicador visual do ultimo run (data/hora + resultado)

**Bloco Regras de Desconto**
- Input numerico: "Maximo desconto do seller (%)" - default 10
- Input numerico (opcional): "Minimo desconto total da campanha (%)"
- Checkbox: "Exigir coparticipacao do ML"
- Texto explicativo de cada campo

**Bloco Escopo de Produtos**
- RadioGroup: Todos | Por categoria | Por lista de itens
- Se "categorias": multi-select (textarea, um por linha)
- Se "itens": textarea para MLBs/SKUs
- Textarea separada: "Lista de exclusao" (itens que nunca aderem)

**Bloco Tipos de Campanha**
- Checkboxes: SMART, DEAL, PRICE_MATCHING
- Checkbox: "Aceitar tipos desconhecidos"

**Bloco Guardrails**
- Input: "Estoque minimo para aderir" - default 0
- Input (opcional): "Margem minima apos desconto (%)"
- Checkbox (desabilitado por padrao): "Aderir mesmo sem calculo de margem"

**Bloco Historico**
- Lista das ultimas execucoes (promotion_agent_logs)
- Cada entrada: data/hora, campanhas, itens aderidos, falhas
- Botao "Ver detalhes" abre JSON formatado

---

## 4. Hook de Integracao

### Novo: `src/hooks/usePromotionAgent.ts`

- `useAgentConfig(workspaceId, sellerId)`: busca config via react-query
- `upsertConfig(config)`: salva/atualiza config (upsert pattern existente)
- `useAgentLogs(workspaceId, sellerId, limit)`: busca logs via react-query
- `triggerManualRun()`: chama edge function `promotion-agent-run` com `triggered_by: 'manual'`

---

## 5. Edge Function: Motor do Agente

### Novo: `supabase/functions/promotion-agent-run/index.ts`

**Config TOML**: `verify_jwt = false`

**Entrada**: `{ workspace_id, seller_id, triggered_by, run_id? }`

**Fluxo**:

1. Gerar `run_id` se nao fornecido (`{triggered_by}-{timestamp}-{seller_id}`)
2. Verificar idempotencia: se `run_id` ja existe em `promotion_agent_logs`, retornar log existente
3. Buscar `promotion_agent_config` - se `is_enabled = false`, registrar log "skipped_disabled" e sair
4. Buscar credenciais ML do seller (`ml_accounts`) com refresh de token se expirado
5. Buscar candidatos: `promotion_items_snapshots` com `item_status = 'candidate'` para o workspace/seller
6. Buscar dados das promocoes associadas (`promotion_snapshots`) para tipo, nome, status
7. Para cada candidato, aplicar regras:
   - `seller_percentage <= max_seller_discount` (extraido de `raw_item_data`)
   - `(seller_percentage + meli_percentage) >= min_total_discount` (se configurado)
   - `meli_percentage > 0` (se `require_copart`)
   - `promotion_type` em `accepted_types` (ou `accept_unknown_type`)
   - Item no escopo (all / categorias / lista) e NAO em `exclude_items`
   - Estoque >= `min_stock` (se disponivel nos dados)
8. Para aprovados, chamar API ML via mesma logica do `promotions-action` (reutilizando `callMeliApi` inline)
9. Atualizar `item_status` em `promotion_items_snapshots` para itens aderidos
10. Registrar resultado em `promotion_agent_logs`
11. Criar notificacao no `mktpfacil_announcements` se houve adesoes:
    - Titulo: "Agente aderiu automaticamente a N produtos"
    - Conteudo: resumo por campanha
    - `priority: 1` (baixa), `is_active: true`, `plan_target: 'all'`
12. Retornar resultado consolidado

**Idempotencia**: verificar `item_status` antes de aderir (skip se ja `started`/`joined`); `run_id` UNIQUE impede duplicacao de execucao.

---

## 6. Encadeamento apos Sync

### Editar: `supabase/functions/promotions-sync/index.ts`

Apos o bloco de sucesso (linha ~670, antes do `return successResponse`):

- Para o seller sincronizado, chamar `promotion-agent-run` via fetch interno:
  ```text
  POST {supabaseUrl}/functions/v1/promotion-agent-run
  { workspace_id, seller_id: accountId, triggered_by: 'promotions-sync', run_id: 'sync-{logId}-{accountId}' }
  ```
- Usar `try/catch` para nao bloquear o retorno do sync em caso de erro do agente
- Logar resultado da chamada

---

## 7. Integracao na Pagina

### Editar: `src/pages/Promocoes.tsx`

- Importar `PromotionAgentBot` e `PromotionAgentConfig`
- Adicionar `useRef` para o container principal e state para posicao do mouse
- Registrar `onMouseMove` no container principal com throttle (16ms)
- Buscar `is_enabled` do agente via `usePromotionAgent` hook
- Renderizar `<PromotionAgentBot>` posicionado fixo no canto inferior direito
- Renderizar `<PromotionAgentConfig>` controlado por estado `agentDrawerOpen`

---

## Resumo de Arquivos

| Arquivo | Tipo | Descricao |
|---------|------|-----------|
| Migracao SQL | Novo | Tabelas `promotion_agent_config` e `promotion_agent_logs` com RLS, indices, trigger |
| `src/components/promotions/PromotionAgentBot.tsx` | Novo | Robo 3D CSS com olhos que seguem mouse |
| `src/components/promotions/PromotionAgentConfig.tsx` | Novo | Drawer de configuracao completo |
| `src/hooks/usePromotionAgent.ts` | Novo | Hook CRUD config + logs + trigger manual |
| `supabase/functions/promotion-agent-run/index.ts` | Novo | Engine de execucao automatica |
| `supabase/config.toml` | Editar | Adicionar `[functions.promotion-agent-run] verify_jwt = false` |
| `supabase/functions/promotions-sync/index.ts` | Editar | Encadear chamada ao agent-run apos sync |
| `src/pages/Promocoes.tsx` | Editar | Integrar robo + drawer + mouse tracking |

---

## Regra de Negocio - Calculo de Desconto

```text
Dados do candidato (raw_item_data):
  seller_percentage = desconto que o seller paga
  meli_percentage   = desconto coparticipado pelo ML

Regra 1 - Teto do seller:
  seller_percentage <= config.max_seller_discount
  -> Se seller_percentage = 7% e max = 10% -> APROVADO
  -> Se seller_percentage = 12% e max = 10% -> REPROVADO

Regra 2 - Minimo total (opcional):
  (seller_percentage + meli_percentage) >= config.min_total_discount
  -> Se total = 10% e min = 10% -> APROVADO
  -> Se total = 8% e min = 10% -> REPROVADO

Regra 3 - Coparticipacao (se exigida):
  meli_percentage > 0 -> APROVADO
  meli_percentage = 0 -> REPROVADO
```
