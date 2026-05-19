## Objetivo

No módulo **ZPL Converter** (`/zpl-converter`), oferecer dois botões de geração:

1. **Converter e Baixar PDF (Padrão)** — mantém a ordem original como vem da API/arquivo, como já funciona hoje.
2. **Converter e Baixar PDF (Ordem Alfabética)** — ordena as etiquetas pelo nome do destinatário antes de montar o PDF.

Não há risco para o fluxo atual: a ordenação acontece apenas em memória, após o split das etiquetas (`splitZPLByType`) e antes da renderização. O pipeline (Labelary → jsPDF, modos PDF Padrão/Vetorial, histórico, timer, singleton de job) permanece intacto.

## Mudanças

### 1. `src/pages/ZPLConverter.tsx`
- Adicionar parâmetro `sortMode: 'original' | 'alpha'` em `convertZPLtoPDF`.
- Após `splitZPLByType(...)`, se `sortMode === 'alpha'`, ordenar o array `labels` usando uma função `extractRecipientName(zpl)` + `localeCompare('pt-BR', { sensitivity: 'base' })`.
- Substituir o botão único por dois botões lado a lado:
  - Botão primário: **"Converter e Baixar PDF (Padrão)"**
  - Botão secundário (variant `outline`): **"Converter e Baixar PDF (Ordem Alfabética)"** com tooltip explicando que ordena pelo nome do destinatário.
- Ambos respeitam o mesmo estado `isConverting` e o singleton de job.

### 2. Nova função utilitária `extractRecipientName(zplBlock: string): string`
Pode viver em `src/lib/zplRecipient.ts` (novo arquivo) para manter `ZPLConverter.tsx` limpo.

Heurística (em ordem de prioridade, primeira que casar vence):
1. Procurar campo precedido por marcador típico de destinatário: regex tolerante a variações como `^FDDESTINAT[ÁA]RIO[:\s]*([^\^]+)\^FS` ou linha imediatamente após um `^FD` contendo "Destinatário"/"Para"/"Cliente".
2. Heurística por estrutura: extrair todos os `^FDxxx^FS`, filtrar tokens curtos (≤2 chars), descartar valores que sejam apenas dígitos, códigos de barras (`>;`, `>:` no início — GS1), datas, CEPs (8 dígitos), URLs, e strings com `MERCADO LIVRE`/`SHOPEE`/`FULL`/`REMETENTE`. Pegar o primeiro token alfabético "longo" (>= 6 chars) que tenha pelo menos um espaço (nomes próprios geralmente têm dois ou mais).
3. Fallback: primeiro `^FD` textual da etiqueta.
4. Fallback final: string `"\uFFFF"` (joga para o fim do sort, garantindo determinismo).

Normalização para comparação: `.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toUpperCase()`.

### 3. Comportamento preservado
- O preview (primeira etiqueta) passa a refletir a primeira da ordem escolhida.
- Histórico de reimpressão continua salvando o `zplCode` original (não reordenado), para que o usuário possa reimprimir e escolher a ordem novamente.
- Estimativa de tempo, progresso e PDF Vetorial/Padrão funcionam igual.

## Por que é seguro

- A reordenação ocorre **antes** de qualquer chamada ao Labelary; cada bloco ZPL (`^XA...^XZ`) continua íntegro.
- Nenhuma alteração no backend, no singleton de job, ou no fluxo do Ship Label.
- Se a heurística não encontrar nome em alguma etiqueta, ela vai para o fim do PDF — nada se perde.

## Arquivos afetados

- `src/lib/zplRecipient.ts` (novo)
- `src/pages/ZPLConverter.tsx` (UI dos dois botões + parâmetro de ordenação)
