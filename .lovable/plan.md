

# Corrigir Percentual de Desconto e Enriquecer Dialog de Confirmacao

## Problema 1: Percentual nao aparece

A coluna `promo_price` no banco esta sempre NULL. O preco promocional real esta em `raw_item_data->>'price'` e o desconto total e `meli_percentage + seller_percentage`. O codigo atual calcula o desconto usando `promo_price` (que e NULL), por isso nunca exibe nada.

**Dados reais do banco:**
- MLB1047536992: original_price=211.12, price=194.54, meli_pct=2.9, seller_pct=5 (total 7.9% off)
- MLB1304171724: original_price=56.23, price=46.90, meli_pct=2.6, seller_pct=14 (total 16.6% off)

## Problema 2: Dialog de confirmacao vazio

Ao clicar "Participar", o dialog mostra apenas o texto generico. Faltam: thumbnail, nome do produto, nome da campanha, desconto, co-participacao e data de finalizacao.

## Solucao

### 1. Corrigir extracao de dados no hook (`useProductPromotionSearch.ts`)

- Extrair `seller_percentage` e `price` (preco promo real) do `raw_item_data`
- Usar `raw_item_data.price` como `promo_price` quando a coluna do banco for null
- Calcular desconto total: `meli_percentage + seller_percentage`
- Adicionar `seller_percentage` a interface `ProductPromotionInfo`

```text
// Linha 183-184 - extrair mais campos do rawData
const sellerPct = (rawData?.seller_percentage as number) || null;
const rawPrice = (rawData?.price as number) || null;
const effectivePromoPrice = pi.promo_price || rawPrice;

// Linha 209 - usar preco efetivo
promo_price: effectivePromoPrice,
seller_percentage: sellerPct,
```

### 2. Corrigir calculo no card (`Promocoes.tsx` - ProductPromotionCard)

Em vez de calcular desconto por diferenca de preco, usar diretamente a soma das percentagens:

```text
const discountPct = (promo.meli_percentage || 0) + (promo.seller_percentage || 0);
// Se ambos forem 0, tentar calcular pela diferenca de preco como fallback
```

### 3. Enriquecer o estado `confirmAction` e o dialog

Expandir o estado para incluir metadados do produto e campanha:

```text
confirmAction: {
  action: 'adhere' | 'remove';
  items: [...];
  label: string;
  promotionId?: string;
  promotionType?: string;
  // Novos campos:
  productTitle?: string;
  productThumbnail?: string;
  campaignName?: string;
  discountPercent?: number;
  meliReduction?: number;
  endDate?: string;
  originalPrice?: number;
  promoPrice?: number;
}
```

O dialog de confirmacao passara de:

```text
[Titulo generico]
[Texto generico]
[Cancelar] [Confirmar]
```

Para:

```text
Aderir a Campanha
+----------+
| [thumb]  |  Etiqueta Selo Fragil 80x30...
|          |  MLB3380488766
+----------+
Campanha: Impulsione suas vendas (SMART)
Desconto: 8% off (R$ 31,03 -> R$ 28,55)
Co-participacao: ML reduz R$ 0,90 das tarifas
Termina em: 5 dias (22/02)

[Cancelar]  [Confirmar Adesao]
```

### Arquivos impactados

| Arquivo | Acao |
|---------|------|
| `src/hooks/useProductPromotionSearch.ts` | Extrair seller_percentage e price do raw_item_data, usar como promo_price |
| `src/pages/Promocoes.tsx` | Corrigir calculo desconto no card; expandir confirmAction com metadados; redesenhar dialog |
