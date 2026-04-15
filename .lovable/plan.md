

# Tratar Falhas de Conexão ML sem Quebrar o Existente

## Situação atual do rafastore

O cliente **já está conectado** — a conta ML `RAFA_STORE` foi criada hoje às 14:26, status `connected`, trial ativo. Das 4 tentativas, a última funcionou.

## Problemas identificados (2 pontos frágeis)

### 1. Fallback de URL incorreto no `ml-auth-url`
Linha 102: o fallback hardcoded ainda usa `https://ddec4858-9aec-466d-afd2-b6bd5577a30c.lovableproject.com` — um domínio de projeto antigo. Se o `FRONTEND_URL` secret não estiver configurado E o body não enviar `frontendOrigin`, o callback redireciona para um domínio morto e o usuário perde a sessão.

### 2. Redirect fixo para `/primeiro-acesso` no callback
Linha 470 do `ml-oauth-callback`: após sucesso, **sempre** redireciona para `/primeiro-acesso`. Se o usuário já completou onboarding (reconexão, troca de conta), ele vê a tela de primeiro acesso desnecessariamente — confuso e pode parecer que "não conectou".

## Correções propostas (mínimas, cirúrgicas)

### Arquivo 1: `supabase/functions/ml-auth-url/index.ts`
- Trocar o fallback hardcoded de `lovableproject.com` para `https://www.mktpfacil.com` (domínio de produção)
- Apenas a string na linha 102 muda

### Arquivo 2: `supabase/functions/ml-oauth-callback/index.ts`
- **Redirect inteligente** (linhas 469-474): após salvar a conta com sucesso, verificar no banco se `user_access_state.onboarding_status = 'completed'`. Se sim, redirecionar para `/settings?section=empresas-contas&ml_connected=true`. Se não, manter o redirect para `/primeiro-acesso?ml_connected=true`.
- **Logging de erro expandido** (linha 89): no bloco de falha do token exchange, logar o status HTTP e o body completo da resposta do ML, para que tentativas futuras deixem rastro nos logs.

### O que NÃO muda
- Nenhum arquivo frontend
- Nenhuma migration SQL
- O fluxo de PKCE, troca de token e salvamento de conta permanece idêntico
- A lógica de `mp-auth-url` (fluxo finance) não é tocada
- O fluxo de primeiro acesso continua funcionando normalmente para quem ainda não completou onboarding

### Resumo do impacto
- Duas edge functions com mudanças cirúrgicas (fallback URL + redirect condicional + logging)
- Zero risco para clientes existentes — quem já usa não percebe diferença
- Clientes que reconectam vão direto para a tela certa em vez de ver o primeiro acesso de novo

