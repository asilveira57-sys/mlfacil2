Plano de correção

Diagnóstico encontrado

- O erro das imagens é gerado dentro do Mercado Pago, depois que o cliente já foi redirecionado para o checkout.
- Para pagamento avulso, o projeto já evita travar o pagador pelo e-mail do login.
- Para assinatura recorrente, a função `billing-checkout` ainda envia obrigatoriamente `payer_email` com o e-mail do usuário logado quando a tela não informa outro e-mail.
- O Mercado Pago valida esse `payer_email` contra a conta Mercado Pago usada no checkout. Se o cliente loga/paga no Mercado Pago com outro e-mail, aparece: “Seu e-mail não corresponde ao da assinatura”.
- O caso `megatools` mostra várias tentativas de checkout recorrente criadas hoje, todas para o plano Veterano, mas sem pagamento ativado; isso combina com o bloqueio por e-mail divergente.
- O caso `PEÇAS_ORIGINAIS` tem usuário confirmado, mas sem nenhum login registrado. Para esse cliente, além do pagamento, há um problema de primeiro acesso/senha que precisa ser tratado pelo fluxo de recuperação.

O que vou alterar

1. Corrigir o fluxo de assinatura recorrente
- Antes de criar uma assinatura no Mercado Pago, abrir uma confirmação simples pedindo o e-mail da conta Mercado Pago que será usada para pagar.
- Pré-preencher com o e-mail da conta MKTP Fácil, mas deixar claro: “Se você usa outro e-mail no Mercado Pago, altere aqui.”
- Enviar esse e-mail como `payer_email` para `billing-checkout` somente em assinaturas recorrentes.
- Manter pagamento avulso sem `payer.email`, como já está, para não reintroduzir o bloqueio.

2. Aplicar em todos os pontos de contratação
- Página pública `/planos`.
- Tela de plano dentro de configurações.
- Tela de assinatura/status dentro de configurações.
- Qualquer botão que use `useOfferCheckout` para plano recorrente.

3. Melhorar a segurança e o log do checkout
- Registrar no log interno se o checkout foi criado com e-mail padrão ou e-mail informado pelo cliente, sem expor dados sensíveis desnecessariamente.
- Não alterar regras de ativação de plano: a ativação continuará dependendo do webhook/pagamento confirmado pelo Mercado Pago.
- Não liberar acesso pago manualmente só porque o checkout foi aberto.

4. Melhorar a mensagem para suporte/admin
- No admin de clientes, reforçar a ação recomendada para usuários confirmados que nunca logaram: enviar recuperação de senha/link de recuperação.
- Para `PEÇAS_ORIGINAIS`, a ação correta será enviar link de recuperação antes de tentar pagamento novamente.

5. Deploy e validação
- Ajustar os arquivos do frontend e, se necessário, a função `billing-checkout`.
- Publicar a função de checkout se houver alteração em backend.
- Validar que:
  - checkout recorrente pede/confirma e-mail Mercado Pago;
  - checkout avulso continua sem travar por e-mail;
  - o e-mail informado chega na função;
  - a tela não quebra se o cliente cancelar o modal;
  - os clientes conseguem gerar um novo link de assinatura sem cair direto no erro do Mercado Pago.

Orientação operacional imediata após a correção

- Para `megatools`: pedir para tentar novamente e informar, no novo modal, exatamente o e-mail da conta Mercado Pago que ele vai usar para pagar.
- Para `PEÇAS_ORIGINAIS`: primeiro enviar recuperação de senha pelo painel de clientes; depois que acessar, repetir o pagamento usando o e-mail correto do Mercado Pago.

Arquivos prováveis

- `src/hooks/useTierOffers.ts`
- `src/pages/Planos.tsx`
- `src/components/settings/SettingsPlan.tsx`
- `src/components/settings/SettingsSubscription.tsx`
- Possivelmente `supabase/functions/billing-checkout/index.ts` para logs/validação adicional
- Possivelmente `src/pages/admin/AdminClientes.tsx` para deixar o diagnóstico de acesso mais claro