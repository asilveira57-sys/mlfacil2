
# Plano: Corrigir Erro "title invalid fields" para Vendedores User Products

## Diagnóstico

O erro ocorre porque o vendedor está ativado para o modelo **User Products** (tag `user_product_seller`). Neste modelo:

| Campo | Modelo Antigo | Modelo User Products |
|-------|---------------|---------------------|
| `title` | Obrigatório | **Proibido** |
| `family_name` | Opcional | **Obrigatório** (define o título) |

O Mercado Livre está migrando progressivamente todos os vendedores para este modelo (2024-2025).

### Evidência no erro:
```json
{
  "error": "The fields [title] are invalid for requested call.",
  "message": "body.invalid_fields",
  "retry_info": {
    "family_name_used": "Etiqueta Selo Frágil Fragile 108x150"
  },
  "payload_sent": {
    "title": "Etiqueta Selo Frágil Fragile 108x150 - 500 Etiquetas Cor Vermelho",
    "family_name": "Etiqueta Selo Frágil Fragile 108x150"
  }
}
```

O sistema está enviando **ambos** `title` e `family_name`, mas para vendedores User Products, apenas `family_name` deve ser enviado.

---

## Solução

Adicionar detecção da tag `user_product_seller` e ajustar o payload conforme o modelo do vendedor.

### Fluxo Corrigido

```text
executeCloneAction()
    ↓
[1] Buscar tags do vendedor via GET /users/me
    ↓
[2] isUserProductSeller = tags.includes("user_product_seller")
    ↓
[3] Se isUserProductSeller:
    - REMOVER campo "title" do payload
    - GARANTIR campo "family_name" presente
    Senão:
    - Manter fluxo atual (title obrigatório)
    ↓
[4] POST /items → Sucesso
```

---

## Alterações

### Arquivo: `supabase/functions/ad-action-execute/index.ts`

**1. Adicionar função para detectar vendedor User Products:**
```typescript
async function isUserProductSeller(accessToken: string): Promise<{
  isUserProduct: boolean;
  tags: string[];
  sellerId: string | null;
}> {
  try {
    const response = await fetch("https://api.mercadolibre.com/users/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    
    if (!response.ok) {
      console.warn("[ad-action-execute] Failed to fetch user info for UP detection");
      return { isUserProduct: false, tags: [], sellerId: null };
    }
    
    const userData = await response.json();
    const tags = userData.tags || [];
    const isUP = tags.includes("user_product_seller");
    
    console.log(`[ad-action-execute] User ${userData.id} tags: [${tags.join(", ")}]`);
    console.log(`[ad-action-execute] is_user_product_seller: ${isUP}`);
    
    return { 
      isUserProduct: isUP, 
      tags, 
      sellerId: userData.id?.toString() 
    };
  } catch (err) {
    console.error("[ad-action-execute] Error detecting UP seller:", err);
    return { isUserProduct: false, tags: [], sellerId: null };
  }
}
```

**2. Chamar detecção antes de montar payload (linha ~1465):**
```typescript
// Detectar se vendedor usa modelo User Products
const upDetection = await isUserProductSeller(currentAccessToken);
const isUserProductModel = upDetection.isUserProduct;

console.log(`[ad-action-execute] === USER PRODUCT MODEL DETECTION ===`);
console.log(`[ad-action-execute] is_user_product_seller: ${isUserProductModel}`);
```

**3. Ajustar construção do payload (linha ~1650-1660):**
```typescript
let newItem: any = {
  // title: SÓ enviar se NÃO for vendedor User Products
  ...(isUserProductModel ? {} : { title: checklist?.final_title || checklist?.override_title || itemData.title }),
  category_id: categoryId,
  currency_id: itemData.currency_id || "BRL",
  listing_type_id: listingTypeToUse,
  // ... resto dos campos
};

// Para vendedor User Products, family_name é OBRIGATÓRIO
if (isUserProductModel) {
  newItem.family_name = checklist?.final_title || itemData.title;
  console.log(`[ad-action-execute] USER PRODUCTS MODE: Using family_name instead of title`);
}
```

**4. Atualizar ALLOWED_BODY_FIELDS para incluir family_name dinamicamente:**
```typescript
// No sanitizePayload, permitir family_name se for vendedor UP
function sanitizePayload(payload: any, allowFamilyName: boolean, isUserProductSeller: boolean = false): any {
  // Se for UP seller, garantir que title seja removido
  if (isUserProductSeller && payload.title) {
    console.log(`[ad-action-execute] SANITIZE: Removing title for UP seller`);
    delete payload.title;
  }
  // ... resto da lógica
}
```

**5. Atualizar diagnóstico anti-catálogo:**
```typescript
const antiCatalogDiagnostic = {
  // ... campos existentes
  is_user_product_seller: isUserProductModel,
  title_sent: !isUserProductModel,
  family_name_used_as_title: isUserProductModel,
};
```

---

## Impacto

| Aspecto | Avaliação |
|---------|-----------|
| Risco | Baixo - apenas adiciona lógica condicional |
| Performance | Mínimo - uma chamada extra a /users/me (já validamos token com ela) |
| Compatibilidade | Total - vendedores antigos continuam funcionando |
| Cache | Opcional - pode cachear resultado por ml_account_id |

---

## Otimização Futura

Salvar a flag `is_user_product_seller` na tabela `ml_accounts` para evitar chamada extra:

```sql
ALTER TABLE ml_accounts ADD COLUMN is_user_product_seller boolean DEFAULT false;
```

Isso pode ser feito em uma iteração futura após validar que a correção funciona.

---

## Resultado Esperado

Após a correção:
- Vendedores **User Products**: POST com `family_name`, sem `title` → Sucesso
- Vendedores **modelo antigo**: POST com `title`, `family_name` opcional → Sucesso
- O erro `body.invalid_fields [title]` será eliminado
