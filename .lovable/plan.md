

## Plano: Fix Concorrencia - Performance, Tab Reset, e Seller Resolution

### 3 Problemas Identificados

**1. Seller resolution falha (403 em todas as APIs ML do browser)**
- O `AddCompetitorSellerDialog` chama `resolveSellerFromLink` que faz fetch direto do browser para `api.mercadolibre.com`
- O browser do usuario esta recebendo 403 (PolicyAgent) em TODOS os endpoints: `/items`, `/search`, batch
- Mas a edge function `competitor-seller-sync` tem token autenticado e funciona (logs mostram "Token refreshed successfully")
- **Solucao**: Parar de resolver client-side. Usar a action `preview` da edge function que ja existe e ja usa token autenticado

**2. Tab reseta ao navegar (Sellers -> sai -> volta -> mostra Anuncios)**
- `activeTab` em `Concorrencia.tsx` (linha 39) usa `useState('tracked')` sem persistencia
- Quando navega para outra pagina e volta, o componente remonta e `activeTab` volta para `'tracked'`
- O `viewMode` dentro de `TrackedCompetitorsTab` tambem reseta para `'listings'` (linha 62)
- **Solucao**: Persistir `activeTab` e `viewMode` na URL via query params (`?tab=tracked&view=sellers`)

**3. Lentidao ao trocar para aba Sellers (4-5s)**
- `SellerTrackingList` chama `fetchSellers` no `useEffect` que invoca a edge function `competitor-seller-sync`
- A edge function faz `getFreshAccessToken` que SEMPRE faz refresh do token ML (linha 57: "Always refresh to ensure fresh token")
- Isso adiciona ~1-2s de latencia desnecessaria em cada chamada `list`
- Alem disso, ao trocar viewMode de listings->sellers, o componente monta e dispara o fetch
- **Solucao**: Na edge function, so refreshar token quando realmente necessario (verificar `token_expires_at`). No frontend, cachear resultado do fetch.

---

### Arquivos a alterar

**1. `src/components/competitor/AddCompetitorSellerDialog.tsx`**
- Remover import de `resolveSellerFromLink` (client-side)
- `handlePreview`: chamar a edge function `competitor-seller-sync` com `action: 'preview'` em vez de resolver client-side
- Isso usa o token autenticado do seller, contornando os 403

**2. `src/pages/Concorrencia.tsx`**
- Ler `activeTab` da URL query param `?tab=` com fallback para `'tracked'`
- No `setActiveTab`, atualizar query param na URL sem reload (`navigate` com `replace`)
- Resultado: sair e voltar preserva a aba

**3. `src/components/competitor/TrackedCompetitorsTab.tsx`**
- Ler `viewMode` da URL query param `?view=` com fallback para `'listings'`
- No `setViewMode`, atualizar query param

**4. `supabase/functions/competitor-seller-sync/index.ts`**
- Em `getFreshAccessToken`: verificar `token_expires_at` antes de refreshar
- So refreshar se token expira em menos de 30 minutos
- Isso elimina ~1-2s de latencia desnecessaria na maioria das chamadas

### Fluxo corrigido de adicionar seller

```text
Usuario cola MLB3852634175
  -> handlePreview()
  -> POST competitor-seller-sync { action: 'preview', input: 'MLB3852634175', seller_id }
  -> Edge function usa token autenticado
  -> fetchMLResilient(/items/MLB3852634175) com auth header
  -> Resolve seller_id -> /users/{id} -> retorna preview
  -> UI mostra nickname, reputacao, total de anuncios
  -> Usuario clica "Monitorar"
  -> POST competitor-seller-sync { action: 'add', ... }
```

