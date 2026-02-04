
# Plano: Módulo de Mensagens Pós-Venda com Inbox de Conversas

## Objetivo
Implementar um sistema completo para visualizar e responder mensagens de compradores após a venda, similar ao módulo de Perguntas (Q&A), permitindo que o vendedor gerencie toda a comunicação pós-venda diretamente pelo painel.

## Visão Geral

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                        PÁGINA /mensagens (Redesenhada)                       │
├─────────────────────────────────────────────────────────────────────────────┤
│  [Abas: Conversas | Templates | Automação]                                  │
│                                                                             │
│  ┌─────────────┐ ┌────────────────────────────┐ ┌───────────────────────┐  │
│  │   INBOX     │ │    ÁREA DE CONVERSA        │ │   PAINEL LATERAL      │  │
│  │             │ │                            │ │                       │  │
│  │ • Pedido 1  │ │  📦 Produto: XYZ           │ │  📋 Detalhes Pedido   │  │
│  │   Felipe    │ │  Comprador: Felipe         │ │  - Status: Enviado    │  │
│  │   "Olá..."  │ │                            │ │  - Data: 04/02        │  │
│  │             │ │  ┌───────────────────────┐ │ │  - Código: 46401..    │  │
│  │ • Pedido 2  │ │  │ 👤 Comprador (14:30)  │ │ │                       │  │
│  │   Bianca    │ │  │ "Olá, quando chega?"  │ │ │  📚 Respostas Rápidas │  │
│  │   "Recebi"  │ │  └───────────────────────┘ │ │  • Prazo de entrega   │  │
│  │             │ │  ┌───────────────────────┐ │ │  • Rastreamento       │  │
│  │             │ │  │ 🏪 Vendedor (14:45)   │ │ │  • Instruções de uso  │  │
│  │             │ │  │ "Será entregue..."    │ │ │                       │  │
│  │             │ │  └───────────────────────┘ │ │                       │  │
│  │             │ │                            │ │                       │  │
│  │             │ │  ┌────────────────────────┐│ │                       │  │
│  │             │ │  │ Digite sua resposta...││ │                       │  │
│  │             │ │  │                    [▸] ││ │                       │  │
│  │             │ │  └────────────────────────┘│ │                       │  │
│  └─────────────┘ └────────────────────────────┘ └───────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Parte 1: Backend - Edge Functions

### 1.1 Nova Edge Function: `ml-sync-messages`
**Objetivo**: Sincronizar conversas do Mercado Livre para o banco local

**Funcionalidades**:
- Buscar pedidos recentes (últimos 15 dias) da tabela `meli_orders_cache`
- Para cada pedido, consultar mensagens via API do ML:
  - `GET /messages/packs/{order_id}/sellers/{seller_id}`
- Armazenar conversas na nova tabela `post_sale_conversations`
- Armazenar mensagens individuais em `post_sale_conversation_messages`
- Identificar conversas com mensagens não lidas
- Suporte a sincronização incremental (apenas novas mensagens)

**Fluxo**:
```text
1. Recebe seller_id
2. Busca pedidos dos últimos 15 dias (pagos/enviados)
3. Para cada pedido:
   a. Chama API: /messages/packs/{order_id}/sellers/{seller_id}
   b. Extrai status da conversa (active/blocked/etc)
   c. Extrai todas as mensagens
   d. Upsert no banco local
4. Retorna estatísticas (total sincronizado, não lidas)
```

### 1.2 Nova Edge Function: `ml-send-message`
**Objetivo**: Enviar mensagem para comprador via API do ML

**Funcionalidades**:
- Validar conteúdo contra `post_sale_blocked_patterns` (já existe)
- Enviar via `POST /messages/packs/{order_id}/sellers/{seller_id}?tag=post_sale`
- Registrar mensagem enviada no banco
- Tratar erros específicos da API (conversa bloqueada, pedido cancelado, etc.)

**Payload para ML**:
```json
{
  "from": { "user_id": "seller_id" },
  "to": { "user_id": "buyer_id" },
  "text": "Mensagem do vendedor (máx 350 caracteres)"
}
```

---

## Parte 2: Banco de Dados

### 2.1 Nova Tabela: `post_sale_conversations`
Armazena o cabeçalho de cada conversa (1 por pedido)

```text
Colunas:
- id (UUID, PK)
- user_id (UUID, FK auth.users)
- seller_id (TEXT)
- order_id (TEXT) - ID do pedido/pack
- buyer_id (TEXT)
- buyer_name (TEXT)
- item_title (TEXT) - Título do produto principal
- item_thumbnail (TEXT)
- shipment_id (TEXT)
- conversation_status (TEXT) - active, blocked, etc.
- unread_count (INT) - Mensagens não lidas pelo vendedor
- last_message_date (TIMESTAMPTZ)
- last_message_text (TEXT) - Preview da última mensagem
- last_message_from (TEXT) - 'buyer' ou 'seller'
- seller_max_chars (INT, default 350)
- created_at / updated_at

Índices:
- seller_id, order_id (UNIQUE)
- seller_id, unread_count > 0 (para filtro rápido)
- last_message_date (para ordenação)
```

### 2.2 Nova Tabela: `post_sale_conversation_messages`
Armazena cada mensagem individual

