

## Diagnóstico: Por que os e-mails ainda saem pelo Lovable

O problema não está no código da edge function — ela já usa o Resend corretamente. O problema é que **o sistema de autenticação não está chamando a sua edge function**. Confirmações:

- `auth-email-hook` tem **zero logs** (nunca foi invocado)
- **Nenhum domínio de e-mail** está configurado no workspace Lovable

### Por que isso acontece

Para que o sistema de autenticação use sua edge function customizada (`auth-email-hook`), é necessário que um **domínio de e-mail Lovable** esteja configurado e com DNS verificado. Sem isso, o sistema ignora o hook e usa o e-mail padrão (`auth.lovable.cloud`).

A verificação de DNS do Lovable exige **registros NS para subdomínio** — e a Hostinger não suporta isso.

### Solução: Migrar DNS para Cloudflare (gratuito)

O Cloudflare suporta registros NS para subdomínios. Com ele:

1. **Criar conta gratuita no Cloudflare** e adicionar `mktpfacil.com`
2. **Atualizar os nameservers** na Hostinger para apontar para o Cloudflare
3. **Recriar todos os registros DNS existentes** no Cloudflare (ele importa automaticamente na maioria dos casos)
4. **Adicionar os registros do Resend** (TXT, CNAME, MX) para `ale.mktpfacil.com` no Cloudflare
5. **Configurar domínio de e-mail Lovable** — o Cloudflare suporta os registros NS necessários
6. **Registrar o hook de autenticação** — com o domínio verificado, o sistema passa a chamar `auth-email-hook`, que envia via Resend

### Resultado esperado

- O sistema de autenticação chama `auth-email-hook`
- A edge function renderiza os templates em português e envia via **Resend**
- E-mails saem de `noreply@ale.mktpfacil.com`
- Templates visuais personalizados são mantidos

### Nota importante

Sem migrar o DNS para um provedor que suporte registros NS para subdomínios (como Cloudflare), não há como ativar o hook customizado dentro do Lovable Cloud. A Hostinger é o bloqueio atual.

