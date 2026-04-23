
Objetivo: corrigir o fluxo de “acesso por e-mail” para que suporte e onboarding não dependam de uma ação errada, e deixar claro quando o problema é entrega real vs. uso do fluxo incorreto.

Diagnóstico confirmado
- Para `wmautoparts@wmautoparts.com.br`, o sistema registrou envio de e-mail de recuperação às `20:27` com status `pending -> sent`.
- O hook de e-mail também registrou enqueue normal para esse destinatário.
- Portanto, não há evidência de falha geral do pipeline de envio neste caso específico.
- O problema principal hoje é de fluxo e semântica:
  1. `admin-resend-verification` não envia e-mail; ele só gera um link mascarado.
  2. No admin, a ação “Reenviar verificação” chama essa função e mostra toast como se o e-mail tivesse sido reenviado.
  3. Usuários importados em massa são criados com `email_confirm: true` e sem senha inicial, então “verificação de e-mail” não é o fluxo correto para primeiro acesso; o fluxo correto é recuperação de senha / link de acesso.
  4. O sistema não mostra ao suporte qual foi o último e-mail realmente enviado nem qual ação correta usar para cada tipo de usuário.

O que será implementado

1. Corrigir a lógica de suporte por tipo de usuário
- Separar claramente os cenários:
  - Cadastro próprio e não confirmado: reenviar confirmação real.
  - Usuário importado/admin-criado/confirmado sem senha útil: enviar recuperação / gerar link de acesso.
  - Usuário confirmado que ainda não conseguiu entrar: oferecer contingência de senha padrão/manual.
- Parar de tratar todos os casos como “verificação”.

2. Corrigir a função administrativa enganosa
- Ajustar `admin-resend-verification` para ficar coerente com o que ela realmente faz.
- Opção A: ela passa a realmente disparar o e-mail correto.
- Opção B: ela vira explicitamente “gerar link de acesso/verificação”.
- A UI será alinhada ao comportamento real para nunca mais dizer “reenviado” quando só gerou link.

3. Melhorar a UI do admin para suporte operacional
- Em `/admin/clientes`, trocar as ações por rótulos corretos:
  - Reenviar confirmação
  - Enviar recuperação
  - Copiar link de confirmação
  - Copiar link de recuperação
- Exibir status úteis no detalhe do cliente:
  - e-mail confirmado ou não
  - onboarding concluído ou não
  - último e-mail auth enviado
  - status do último envio
- Evitar que o suporte escolha a ação errada.

4. Aproveitar as funções já existentes de diagnóstico/contingência
- Integrar o diagnóstico de auth para consulta rápida do estado do usuário.
- Integrar o gerador manual de link de reset como fallback oficial.
- Manter a política de senha padrão apenas como contingência explícita, não como fluxo principal.

5. Melhorar transparência sobre entrega
- Mostrar no admin os eventos recentes do `email_send_log` por usuário/e-mail.
- Diferenciar:
  - enviado pelo sistema
  - link gerado manualmente
  - nenhuma tentativa recente
- Isso reduz a sensação de “não enviou” quando, na verdade, o e-mail foi processado e o problema pode estar na caixa do destinatário.

Arquivos que devem ser alterados
- `src/pages/admin/AdminClientes.tsx`
- `src/pages/admin/AdminUsers.tsx`
- `src/hooks/useAdmin.ts`
- `supabase/functions/admin-resend-verification/index.ts`
- `supabase/functions/admin-generate-reset-link/index.ts` (se precisar alinhar retorno/mascara)
- possivelmente um novo helper/função administrativa para “enviar acesso correto” por estado do usuário

Ajustes de comportamento esperados
- “Reenviar verificação” só aparece para usuário realmente não confirmado.
- Usuário importado/Veterano não entra mais no fluxo errado de verificação.
- Para casos como o da WM Autoparts, o suporte verá que houve envio de recuperação e poderá agir com o fallback correto.
- O admin deixará de mascarar um “copiar link” como se fosse “e-mail reenviado”.

Antes/depois do fluxo
- Antes:
  - suporte clica “Reenviar verificação”
  - sistema gera link
  - toast diz que reenviou e-mail
  - usuário continua sem receber nada
- Depois:
  - sistema detecta o estado da conta
  - oferece a ação correta
  - mostra se houve envio real
  - se não for caso de e-mail, oferece link manual/recuperação de forma explícita

Validação
- Testar 3 cenários:
  1. usuário novo não confirmado criado por signup
  2. usuário importado sem senha inicial
  3. usuário já confirmado com dificuldade de login
- Confirmar no admin:
  - ação exibida correta
  - toast coerente com a ação
  - log visível de envio real
- Confirmar no banco/logs:
  - `email_send_log` registrando `pending/sent` quando houver envio
  - link mascarado gerado apenas quando a ação for manual
- Confirmação final esperada:
  - suporte passa a saber exatamente por que o cliente não entrou
  - o sistema deixa de depender de um “reenviar verificação” que hoje engana operacionalmente
  - correção aplicada no fluxo de acesso de novos clientes e de clientes importados
