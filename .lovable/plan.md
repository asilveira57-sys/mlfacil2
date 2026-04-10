

# Diagnóstico e Correção Definitiva do Sistema de E-mails

## Situação Atual — Dois Sistemas Conflitantes

O projeto tem **dois sistemas de e-mail independentes**, o que explica o comportamento inconsistente:

| Sistema | Função | Como envia |
|---|---|---|
| **Lovable Cloud** (`auth-email-hook` → `process-email-queue`) | E-mails de autenticação (signup, recovery, etc.) | Fila pgmq → API Lovable |
| **Resend legado** (`email-worker-send` + tabela `email_queue`) | E-mails de campanhas/comunicações admin | Direto via Resend API |

Os e-mails de **cadastro e recuperação de senha** passam pelo sistema Lovable Cloud (correto). O Resend é usado apenas para comunicações administrativas (campanhas). Porém:

- **Sem logs nas funções** — `auth-email-hook`, `process-email-queue` e `email-worker-send` não mostram logs recentes, indicando possível falha na execução ou deployment desatualizado
- **Incoerência de tempo** — o botão "Reenviar" aparece após 30 segundos, mas a instrução diz "aguarde até 2 minutos"
- **Possível conflito DNS** — O Resend e o Lovable Cloud compartilham o mesmo subdomínio `notify.notifica.mktpfacil.com`, o que pode causar falhas de entrega

## Plano de Correção

### 1. Redeployar as funções de e-mail do Lovable Cloud
As funções `auth-email-hook` e `process-email-queue` podem estar com deploy antigo ou falhando silenciosamente. Redeployar ambas para garantir que o código atual está ativo.

### 2. Testar o fluxo de recuperação de senha de ponta a ponta
Invocar `auth-email-hook` via curl para verificar se a cadeia completa (hook → fila → envio) está funcionando. Verificar os logs após o teste.

### 3. Desativar e remover o sistema Resend
- Remover a edge function `email-worker-send` (envia via Resend API diretamente)
- Remover a edge function `email-test-provider` (testa via Resend)
- Limpar referências ao Resend no frontend (`EmailProviderTab.tsx`, `useEmailAdmin`)
- O secret `RESEND_API_KEY` deixará de ser usado

**Nota:** As funções de campanha (`email-campaign-send`, `email-enqueue-event`, `email-render-template`, `email-schedule-evaluate`) que usam a tabela `email_queue` serão avaliadas — se dependem do Resend, serão migradas para usar a API Lovable ou desativadas.

### 4. Corrigir incoerência de tempo (30s vs 2min)
Na tela de verificação de e-mail (`CriarAcesso.tsx`), alinhar a mensagem:
- Manter o countdown de 30 segundos para o botão reenviar (é adequado)
- Alterar o texto de "Aguarde até 2 minutos" para "Aguarde alguns segundos" — e-mails pelo Lovable Cloud chegam em segundos, não minutos

### 5. Garantir mascaramento correto
O `auth-email-hook` já envia como `MKTP Fácil <noreply@notifica.mktpfacil.com>` — sem menção a "Lovable". Confirmar que o `process-email-queue` preserva esse remetente na entrega final. Os templates já estão em português.

## Arquivos afetados
- `supabase/functions/auth-email-hook/index.ts` — redeploy (sem alteração de código)
- `supabase/functions/process-email-queue/index.ts` — redeploy (sem alteração de código)
- `supabase/functions/email-worker-send/` — remover
- `supabase/functions/email-test-provider/` — remover
- `src/components/admin/email/EmailProviderTab.tsx` — remover referências ao Resend
- `src/pages/CriarAcesso.tsx` — corrigir texto "2 minutos" → "alguns segundos"

## Resultado esperado
- E-mails de cadastro e recuperação de senha chegam em segundos, sem spam
- Remetente mostra "MKTP Fácil" (sem Lovable)
- Mensagens em português
- Sistema único e confiável (Lovable Cloud), sem conflito com Resend
- Interface coerente entre countdown e instrução textual

