

## Plano: Migrar IA do Lovable Gateway para OpenAI API Direta

### Escopo

4 edge functions usam o gateway Lovable AI para chamadas de IA:

| Função | URL atual |
|---|---|
| `ads-ai-consultant` | `ai.gateway.lovable.dev` |
| `blog-generate-article` | `ai.gateway.lovable.dev` |
| `generate-message-suggestions` | `ai.gateway.lovable.dev` |
| `post-sale-messages` | `api.lovable.dev` |

> `auth-email-hook` usa `LOVABLE_API_KEY` para autenticação de webhook, **não** para IA — permanece inalterado.

### Alterações

**1. Salvar secret `OPENAI_API_KEY`** via ferramenta de secrets

**2. Em cada uma das 4 funções, substituir:**
- `LOVABLE_API_KEY` → `OPENAI_API_KEY` (apenas nas chamadas de IA)
- `ai.gateway.lovable.dev/v1/chat/completions` → `api.openai.com/v1/chat/completions`
- Modelos: `google/gemini-2.5-flash` → `gpt-4o-mini`, `google/gemini-2.5-pro` → `gpt-4o`
- Header `Authorization: Bearer ${OPENAI_API_KEY}`

**3. Mapeamento de modelos:**
- `google/gemini-2.5-flash` / `gemini-2.5-flash` → `gpt-4o-mini` (rápido, barato)
- `google/gemini-2.5-pro` → `gpt-4o` (quando precisar de mais capacidade)

### Arquivos alterados
- `supabase/functions/ads-ai-consultant/index.ts`
- `supabase/functions/blog-generate-article/index.ts`
- `supabase/functions/generate-message-suggestions/index.ts`
- `supabase/functions/post-sale-messages/index.ts`

### Resultado
- Zero consumo de créditos Lovable AI
- Controle direto de custo via dashboard da OpenAI
- Comportamento idêntico para o usuário final

