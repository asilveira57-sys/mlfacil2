

## Problem Analysis

Looking at the console logs, **every single ML API call is returning 403** from the browser — `/items/`, `/search`, everything. The client-side approach that was implemented to "bypass IP blocks" is also being blocked by ML's PolicyAgent from the Lovable preview domain.

The specific URL the user pasted is:
```
https://www.mercadolivre.com.br/par-trava-da-tampa-impressora-elgin-l42-dt/p/MLB2068148114#...&wid=MLB4083136109&sid=search
```

Two key problems:
1. **`MLB2068148114` is a catalog page ID** (under `/p/`), not a regular listing — the API blocks access to it
2. **`wid=MLB4083136109`** in the URL fragment is the **actual item listing ID** but is never extracted
3. Even when fallbacks run (search by slug, etc.), the ML API blocks everything from this origin

## Plan

### 1. Extract `wid=` from URL fragments (client-side)

In `src/lib/meli/extractMeliId.ts`, add a new highest-priority pattern to extract `wid=MLBxxxxxx` from URL hash fragments. This gives us the real listing ID instead of the catalog page ID.

### 2. Hybrid resolution: client-side first, then edge function fallback

In `src/lib/meli/resolveSellerFromLink.ts` and `AddCompetitorSellerDialog.tsx`:
- Try client-side resolution first (current approach)
- If client-side gets 403, **fall back to the edge function** which has ML auth tokens that bypass PolicyAgent
- The edge function's `fetchMLResilient` already tries authenticated requests first

### 3. Add HTML page scraping as final fallback in edge function

In `supabase/functions/competitor-seller-sync/index.ts`, add a new function that:
- Fetches the actual ML product page HTML (not the API)
- Parses it to extract seller ID from the page's embedded JSON data (`__PRELOADED_STATE__` or JSON-LD)
- Uses that seller ID to fetch user data via API

This works because the product page is a public website meant for browsers, unlike the API which has PolicyAgent restrictions.

### 4. Better error messaging

Update the error message to stop saying "inativo ou removido" when the real issue is API access restrictions. Show a more accurate message like "Não foi possível acessar a API do Mercado Livre. Tente informar o ID numérico do vendedor."

### Technical Details

**File changes:**

- `src/lib/meli/extractMeliId.ts` — Add `wid=` extraction as Priority 0 in `MLB_PRIORITY_PATTERNS`
- `src/lib/meli/resolveSellerFromLink.ts` — Add edge function fallback when all client-side attempts get 403
- `src/components/competitor/AddCompetitorSellerDialog.tsx` — Wire up the hybrid flow (client → edge function)
- `supabase/functions/competitor-seller-sync/index.ts` — Add `scrapeSellerFromPage()` function as final fallback in `resolveSellerFromInput`

