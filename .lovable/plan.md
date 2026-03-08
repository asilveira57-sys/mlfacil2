

## Plano: Contornar PolicyAgent com Multi-Get + Search Fallback

### Resumo

Substituir `GET /items/{id}` por `GET /items?ids={id}&attributes=all` (multi-get) como tentativa principal em todas as 3 Edge Functions. Adicionar fallback via Search API. Manter cache como último recurso.

### Nova ordem de tentativas

```text
1. Multi-get autenticado: GET /items?ids=MLB...&attributes=all (Bearer token)
2. Multi-get público: GET /items?ids=MLB... (sem token)
3. Search fallback: GET /sites/MLB/search?q=MLB... (Bearer token)
4. Single-get legado público: GET /items/MLB... (último recurso)
5. Cache local (meli_listings_cache)
6. Erro final
```

### Alterações por arquivo

#### 1. `supabase/functions/ad-item-snapshot/index.ts`

- Adicionar função `mlMultiGetFetch(supabase, userId, { itemId, accessToken?, attempt })` que chama `/items?ids={id}&attributes=all` e extrai `response[0].body`
- Adicionar função `mlSearchFallback(supabase, userId, { itemId, accessToken, attempt })` que chama `/sites/MLB/search?q={id}&limit=1`
- Substituir a lógica de tentativas (Etapas 3A/3B/3C) pela nova ordem:
  - **A**: Multi-get autenticado (se tem token)
  - **B**: Multi-get público (sem token)
  - **C**: Search fallback autenticado
  - **D**: Single-get público legado (manter `mlPublicFetch` existente como fallback)
  - **E**: Cache (sem mudança)
- Descrição continua via `/items/{id}/description` (endpoint separado, sem PolicyAgent)

#### 2. `supabase/functions/create-listing-capture/index.ts`

- Adicionar mesmas funções `multiGetFetch` e `searchFallback` (inline, já que não há shared module)
- Substituir `fetchItemPublic` + `fetchItemAuthenticated` pela nova ordem de tentativas
- Descrição continua via `fetchDescriptionPublic` existente

#### 3. `supabase/functions/ml-get-item/index.ts`

- Substituir `GET /items/${itemId}` por multi-get `GET /items?ids=${itemId}&attributes=all`
- Manter lógica de refresh de token existente

### Funções novas (padrão compartilhado)

```typescript
// Multi-get: retorna array [{code: 200, body: {...}}]
async function mlMultiGetFetch(params: {
  itemId: string;
  accessToken?: string;
}): Promise<{ ok: boolean; data?: any; status: number }> {
  const url = `https://api.mercadolibre.com/items?ids=${params.itemId}&attributes=all`;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (params.accessToken) {
    headers['Authorization'] = `Bearer ${params.accessToken}`;
  }
  const response = await fetch(url, { headers });
  const results = await response.json();
  if (Array.isArray(results) && results[0]?.code === 200 && results[0].body) {
    return { ok: true, data: results[0].body, status: 200 };
  }
  return { ok: false, status: results?.[0]?.code || response.status };
}

// Search fallback
async function mlSearchFallback(params: {
  itemId: string;
  accessToken?: string;
}): Promise<{ ok: boolean; data?: any }> {
  const url = `https://api.mercadolibre.com/sites/MLB/search?q=${params.itemId}&limit=1`;
  const headers: Record<string, string> = {};
  if (params.accessToken) {
    headers['Authorization'] = `Bearer ${params.accessToken}`;
  }
  const response = await fetch(url, { headers });
  const searchData = await response.json();
  if (searchData.results?.[0]?.id === params.itemId) {
    return { ok: true, data: searchData.results[0] };
  }
  return { ok: false };
}
```

### Notas importantes

- O endpoint `/items/{id}/description` **não** foi afetado pelo PolicyAgent — não precisa mudar
- O multi-get retorna `pictures` completas e `attributes`, igual ao single-get
- O search fallback retorna dados mais limitados (sem `description`, sem `attributes` completos), por isso é última opção antes do cache
- Logs de auditoria mantidos em cada tentativa para diagnóstico

