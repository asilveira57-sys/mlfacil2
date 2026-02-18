
# Correcao do Bug de Resolucao de Seller Concorrente

## Problema Identificado

Na funcao `extractItemIdFromInput` do edge function `competitor-seller-sync`, o primeiro regex pattern:

```text
/MLB[-]?(\d{8,})/i
```

Captura apenas os **digitos** no grupo 1 (ex: `1347574279`), descartando o prefixo "MLB". O resultado e uma chamada a `/items/1347574279` que retorna 404, quando o correto seria `/items/MLB1347574279`.

O mesmo problema ocorre no quarto pattern `/\/(MLB[-]?\d{8,})/i` que captura corretamente, mas como o primeiro pattern faz match antes, nunca e alcancado.

## URL do usuario como exemplo

```text
https://www.mercadolivre.com.br/.../up/MLBU1403875470?pdp_filters=item_id:MLB1347574279
```

- Pattern `item_id[=:]?(MLB\d+)` do `extractMeliId.ts` (modulo existente) capturaria `MLB1347574279` corretamente
- Mas o `extractItemIdFromInput` da edge function usa patterns diferentes e quebrados

## Solucao

Corrigir os patterns de regex para capturar o ID completo com prefixo "MLB":

```text
Antes: /MLB[-]?(\d{8,})/i       → grupo 1 = "1347574279"
Depois: /(MLB[-]?\d{8,})/i      → grupo 1 = "MLB1347574279"
```

### Mudancas especificas no arquivo `supabase/functions/competitor-seller-sync/index.ts`:

1. **Reordenar e corrigir os patterns** para priorizar `item_id` (que ja aparece na URL do usuario como `item_id:MLB1347574279`):

```text
Patterns corrigidos (em ordem de prioridade):
  1. /item_id[=:]?(MLB\d+)/i          -- item_id param (mais especifico)
  2. /pdp_filters=item_id[=:]?(MLB\d+)/i  -- pdp_filters (URL do usuario)
  3. /\/(MLB[-]?\d{8,})/i             -- MLB direto no path
  4. /(MLB[-]?\d{8,})/i               -- MLB em qualquer lugar
```

2. **Adicionar fallback MLBU**: Se nenhum MLB for encontrado, tentar extrair MLBU e resolver via `/products/{MLBU_ID}` ou buscar o item vinculado.

3. **Normalizar o resultado**: garantir que o ID retornado sempre comeca com "MLB" (ou "MLBU") e nao apenas digitos.

## Arquivos Modificados

- `supabase/functions/competitor-seller-sync/index.ts` -- corrigir `extractItemIdFromInput`

## Secao Tecnica

A funcao corrigida ficara assim:

```typescript
function extractItemIdFromInput(input: string): string | null {
  const patterns = [
    /item_id[=:]?(MLB\d{8,})/i,
    /pdp_filters=item_id[=:]?(MLB\d{8,})/i,
    /\/(MLB[-]?\d{8,})/i,
    /(MLB[-]?\d{8,})/i,
  ];
  for (const p of patterns) {
    const m = input.match(p);
    if (m && m[1]) {
      return m[1].replace(/-/g, '').toUpperCase();
    }
  }
  if (/^MLB\d{8,}$/i.test(input.trim())) {
    return input.trim().replace(/-/g, '').toUpperCase();
  }
  // MLBU fallback
  const mlbuMatch = input.match(/(MLBU\d+)/i);
  if (mlbuMatch) {
    return mlbuMatch[1].toUpperCase();
  }
  return null;
}
```

E na funcao `resolveSellerFromInput`, adicionar tratamento para IDs MLBU (buscar item vinculado via catalog endpoint ou search).

Apos o deploy, a URL do usuario `item_id:MLB1347574279` sera extraida corretamente e a chamada `/items/MLB1347574279` retornara o seller_id do concorrente.
