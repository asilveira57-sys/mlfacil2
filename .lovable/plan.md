

## Plano: Corrigir peso, cálculo de frete e criar tabela oficial global

### Problemas confirmados

1. **Peso ainda em gramas**: O `radiography-collector` (linha 481) armazena `weight_kg` direto do ML sem converter. O `freight-sync-dimensions` já tem a conversão (linha 74), mas o collector **não**. Como o collector roda mais frequentemente, ele sobrescreve o valor corrigido. Resultado: 3740g exibido como "3740.00 kg".

2. **Cálculo retorna R$ 0.00**: O `handleCalculate` usa `FreightEngine` localmente, que busca regras por `logistic_mode === context.logistic_mode`. O logistic_type vindo do ML é `xd_drop_off`, mas as regras salvas via API Query Dialog usam o mesmo valor. O problema é que **não há tabela ativa selecionada** (o `freight_settings.active_ruleset_id` é null) ou a tabela existente não tem match porque as regras são salvas como pontos individuais (peso=0.3, preço=79) sem faixas (max é null), e a comparação `matchesWeight` falha quando o peso real não é exatamente o valor mínimo.

3. **Tabela por seller vs global**: Atualmente cada consulta à API gera uma tabela personalizada por seller. O cliente quer uma tabela oficial global (sem categoria fixa, única para todos os sellers).

---

### Implementação

#### Etapa 1 — Corrigir peso no radiography-collector

No `radiography-collector/index.ts`, linha 481, aplicar a mesma lógica do `freight-sync-dimensions`:
```
const rawWeight = getAttrNum([...]);
const weight_kg = rawWeight !== null && rawWeight > 50 ? rawWeight / 1000 : rawWeight;
```

#### Etapa 2 — Migração para corrigir dados existentes

SQL migration:
```sql
UPDATE public.meli_listings_cache 
SET weight_kg = weight_kg / 1000 
WHERE weight_kg > 50 
  AND dimensions_source IN ('ml_api', 'none')
  AND weight_kg IS NOT NULL;
```

#### Etapa 3 — Criar tabela oficial global com faixas completas

Criar uma nova edge function `freight-global-table-sync` que:
- Usa qualquer conta ML ativa como proxy para consultar a API de shipping options
- Gera combinações completas: pesos [0.3, 0.5, 1, 2, 3, 5, 7, 10, 15, 20, 30] x preços [50, 79, 120, 200, 350, 500, 750, 1000, 2000, 5000]
- Para cada tipo logístico (`drop_off`, `xd_drop_off`, `fulfillment`) e tipo de anúncio (`gold_pro`, `gold_special`)
- Salva como `freight_rulesets` com `is_global = true` (nova coluna) e linhas com **faixas** (weight_min/max e price_band_min/max) em vez de pontos únicos
- Executa via botão manual + cron mensal

Adicionar coluna `is_global BOOLEAN DEFAULT false` em `freight_rulesets` via migração.

#### Etapa 4 — Converter resultados da API em faixas contínuas

Ao processar os resultados, agrupar resultados adjacentes com mesmo custo em faixas:
- weight_min = peso atual, weight_max = próximo peso na lista (ou null para último)
- price_band_min = preço atual, price_band_max = próximo preço (ou null)

Isso resolve o problema do `FreightEngine` que não faz match porque `weight_max` é null e `weight_min` é um ponto fixo.

#### Etapa 5 — Alterar lógica de cálculo para usar tabela global

No `FreightProductsTab.tsx`, alterar `handleCalculate`:
- Buscar primeiro a tabela global ativa (`is_global = true, status = 'active'`)
- Não depender mais de `freight_settings.active_ruleset_id` por seller
- Usar `listing_type_id` e `logistic_type` do próprio produto para filtrar regras

#### Etapa 6 — Botão "Gerar Tabela Oficial" na aba Tabela de Frete

Na `FreightRulesetsTab`, adicionar botão para disparar `freight-global-table-sync`.
Marcar visualmente as tabelas globais vs locais.

#### Etapa 7 — Recálculo em massa automático

Após gerar/atualizar tabela global, o "Recalcular em Massa" deve:
1. Sincronizar dimensões (já funciona)
2. Iterar todos os produtos com dimensões e calcular frete esperado usando a tabela global

---

### Arquivos modificados

| Arquivo | Ação |
|---|---|
| `supabase/functions/radiography-collector/index.ts` | Conversão gramas→kg (linha 481) |
| Migração SQL | Corrigir pesos existentes + adicionar `is_global` em `freight_rulesets` |
| `supabase/functions/freight-global-table-sync/index.ts` | Nova function para gerar tabela oficial completa |
| `src/components/freight/FreightProductsTab.tsx` | Usar tabela global para calcular, fix no match de regras |
| `src/components/freight/FreightRulesetsTab.tsx` | Botão "Gerar Tabela Oficial", badge global |
| `src/lib/freightEngine.ts` | Melhorar matching para faixas com null (> weight_min sem max) |

### Resultado
- Pesos exibidos corretamente em kg (ex: 3.74 kg)
- Tabela oficial global gerada automaticamente com todas as combinações ML
- Cálculo de frete esperado funciona para qualquer produto com dimensões
- Atualização mensal automática da tabela oficial
- Não depende mais de configuração por seller

