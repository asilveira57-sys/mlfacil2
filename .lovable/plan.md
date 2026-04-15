

# Normalizar Tamanho de Página das Etiquetas para 10x15cm

## Problema

A API do Mercado Livre retorna PDFs em tamanhos diferentes dependendo da **configuração da conta do vendedor no painel ML**. Vendedores configurados para "impressora térmica" recebem páginas 10x15cm. Vendedores configurados para "folha A4" recebem PDFs em A4 paisagem (842x595pt), com a etiqueta centralizada na folha.

Nosso sistema copia as páginas como vêm do ML, sem normalizar o tamanho. Resultado: contas como MKMODAS e OLGA recebem PDFs A4 quando deveriam receber 10x15.

## Causa raiz

Nos 3 pipelines de geração (standard, header, e per-shipment), o código usa `copyPages` ou `embedPage` que **preservam** as dimensões originais do PDF do ML. Nenhuma normalização de tamanho é feita.

## Solução proposta

Criar uma função `normalizePageTo10x15` que é aplicada a cada página baixada do ML **antes** de inseri-la no PDF final. A função:

1. Verifica se a página já está no tamanho correto (~283x425pt ±10%). Se sim, retorna sem alteração.
2. Se a página é maior (A4), usa `embedPage` para **escalar** a página inteira para caber em 283x425pt, mantendo proporção e centralizando.
3. Funciona tanto para A4 portrait quanto landscape.

### Pontos de inserção (3 locais no código)

1. **`buildHeaderPdfSafe`** (linha 319): Após `embedPage(sourcePdf.getPage(0))`, normalizar `origWidth/origHeight` antes de criar a página com header.

2. **Pipeline standard `isPerShipmentPdf`** (linha 1104): Após `copyPages(sourcePdf, [0])`, verificar tamanho e re-escalar se necessário.

3. **DANFE pages** (linhas 381 e 1109): Normalizar também as páginas de DANFE — se vieram em A4, escalar para 10x15.

### Dimensões alvo

```text
10cm x 15cm = 283.46pt x 425.20pt (1pt = 0.3528mm)
Tolerância: ±15% (241-326pt largura, 361-489pt altura)
Se fora da tolerância → escalar para caber
```

### O que NÃO muda

- Frontend (nenhum arquivo)
- Lógica de Flex/Coleta/NF
- Lógica de header (texto, posicionamento, linhas)
- Lógica de DANFE skip
- Pipeline ZPL (não é PDF)
- Nenhuma migration SQL
- Preferências de cabeçalho

### Segurança da mudança

- Se a página já é 10x15, a normalização é um no-op (zero impacto)
- Clientes que já recebem etiquetas corretas não percebem diferença
- Clientes com A4 passam a receber 10x15 automaticamente
- A escala é proporcional — nenhum conteúdo é cortado

### Arquivo alterado

- `supabase/functions/ml-generate-labels/index.ts` — adicionar função `normalizePageTo10x15` e aplicar nos 3 pontos de inserção

