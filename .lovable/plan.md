

## Resumo

Três melhorias no ecossistema de suporte:

1. **Badge de chamados pendentes na tab Suporte do Admin** — mostrar contador de tickets abertos/em atendimento ao lado do label "Suporte"
2. **E-mail automático para admin quando seller abre chamado** — via `email-trigger.ts` integrado ao fluxo de criação de ticket
3. **E-mail de confirmação para o seller ao abrir chamado** — "Seu chamado foi recebido"
4. **E-mail para o seller quando admin responde** — integrar no `handleSendReply` do `AdminTicketDetail`
5. **Corrigir anexos não clicáveis** (pendente do plano anterior) — gerar URL pública via Storage
6. **Corrigir navegação "Meus Chamados"** (pendente) — usar `?section=abrir-chamado&ticket=ID`

---

## Detalhes Técnicos

### 1. Badge no Admin — `src/pages/Admin.tsx`

Adicionar um hook `useOpenTicketsCount` que faz query em `support_tickets` com `status in ('open', 'in_progress')` e retorna a contagem. No array `adminTabs`, renderizar um badge numérico ao lado do item "Suporte" quando count > 0 (similar à sineta de notificações).

### 2. E-mails via módulo existente — Edge Function `email-enqueue-event`

O sistema já tem infraestrutura de e-mail com `enqueueEmailEvent()`. Serão criados 3 event_keys:

- `support_ticket_opened_admin` — notifica admin quando seller abre ticket
- `support_ticket_opened_seller` — confirma ao seller que o chamado foi recebido
- `support_ticket_reply_seller` — notifica seller quando admin responde

Cada um precisa de um template na tabela `email_templates` (migração SQL) e o disparo será feito:
- No `CreateTicketDialog.tsx` após criação bem-sucedida — chamar edge function para enfileirar os 2 eventos (admin + seller)
- No `AdminTicketDetail.tsx` no `handleSendReply` — enfileirar evento de resposta

Como o `enqueueEmailEvent` é para uso server-side, o disparo do frontend será via uma nova edge function leve `support-notify` que recebe `{ type, ticket_id }` e faz os inserts na fila de e-mail.

### 3. Anexos clicáveis — `AdminTicketDetail.tsx` e `SupportTicketDetail.tsx`

Para cada attachment, gerar URL via `supabase.storage.from('support-attachments').getPublicUrl(storage_path)`. Se imagem: renderizar thumbnail clicável (abre nova aba). Se arquivo: link de download.

### 4. Navegação correta — `FloatingSupportButton.tsx` + `SettingsSupport.tsx`

- Corrigir rotas: `navigate('/settings?section=abrir-chamado')` 
- `AdminTicketDetail` notification `action_url`: `/settings?section=abrir-chamado&ticket=${ticket.id}`
- `SettingsSupport.tsx`: ler `useSearchParams` para `ticket` param e auto-abrir o detalhe

### Arquivos envolvidos

| Arquivo | Alteração |
|---------|-----------|
| `src/pages/Admin.tsx` | Badge numérico na tab Suporte |
| `src/hooks/useOpenTicketsCount.ts` | Novo hook — conta tickets open/in_progress |
| `src/components/admin/support/AdminTicketDetail.tsx` | Anexos clicáveis + e-mail ao responder |
| `src/components/support/SupportTicketDetail.tsx` | Anexos clicáveis |
| `src/components/support/CreateTicketDialog.tsx` | Disparar e-mail após criar ticket |
| `src/components/support/FloatingSupportButton.tsx` | Corrigir rotas de navegação |
| `src/components/settings/SettingsSupport.tsx` | Auto-abrir ticket via URL param |
| `supabase/functions/support-notify/index.ts` | Nova edge function — enfileira e-mails de suporte |
| Migração SQL | Templates de e-mail para os 3 eventos |

