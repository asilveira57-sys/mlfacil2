
Objetivo: corrigir definitivamente o envio de e-mails de confirmação/cadastro e recuperação de senha, e eliminar a inconsistência entre domínio de envio e configuração atual.

Diagnóstico (já confirmado no código e logs):
- Problema é geral (não é só de 1 cliente).
- O domínio de e-mail no Cloud está verificado (`notify.notifica.mktpfacil.com`), então DNS/Cloudflare está OK.
- O hook de autenticação está enviando com remetente hardcoded `noreply@ale.mktpfacil.com`, e os logs mostram erro 500 por domínio não verificado.
- O módulo de teste/admin também está com remetente inconsistente (`noreplay@mktpfacil.com` / domínio não verificado), gerando 403.
- Resultado: tela mostra “e-mail enviado”, mas entrega falha no provedor.

Plano de implementação

1) Corrigir o ponto crítico (auth) para parar a falha de recuperação/confirmação
- Refatorar `supabase/functions/auth-email-hook/index.ts` para remover remetente hardcoded inválido.
- Passar a resolver remetente por configuração central válida do projeto (domínio de envio ativo no Cloud).
- Manter o mapeamento existente de templates (`confirm_email`, `password_reset`) para não quebrar fluxo atual.
- Melhorar log de erro/sucesso com contexto do remetente usado (sem expor segredo), para facilitar suporte futuro.

2) Unificar remetente no módulo de e-mail administrativo
- Ajustar `supabase/functions/email-test-provider/index.ts` e `supabase/functions/email-worker-send/index.ts` para usar o mesmo padrão de remetente válido.
- Corrigir fallback default de remetente e evitar typo (`noreplay`).
- Garantir que o teste no Admin reflita exatamente o mesmo domínio aceito no ambiente atual.

3) Blindar configuração para não voltar a quebrar
- Em `src/components/admin/email/EmailProviderTab.tsx` e hook relacionado, adicionar validação de domínio no campo “from_email”.
- Exibir erro claro ao salvar quando o domínio do remetente não estiver no domínio de envio ativo do projeto.
- Impedir persistência de configuração inválida que volta a causar 403/500.

4) Ajuste de suporte no Admin (transparência)
- Revisar `supabase/functions/admin-resend-verification/index.ts` para mensagem de retorno consistente com o comportamento real (gerar link e permitir cópia/uso manual).
- Evita falso positivo de “enviado” quando o objetivo foi apenas gerar link.

5) Validação fim a fim (obrigatória)
- Teste 1: “Esqueci minha senha” → receber e-mail real em inbox.
- Teste 2: novo cadastro → receber confirmação de conta.
- Teste 3: Admin > E-mail > “Enviar teste” → sucesso sem erro de domínio.
- Teste 4: Admin > Clientes > ações de verificação (reenviar/copiar link) funcionando conforme esperado.
- Teste 5: verificar logs de função sem novos erros de domínio não verificado.

Arquivos principais a ajustar
- `supabase/functions/auth-email-hook/index.ts`
- `supabase/functions/email-test-provider/index.ts`
- `supabase/functions/email-worker-send/index.ts`
- `src/components/admin/email/EmailProviderTab.tsx`
- `src/hooks/useEmailAdmin.ts`
- `supabase/functions/admin-resend-verification/index.ts` (mensagem/semântica de retorno)

Resultado esperado
- Recuperação de senha e confirmação de cadastro voltam a entregar e-mail.
- Fluxo deixa de depender de remetente inválido/hardcoded.
- Configuração passa a ser consistente e validada, evitando regressão.
- Diagnóstico futuro fica simples via logs padronizados.