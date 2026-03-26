

## Plano: Rotear auth-email-hook pelos templates do banco de dados + Resend

### Situação atual
- Você tem 15 templates no banco (`email_templates`) com variáveis `{{}}`, gerenciados pela rota `/admin/emails`
- O `email-worker-send` já envia via Resend lendo da fila `email_queue`
- O `email-enqueue-event` já resolve variáveis e enfileira e-mails
- O `auth-email-hook` atual usa templates React Email hardcoded — **não usa seus templates do banco**

### O que será feito

**Reescrever `auth-email-hook/index.ts`** para:

1. **Receber o evento de autenticação** (signup, recovery, magiclink, invite, email_change, reauthentication)
2. **Mapear o tipo de evento para o `key` do template no banco:**
   - `signup` → `confirm_email`
   - `recovery` → `password_reset`
   - `magiclink` → template de magic link (se existir)
   - `invite` → template de convite (se existir)
3. **Buscar o template do banco** (`email_templates` por `key`)
4. **Resolver variáveis** `{{confirmation_url}}`, `{{site_name}}`, `{{recipient}}`, `{{token}}` etc.
5. **Enviar diretamente via API do Resend** (sem enfileirar, pois auth precisa ser imediato)
6. **Registrar log** na tabela `email_logs`
7. **Remover dependências** de React Email, `@lovable.dev/webhooks-js`, e os templates TSX de `_shared/email-templates/`

### Mapeamento de eventos → templates

```text
Evento Auth         →  Template Key (banco)
─────────────────────────────────────────
signup              →  confirm_email
recovery            →  password_reset
magiclink           →  (a definir ou reusar confirm_email)
invite              →  (a definir)
email_change        →  (a definir)
reauthentication    →  (a definir)
```

### Variáveis disponíveis para os templates

Os templates do banco poderão usar estas variáveis:
- `{{confirmation_url}}` — link de confirmação/reset
- `{{site_name}}` — "MKTP Fácil"
- `{{recipient}}` — e-mail do destinatário
- `{{token}}` — código OTP (reauthentication)

### Arquivos modificados

| Arquivo | Ação |
|---------|------|
| `supabase/functions/auth-email-hook/index.ts` | Reescrever: buscar template do banco, resolver variáveis, enviar via Resend |
| `supabase/functions/auth-email-hook/deno.json` | Simplificar (remover JSX config) |
| `supabase/functions/_shared/email-templates/*.tsx` | Manter (não deletar), mas não serão mais usados pelo hook |

### Fluxo final

```text
Supabase Auth → auth-email-hook
  → Busca template por key no banco (email_templates)
  → Resolve {{variáveis}}
  → Envia via Resend API (RESEND_API_KEY)
  → Registra log em email_logs
  → Remetente: MKTP Fácil <noreply@ale.mktpfacil.com>
```

### Pré-requisitos

- Confirmar quais templates do banco cobrem quais eventos (dos 6 tipos de auth, você tem `confirm_email` e `password_reset` — precisamos definir os demais ou criar novos)
- `RESEND_API_KEY` já configurada

### Deploy
- Redeployar `auth-email-hook` após as alterações

