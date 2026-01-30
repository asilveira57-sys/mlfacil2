

## Objetivo

Implementar um fluxo oficial, estável e sem scraping para resolver IDs de catálogo (MLBU) em um `item_id` real (MLB) e permitir clonagem correta, seguindo as regras da API oficial do Mercado Livre.

---

## Problema Atual

O código atual tenta tratar MLBU como MLB através da função `normalizeProductId()`, que simplesmente remove o "U" do ID:
- `MLBU1436905343` → `MLB1436905343`

Isso gera 404 em todos os endpoints porque `MLB1436905343` não existe como produto/item — é um ID de catálogo universal.

---

## Solução Proposta

### Regras Obrigatórias (conforme prompt)

1. **MLBU nunca deve ser normalizado para MLB** - são coisas diferentes
2. **Usar API oficial de catálogo** - `/products/{MLBU}` com `buy_box_winner.item_id`
3. **Sem scraping** - nenhum fetch de HTML
4. **Logs claros** - cada etapa logada para debug
5. **Mensagem final clara** quando não há vendedor ativo

---

## Arquitetura do Novo Fluxo

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                         DETECÇÃO DE ORIGEM                              │
├─────────────────────────────────────────────────────────────────────────┤
│ Input: MLB1234567890  → Tratar como ITEM NORMAL                         │
│ Input: MLBU1234567890 → Tratar como CATÁLOGO (buy_box_winner)           │
│ Input: /p/MLBU...     → Extrair MLBU e tratar como CATÁLOGO             │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│              FLUXO CATÁLOGO (quando ID começa com MLBU)                 │
├─────────────────────────────────────────────────────────────────────────┤
│ 1. GET /products/{MLBU}                                                 │
│    → Extrair buy_box_winner.item_id (ex: MLB5678901234)                 │
│                                                                         │
│ 2. Se não existe buy_box_winner:                                        │
│    → Retornar erro claro com orientação                                 │
│                                                                         │
│ 3. Com o item_id real:                                                  │
│    → GET /items/{item_id}                                               │
│    → Seguir fluxo normal de clonagem                                    │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│              FLUXO ITEM NORMAL (quando ID começa com MLB)               │
├─────────────────────────────────────────────────────────────────────────┤
│ 1. GET /items/{MLB}                                                     │
│    → Seguir fluxo normal de clonagem                                    │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Mudanças Técnicas

### 1. Backend: `supabase/functions/ad-action-execute/index.ts`

**Remover lógica problemática:**
- Função `normalizeProductId()` que converte MLBU → MLB
- Função `fetchCatalogItemData()` com múltiplos tiers de fallback

**Adicionar nova lógica:**

