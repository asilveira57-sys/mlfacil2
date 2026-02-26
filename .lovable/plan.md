

## Dois problemas a resolver

---

### Problema 1: Email auto-confirmado no cadastro

O sistema está com auto-confirm habilitado — ao criar conta, o `email_confirmed_at` é preenchido instantaneamente sem o usuário clicar em nenhum link. Isso permite acesso sem email válido.

**Correção:**
- Desabilitar auto-confirm via ferramenta `configure-auth` (email confirmations = required)
- Ajustar a página `Auth.tsx` para exibir mensagem de "verifique seu email" após signup, em vez de redirecionar direto ao dashboard

---

### Problema 2: Canal Oficial — filtro por seller

Hoje o campo `plan_target` filtra apenas por plano (all/free/pro/enterprise). Mas comunicados gerados por ações automáticas (ex: adesão a campanhas) só interessam ao seller que executou a ação. Precisamos de um filtro por seller.

**Modelo proposto para targeting:**

| Cenário | plan_target | target_seller_id |
|---|---|---|
| Comunicado para todos | `all` | `NULL` |
| Comunicado para plano específico | `pro` | `NULL` |
| Comunicado para seller específico | `all` | `uuid do seller` |

**Alterações no banco:**
- Adicionar coluna `target_seller_id UUID NULL` em `mktpfacil_announcements`
- Criar índice nessa coluna

**Alterações no código:**

1. **`useOfficialChannel.ts`** — Na query de `useAnnouncements`, filtrar: só retornar comunicados onde `target_seller_id IS NULL` OU `target_seller_id = sellerId do usuário ativo`. Buscar o `sellerId` do contexto ativo.

2. **`promotion-agent-run/index.ts`** — Ao criar o comunicado de adesão, gravar `target_seller_id` com o `sellerId` que executou a ação (já disponível como parâmetro da função).

3. **`AdminCanalOficial.tsx`** — Adicionar campo opcional "Seller alvo" no formulário admin (input de texto/UUID ou select com sellers conhecidos). Exibir badge de seller na lista quando preenchido.

4. **`OfficialChannelDrawer.tsx`** — Nenhuma mudança estrutural; o filtro fica na query do hook.

---

### Resumo de arquivos

| Arquivo | Mudança |
|---|---|
| Auth config | Desabilitar auto-confirm email |
| `src/pages/Auth.tsx` | Tratar estado pós-signup (mensagem de verificação) |
| Migration SQL | Adicionar `target_seller_id` em `mktpfacil_announcements` |
| `src/hooks/useOfficialChannel.ts` | Filtrar por `target_seller_id` usando seller ativo |
| `supabase/functions/promotion-agent-run/index.ts` | Gravar `target_seller_id` no comunicado |
| `src/pages/admin/AdminCanalOficial.tsx` | Campo de seller alvo no formulário |

