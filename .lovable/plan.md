

## Plano: Refatoração do Módulo de Concorrência

### Problemas Identificados

1. **MLBU não resolve seller** — Links de catálogo (`/up/MLBU...`) não conseguem resolver o vendedor porque a API pública do ML não retorna `seller_id` consistentemente para produtos de catálogo. O screenshot mostra exatamente isso: `MLBU1741535571` falhou.

2. **"ID externo não disponível"** — Trackers criados com `competitor_external_id = null` (quando o parse falhou) ficam permanentemente quebrados. O `check` action retorna 400 porque não tem o MLB ID.

3. **Dois sistemas paralelos desconectados** — Existem DUAS edge functions (`competitor-tracking` para anúncios individuais e `competitor-seller-sync` para sellers inteiros), cada uma com sua própria lógica de resolução ML, seus próprios patterns de URL, e tabelas diferentes. Isso causa confusão e duplicação.

4. **Resolução client-side vs server-side inconsistente** — `AddCompetitorSellerDialog` usa resolução client-side (`resolveSellerFromLink.ts`), enquanto `AddTrackedListingDialog` manda a URL crua para a edge function que faz server-side. Os dois caminhos têm parsers diferentes com bugs diferentes.

5. **Links de catálogo** — A API `/products/{MLBU_ID}` retorna `buy_box_winner` mas exige autenticação. A API `/sites/MLB/search?catalog_product_id=MLBU...` funciona publicamente mas pode não retornar resultados para todos os catálogos.

### Plano de Correção

**Fase 1: Unificar resolução de ID (client-side como padrão)**

O browser do usuário não sofre bloqueio PolicyAgent (403). A resolução deve ser **sempre client-side** e o resultado enviado já resolvido para a edge function.

- **Atualizar `resolveSellerFromLink.ts`**: Adicionar fallback para MLBU usando `/sites/MLB/search?catalog_product_id=MLBU...&limit=5` (retorna múltiplos sellers). Se não encontrar, usar slug do título da URL como query de busca.

- **Atualizar `AddCompetitorSellerDialog`**: Já usa resolução client-side — está OK.

- **Atualizar `AddTrackedListingDialog`**: Mudar para fazer resolução **client-side** do MLB ID antes de enviar para a edge function. Usar `extractMeliId()` + fetch público no browser para obter dados do anúncio (título, preço, thumbnail) e enviar tudo já resolvido para a edge function.

**Fase 2: Corrigir edge function `competitor-tracking`**

- **Ação `add`**: Aceitar `competitor_external_id` já resolvido do client. Se não vier, tentar parse server-side como fallback, mas nunca salvar tracker com `competitor_external_id = null`.

- **Ação `check`**: Se `competitor_external_id` for null, tentar re-resolver a partir de `competitor_url` antes de retornar erro. Se resolver, atualizar o tracker.

- **Remover parse duplicado**: A edge function não precisa mais de `parseMLItemId()` complexo — o client já envia o ID resolvido.

**Fase 3: Melhorar o fluxo de "Adicionar Concorrente" (anúncio)**

- Ao colar a URL, fazer um **preview automático** (como já faz no seller dialog): buscar título, preço, thumbnail e mostrar antes de confirmar.
- Rejeitar MLBU links no fluxo de anúncio individual com mensagem clara: "Este é um link de catálogo. Use a aba Sellers para monitorar o vendedor."

**Fase 4: Corrigir trackers órfãos existentes**

- Criar uma ação `repair` na edge function que busca todos os trackers com `competitor_external_id = null`, tenta re-extrair o ID da `competitor_url`, e atualiza. Os que não puderem ser resolvidos ficam com status `erro`.

### Detalhes Técnicos

| Arquivo | Mudança |
|---|---|
| `src/lib/meli/resolveSellerFromLink.ts` | Melhorar fallback MLBU com múltiplos sellers |
| `src/components/competitor/AddTrackedListingDialog.tsx` | Resolução client-side + preview antes de adicionar |
| `supabase/functions/competitor-tracking/index.ts` | Aceitar ID pré-resolvido; ação `repair`; fallback no `check` |
| `src/hooks/useCompetitorTracking.ts` | Enviar `competitor_external_id` já resolvido no `addTracker` |
| `src/lib/meli/extractMeliId.ts` | Sem mudança (já funciona bem) |

### Resultado Esperado

- Links de catálogo (MLBU) direcionam para monitoramento de seller com mensagem clara
- Links de anúncio (MLB) são resolvidos client-side, com preview, e salvos com ID correto
- Trackers existentes sem ID são reparados automaticamente
- O erro "ID externo não disponível" não acontece mais

