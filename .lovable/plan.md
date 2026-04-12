

# Correção: Ticket Admin — Imagem Não Carrega + Nome do Cliente Ausente

## Problemas

1. **Imagem não carrega**: O bucket `support-attachments` é **privado**, mas o código usa `getPublicUrl()` que só funciona para buckets públicos. Resultado: URL quebrada.
2. **Nome do cliente ausente**: O ticket tem `user_id` mas nenhuma busca ao `profiles` é feita — aparece apenas "Seller" genérico.

## Solução

### 1. Usar `createSignedUrl` para anexos (AdminTicketDetail.tsx)

Substituir `getPublicUrl` por `createSignedUrl` com expiração de 1h. Como é assíncrono, buscar as URLs assinadas no `useEffect` junto com os dados do ticket e armazenar em um state map.

### 2. Buscar nome do cliente via `profiles` (AdminTicketDetail.tsx)

Após carregar o ticket, fazer um `select('full_name, email')` na tabela `profiles` usando `ticket.user_id`. Exibir o nome no cabeçalho do chamado e nas mensagens do tipo "user".

### 3. Aplicar a mesma correção no SupportTicketDetail.tsx (lado seller)

O componente do seller também usa `getPublicUrl` — corrigir para `createSignedUrl` para consistência.

## Arquivo afetado

- `src/components/admin/support/AdminTicketDetail.tsx` — signed URLs + busca do perfil do cliente
- `src/components/support/SupportTicketDetail.tsx` — signed URLs para anexos

## Resultado

- Imagens anexadas aparecem corretamente no painel admin
- Nome e email do cliente visíveis no cabeçalho do chamado
- Mensagens do tipo "user" mostram o nome real em vez de "Seller"

