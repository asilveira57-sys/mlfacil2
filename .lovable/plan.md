

## Diagnóstico real (agora corrigido)

A ML retorna **um único payload por requisição em lote** com a seguinte estrutura:

```
[Etiqueta1, Nota1, Etiqueta2, Nota2, ..., EtiquetaN, NotaN, ListaDeSeparação(A4 PDF)]
```

- Etiquetas e notas vêm em **ZPL** (formato térmico, dimensões pequenas).
- A **lista de separação** vem como **página A4 em PDF** anexada ao final — é UMA folha só, com todas as separações consolidadas.
- A regra "descartar bloco 3" estava errada: notas legítimas seriam descartadas em lotes com 2+ shipments.

## Plano correto

**Arquivo único:** `supabase/functions/ml-generate-labels-labeltest/index.ts`

### 1. Pipeline ZPL para etiqueta + DANFE
- Por shipment, buscar `response_type=zpl2`.
- Extrair **todos** os blocos `^XA...^XZ` do payload retornado.
- Renderizar cada bloco ZPL via Labelary → embed no PDF final.
- **Nada de descartar por índice.** Todo bloco ZPL válido entra.

### 2. Detectar e descartar lista de separação (única regra de exclusão)
- A lista de separação **não vem em ZPL** — vem como página A4 em PDF.
- No fluxo ZPL puro, ela simplesmente **não aparece** (porque pedimos `zpl2`, e A4 não é ZPL).
- Garantia adicional: se algum bloco extraído tiver dimensões A4 (~595×842 pt) ou for identificado como PDF/non-ZPL no payload, **descartar esse bloco específico** (não por posição).
- Critério de descarte: `é A4 retrato` OU `bloco não contém marcadores ZPL válidos`. Nunca por índice.

### 3. Validação por shipment
- Mínimo esperado: 2 blocos ZPL válidos (etiqueta + nota).
- Se vier só 1 bloco → `reason_code: 'DANFE_MISSING'`, shipment falha, lote continua.
- Se vier 2+ blocos ZPL → todos entram no PDF final, na ordem.

### 4. Manter o que já está funcionando
- Variação no cabeçalho (`seller_id` no filtro + fallback do título + `show_variation_attrs=true`).
- Chunks de 10 shipments com merge final.
- CPU yield entre chunks.

### 5. Telemetria por shipment
- `zpl_blocks_total`, `zpl_blocks_kept`, `zpl_blocks_discarded_a4`, `danfe_status`.

### Critérios de aceite
- Lote com N shipments → PDF final tem 2N páginas (etiqueta + nota por shipment).
- Zero página A4 de lista de separação no PDF final.
- Shipment sem nota ZPL → falha controlada, demais continuam.
- `shipping-labels` intocado.

### Escopo
- 1 arquivo. Sem schema, sem frontend, sem tocar no legado.

