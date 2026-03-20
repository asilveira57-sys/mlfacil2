

# Plano: Corrigir E-mails de Boas-Vindas e Logs

## Diagnóstico

### Problema 1 — E-mail de confirmação vem em inglês do @lovable
O `auth-email-hook` existe com templates em PT-BR, mas o domínio de e-mail (`notify.www.mktpfacil.com`) **falhou na verificação DNS**. Resultado: o sistema ignora o hook customizado e envia o e-mail padrão do Lovable — em inglês, de `@auth.lovable.cloud`.

**Solução:** O domínio precisa ser reconfigurado. O problema é que `www.mktpfacil.com` provavelmente não é o domínio raiz — o subdomínio `notify.www.mktpfacil.com` não conseguiu propagar os registros NS. Você precisa verificar/reconfigurar o domínio de e-mail nas configurações do projeto.

### Problema 2 — E-mail de boas-vindas via Resend não envia ("No email found")
O `email-enqueue-event` busca o e-mail do usuário **apenas** na tabela `profiles`. Porém, dos 8 usuários do sistema, **apenas 2 têm registro na tabela profiles**. Os outros 6 não têm `profiles.email` preenchido.

Usuários sem profile (confirmado no banco):
- `4f72b283...` (raffaelvon@gmail.com) — sem profile
- `b8dfb2cd...` (adeconex4@gmail.com) — sem profile
- `5c51a800...` — sem profile

O e-mail existe em `auth.users`, mas o código não consulta lá como fallback.

### Problema 3 — Logs mostram UUID ao invés do nome
A mensagem de log é `"No email found for user {UUID}"`. Não busca nome, empresa ou qualquer referência humana.

---

## Correções

### 1. Corrigir lookup de e-mail no `email-enqueue-event`
**Arquivo:** `supabase/functions/email-enqueue-event/index.ts`

Alterar o bloco de resolução de e-mail (linhas 187-208):
- Manter busca em `profiles.email` como primeira opção
- Adicionar fallback: buscar em `auth.users` via `supabase.auth.admin.getUserById(targetUserId)`
- Se encontrar, usar o e-mail de `auth.users`

### 2. Melhorar mensagem de log com nome/empresa
**Arquivo:** `supabase/functions/email-enqueue-event/index.ts`

Antes de logar, buscar dados de contexto do usuário:
- `profiles.full_name` (se existir)
- `companies.display_name` (se `company_id` fornecido)
- Usar na mensagem: `"No email found for [Nome] (empresa: [Empresa])"` ao invés de UUID
- Aplicar mesma lógica para logs de sucesso: `"Enqueued marketplace_connected → [Nome] (email@x.com)"`

### 3. Melhorar exibição dos logs no frontend
**Arquivo:** `src/components/admin/email/EmailLogsTab.tsx`

- Adicionar badge de cor para `invalid_email` (amarelo/warning)
- Truncar UUIDs se ainda aparecerem: mostrar apenas primeiros 8 chars

### 4. Garantir profiles sejam criados no signup
**Arquivo:** Verificar se o trigger `handle_new_user` ou equivalente cria profile com email. Se não, ajustar para que todo novo usuário tenha profile com email preenchido desde o cadastro.

### 5. Domínio de e-mail — reconfigurar
O domínio `notify.www.mktpfacil.com` falhou. Precisa ser reconfigurado — idealmente usando o domínio raiz (ex: `mktpfacil.com` ao invés de `www.mktpfacil.com`), pois subdomínios de `www` são incomuns para delegação DNS.

Após resolver o DNS, o `auth-email-hook` passará a funcionar e os e-mails de confirmação virão em PT-BR, com a identidade visual do MKTP Fácil.

---

## Arquivos modificados
1. `supabase/functions/email-enqueue-event/index.ts` — fallback auth.users + logs humanizados
2. `src/components/admin/email/EmailLogsTab.tsx` — badge para invalid_email
3. Deploy da edge function atualizada

## Resultado esperado
- E-mails de boas-vindas via Resend passam a ser enviados (fallback para auth.users)
- Logs mostram nome da pessoa e empresa, não UUID
- Domínio de e-mail precisa ser reconfigurado para o auth-email-hook funcionar

