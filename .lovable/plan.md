

# Plano: Corrigir Erro 403 ao Buscar Item de Outro Vendedor

## Diagnóstico

O erro `FETCH_FAILED` com status 403 `access_denied` ocorre porque:

1. O sistema está tentando clonar um anúncio de **outro vendedor** (concorrente)
2. A busca do item está usando **token de autenticação** na chamada `GET /items/{id}`
3. Quando você envia um token para acessar um item que **não é seu**, o Mercado Livre retorna 403

### Evidência:
```json
{
  "error": "FETCH_FAILED",
  "api_error": "{\"message\":\"Access to the requested resource is forbidden\",\"error\":\"access_denied\",\"status\":403}"
}
```

### Código Problemático (linha 1500-1502):
```typescript
const getResponse = await fetch(`https://api.mercadolibre.com/items/${resolvedItemId}`, {
  headers: { Authorization: `Bearer ${currentAccessToken}` }, // ← SEMPRE envia token
});
```

---

## Solução

Aplicar o padrão **"public first, auth fallback"** que já existe em outras edge functions do projeto:

1. **Tentar primeiro SEM autenticação** (endpoint público)
2. **Se falhar com 403, tentar COM autenticação** (para itens próprios)

---

## Alterações

### Arquivo: `supabase/functions/ad-action-execute/index.ts`

**Substituir linhas 1498-1515:**

```typescript
// Fetch real item (MLB) - PUBLIC FIRST, AUTH FALLBACK
console.log(`[ad-action-execute] Fetching item data (public): ${resolvedItemId}`);
let getResponse = await fetch(`https://api.mercadolibre.com/items/${resolvedItemId}`);

// Se falhar com 403 no público, tentar com auth (pode ser item próprio com restrição)
if (!getResponse.ok && getResponse.status === 403) {
  console.log(`[ad-action-execute] Public fetch returned 403, trying with auth token...`);
  getResponse = await fetch(`https://api.mercadolibre.com/items/${resolvedItemId}`, {
    headers: { Authorization: `Bearer ${currentAccessToken}` },
  });
}

if (!getResponse.ok) {
  const errBody = await getResponse.text().catch(() => "");
  return {
    success: false,
    error: getResponse.status === 404 ? "NOT_FOUND" : "FETCH_FAILED",
    message: `Falha ao buscar item ${resolvedItemId}`,
    api_status: getResponse.status,
    api_error: errBody,
  };
}

itemData = await getResponse.json();
```

---

## Fluxo Corrigido

```text
Clone de item MLB6225626056
    ↓
[1] GET /items/MLB6225626056 (SEM auth)
    ↓
    200 OK → Sucesso, usar dados públicos
    ↓
[2] Se 403 → GET /items/MLB6225626056 (COM auth)
    ↓
    200 OK → Item próprio, usar dados
    403 → Erro real (item restrito)
```

---

## Impacto

| Aspecto | Avaliação |
|---------|-----------|
| Risco | Muito baixo - padrão já usado em outras funções |
| Performance | Igual ou melhor (menos headers enviados no caso comum) |
| Compatibilidade | Total - funciona para itens próprios e de concorrentes |

---

## Referência de Implementação Existente

O arquivo `supabase/functions/learn-listing/index.ts` (linhas 245-254) já usa esse padrão:

```typescript
// Fetch item from ML API - try public endpoint first, then with auth
let itemResponse = await fetch(`https://api.mercadolibre.com/items/${itemId}`);

// If public fetch fails, try with auth token
if (!itemResponse.ok && itemResponse.status === 403) {
  itemResponse = await fetch(`https://api.mercadolibre.com/items/${itemId}`, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });
}
```

---

## Resultado Esperado

Após a correção:
- Clonagem de anúncios de **concorrentes** → funciona (endpoint público)
- Clonagem de anúncios **próprios** → funciona (fallback com auth)
- O erro `FETCH_FAILED 403 access_denied` será eliminado
