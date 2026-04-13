
Objetivo: resolver de forma definitiva o caso do Mateus e eliminar a falsa causa raiz de “e-mail não confirmado”.

Diagnóstico já confirmado:
- O domínio de envio está verificado e apto para enviar.
- A infraestrutura de e-mail está funcionando: há vários e-mails de recuperação recentes com ciclo completo `pending -> sent` para outros usuários.
- O endereço `matheusmumanix@gmail.com` não aparece nem na fila/log de envio nem na lista de supressão.
- Existe um perfil para o Mateus, e há evento de login com sucesso hoje.
- O perfil dele ainda mostra `email_verified = false`, o que indica inconsistência cadastral/sincronização.
- Conclusão provável: o problema do Mateus não está no provedor de e-mail em si; o reset dele nem está entrando no pipeline de envio. Ou o cadastro de autenticação está divergente do perfil, ou o fluxo de recuperação para esse usuário específico não está sendo disparado corretamente.

Plano de ação imediata:
1. Validar o cadastro real do Mateus no backend de autenticação
   - Conferir o usuário real de autenticação correspondente ao perfil.
   - Comparar e-mail, status de confirmação e último acesso entre autenticação e perfil.
   - Identificar se existe divergência entre `profiles.email` e o e-mail efetivo da conta de login.

2. Reproduzir o reset exatamente para o Mateus e rastrear ponta a ponta
   - Disparar uma recuperação real para `matheusmumanix@gmail.com`.
   - Confirmar se o pedido entra no fluxo de autenticação.
   - Verificar se o evento chega ao hook de e-mail.
   - Confirmar se gera registro de envio e se entra na fila.

3. Corrigir a causa raiz conforme o cenário encontrado
   - Se houver divergência entre perfil e conta de autenticação: corrigir/sincronizar os dados.
   - Se o perfil ficou com `email_verified` desatualizado: alinhar esse estado para não confundir admin e suporte.
   - Se a conta estiver órfã/quebrada: reparar a conta do usuário para que o reset volte a funcionar normalmente.
   - Se o hook de auth estiver falhando só para recovery: ajustar e redeployar o fluxo.

4. Criar um fallback operacional para suporte
   - Adicionar uma ação administrativa de “gerar/copiar link de redefinição de senha” para casos urgentes.
   - Isso evita depender exclusivamente da entrega do e-mail em situações críticas.

5. Fechar a lacuna de monitoramento
   - Melhorar a visualização dos logs de e-mail/admin para mostrar claramente quando:
     - o reset foi solicitado,
     - o envio entrou na fila,
     - foi enviado,
     - ou nem chegou no pipeline.
   - Isso reduz futuras investigações manuais.

Resultado esperado:
- O Mateus volta a conseguir redefinir a senha normalmente.
- Fica claro por que o caso dele não gerou envio, mesmo com a infraestrutura ativa.
- O sistema ganha um caminho de contingência para não depender de suporte manual em cada caso.

Detalhes técnicos:
- Hoje o front chama `supabase.auth.resetPasswordForEmail(...)` em `src/pages/Auth.tsx`.
- O caminho de envio autenticado usa `supabase/functions/auth-email-hook/index.ts`, que registra em `email_send_log` e enfileira para `process-email-queue`.
- Como não existe nenhum `email_send_log` para o Mateus, o ponto de falha está antes do envio efetivo.
- Também há um indício forte de inconsistência de dados: o perfil do Mateus continua com `email_verified = false`, apesar da confirmação em massa e de já existir login com sucesso.
