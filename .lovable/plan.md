## Problema

No `/zpl-converter` (Etiqueta Full):
1. Ao sair da página durante a conversão e voltar, **a configuração some** (tipo, dimensões, código ZPL, preview).
2. Quando a conversão termina com a aba em segundo plano ou após navegação, o `pdf.save()` não dispara o "Salvar como" automaticamente — o usuário precisa clicar de novo para o download abrir.
3. A geração da etiqueta em si funciona e **NÃO pode ser quebrada** (sem mexer em `convertSingleLabel`, `processLabelsInBatches`, `splitZPLByType`, Labelary, jsPDF).

## Causa

- `ZPLConverter.tsx` mantém todo o estado em `useState` puro. Ao trocar de rota o componente desmonta → estado se perde.
- O `pdf.save()` do jsPDF cria um `<a>` no DOM e clica nele. Se isso ocorrer enquanto o componente já desmontou (rota trocada) ou a aba está em background, o navegador trata como sem gesto do usuário e exige clique para concluir.
- Não há persistência (igual já existe em `ZplViewerTool`/`shippingLabelsSession`), nem cache do PDF gerado para reoferecer download imediato.

## Solução (cirúrgica, sem tocar no pipeline de conversão)

### 1. Persistir configuração + preview em sessionStorage
Espelhar o padrão de `src/pages/tools/ZplViewerTool.tsx` (chave única `zpl_converter_state_v1`):
- Salvar em `useEffect`: `zplCode`, `width`, `height`, `dpi`, `selectedLabelType`, `selectedFullProdutoSubType`, `outputFormat`, `uploadedFileName`, e (novo) o **último PDF gerado** como base64 + nome do arquivo.
- Hidratar lazy nos `useState(() => ...)` no mount.
- Não limpar em `finally` (já não limpa). Em `handleClearCode`, remover a chave.

### 2. Conversão sobrevive à navegação
Mover o estado de conversão para um **singleton em módulo** (`src/lib/zplConverterJob.ts`) com:
- `runJob(params, callbacks)` — guarda promise atual, `progress`, `phase`, `resultPdfBlob`.
- `subscribe(listener)` para a página re-hidratar progresso ao voltar.
- Se o componente desmontar, a Promise continua executando; quando termina, salva o blob no singleton + sessionStorage (base64).
- Ao voltar para a página: hook lê o singleton, mostra a barra continuando, e se já terminou faz o download (ver passo 3).

### 3. Auto-download confiável
Quando o PDF termina:
1. Em vez de `pdf.save(...)`, gerar `const blob = pdf.output('blob')` e guardar em memória + sessionStorage.
2. Tentar `triggerDownload(blob, fileName)`:
   - Cria `URL.createObjectURL`, `<a download>`, anexa ao `document.body`, `.click()`, remove.
   - Funciona se a aba/página estiver ativa (caso normal).
3. Se a aba estiver em background OU rota desmontou: salva o blob no estado persistido e, ao montar/voltar à aba (`visibilitychange` + mount), tenta o download novamente automaticamente uma única vez. Se o navegador ainda bloquear (sem gesto), mostrar um banner discreto **"PDF pronto — Baixar agora"** que executa o download no clique. (Sem perder configuração nem preview.)
4. Manter o `addToHistory` e `saveConversionTime` exatamente como hoje.

### 4. Não dar refresh / não recriar
- Nenhum `navigate`, nenhum `window.location`, nenhum `key={}` que force remount.
- `onAuthStateChange` continua ignorando `TOKEN_REFRESHED` (já está correto).

## Arquivos a alterar

- `src/lib/zplConverterJob.ts` — **novo**: singleton de job + persistência blob/base64 + helpers `triggerDownload` / `tryAutoDownload`.
- `src/pages/ZPLConverter.tsx` — hidratar estado de sessionStorage, usar o singleton para `runJob`, substituir `pdf.save()` por `pdf.output('blob')` + `triggerDownload`, escutar `visibilitychange` para retry de download, banner "Baixar agora" quando bloqueado.

## Garantias de não-regressão

- `convertSingleLabel`, `processLabelsInBatches`, `splitZPLByType`, geração jsPDF/Labelary: **byte-a-byte preservados**.
- Fluxo de PDF vetorial single-label (download direto do blob da Labelary) passa pelo mesmo `triggerDownload`.
- `quality`, `outputFormat`, sub-tipos `full_produto`, dropzone, histórico de reimpressão: inalterados.
- `Sobre flex / NF / carrinho`: fora do escopo, nada alterado.
