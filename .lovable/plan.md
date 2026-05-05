## Diagnóstico

O problema veio da última correção de preservação do arquivo:

1. O PDF passou a ficar salvo corretamente no singleton/sessionStorage, mas o `attemptAutoDownload()` é chamado automaticamente no mount da página e também no `visibilitychange`.
2. Como não existe uma marcação de “este PDF já teve tentativa de download automático”, toda vez que você sai e volta para `/zpl-converter`, o mesmo arquivo pronto é detectado de novo e o sistema clica no link de download novamente.
3. O contador zera porque o componente `ZPLTimer` guarda o tempo decorrido em `useState` local. Ao sair da rota, o componente desmonta; ao voltar, ele monta de novo começando de `0`, mesmo que o job real continue rodando no singleton.

## Plano cirúrgico

### 1. Bloquear loop de downloads automáticos
Alterar somente a camada de controle do job em `src/lib/zplConverterJob.ts`:

- Adicionar um identificador único por conversão (`jobId`).
- Adicionar estado de entrega do download:
  - `autoDownloadAttempted`: se o download automático já foi tentado para esse PDF.
  - `pendingDownload`: se o PDF ficou pronto enquanto a aba/página não estava em condição de baixar.
- O download automático poderá acontecer no máximo 1 vez por `jobId`.
- Ao sair e voltar da página, se o mesmo PDF já teve tentativa automática, ele não dispara outro download.
- O botão manual “Baixar agora” continuará disponível para o usuário baixar novamente, mas clique manual não cria loop.

### 2. Remover chamada automática no mount que causa repetição
Em `src/pages/ZPLConverter.tsx`:

- Remover a chamada incondicional de `attemptZplAutoDownload()` quando a página monta.
- Manter o `visibilitychange`, mas ele só tentará baixar quando:
  - houver PDF pronto,
  - `pendingDownload` estiver ativo,
  - e aquele `jobId` ainda não tiver recebido tentativa automática.

Isso preserva o comportamento desejado: se terminou enquanto o usuário estava fora/aba oculta, tenta abrir o download quando ele volta. Mas não fica baixando 5, 6 arquivos ao navegar.

### 3. Corrigir contador para não zerar ao voltar para a página
Alterar o estado do job em `src/lib/zplConverterJob.ts`:

- Salvar `startedAt` no singleton quando a conversão começa.
- Persistir `startedAt` enquanto a conversão está em andamento.
- O tempo exibido será calculado por relógio real: `Date.now() - startedAt`.

Alterar `src/components/ZPLTimer.tsx` de forma compatível:

- Adicionar uma prop opcional, por exemplo `startedAtMs`.
- Quando essa prop existir, o timer não começa do zero; ele calcula o tempo decorrido a partir do início real do job.
- Se o componente desmontar e montar de novo, ele volta mostrando o tempo correto, por exemplo 00:42 em vez de 00:00.
- Manter compatibilidade com usos antigos do `ZPLTimer` que não passarem `startedAtMs`.

Alterar `src/pages/ZPLConverter.tsx`:

- Passar `jobState.startedAt` para o `ZPLTimer`.
- Não usar estado local para tempo do job.

### 4. Não mexer na geração das etiquetas
Não alterar estas funções/pipeline:

- `convertSingleLabel`
- `processLabelsInBatches`
- `splitZPLByType`
- chamada Labelary
- montagem jsPDF
- tipo Full Produto / Full Volume
- PDF padrão / PDF vetorial
- histórico de reimpressão

A correção fica restrita ao controle de estado, timer e disparo de download.

## Resultado esperado

- A conversão continua rodando se o usuário sair da página e voltar.
- O contador continua do tempo real, sem zerar.
- O PDF pronto não some.
- O download automático não entra em loop.
- Cada conversão dispara no máximo uma tentativa automática de download.
- Se o navegador bloquear ou se o usuário quiser baixar de novo, ele usa o botão manual, sem gerar múltiplos arquivos sozinho.