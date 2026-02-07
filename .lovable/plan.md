

# Analise e Correcao do Modulo Pos-Venda

## Diagnostico Completo

### Problema 1: Mensagens criadas para pedidos ja enviados/entregues

O `processOrderEvent` no worker verifica apenas `orderData.status === "paid"`, mas **nao verifica o status de envio (shipping)**. No Mercado Livre, pedidos ja enviados ou entregues mantêm `status: "paid"` -- o que muda eh o `shipping.status`. Resultado: ao re-enfileirar 7 dias de eventos, o sistema criou rascunhos para pedidos onde o produto ja esta a caminho ou foi entregue.

**Evidencia**: 40 mensagens pendentes criadas em lote, incluindo pedidos antigos como `2000014808119220` e `2000014861128514`.

### Problema 2: "Conversa nao encontrada" ao tentar aprovar

O hook `useApprovePendingMessage` busca uma conversa existente em `post_sale_conversations` para enviar via `ml-send-message`. Porem, so existe **1 conversa** na tabela (e esta com status "blocked"). A maioria dos pedidos nunca teve troca de mensagens, entao nao tem registro de conversa. O fluxo de aprovacao falha imediatamente.

### Problema 3: Restricoes da API Action Guide do Mercado Livre

A documentacao oficial confirma restricoes severas:

- **`blocked_by_conversation_started_by_seller`**: apos usar Action Guide, o vendedor **deve aguardar a resposta do comprador** antes de poder enviar novamente
- **`blocked_by_conversation_use_message_api`**: se o comprador ja iniciou a conversa, Action Guide nao funciona
- **Caps de uso**: ha limite de quantas vezes cada "reason" pode ser usada (ex: "OTHER" tem cap)
- **403 - limit_exceeded**: "You are not allowed to execute the option OTHER again"
- **403 - forbidden**: "This package has the conversation blocked"

O Mercado Livre ja notifica automaticamente o comprador sobre aprovacao, envio e entrega. O envio proativo de mensagens eh **intencionalmente restrito** pela plataforma.

### Conclusao

**Sim, eh bloqueio do Mercado Livre.** A API Action Guide existe mas tem restricoes tao severas que torna o envio automatico de boas-vindas pouco viavel na pratica. O modulo deveria focar em **responder mensagens do comprador** (fluxo reativo), similar ao modulo de Perguntas.

---

## Plano de Correcao

### Fase 1: Limpar mensagens pendentes invalidas

- Executar SQL para marcar como `is_visible = false` todas as 40 mensagens pendentes atuais (foram criadas incorretamente para pedidos ja enviados)
- Desativar temporariamente a regra de automacao (`post_sale_automation_rules.is_active = false`) ate o modulo estar corrigido

### Fase 2: Corrigir filtro de shipping no worker

No `processOrderEvent` em `ml-worker-process/index.ts`:
- Apos buscar dados do pedido na API ML, verificar `orderData.shipping.status`
- Apenas criar rascunho se `shipping.status` for `null`, `pending` ou `to_be_agreed` (pedido sem envio ainda)
- Rejeitar automaticamente pedidos com shipping `shipped`, `delivered`, `ready_to_ship`, etc.
- Adicionar log claro: "Order has shipping status X, skipping welcome message"

### Fase 3: Corrigir fluxo de aprovacao (eliminar dependencia de conversa)

No `useApprovePendingMessage`:
- Em vez de buscar conversa existente, **criar a conversa automaticamente** antes de enviar (upsert), ou
- Chamar `ml-send-message` diretamente passando `pack_id` e `seller_id` do rascunho, sem exigir conversa pre-existente

No `ml-send-message`:
- Aceitar `pack_id` como alternativa a `conversation_id` para o caso de primeiro contato via Action Guide
- Se nao encontrar conversa, criar uma automaticamente (ja que eh primeiro contato)

### Fase 4: Adicionar avisos claros sobre limitacoes

Na UI `PostSalePendingDrafts`:
- Adicionar banner informativo explicando as restricoes do ML
- Mostrar status do shipping junto ao rascunho (ex: "Pedido ja enviado -- nao recomendado")
- Adicionar botao "Descartar Todos" para limpar rascunhos invalidos em lote

### Fase 5: Preparar para modo "somente resposta"

Caso o bloqueio persista apos as correcoes:
- Manter o modulo de conversas existente (`PostSaleConversationsTab`, `PostSaleInbox`, `PostSaleConversation`, `PostSaleReplyEditor`) como funcionalidade principal
- Mover a aba "Pendentes" para funcionar apenas como fila de respostas sugeridas (quando o comprador enviar mensagem)
- Desativar o gatilho `venda_confirmada` no worker e focar em gatilhos reativos (quando comprador envia mensagem)

---

## Detalhes Tecnicos

### Arquivos a modificar

| Arquivo | Acao |
|---|---|
| `supabase/functions/ml-worker-process/index.ts` | Adicionar verificacao de `shipping.status` no `processOrderEvent` |
| `supabase/functions/ml-send-message/index.ts` | Aceitar `pack_id` direto, criar conversa automaticamente |
| `src/hooks/usePostSalePendingMessages.ts` | Remover dependencia de conversa pre-existente, usar pack_id |
| `src/components/post-sale/PostSalePendingDrafts.tsx` | Banner de avisos, botao "Descartar Todos", info de shipping |
| SQL migration | Limpar pendentes invalidas + desativar regra temporariamente |

### Verificacao de Shipping no Worker (logica)

```text
orderData.shipping.status:
  null / pending / to_be_agreed  -->  OK, pode criar rascunho
  ready_to_ship / handling       -->  SKIP (ja em preparacao)
  shipped / in_transit           -->  SKIP (ja enviado)
  delivered                      -->  SKIP (ja entregue)
  cancelled / not_delivered      -->  SKIP (cancelado/problema)
```

### Ordem de execucao

1. SQL: limpar rascunhos + desativar regra
2. Corrigir worker (shipping filter)
3. Corrigir fluxo de aprovacao (pack_id direto)
4. UI: banners e botao de limpeza
5. Deploy e teste
6. Se bloqueio persistir: pivotar para modo somente-resposta

