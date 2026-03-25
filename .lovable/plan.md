

## Plano: Resolver conflito de DNS e manter apenas Resend

### Problema
O subdomínio `ale.mktpfacil.com` está delegado ao Lovable Emails (NS records apontando para `ns3.adorável.nuvem` / `ns4.adorável.nuvem`), o que impede o Resend de verificar os registros DNS nesse subdomínio. A Hostinger não permite criar registros NS para subdomínios na interface padrão.

### Solução (3 passos)

**Passo 1 — Remover o domínio do Lovable Emails**
- Na tela que você está agora (**Cloud → Emails → Gerenciar domínios**), clique nos 3 pontinhos (⋮) ao lado de `mktpfacil.com` e selecione **Remover domínio**
- Isso desativa a tentativa de delegação NS do Lovable

**Passo 2 — Remover registros DNS na Hostinger (se existirem)**
- Acesse o painel de DNS da Hostinger para `mktpfacil.com`
- Procure e **remova** qualquer registro NS ou TXT relacionado ao Lovable:
  - NS `ale.mktpfacil.com` → ns3.adorável.nuvem (ou ns3.lovable.cloud)
  - NS `ale.mktpfacil.com` → ns4.adorável.nuvem (ou ns4.lovable.cloud)  
  - TXT `_lovable-email.mktpfacil.com` → lovable_email_verify=...
- Se esses registros nunca foram adicionados (já que a Hostinger não suporta NS para subdomínios), pule este passo

**Passo 3 — Configurar DNS do Resend na Hostinger**
- No dashboard do Resend, vá em **Domains** e adicione `ale.mktpfacil.com` (ou o domínio raiz `mktpfacil.com`)
- O Resend vai pedir registros do tipo **TXT**, **MX** e **CNAME** — esses a Hostinger suporta normalmente
- Adicione os registros conforme indicado pelo Resend:
  - TXT (SPF) 
  - CNAME (DKIM — geralmente 3 registros)
  - MX (para bounce handling)
- Aguarde a propagação DNS (pode levar até 72h) e clique em **Verify** no Resend

### Resultado
- Resend conseguirá verificar o domínio
- Seus e-mails transacionais (onboarding, campanhas, etc.) continuarão funcionando via Resend
- Sem conflito de DNS

### Nota técnica
Nenhuma alteração de código é necessária. O sistema de e-mails do app já usa Resend via edge function e `RESEND_API_KEY`. Apenas a configuração de DNS precisa ser resolvida.

