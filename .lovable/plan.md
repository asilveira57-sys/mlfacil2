

# Melhorar Layout do Cabeçalho das Etiquetas

## O que muda

O cabeçalho atual usa um formato compacto com prefixos genéricos ("Cliente:", "1x [SKU] Título"). O modelo de referência usa um layout mais rico e visual, com título do produto em destaque, atributos de variação, e formatação diferenciada.

### Alterações no formato das linhas (sem mudar a estrutura de config existente)

**De:**
```
Cliente: João da Silva
1x [W11310109] Hélice Espargidor Superior
Pedido: 2000005847123456
Obs: Presente, embrulhar...
```

**Para (mais próximo da referência):**
```
Hélice Espargidor Superior Lava Louça Brastemp        ← título do produto (bold, maior destaque)
Quantidade: 1 - Apelido: W11310109                    ← quantidade + SKU no formato "Apelido"
Priscila Peninck                                      ← nome do comprador sem prefixo
Cor: Transparente + Cinza                             ← atributos de variação (novo!)
```

### Mudanças técnicas

**1. Edge function `ml-generate-labels/index.ts`**

- Alterar `buildHeaderLinesForOrder()` para novo formato:
  - **Produto**: título completo como primeira linha (sem prefixo "Nx")
  - **Quantidade + SKU**: "Quantidade: N - Apelido: SKU" numa segunda linha
  - **Cliente**: nome sem prefixo "Cliente:"
  - **Atributos de variação**: novas linhas "Cor: X", "Tamanho: Y" etc.
- Buscar `variation_attributes` na query de `meli_order_items_cache` (já existe no banco como JSON)
- Na renderização PDF:
  - Primeira linha do produto em `fontBold` com fonte levemente maior
  - Demais linhas em `font` normal (não bold)
  - Adicionar borda/caixa ao redor do cabeçalho (drawRectangle)
  - Aumentar `HEADER_HEIGHT_PT` de 65 para ~85pt para acomodar as linhas extras

**2. `src/lib/buildHeaderLines.ts`**

- Adicionar `variation_attributes` ao interface `OrderItem`
- Ajustar `buildProductLines()` para o novo formato (título separado de quantidade+SKU)
- Adicionar geração de linhas de atributos de variação

**3. `src/pages/LabelHeaderSettings.tsx`**

- Atualizar preview para refletir o novo formato
- Adicionar toggle para "Mostrar atributos de variação" (novo campo `show_variation_attrs`)
- Atualizar dados de amostra com `variation_attributes`

**4. Migration SQL**

- Adicionar coluna `show_variation_attrs` (boolean, default true) em `meli_label_header_preferences`

### O que NÃO muda

- Estrutura de layouts (meli_100x150, mlfacil_100x175_header, meli_100x150_no_nf)
- Lógica de Flex/Coleta/NF
- Pipeline de geração por shipment
- Lógica de DANFE
- Configurações existentes (show_customer, show_products, show_sku, etc.)
- Drag-and-drop de ordem das linhas

### Resumo visual

A etiqueta vai ficar visualmente mais próxima do modelo que os clientes pedem: título do produto em destaque, SKU como "Apelido", nome do comprador limpo, e atributos de variação visíveis. Tudo dentro da mesma infraestrutura de cabeçalho que já existe.

