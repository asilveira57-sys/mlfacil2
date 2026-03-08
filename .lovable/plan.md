

## Plano: Fix Refresh na Concorrência + 0 Anúncios no Seller

### Problema 1: Refresh ao trocar aba/view dentro da página

**Causa raiz**: `TrackedCompetitorsTab` tem um `useEffect` (linha 73-76) que chama `fetchTrackers` e `fetchOverview` com `fetchTrackers` e `fetchOverview` como dependências. Quando `setViewMode` atualiza o `searchParams`, o hook `useSearchParams` causa re-render do componente. O `useEffect` re-executa porque `fetchTrackers`/`fetchOverview` são recriados a cada render do hook `useCompetitorTracking` (que usa `useState` internamente, mas `fetchTrackers` tem `sellerId` como dep e é `useCallback` — estável). 

Porém, o problema principal é que **qualquer mudança no `searchParams`** (ex: `view=sellers`) causa re-render em `TrackedCompetitorsTab` porque ele chama `useSearchParams`. Isso causa o `useEffect` disparar novamente (mesmo que deps sejam estáveis, a mudança de URL causa unmount/remount de subcomponentes via `TabsContent`).

**Mesma causa no `SellerTrackingList`**: linha 40-42, `useEffect` com `fetchSellers` como dep. Toda vez que o componente monta (ao trocar de view), dispara fetch.

**Solução**:
- Mover o fetch para um nível estável: usar `useRef` para evitar re-fetch se os dados já existem
- Adicionar guard no `useEffect` para só buscar se `sellers.length === 0` (primeiro mount) ou se explicitamente solicitado
- No `TrackedCompetitorsTab`, usar `forceUpdate: false` pattern — guardar dados em ref e só re-fetch se `sellerId` realmente mudar

### Problema 2: Seller adicionado com 0 anúncios

**Causa raiz**: `fetchSellerListings` usa `/sites/MLB/search?seller_id=X` que retorna 403 (PolicyAgent). O `fetchMLResilient` tenta com auth e depois sem auth — ambos falham. O `catch` no loop faz `break`, retornando array vazio. Resultado: seller inserido com `total_items_tracked: 0`.

**Solução**: Usar endpoint alternativo `/users/{seller_id}/items/search` que é menos bloqueado pelo PolicyAgent. Se esse também falhar, tentar o endpoint multiget batch para buscar os IDs de items do seller via outros meios.

---

### Arquivos a alterar

**1. `src/components/competitor/TrackedCompetitorsTab.tsx`**
- Adicionar `hasFetchedRef` para evitar re-fetch desnecessário
- Guard no useEffect: só fetch se `sellerId` mudou ou primeira vez
- Separar a lógica de `searchParams` para não causar re-renders desnecessários

**2. `src/components/competitor/SellerTrackingList.tsx`**
- Mesmo pattern: `hasFetchedRef` + guard para evitar re-fetch ao montar/desmontar por troca de view
- Mover `fetchSellers` para só executar se dados estão vazios ou sellerId mudou

**3. `src/hooks/useCompetitorSellers.ts`**
- Adicionar cache: se já tem sellers carregados para o mesmo sellerId, retornar imediatamente
- Expor `refresh` separado de `fetchSellers` (para botão manual)

**4. `supabase/functions/competitor-seller-sync/index.ts`**
- Em `fetchSellerListings`: adicionar fallback usando `/users/{seller_id}/items/search` endpoint
- Se `/sites/MLB/search?seller_id=X` retorna 403, tentar `/users/{mlSellerId}/items/search?status=active&offset=X&limit=50` com token autenticado
- Esse endpoint funciona melhor para sellers autenticados e geralmente não é bloqueado pelo PolicyAgent

### Fluxo corrigido

```text
Troca de view (Anúncios → Sellers):
  -> SellerTrackingList monta
  -> useEffect verifica: hasFetchedRef.current === true && sellerId unchanged?
  -> SIM → skip fetch, usa dados do hook (preservados no state do pai)
  -> NÃO → fetch uma vez, marca hasFetchedRef

Add Seller:
  -> resolveSellerFromInput (OK, encontra seller)
  -> fetchSellerListings:
     1. Tenta /sites/MLB/search?seller_id=X (403 → catch → continua)
     2. Fallback: /users/X/items/search?status=active (geralmente funciona com auth)
  -> Items encontrados → insere no DB
```

