

## Diagnóstico: Por que o backfill não corrigiu os dados

### Problema raiz identificado

A tabela `meli_shipments_cache` tem constraint unique em `(seller_id, shipment_id)` — composta. Porém o código do backfill usa `onConflict: 'shipment_id'` (simples), o que faz o Supabase/Postgres rejeitar silenciosamente os upserts. Resultado: **nenhum registro é de fato inserido**.

Evidência nos logs: a cada iteração de self-chain, o backfill encontra **935 shipments missing** — o número nunca diminui, confirmando que os inserts falham silenciosamente.

Dados atuais do seller `1411095727`:
- **4.513** pedidos com `shipment_id`
- **538** já cacheados (todos com cidade preenchida)
- **3.975** faltando no cache — nunca foram inseridos

O `ml-enrich-neighborhoods` reporta "No shipments need geographic enrichment" porque os 538 existentes já têm cidade. O problema não é de enriquecimento, é que os registros nunca chegam ao banco.

### Plano de correção

**1. Corrigir `onConflict` no `ml-backfill-shipments/index.ts`**

Duas ocorrências de `onConflict: 'shipment_id'` precisam ser alteradas para `onConflict: 'seller_id,shipment_id'`:
- Linha 130 (placeholder para 404)
- Linha 168 (upsert principal com dados do shipment)

**2. Corrigir `onConflict` no `ml-enrich-neighborhoods/index.ts`**

O `cep_cache` usa `onConflict: 'zipcode'` — preciso confirmar se está correto (provavelmente sim, pois é PK). Sem alteração necessária aqui.

### Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `supabase/functions/ml-backfill-shipments/index.ts` | Corrigir `onConflict` de `'shipment_id'` para `'seller_id,shipment_id'` em 2 locais |

### Resultado esperado

Após o deploy, ao clicar "Corrigir endereços" novamente, os ~3.975 shipments faltantes serão inseridos corretamente no cache com cidade/estado extraídos diretamente da API do ML. O número de N/D deve cair drasticamente.

