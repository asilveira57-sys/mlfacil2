

# Mascarar Link de Verificação — Remover "Lovable" e "Supabase" da URL

## Problema

Quando você copia o link de verificação para enviar ao cliente, a URL expõe dois domínios internos:
- `rfckrbqwdsejicjlxqdv.supabase.co` (verificação)
- `mlfacil2.lovable.app` (redirect)

O cliente vê nomes técnicos que não têm relação com o MKTP Fácil.

## Solução

Criar um sistema de redirecionamento usando o domínio próprio `www.mktpfacil.com`. O fluxo:

1. Admin clica "Copiar link de verificação"
2. A edge function gera o link real do Supabase, salva numa tabela temporária com um token curto (UUID)
3. O link copiado para a área de transferência é: `https://www.mktpfacil.com/verificar?t=abc123...`
4. Cliente clica no link → página do app busca o link real → redireciona automaticamente para a verificação

O cliente nunca vê "Lovable" ou "Supabase" na URL.

## Implementação

### 1. Migration — tabela `verification_links`
```sql
CREATE TABLE verification_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  verification_url TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT now() + INTERVAL '72 hours',
  used BOOLEAN DEFAULT false
);
-- RLS: leitura pública (para o redirect funcionar), inserção apenas via service role
```

### 2. Edge function `admin-resend-verification`
Após gerar o `action_link`, salvar na tabela `verification_links` e retornar a URL mascarada:
```
https://www.mktpfacil.com/verificar?t={id}
```

### 3. Página frontend `/verificar`
Nova rota React que:
- Lê o parâmetro `t` da URL
- Busca o `verification_url` na tabela `verification_links`
- Se válido e não expirado, redireciona com `window.location.href`
- Se inválido/expirado, mostra mensagem amigável

### 4. Rota no App.tsx
Adicionar `/verificar` como rota pública (sem auth gate).

## Arquivos afetados
- **Nova migration SQL** — criar tabela `verification_links`
- **`supabase/functions/admin-resend-verification/index.ts`** — salvar link e retornar URL mascarada
- **Novo `src/pages/Verificar.tsx`** — página de redirect
- **`src/App.tsx`** — adicionar rota `/verificar`

## Resultado
- Link copiado: `https://www.mktpfacil.com/verificar?t=abc123`
- Zero menção a Lovable ou Supabase
- Links expiram em 72h automaticamente
- Funciona com o domínio personalizado já configurado