```text
Colunas:
- id (UUID, PK)
- conversation_id (UUID, FK)
- ml_message_id (TEXT, UNIQUE)
- from_user_id (TEXT)
- from_type (TEXT) - 'buyer' ou 'seller'
- message_text (TEXT)
- message_status (TEXT) - available, moderated, etc.
- moderation_status (TEXT) - clean, rejected, pending
- moderation_reason (TEXT)
- has_attachments (BOOLEAN)
- attachments (JSONB) - Array de anexos
- message_date (TIMESTAMPTZ)
- read_at (TIMESTAMPTZ)
- created_at
```

### 2.3 RLS Policies
- Usuários só acessam conversas onde são donos (user_id = auth.uid())
- Políticas para SELECT, INSERT, UPDATE

---

## Parte 3: Frontend - Componentes

### 3.1 Novo Componente: `PostSaleInbox`
Lista de conversas com:
- Filtros: Não lidas, Todas, Por status do pedido
- Busca por nome do comprador ou número do pedido
- Indicador visual de mensagens não lidas
- Preview da última mensagem
- Ordenação por data da última mensagem

### 3.2 Novo Componente: `PostSaleConversation`
Área de visualização da conversa:
- Timeline de mensagens (estilo chat)
- Diferenciação visual entre mensagens do vendedor e comprador
- Indicador de mensagens moderadas/bloqueadas
- Exibição de anexos (imagens, PDFs)

### 3.3 Novo Componente: `PostSaleReplyEditor`
Editor de resposta:
- Campo de texto com contador de caracteres (máx 350)
- Validação em tempo real contra padrões bloqueados
- Botão de respostas rápidas (da biblioteca)
- Sugestão por IA (opcional)
- Botão de enviar

### 3.4 Novo Componente: `PostSaleConversationDetails`
Painel lateral com:
- Informações do pedido (número, status, data)
- Informações do comprador
- Link para rastreamento
- Histórico de envios

---

## Parte 4: Hooks e Estado

### 4.1 Novos Hooks
```text
usePostSaleConversations(filters)
  - Lista conversas com paginação
  - Filtros: unread, status, search

usePostSaleConversation(conversationId)
  - Detalhes de uma conversa + mensagens

useSendPostSaleMessage()
  - Mutation para enviar mensagem

useSyncPostSaleMessages()
  - Trigger para sincronização manual

useMarkConversationRead()
  - Marcar conversa como lida
```

---

## Parte 5: Fluxo de Sincronização

### 5.1 Sincronização Inicial
1. Usuário acessa `/mensagens` > aba "Conversas"
2. Sistema verifica se há conversas sincronizadas
3. Se não houver ou última sync > 15 min, dispara `ml-sync-messages`
4. Exibe loading enquanto sincroniza
5. Popula inbox com conversas

### 5.2 Sincronização Manual
- Botão "Atualizar" no header (igual Q&A)
- Dispara edge function e atualiza lista

### 5.3 Sincronização ao Enviar
- Após enviar mensagem com sucesso, atualiza conversa local
- Não precisa resincronizar tudo

---

## Parte 6: Validação de Conteúdo

Reutiliza a infraestrutura existente:
- Tabela `post_sale_blocked_patterns` (já criada com 21 padrões)
- Edge Function `post-sale-messages?action=validate` (já existe)
- Validação antes do envio

---

## Detalhes Técnicos

### API do Mercado Livre Utilizada
```text
GET /messages/packs/{pack_id}/sellers/{seller_id}
- Retorna histórico de mensagens
- Inclui status da conversa
- Limite de caracteres do vendedor

POST /messages/packs/{pack_id}/sellers/{seller_id}?tag=post_sale
- Envia nova mensagem
- Limite: 350 caracteres
- Caracteres permitidos: ISO-8859-1 + emojis específicos
```

### Tratamento de Erros
- Conversa bloqueada pelo comprador
- Pedido cancelado (só permite responder se houver conversa prévia)
- Moderação rejeitada (conteúdo impróprio)
- Token expirado (refresh automático)

---

## Arquivos a Criar/Modificar

### Novos Arquivos
```text
supabase/functions/ml-sync-messages/index.ts
supabase/functions/ml-send-message/index.ts
src/types/post-sale-conversation.ts
src/hooks/usePostSaleConversations.ts
src/components/post-sale/PostSaleInbox.tsx
src/components/post-sale/PostSaleConversation.tsx
src/components/post-sale/PostSaleReplyEditor.tsx
src/components/post-sale/PostSaleConversationDetails.tsx
src/components/post-sale/PostSaleConversationsTab.tsx
```

### Arquivos a Modificar
```text
src/pages/MensagensPosVenda.tsx - Adicionar aba de Conversas
src/components/post-sale/index.ts - Exportar novos componentes
```

### Migrações SQL
```text
1. Criar tabela post_sale_conversations
2. Criar tabela post_sale_conversation_messages
3. Adicionar RLS policies
4. Adicionar índices de performance
```

---

## Ordem de Implementação

1. **Fase 1 - Infraestrutura**
   - Criar tabelas no banco
   - Criar edge function `ml-sync-messages`
   - Testar sincronização

2. **Fase 2 - Visualização**
   - Criar tipos TypeScript
   - Criar hooks de leitura
   - Implementar PostSaleInbox
   - Implementar PostSaleConversation
   - Integrar na página

3. **Fase 3 - Resposta**
   - Criar edge function `ml-send-message`
   - Implementar PostSaleReplyEditor
   - Validação de conteúdo
   - Teste end-to-end

4. **Fase 4 - Refinamentos**
   - Marcação de lidas
   - Filtros avançados
   - Indicadores visuais
   - Respostas rápidas
