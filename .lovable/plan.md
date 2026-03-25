

## Plano: Rotear e-mails de autenticação pelo Resend

### Problema
O `auth-email-hook` usa `@lovable.dev/email-js` (API do Lovable) para enviar e-mails de autenticação. Como não há domínio Lovable Email configurado, os e-mails saem de `no-reply@auth.lovable.cloud` ao invés do seu domínio `ale.mktpfacil.com`.

### Solução
Modificar o `auth-email-hook` para enviar e-mails via **Resend API** usando a `RESEND_API_KEY` que já está configurada, mantendo os templates React Email existentes.

### Mudanças

**1. Atualizar `supabase/functions/auth-email-hook/index.ts`**
- Remover imports de `@lovable.dev/email-js` e `@lovable.dev/webhooks-js`
- Usar Resend API (`https://api.resend.com/emails`) para envio
- Usar `RESEND_API_KEY` (já existe como secret)
- Remetente: `MKTP Fácil <noreply@ale.mktpfacil.com>`
- Manter verificação de webhook via `LOVABLE_API_KEY` para o fluxo de preview
- Manter todos os 6 templates existentes (signup, invite, magiclink, recovery, email_change, reauthentication)
- Manter rendering via React Email (`renderAsync`)

**2. Deploy da edge function**
- Redeployar `auth-email-hook`

### Resultado
- E-mails de cadastro, reset de senha, magic link → saem de `noreply@ale.mktpfacil.com` via Resend
- Templates visuais em português permanecem iguais
- Sistema de e-mails transacionais/campanhas (email-worker-send) continua inalterado

### Nota técnica
O fluxo de preview (`/preview`) continuará funcionando com `LOVABLE_API_KEY`. Apenas o envio real será redirecionado para o Resend.

