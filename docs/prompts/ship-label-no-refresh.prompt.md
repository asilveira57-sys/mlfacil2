# Prompt para corrigir refresh no módulo Ship Label

Você é um engenheiro sênior React + TanStack Query.

## Contexto do bug
No módulo **Ship Label** (`/shipping-labels`), ao trocar de guia/aba do navegador ou navegar para outra rota e voltar, a tela dispara atualização automática desnecessária. Isso causa:
- lentidão perceptível;
- quebra de fluxo do usuário;
- risco de perder contexto visual da consulta/lista;
- reclamações de clientes.

## Objetivo
Impedir refresh/refetch automático ao retornar para aba/rota no módulo Ship Label, preservando estado em memória e só atualizando quando o usuário pedir explicitamente (ex.: botão de sincronizar/atualizar).

## Escopo
Arquivo principal: `src/hooks/useShippingLabels.ts`.

## Tarefas obrigatórias
1. Localizar todas as `useQuery` do módulo Ship Label.
2. Garantir, em **todas** elas:
   - `refetchOnWindowFocus: false`
   - `refetchOnMount: false`
   - `refetchOnReconnect: false`
3. Não remover ações manuais de atualização já existentes (`refetch`, sync manual, etc.).
4. Não alterar regras de negócio de seleção, paginação e geração de etiquetas.
5. Manter TypeScript sem erros e sem `any` novos desnecessários.

## Critérios de aceite
- Ao sair da aba e voltar, **não** ocorre refetch automático.
- Ao trocar de rota e retornar para `/shipping-labels`, **não** ocorre recarregamento automático dos dados.
- A atualização continua possível por ação explícita do usuário.
- Build/lint continuam passando.

## Entrega esperada
- Diff objetivo e mínimo.
- Explicação curta do porquê técnico da mudança.
- Lista dos pontos onde o refetch automático foi desabilitado.
