

# Diagnóstico: Por que o Flex falha no Label Teste

Verifiquei os jobs reais que o Rodrigo tentou rodar (5 envios Flex, layouts `mlfacil_100x175_header` e `meli_100x150_no_nf`). **Todos falharam com o mesmo erro**:

```
Labelary retornou status 404: ERROR: Requested 1st label but ZPL generated no labels
blocks_rendered: 1, zpl_blocks_total: 2
```

## Causa raiz

O Mercado Livre devolve **2 blocos ZPL por pedido Coleta** (etiqueta + DANFE) e **1 bloco por pedido Flex** (só etiqueta — Flex não tem DANFE no ZPL).

A função `distributeZplBlocks` em `supabase/functions/_shared/labeltest-render.ts` (linhas 264–296) **assume que todo shipment tem 2 blocos**. Quando o batch é todo Flex (ex.: 5 envios → 5 blocos), ela faz `5 / 5 = 1 bloco por shipment` e funciona; mas o `renderChunkToPdf` (linha 416) tem uma trava:

```ts
if (entry.err || imgs.length < 2 || imgs.length !== blocksTotal) { ... erro ... }
```

→ **`imgs.length < 2` rejeita todo shipment Flex**, mesmo quando o ZPL veio correto. Resultado: erro `LABELARY_CONVERSION_FAILED` para 100% dos Flex.

Além disso, no caso misto (Flex + Coleta no mesmo lote), o cálculo `allBlocks.length % shipmentIds.length === 0` também quebra — cai no fallback `pares de 2 blocos` e marca os Flex como `DANFE_MISSING`.

## Como o módulo Shipping V1 (que funciona) resolve

Em `ml-generate-labels/index.ts` (linhas 1015–1030) o V1 monta um `perShipmentSkipDanfe: Set<string>` com os Flex sem NF e o pipeline pula a tentativa de anexar DANFE para esses shipments — gerando só a etiqueta.

## Plano de correção (Label Teste V2)

### 1. `supabase/functions/_shared/labeltest-render.ts`

**a) `distributeZplBlocks` — distribuir blocos por tipo logístico**

Adicionar parâmetro `flexShipmentIds: Set<string>` e calcular dinamicamente:
- Flex → 1 bloco esperado
- Coleta → 2 blocos esperados (etiqueta + DANFE)
- Layout `meli_100x150_no_nf` → 1 bloco para todos (descarta DANFE)

Distribuir sequencialmente respeitando o "tamanho esperado" de cada shipment. Marcar `DANFE_MISSING` apenas para Coleta com 1 bloco quando o layout exigir DANFE.

**b) `renderChunkToPdf` — remover a trava `imgs.length < 2`**

Trocar por: aceitar qualquer shipment cujo `imgs.length === blocksTotal` (1 bloco para Flex, 2+ para Coleta). Mensagem de erro só quando faltar bloco de fato.

**c) `LAYOUTS` — semântica de `includeDanfe`**

Manter como está, mas usar a flag para decidir:
- `includeDanfe: true` + Flex → renderiza só etiqueta (fallback automático)
- `includeDanfe: true` + Coleta sem 2º bloco → erro `DANFE_MISSING`
- `includeDanfe: false` → ignora 2º bloco mesmo se vier

### 2. `supabase/functions/ml-generate-labels-labeltest/index.ts` (dispatcher)

- Carregar `logistic_type` (já carrega) e propagar a relação `sid → isFlex` para o worker via `batches[i].flex_sids: string[]` ou recarregar no worker.
- No ramo **ZPL inline**, aplicar a mesma `distributeZplBlocks` corrigida.

### 3. `supabase/functions/ml-generate-labels-labeltest-batch/index.ts` (worker)

- Construir `flexSet = new Set(sids onde shipMap.get(sid).logistic_type === 'self_service')`.
- Passar `flexSet` para `distributeZplBlocks` e para `renderChunkToPdf`.

### 4. `src/lib/labeltestEligibility.ts` (front)

`computeCapabilitiesV2` hoje bloqueia "Cabeçalho + DANFE" quando há **Coleta sem NF**, mas não trata Flex explicitamente. Está OK conforme as regras V1, mas vou adicionar comentário deixando claro: Flex sempre permitido em todos os layouts (DANFE ignorada no backend).

### 5. Testes de aceite

| Cenário | Layout | Esperado |
|---|---|---|
| 1 Flex sozinho | `meli_100x150` | PDF 1 página (etiqueta) |
| 1 Flex sozinho | `mlfacil_100x175_header` | PDF 1 página (etiqueta + cabeçalho, sem DANFE) |
| 1 Flex sozinho | `meli_100x150_no_nf` | PDF 1 página (etiqueta) |
| 5 Flex em lote | qualquer | 5 páginas, 0 erros |
| 3 Flex + 2 Coleta com NF | `mlfacil_100x175_header` | Flex: 1 pág c/ cabeçalho, Coleta: 2 pág (cabeçalho+etiqueta + DANFE) |
| Coleta sem NF, layout Padrão ML | `meli_100x150` | erro `DANFE_MISSING` (correto) |

### 6. Validação pós-deploy

- Rodar SQL contra `meli_print_queue_v2 WHERE module='labeltest'` filtrando por jobs nos últimos 30min para confirmar 0 erros `LABELARY_CONVERSION_FAILED` em shipments Flex.
- Verificar logs `[labeltest-batch]` confirmando `success_count` igual ao número de Flex no batch.

## Arquivos que serão alterados

1. `supabase/functions/_shared/labeltest-render.ts` (lógica central — `distributeZplBlocks` + `renderChunkToPdf`)
2. `supabase/functions/ml-generate-labels-labeltest/index.ts` (ramo ZPL inline)
3. `supabase/functions/ml-generate-labels-labeltest-batch/index.ts` (worker — passa `flexSet`)
4. `src/lib/labeltestEligibility.ts` (apenas comentário esclarecendo política Flex)

## Garantias

- **Não toca** no `ml-generate-labels` V1 nem no `shippingLabelRules.ts` (módulo Shipping continua intacto).
- **Não altera** a tabela `meli_print_queue_v2` nem RPC `labeltest_complete_batch`.
- Mantém o pipeline assíncrono (job + batches + polling).
- O erro de build mencionado (`@dnd-kit/core` em `SettingsMenuEditor.tsx`) é independente desse fluxo e será corrigido em separado se persistir após deploy.

