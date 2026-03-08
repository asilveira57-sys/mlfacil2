

## Diagnóstico

Atualmente **não existe** uma tela de administração para chamados de suporte. O admin não tem como ver, responder ou ser notificado de tickets abertos pelos sellers. Também falta a opção "Meus Chamados" no botão flutuante de suporte.

A categoria de notificação `system_alert` será usada para notificar o seller quando o admin responder (o enum atual não tem categoria de suporte, mas `system_alert` serve bem para isso sem precisar migrar o enum).

## Plano

### 1. Criar página Admin de Suporte (`src/pages/admin/AdminSuporte.tsx`)

- Lista todos os tickets de todos os workspaces com filtros (status, categoria, busca)
- Mostra seller/workspace de cada ticket
- Clique abre detalhe do ticket com timeline de mensagens
- Admin responde com `sender_type: 'support'` e pode alterar status (em atendimento, aguardando resposta, resolvido, finalizado)
- Ao enviar resposta, insere notificação individual na `app_notifications` para o `user_id` do ticket com `category: 'system_alert'`, `action_url: '/settings?tab=support'`, referenciando o ticket

### 2. Registrar tab no Admin (`src/pages/Admin.tsx`)

- Adicionar `{ id: 'suporte', label: 'Suporte', icon: Headphones }` no array `adminTabs`
- Adicionar rota `<Route path="suporte/*" element={<AdminSuporte />} />`

### 3. Adicionar "Meus Chamados" no botão flutuante (`src/components/support/FloatingSupportButton.tsx`)

- Nova opção no popover: "Meus Chamados" com ícone `ClipboardList`
- Query para contar tickets com respostas não lidas (mensagens `sender_type = 'support'` com `created_at` posterior à última mensagem `sender_type = 'user'`)
- Badge numérico no botão (igual sineta) mostrando quantidade de chamados com respostas pendentes
- Click navega para `/settings?tab=support`

### 4. Notificação individual ao seller

- Quando admin envia mensagem no `AdminSuporte`, inserir em `app_notifications`:
  - `user_id`: dono do ticket
  - `category`: `system_alert`
  - `title`: "Resposta no chamado: {subject}"
  - `action_url`: `/settings?tab=support`
  - `reference_type`: `support_ticket`
  - `reference_id`: ticket id
- Atualizar status do ticket para `waiting_response`

### Resultado
- Admin vê e responde chamados em `/admin/suporte`
- Seller recebe notificação na sineta quando admin responde
- Botão flutuante tem "Meus Chamados" com badge de respostas não lidas

