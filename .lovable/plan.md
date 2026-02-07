
# Diagnostico e Correções: Módulo de Mensagens Pós-Venda

## Status: Fases 1-4 Implementadas ✅

---

## O que foi corrigido

### Fase 1 - Configurações DB ✅
- `ml_integrations` do seller `66043362`: ativado `can_sync_orders`, `can_sync_messages`, `can_sync_questions`
- Criado `ml_integrations` para seller `1667452966` (MLFACIL_CONSULTORIA) com todas flags ativas
- Re-enfileirados webhooks `orders_v2` que estavam como "skipped" por `feature_not_enabled`

### Fase 2 - Logging e Limites ✅
- `qa-messages-polling-sync`: MAX_ORDERS_PER_ACCOUNT aumentado de 20 para 50
- `qa-messages-polling-sync`: Logging detalhado para respostas non-200 da API de mensagens (antes era silencioso)

### Fase 3 - Automação de Boas Vindas ✅
- `ml-worker-process`: `processOrderEvent` implementado com lógica completa:
  - Busca dados do pedido na API do ML
  - Consulta `post_sale_automation_rules` ativas
  - Busca template vinculado e interpola variáveis ({{nome_comprador}}, {{produto}}, etc.)
  - Valida conteúdo contra `post_sale_blocked_patterns`
  - Se `require_approval = true`: cria rascunho em `post_sale_messages` com status `pendente`
  - Se `require_approval = false`: envia automaticamente via Action Guide API
  - Prevenção de duplicatas por order_id + seller_id + trigger_event
  - Notificações para mensagens pendentes de aprovação

### Fase 4 - Action Guide API ✅
- `ml-send-message`: Suporte ao endpoint Action Guide adicionado
  - Novo parâmetro `use_action_guide: true` ativa envio via `/messages/action_guide`
  - Parâmetro `action_guide_reason` aceita: DELIVERY_PROMISE, REQUEST_VARIANTS, REQUEST_BILLING_INFO, SEND_INVOICE_LINK, OTHER
  - Validação de razões permitidas

---

## Fase 5 - Frontend (Pendente)

- Adicionar aba ou indicador na tela de Conversas para mensagens pendentes de aprovação
- Permitir aprovar/editar/rejeitar rascunhos de Boas Vindas antes do envio
