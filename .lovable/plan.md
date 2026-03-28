

## Plano: Corrigir Gestão de Frete — carregar dimensões + ativar Editar/Calcular

### Diagnóstico

1. **Dados vazios**: O `radiography-collector` sincroniza os anúncios para `meli_listings_cache`, mas **não solicita o campo `attributes`** na chamada à API do ML. Sem `attributes`, não há como extrair `SELLER_PACKAGE_HEIGHT/WIDTH/LENGTH/WEIGHT`. As colunas `weight_kg`, `height_cm`, `width_cm`, `length_cm` existem na tabela mas ficam sempre `null`.

2. **Botões Editar/Calcular**: Não têm `onClick` — são `<Button>` sem ação nenhuma.

3. **Frete esperado**: Depende do cálculo via `pricing-engine`, que por sua vez depende das dimensões. Sem input, sem resultado.

---

### Implementação

#### 1. Enriquecer o `radiography-collector` para capturar dimensões

- Adicionar `attributes` na lista de campos do multiget (`?attributes=...`)
- Após receber cada item, extrair dimensões de `SELLER_PACKAGE_*` / `PACKAGE_*` (usando lógica já existente em `ad-item-snapshot`)
- Popular `weight_kg`, `height_cm`, `width_cm`, `length_cm`, `dimensions_source` no upsert para `meli_listings_cache`
- `dimensions_source` = `'ml_api'` quando encontrado, manter `'none'` quando ausente

#### 2. Criar edge function `freight-sync-dimensions` (sync sob demanda)

- Nova function leve que faz multiget de items em lotes de 20, extrai dimensões e atualiza `meli_listings_cache`
- Usada pelo botão "Atualizar" na aba Produtos e pelo "Recalcular em Massa"
- Controle de rate limit com sleep entre lotes

#### 3. Implementar dialog de edição manual (botão "Editar")

- Criar `FreightProductEditDialog.tsx` com campos: peso (kg), altura (cm), largura (cm), comprimento (cm), perfil de frete (A/B/C)
- Ao salvar, faz `update` direto em `meli_listings_cache` e seta `dimensions_source = 'manual'`
- Invalidar cache do react-query

#### 4. Implementar ação "Calcular" (botão)

- Chamar o `pricing-engine` (já existente) para o item individual, passando peso/dimensões atuais
- Atualizar `expected_freight_cost` no cache local e no banco
- Mostrar toast com resultado

#### 5. Conectar botão "Recalcular em Massa"

- Chamar `freight-sync-dimensions` para atualizar dimensões do ML
- Em seguida, chamar `pricing-engine` em lote para atualizar `expected_freight_cost`

---

### Arquivos

| Arquivo | Ação |
|---|---|
| `supabase/functions/radiography-collector/index.ts` | Adicionar `attributes` ao multiget + popular dimensões |
| `supabase/functions/freight-sync-dimensions/index.ts` | Nova function de sync sob demanda |
| `src/components/freight/FreightProductEditDialog.tsx` | Novo dialog de edição manual |
| `src/components/freight/FreightProductsTab.tsx` | Conectar Editar (dialog) e Calcular (pricing-engine) |
| `src/hooks/useFreightProducts.ts` | Adicionar mutation de update |

### Resultado esperado
- Ao sincronizar, dimensões do ML preenchem a tabela automaticamente
- Editar permite ajuste manual de peso/dimensões por produto
- Calcular retorna o frete esperado usando o motor existente
- Status muda de "Sem dados" para "OK" ou "Estimado" conforme a fonte

