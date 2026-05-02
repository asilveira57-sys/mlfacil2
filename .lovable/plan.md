## Diagnóstico (causa raiz)

Investiguei `ml-generate-labels` (V1), `ml-generate-labels-v2` (V2), `ml-generate-labels-labeltest` e o helper `_shared/labeltest-render.ts`. A dedup de cart já está em produção — o sintoma atual ("25 selecionadas → 22 impressas") é **diferente**: são etiquetas sendo **silenciosamente descartadas** por 4 falhas distintas:

### Bug 1 — `distributeZplBlocks` mapeia ZPL por POSIÇÃO (LabelTest ZPL)
`fetchZplBatchFromMl` faz UMA chamada à ML com todos os shipment_ids concatenados. O retorno (N blocos `^XA…^XZ`) é distribuído pelos shipments **assumindo que Flex = 1 bloco e Coleta = 2 blocos**. Quando a ML quebra essa expectativa (Coleta sem NF que vem com 1 bloco no meio do lote, lote misto Flex+Coleta+Full em ordem trocada, etc.), o cálculo `expectedTotal !== allBlocks.length` cai no "Caso D best-effort" → consome blocos em ordem até acabar → **últimos 2-3 shipments ficam sem blocos** → some do ZPL final. Status fica `parcial`, usuário só vê toast amarelo.

### Bug 2 — V2 e V1 PDF: `BLOCK ALL` no primeiro erro
`fetchSingleShipmentPdf` (V1 linha 234) e `fetchSinglePdf` (V2 linha 74) só fazem 3 retries e qualquer 4xx **não-429** retorna `null` → o loop principal faz `break` (V2 linhas 259/264/267, V1 linhas 299/308/315) e descarta TODOS os shipments seguintes. Um único 404 transiente da ML em uma etiqueta no meio do lote corta o resto. Resultado típico: "selecionei 25, vieram 22".

### Bug 3 — V2 ZPL: zero validação do que voltou
Linha 320 do V2: `totalSuccess = validIds.length` é setado **sem contar quantos `^XA` realmente vieram no ZPL**. Se a ML mandar incompleto, marcamos como sucesso e mandamos para impressora um arquivo curto.

### Bug 4 — Validação local descarta shipments por cache desatualizado
Linhas 175-186 de V2 (e equivalentes em V1/LabelTest): se `meli_shipments_cache` não tem o shipment_id (ou tem `label_available=false` desatualizado), o shipment vira `validationError` e **some da contagem total**. O usuário vê "Selecionei 25, gerou 22" sem entender que 3 foram filtradas antes mesmo de chamar a ML.

## Plano de correção

### 1. Substituir distribuição por POSIÇÃO por distribuição por IDENTIDADE (`labeltest-render.ts`)
- Mudar `fetchZplBatchFromMl` para SEMPRE fazer chamada **individual por shipment** quando o lote tem mistura Flex/Coleta, com concorrência 6 (paralelo). Isso é determinístico: cada resposta sabe a qual shipment pertence.
- Manter `splitZplBlocks` para extrair os 1-2 blocos de cada resposta individual.
- Eliminar todos os "Caso A/B/C/D" do `distributeZplBlocks` — substituir por mapeamento direto.
- Aceitar 1, 2 ou até 3 blocos por shipment sem perder nada. Se ML retornar 0 blocos para um shipment específico, registrar erro **nominal** (com o shipment_id) e seguir os outros.

### 2. Remover `BLOCK ALL` do V1 e V2 PDF
- Trocar `break` por `continue` quando uma etiqueta individual falhar.
- Acumular `failedShipments[]` com motivo (404, timeout, PDF inválido, 0 páginas).
- Aumentar retries de 3→5 e tratar 404 como retry (ML responde 404 enquanto a etiqueta está sendo gerada do lado deles).
- Ao final: gerar PDF com as etiquetas que vieram OK e retornar `failedShipments` discriminado para o front mostrar EXATAMENTE quais falharam (com botão "Tentar novamente apenas as falhas").

### 3. Validar ZPL retornado em V2
- Após `extractZplFromBytes`, contar `^XA` no resultado e comparar com `validIds.length`.
- Se faltar, fazer fallback automático para chamadas individuais por shipment (mesmo path do item 1).
- `totalSuccess` = blocos `^XA` realmente extraídos, nunca `validIds.length` cego.

### 4. Auto-resync antes de validar
- Antes de descartar shipment por `!shipMap.get(sid)` ou `!label_available`, chamar `ml-sync-shipments` somente para os IDs faltantes/desatualizados (1 chamada extra, max 200 ids).
- Re-validar com cache atualizado. Só então mandar para `validationErrors`.

### 5. UI: contador "Selecionado vs Gerado vs Falhas" + retry
- Em `useShippingLabels.ts` e `useShippingLabelsV2.ts`: ao receber `per_shipment_log`/`failedShipments`, mostrar painel claro com 3 números (ex.: `25 selecionados → 22 gerados → 3 falhas`).
- Listar os 3 que falharam com motivo e botão **"Tentar novamente"** que reenvia só esses IDs.
- Toast vira destrutivo (vermelho) ao invés de warning, para não passar despercebido em véspera de muita venda.

### 6. Telemetria
- Adicionar logs estruturados `[labels:fail]` em cada caminho de descarte (404 ML, cache miss, parse falha, distribuição inconsistente) com `shipment_id`, `reason_code`, `seller_id` — para se voltar a acontecer eu conseguir rastrear no SQL em segundos.

## Arquivos a alterar

- `supabase/functions/_shared/labeltest-render.ts` — refatorar `fetchZplBatchFromMl` + `distributeZplBlocks`
- `supabase/functions/ml-generate-labels-v2/index.ts` — remover BLOCK ALL, validar ZPL, contar `^XA`
- `supabase/functions/ml-generate-labels/index.ts` — remover BLOCK ALL no pipeline header e standard
- `supabase/functions/ml-generate-labels-labeltest/index.ts` — usar nova distribuição por identidade
- `supabase/functions/ml-generate-labels-labeltest-batch/index.ts` — idem
- `src/hooks/useShippingLabels.ts` — exibir 3 contadores + botão retry só falhas
- `src/hooks/useShippingLabelsV2.ts` — idem
- `src/components/shipping/BulkActionsBar.tsx` e `BulkActionsBarV2.tsx` — exibir painel de falhas

## Garantias

- **Nada quebra para o caso feliz**: 25 Coleta normais com NF continuam saindo 25 etiquetas em uma chamada batch (com validação de contagem `^XA`).
- **Caso de falha real**: 22 saem completas + 3 listadas com motivo + botão para retentar.
- **Cache desatualizado**: re-sync silencioso recupera; só se ainda assim faltar, vai para falhas.
- Trabalho contido, sem mexer em rotas, autenticação, billing ou outras áreas. Pronto para o pico de segunda-feira.

## Observação

Não é necessário criar nova migração de banco. As tabelas `meli_print_queue_v2` já têm `per_shipment_log` (JSONB) que aceita o novo schema. Só leitura adicional no front.
