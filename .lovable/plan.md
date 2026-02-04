
# Plano: Truncar `family_name` para 60 Caracteres

## Diagnóstico

O Mercado Livre tem um limite rígido de **60 caracteres** para o campo `family_name`:

```json
{
  "code": "item.family_name.length_invalid",
  "message": "Family Name length is over of 60 character"
}
```

### Valor Atual (67 caracteres):
```
"Etiqueta Selo Frágil Fragile 108x150 - 500 Etiquetas Cor Vermelho"
```

### Valor Truncado (60 caracteres):
```
"Etiqueta Selo Frágil Fragile 108x150 - 500 Etiquetas Cor Ver"
```

---

## Solução

Adicionar truncamento automático em todos os pontos onde `family_name` é atribuído.

---

## Alterações

### 1. `supabase/functions/ad-action-execute/index.ts`

**Adicionar helper de truncamento:**
```typescript
function truncateFamilyName(value: string): string {
  const MAX_LENGTH = 60;
  if (!value) return value;
  if (value.length <= MAX_LENGTH) return value;
  return value.substring(0, MAX_LENGTH).trim();
}
```

**Linha ~1718 (atribuição para User Products):**
```typescript
// ANTES:
newItem.family_name = finalTitle;

// DEPOIS:
newItem.family_name = truncateFamilyName(finalTitle);
console.log(`[ad-action-execute] family_name truncated: ${finalTitle.length} → ${newItem.family_name.length} chars`);
```

**Linha ~1723 (atribuição via preflight):**
```typescript
// ANTES:
newItem.family_name = fillResult.bodyLevelFields.family_name;

// DEPOIS:
newItem.family_name = truncateFamilyName(fillResult.bodyLevelFields.family_name);
```

**Linhas ~870-890 (retry logic com family_name):**
Verificar e truncar também no retry quando `family_name` é injetado.

---

### 2. `supabase/functions/clone-anti-catalog-execute/index.ts`

**Adicionar helper de truncamento (igual):**
```typescript
function truncateFamilyName(value: string): string {
  const MAX_LENGTH = 60;
  if (!value) return value;
  if (value.length <= MAX_LENGTH) return value;
  return value.substring(0, MAX_LENGTH).trim();
}
```

**Linhas ~305-310 (tentativa 2 com family_name):**
```typescript
// ANTES:
const payload2 = { ...basePayload, family_name: familyNameValue };

// DEPOIS:
const payload2 = { ...basePayload, family_name: truncateFamilyName(familyNameValue) };
```

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/ad-action-execute/index.ts` | Adicionar `truncateFamilyName()` e aplicar em 3 pontos |
| `supabase/functions/clone-anti-catalog-execute/index.ts` | Adicionar `truncateFamilyName()` e aplicar no retry |

---

## Impacto

| Aspecto | Avaliação |
|---------|-----------|
| Risco | Muito baixo - apenas trunca string |
| Performance | Nenhum impacto |
| UX | O título pode ficar cortado, mas o anúncio será criado com sucesso |

---

## Resultado Esperado

Após a correção:
- Títulos com mais de 60 caracteres serão automaticamente truncados
- O erro `item.family_name.length_invalid` será eliminado
- Clone V2 funcionará para todos os anúncios
