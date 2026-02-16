
# Correcao da Central de Promocoes - Plano Revisado

## Diagnostico

1. **Thumbnails e titulos vazios**: O `raw_item_data` da API de promocoes NAO contem `title` nem `thumbnail` (so tem dados de preco/desconto). O cache local de anuncios (`meli_listings_cache`) tem 0 registros para o seller atual. O fallback via API publica do ML no browser falha por CORS (browser nao pode chamar `api.mercadolibre.com` diretamente).

2. **Adesao nao funciona**: A Edge Function `promotions-action` NUNCA foi deployada (zero logs). O codigo esta correto mas precisa ser deployado.

3. **Modal fecha antes da acao terminar**: O componente `AlertDialogAction` do Radix fecha automaticamente o dialog quando clicado, ANTES da Promise async resolver. Resultado: o usuario ve a tela voltar para a lista de promocoes antes de a acao completar.

4. **"Voce recebe"**: O usuario pediu para NAO implementar agora - requer analise mais cuidadosa considerando comissao + frete.

## Solucao

### Parte 1: Enriquecer durante a sincronizacao (sem edge function nova)

Em vez de criar uma edge function separada, o enriquecimento acontece dentro do `promotions-sync` que ja roda no servidor (sem CORS). Apos sincronizar os itens de cada promocao, buscar titulo/thumbnail na API publica do ML para os item_ids que NAO estao no `meli_listings_cache`, e salvar no cache.

Isso resolve o problema na raiz: na proxima vez que o usuario abrir a central de promocoes, os dados visuais ja estarao no banco.

**Arquivo:** `supabase/functions/promotions-sync/index.ts`

Apos o loop de upsert dos itens (linha ~417), adicionar:
- Coletar todos os `item_id` unicos dos itens da promocao
- Verificar quais JA existem na `meli_listings_cache`
- Para os que faltam, buscar `GET /items?ids={ids}&attributes=id,title,thumbnail,permalink` na API do ML (batches de 20)
- Upsert em `meli_listings_cache` com os dados basicos (item_id, seller_id, title, thumbnail, permalink)

### Parte 2: Fallback imediato no frontend (para sessao atual)

Como o enriquecimento na sync resolve para FUTURAS sessoes, para a sessao ATUAL (antes de re-sincronizar), o hook precisa buscar os dados faltantes. Como o browser nao pode chamar a API do ML diretamente (CORS), a solucao e usar a propria edge function `promotions-action` para retornar uma rota de enriquecimento, OU aceitar o trade-off de exigir uma re-sync.

A abordagem mais simples e eficiente: adicionar uma rota `enrich` na MESMA edge function `promotions-action` (sem criar funcao nova). Quando `action = "enrich"`, busca titulo/thumbnail do ML e retorna.

**Arquivo:** `supabase/functions/promotions-action/index.ts`

Adicionar acao `"enrich"`:
- Recebe `{ action: "enrich", items: [{ item_id: "MLB..." }, ...] }`
- Busca `GET /items?ids={ids}` na API publica do ML (nao precisa token)
- Retorna `{ data: { MLB123: { title, thumbnail, permalink }, ... } }`
- Nao precisa de workspace_id, seller_id nem token - usa API publica

**Arquivo:** `src/hooks/useEnrichedPromotionItems.ts`

- Remover o `fetch` direto para `api.mercadolibre.com` (bloqueado por CORS)
- Substituir pela chamada a `promotions-action` com `action: "enrich"` via `supabase.functions.invoke`
- Isso usa o proxy do backend, sem problemas de CORS

### Parte 3: Deploy da edge function de adesao

A `promotions-action` precisa ser deployada. O codigo ja esta correto (endpoint v2 + offer_id para SMART), so falta o deploy.

### Parte 4: Corrigir fechamento prematuro do modal

**Arquivo:** `src/pages/Promocoes.tsx`

- Trocar `AlertDialogAction` por um `Button` normal dentro do `AlertDialogFooter`
- Usar `e.preventDefault()` para impedir o fechamento automatico
- Controlar o fechamento manualmente: so fechar apos a acao completar
- Manter o modal de detalhes da promocao aberto apos a acao

### Parte 5: "Voce recebe" - NAO implementar agora

Conforme solicitado, o calculo de "Voce recebe" sera tratado separadamente em momento futuro, considerando comissao + frete corretamente.

---

## Detalhes Tecnicos

### Enriquecimento na sync (`promotions-sync/index.ts`)

Apos o loop dos itens (~linha 417), adicionar bloco:

```text
1. Coletar item_ids unicos do promo.items
2. Consultar meli_listings_cache para ver quais ja existem
3. Para os faltantes, chamar GET /items?ids=X,Y,Z&attributes=id,title,thumbnail,permalink
4. Upsert no meli_listings_cache com dados basicos
```

Nao precisa de token de acesso - a API publica de items aceita requests sem autenticacao.

### Rota "enrich" na `promotions-action`

```text
action = "enrich":
  - Nao precisa de seller_id, workspace_id, promotion_id
  - Recebe apenas items[].item_id
  - Chama API publica ML em batches de 20
  - Retorna mapa { item_id: { title, thumbnail, permalink } }
```

### Correcao do AlertDialog (`Promocoes.tsx`)

Trocar:
```text
<AlertDialogAction onClick={...} disabled={actionLoading}>
  Confirmar
</AlertDialogAction>
```

Por:
```text
<Button onClick={async (e) => { e.preventDefault(); await handleAction(); }}>
  Confirmar
</Button>
```

E controlar o `onOpenChange` do AlertDialog para nao fechar enquanto `actionLoading` for true.

### Impacto nos arquivos

| Arquivo | Acao |
|---------|------|
| `supabase/functions/promotions-sync/index.ts` | Enriquecer items com titulo/thumb apos sync |
| `supabase/functions/promotions-action/index.ts` | Adicionar rota "enrich"; deploy |
| `src/hooks/useEnrichedPromotionItems.ts` | Usar rota "enrich" via edge function (sem CORS) |
| `src/pages/Promocoes.tsx` | Corrigir AlertDialog para nao fechar antes da acao completar |

### Resultado esperado

- Titulos e thumbnails aparecem via cache (populado na sync) + fallback via edge function
- Adesao SMART funciona (edge function deployada com endpoint v2 + offer_id)
- Modal permanece aberto durante e apos a adesao
- "Voce recebe" fica para implementacao futura
