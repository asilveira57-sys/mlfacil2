
# Restaurar Geração de Etiquetas Agora, sem Quebrar o que Já Funciona

## Leitura do problema
O que quebrou não foi a regra de seleção nem o fluxo de cabeçalho em si. O ponto mais arriscado foi a mudança recente dentro de `supabase/functions/ml-generate-labels/index.ts`, que passou a mexer no PDF em todos os pipelines para “normalizar” páginas para 10x15.

Hoje a função ficou mais frágil em 2 pontos:
1. passou a redesenhar páginas que antes só eram copiadas;
2. a geração é “bloqueio total”: se 1 envio falha, derruba o PDF inteiro.

Para uma conta como `ADECONEX.SP`, que já vinha 10x15 correto, o comportamento ideal era continuar no caminho antigo, sem tocar em nada. Então a forma mais segura de resolver urgente é separar “restaurar operação” de “corrigir contas A4”.

## Causa provável
A normalização foi aplicada cedo demais e de forma ampla demais:
- entrou no pipeline padrão;
- entrou no pipeline com cabeçalho;
- entrou também na DANFE;
- usa recriação/embedding extra de página, o que aumenta chance de erro;
- qualquer PDF fora da tolerância cai nesse caminho novo.

Ou seja: a correção para MKMODAS/OLGA acabou interceptando também casos que antes funcionavam.

## Plano seguro de correção

### Fase 1 — Firebreak imediato
Reverter apenas a parte da normalização de PDF em `ml-generate-labels` e restaurar o fluxo anterior de cópia simples das páginas.

O que volta:
- `copyPages` / `embedPage` como estava antes da normalização;
- pipeline padrão volta a gerar como antes;
- pipeline com cabeçalho volta a usar a etiqueta original como base;
- DANFE volta ao comportamento antigo.

O que permanece:
- autenticação mais recente da edge function;
- regras de NF / Flex / Coleta;
- frontend;
- seleção de layouts;
- ZPL.

Objetivo dessa fase: fazer `ADECONEX.SP` e as contas que já rodavam em 10x15 voltarem a funcionar imediatamente.

### Fase 2 — Validação pós-restauração
Depois do rollback cirúrgico:
- testar geração PDF padrão;
- testar “Cabeçalho sem DANFE”;
- testar “Cabeçalho + DANFE” apenas quando a venda realmente permitir;
- confirmar que o erro desapareceu na conta problemática principal.

### Fase 3 — Reintrodução segura da correção A4
Só depois de tudo estável, reimplementar a solução de MKMODAS/OLGA com abordagem conservadora:

- detectar apenas páginas claramente A4/oversized;
- não normalizar páginas que já estejam próximas de 10x15;
- aplicar a normalização só no ponto estritamente necessário;
- evitar recriar PDF inteiro à toa;
- manter fallback: se a página não for claramente A4, seguir fluxo antigo.

Em outras palavras: a futura correção não será “qualquer coisa fora da tolerância”, e sim “somente quando for evidentemente A4 do ML”.

## O que não vou mexer nessa correção urgente
- `src/lib/shippingLabelRules.ts`
- regras de habilitação de “Cabeçalho + DANFE”
- frontend da tela de etiquetas
- banco/migrations
- preferências de cabeçalho
- ZPL

## Observação importante sobre o cabeçalho “desabilitado”
Isso é uma regra separada da falha de geração:
- Coleta sem NF emitida bloqueia “Cabeçalho + DANFE”;
- “Cabeçalho sem DANFE” continua sendo o caminho permitido nesses casos.

Então a urgência principal aqui é restaurar a geração; a lógica de habilitação do cabeçalho não deve ser alterada nesse rollback.

## Arquivo a ajustar
- `supabase/functions/ml-generate-labels/index.ts`

## Resultado esperado
1. a geração volta a funcionar imediatamente para quem já estava correto;
2. `ADECONEX.SP` volta ao comportamento anterior estável;
3. a correção de MKMODAS/OLGA será refeita depois, de forma isolada e sem risco para a base toda.

## Detalhe técnico
Implementação segura da Fase 1:
- remover/desativar `TARGET_WIDTH_PT`, `TARGET_HEIGHT_PT`, `SIZE_TOLERANCE`;
- remover/desativar `normalizePageTo10x15` e `copyPageNormalized`;
- restaurar os trechos do pipeline padrão e do header para o fluxo anterior;
- preservar as mudanças de autenticação da edge function;
- redeploy só da função `ml-generate-labels`.

Essa é a forma mais rápida e menos arriscada de “voltar ao que funcionava” sem desmontar outras correções recentes.
