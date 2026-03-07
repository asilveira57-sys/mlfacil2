

## Configurar E-mails de Autenticação em Português

### Situação atual
- O domínio `www.mktpfacil.com` está configurado como domínio customizado do projeto
- **Nenhum domínio de e-mail** está configurado ainda para envio de e-mails de autenticação
- Não existe a edge function `auth-email-hook` no projeto
- Os e-mails de auth (reset de senha, verificação, etc.) usam o template padrão em inglês do Lovable

### O que precisa ser feito

**Passo 1 — Configurar domínio de e-mail**
Antes de criar os templates em português, é necessário configurar um domínio de envio (ex: `mail.mktpfacil.com` ou `notify.mktpfacil.com`). Isso envolve adicionar registros DNS no seu provedor de domínio. O painel abaixo guia esse processo.

**Passo 2 — Criar templates de autenticação em português**
Após o domínio ser configurado, vou usar a ferramenta de scaffolding para criar os 6 templates de e-mail:
- **Confirmação de cadastro** — "Confirme seu e-mail"
- **Reset de senha** — "Redefinir sua senha"
- **Magic link** — "Seu link de acesso"
- **Convite** — "Você foi convidado"
- **Troca de e-mail** — "Confirme seu novo e-mail"
- **Reautenticação** — "Código de verificação"

Todos em português, com a identidade visual do MKTP Fácil:
- Cor primária: Deep Navy Blue (`hsl(223, 47%, 23%)`)
- Cor de fundo do e-mail: branco (`#ffffff`)
- Botões com border-radius do projeto
- Tom e linguagem alinhados com o app

**Passo 3 — Deploy da edge function**
Deploy automático da `auth-email-hook` que intercepta os e-mails de autenticação e envia pelo domínio configurado.

### Primeiro passo agora
Configurar o domínio de e-mail pelo painel:

<lov-actions>
<lov-open-email-setup>Configurar domínio de e-mail</lov-open-email-setup>
</lov-actions>