```typescript
// Nova função de detecção
function isCatalogId(itemId: string): boolean {
  return /^MLBU/i.test(itemId); // Apenas MLBU é catálogo
}

// Nova função de resolução de catálogo (única fonte de verdade)
async function resolveCatalogItem(
  accessToken: string, 
  catalogId: string
): Promise<{ ok: boolean; itemId?: string; productData?: any; error?: string }> {
  console.log(`[ad-action-execute] Resolving catalog ID: ${catalogId}`);
  
  // GET /products/{MLBU} (API oficial de catálogo)
  const productRes = await fetch(
    `https://api.mercadolibre.com/products/${catalogId}`,
    { headers: { "Authorization": `Bearer ${accessToken}` } }
  );
  
  console.log(`[ad-action-execute] /products/${catalogId} status: ${productRes.status}`);
  
  if (!productRes.ok) {
    return { 
      ok: false, 
      error: `Produto de catálogo não encontrado (${catalogId}). Verifique se o link está correto.` 
    };
  }
  
  const product = await productRes.json();
  console.log(`[ad-action-execute] Product found: ${product.name}`);
  
  // Verificar buy_box_winner
  if (!product.buy_box_winner?.item_id) {
    console.log(`[ad-action-execute] No buy_box_winner for catalog ${catalogId}`);
    return { 
      ok: false, 
      error: "Este produto está em catálogo, mas não possui um vendedor ativo no momento. Cole o link de um anúncio específico (MLB) para continuar.",
      productData: product,
    };
  }
  
  const realItemId = product.buy_box_winner.item_id;
  console.log(`[ad-action-execute] buy_box_winner.item_id resolved: ${realItemId}`);
  
  return { ok: true, itemId: realItemId, productData: product };
}
```

**Ajustar `executeCloneAction()`:**

```typescript
async function executeCloneAction(accessToken, itemId, snapshot, checklist) {
  let itemData = snapshot;
  let resolvedItemId = itemId;
  let catalogInfo = null;
  
  if (!itemData || Object.keys(itemData).length === 0) {
    // DETECÇÃO: É catálogo (MLBU) ou item normal (MLB)?
    if (isCatalogId(itemId)) {
      console.log(`[ad-action-execute] Detected CATALOG ID: ${itemId}`);
      
      // Resolver catálogo via API oficial
      const catalogResult = await resolveCatalogItem(accessToken, itemId);
      if (!catalogResult.ok) {
        return { 
          success: false, 
          error: catalogResult.error,
          is_catalog: true,
          catalog_id: itemId,
        };
      }
      
      resolvedItemId = catalogResult.itemId;
      catalogInfo = {
        original_catalog_id: itemId,
        buy_box_winner_id: resolvedItemId,
        product_name: catalogResult.productData?.name,
      };
      
      console.log(`[ad-action-execute] Catalog resolved to item: ${resolvedItemId}`);
    }
    
    // Buscar item real (MLB)
    console.log(`[ad-action-execute] Fetching item data: ${resolvedItemId}`);
    const getResponse = await fetch(
      `https://api.mercadolibre.com/items/${resolvedItemId}`,
      { headers: { "Authorization": `Bearer ${accessToken}` } }
    );
    
    if (!getResponse.ok) {
      const errBody = await getResponse.text();
      console.error(`[ad-action-execute] Failed to fetch item ${resolvedItemId}:`, errBody);
      return { 
        success: false, 
        error: `Falha ao buscar detalhes do anúncio ${resolvedItemId}`, 
        api_error: errBody,
        catalog_info: catalogInfo,
      };
    }
    
    itemData = await getResponse.json();
  }
  
  // Continuar fluxo normal de clonagem...
}
```

### 2. Frontend: UX para Catálogo

**Arquivo:** `src/components/ad-timeline/CloneByLinkDialog.tsx`

Adicionar feedback visual quando o ID detectado for MLBU:

```tsx
{link && detectedId && (
  <div className="space-y-1">
    <p className="text-xs text-muted-foreground">
      ID detectado: <span className="font-mono">{detectedId}</span>
    </p>
    {detectedId.startsWith('MLBU') && (
      <div className="flex items-start gap-2 p-2 rounded-md bg-amber-500/10 border border-amber-500/30">
        <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-700">
          Este é um produto de catálogo. O clone será feito com base no 
          vendedor que está vencendo a buy box neste momento.
        </p>
      </div>
    )}
  </div>
)}
```

**Arquivo:** `src/components/ad-actions/ActionDetailsDialog.tsx`

Mostrar informações de catálogo no resultado quando disponível.

### 3. Frontend: `src/lib/meli/extractMeliId.ts`

Manter a extração robusta que já existe, mas garantir que MLBU seja preservado:

```typescript
// Já funciona corretamente - MLBU é detectado e preservado
// Apenas adicionar função auxiliar para identificar catálogo
export function isCatalogMeliId(id: string): boolean {
  return /^MLBU/i.test(id);
}
```

---

## Logging Obrigatório

Cada etapa terá log claro:

| Etapa | Log |
|-------|-----|
| Detecção | `[ad-action-execute] Detected CATALOG ID: MLBU...` |
| Resolução | `[ad-action-execute] /products/MLBU... status: 200` |
| buy_box_winner | `[ad-action-execute] buy_box_winner.item_id resolved: MLB...` |
| Sem vendedor | `[ad-action-execute] No buy_box_winner for catalog MLBU...` |
| Item final | `[ad-action-execute] Fetching item data: MLB...` |
| Erro | `[ad-action-execute] Failed to fetch item MLB...: {error}` |

---

## O que NÃO será implementado

- ❌ Scraping de HTML
- ❌ Regex em página pública
- ❌ Dependência de `/products/{id}/items` como fallback
- ❌ Tentativas em loop com ID normalizado (MLBU→MLB)
- ❌ Múltiplos tiers de fallback confusos

---

## Mensagens de Erro Finais

| Cenário | Mensagem |
|---------|----------|
| Catálogo sem vendedor | "Este produto está em catálogo, mas não possui um vendedor ativo no momento. Cole o link de um anúncio específico (MLB) para continuar." |
| Catálogo não encontrado | "Produto de catálogo não encontrado (MLBU...). Verifique se o link está correto." |
| Item não encontrado | "Falha ao buscar detalhes do anúncio MLB..." |

---

## Critérios de Aceite

1. ✅ MLBU nunca gera chamada para `/items/{MLBU}` diretamente
2. ✅ Clonagem funciona com: ID MLBU, Link `/p/MLBU`, Link MLB direto
3. ✅ Consumo de crédito reduzido (máximo 2 chamadas: `/products` + `/items`)
4. ✅ Nenhum scraping ativo
5. ✅ Logs permitem identificar exatamente onde falhou
6. ✅ UX informa usuário sobre produto de catálogo

---

## Arquivos a Modificar

| Arquivo | Ação |
|---------|------|
| `supabase/functions/ad-action-execute/index.ts` | Reescrever lógica de resolução MLBU |
| `src/components/ad-timeline/CloneByLinkDialog.tsx` | Adicionar aviso visual para catálogo |
| `src/components/ad-actions/ActionDetailsDialog.tsx` | Mostrar info de catálogo no resultado |
| `src/lib/meli/extractMeliId.ts` | Adicionar `isCatalogMeliId()` |

---

## Plano de Testes

1. Criar rascunho com link MLBU (ex: `MLBU1435399930`)
2. Verificar logs no backend: deve aparecer resolução via `/products/{MLBU}`
3. Se tiver buy_box_winner → clonagem deve funcionar
4. Se não tiver buy_box_winner → erro claro deve aparecer
5. Testar também com link MLB direto → fluxo deve ser direto

