

## Diagnóstico

Os logs da edge function `ml-oauth-callback` confirmam o problema:

```
ERROR Token exchange failed: {"message":"code_verifier is a required parameter","error":"invalid_request","status":400}
INFO PKCE code_verifier present: false
INFO Flow: finance
```

**Causa raiz:** O Mercado Livre agora **exige PKCE** (code_verifier/code_challenge) em todas as trocas de token. O fluxo do Mercado Livre (`ml-auth-url`) já implementa PKCE corretamente, mas o fluxo financeiro do Mercado Pago (`mp-auth-url`) **não gera PKCE** — não envia `code_challenge` na URL de autorização, nem armazena `code_verifier` no state.

Quando o callback unificado (`ml-oauth-callback`) tenta trocar o código por token, o `code_verifier` está ausente no state, e a API do ML rejeita com erro 400.

## Plano de Correção

### 1. Adicionar PKCE ao `mp-auth-url` (edge function)

- Copiar as funções `generatePKCE()` e `base64UrlEncode()` do `ml-auth-url`
- Gerar o par `codeVerifier`/`codeChallenge` antes de montar a URL
- Incluir `code_challenge` e `code_challenge_method=S256` nos parâmetros da URL de autorização
- Salvar o `codeVerifier` no state como `cv` (mesmo padrão do ML flow)

### 2. Corrigir bug secundário no `ml-oauth-callback` (finance flow)

Na linha 131, `mpUserIdStr` é referenciado antes da sua declaração na linha 132. Isso causaria um `ReferenceError` se o token exchange tivesse sucesso. Inverter a ordem: declarar `const mpUserIdStr = mlUserIdStr;` antes do `console.log`.

### 3. Remover edge function duplicada `mp-oauth-callback`

A edge function standalone `mp-oauth-callback/index.ts` é código morto — todo o fluxo financeiro já é tratado pelo `ml-oauth-callback` (via `flow: 'finance'` no state). Mantê-la gera confusão e risco de uso acidental.

### Arquivos alterados
- `supabase/functions/mp-auth-url/index.ts` — adicionar PKCE
- `supabase/functions/ml-oauth-callback/index.ts` — fix linha 131-132
- `supabase/functions/mp-oauth-callback/` — deletar (código morto)

### Resultado esperado
- OAuth financeiro completa com sucesso (PKCE válido)
- Toast "Falha ao trocar código de autorização" eliminado
- Conta financeira salva em `finance_accounts` corretamente

