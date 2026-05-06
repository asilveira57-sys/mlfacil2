# Isolar Resend e padronizar envio em Lovable Emails

## Diagnóstico

Boa notícia: o sistema **já envia 100% dos e-mails via Lovable Emails**.

- Domínio verificado: `notify.notifica.mktpfacil.com` ✅
- `auth-email-hook` já usa o padrão de fila (`enqueue_email` → `process-email-queue`) com retry e suppression — não há envio direto pelo Resend
- Busca por código Resend retornou **zero ocorrências reais** (`RESEND_API_KEY`, `resend.com`, `@resend/*`, `connector-gateway/resend`) em `src/` e `supabase/functions/`
- Os arquivos que aparecem com a palavra "resend" são na verdade **"reenviar e-mail de verificação"** (admin-resend-verification, admin-resend-collab-invite) — não têm relação com o serviço Resend
- Único vestígio do Resend: o **secret `RESEND_API_KEY`** ainda configurado no projeto (órfão, não usado por ninguém)

Portanto, as reclamações de "e-mail não chega" **não são causadas por mistura de provedores**. Elas têm outras causas prováveis (caixa cheia, spam, suppression list, DNS ainda propagando para algum cliente, ou fila com erro). Vamos atacar as duas frentes:

## Plano

### 1. Limpeza do Resend (eliminar qualquer vestígio)

- **Remover o secret `RESEND_API_KEY`** do projeto (uso de `delete_secret`) — único resíduo real no backend
- **Remover NS do Cloudflare relacionados ao Resend**: o Resend nunca chegou a ser configurado em DNS no projeto atual. O subdomínio `notify.notifica.mktpfacil.com` está delegado para os nameservers do Lovable (`ns5.lovable.cloud`, `ns6.lovable.cloud`) — esses **devem permanecer**. Se houver registros TXT/MX/CNAME antigos do Resend em `notifica.mktpfacil.com` (raiz) no seu Cloudflare, eu listo quais procurar e você apaga manualmente no painel (não tenho acesso ao seu Cloudflare). Esses registros órfãos não afetam envio, mas confundem o DNS.
- Garantir que `email_domain--toggle_project_emails` esteja **enabled** (já está, pois o hook está ativo)

### 2. Garantir entregabilidade 100% (cadastro + recuperação de senha)

Vou implementar verificações e correções pró-ativas:

**A. Auditoria de fila e suppression**
- Consultar `email_send_log` dos últimos 30 dias filtrando `status IN ('failed','dlq','suppressed','pending')` para identificar padrões de falha (provedor, ISP, motivo)
- Listar `suppressed_emails` — clientes nessa lista nunca recebem nada. Decidir caso a caso se devem ser removidos (apenas para hard bounces antigos onde o cliente confirma que tem o e-mail correto)
- Verificar se o cron `process-email-queue` está ativo (`cron.job`) e processando

**B. Hardening do auth-email-hook**
- Reduzir TTL para 15 min é o padrão atual — manter
- Adicionar **logging extra** quando `enqueue_email` falhar, para alertar imediatamente em vez de o cliente descobrir
- Confirmar que `SUPPORT_EMAILS` e admin recebem alerta quando houver e-mails em DLQ

**C. UX para o cliente novo**
- Na tela de cadastro (`/auth`), após signup exibir mensagem clara: *"Enviamos um e-mail de confirmação para X. Verifique também a pasta de spam/lixo eletrônico. Não recebeu em 2 minutos? [Reenviar]"*
- Botão **Reenviar e-mail de confirmação** já existe via `admin-resend-verification`, vamos expor também ao próprio usuário no Auth.tsx (não só para admin)
- Em `/reset-password` / fluxo de recuperação, mesma instrução de spam + opção de reenvio
- Adicionar nota nas duas telas: *"Remetente: noreply@notifica.mktpfacil.com — adicione aos seus contatos"*

**D. Painel admin de monitoramento**
- Em `AdminEmails.tsx`, adicionar aba/card **"Falhas de Entrega"** mostrando últimas 50 entradas com status ≠ sent, com botão para **reenviar manualmente** ou **remover do suppression**
- Alerta visível quando houver mais de 5 e-mails em DLQ nas últimas 24h

### 3. Documentação para suporte

- Criar/atualizar artigo na Central de Ajuda: *"Não recebi o e-mail de confirmação/recuperação"* com passos: spam → reenviar → adicionar remetente → contatar suporte
- Memorizar regra: **provedor único = Lovable Emails**, Resend proibido

## Arquivos / ações previstos

| Item | Ação |
|---|---|
| Secret `RESEND_API_KEY` | Deletar via `delete_secret` |
| `src/pages/Auth.tsx` | Adicionar mensagem pós-signup + botão reenviar para o próprio usuário |
| `src/pages/ResetPassword.tsx` | Adicionar nota sobre spam e remetente |
| `src/pages/admin/AdminEmails.tsx` | Nova aba "Falhas de Entrega" com ações |
| `supabase/functions/auth-email-hook/index.ts` | Logging extra em falha de enqueue |
| Edge Function nova `email-delivery-monitor` (opcional) | Alerta admin quando DLQ > N |
| Memória do projeto | Atualizar regra "Lovable Emails é único provedor; Resend banido" |
| Cloudflare (manual pelo cliente) | Remover registros órfãos do Resend na zona `notifica.mktpfacil.com` (se houver) |

## O que NÃO vou fazer

- Não vou remover/desabilitar Lovable Emails nem mexer nos NS `ns5/ns6.lovable.cloud` (são essenciais)
- Não vou apagar `auth-email-hook` (é o que faz funcionar hoje)
- Não vou tocar em `admin-resend-*` (são "reenviar", não Resend)

Aprova para eu executar?
