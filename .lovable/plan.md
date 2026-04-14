
Objetivo

Fazer a página de Etiquetas obedecer um modo realmente estático durante:
- troca de rota
- mudança de aba/janela do navegador
- Alt+Tab
- retorno para a página

sem perder:
- progresso de geração
- seleção atual
- filtros e paginação
- percepção de continuidade operacional

Diagnóstico confirmado

O problema principal não é “window focus”. O app já desliga `refetchOnWindowFocus`.
O problema real é estrutural:

1. `useShippingLabels` guarda estado operacional só em memória do componente
- `selectedIds`
- `generationProgress`
- `isGenerating` (vem da mutation local)
- filtros/página/busca

2. A geração de etiquetas é tratada como chamada síncrona
- `ml-generate-labels` retorna o arquivo só no final (`pdf_base64` / `zpl_content`)
- se o usuário sai da rota, o componente desmonta e perde o estado visual
- quando volta, a página remonta e reconsulta dados, parecendo “recarregar” e “perder o que estava fazendo”

3. O backend já cria job em `meli_print_queue`, mas o frontend não usa isso para retomada
- existe inclusive `ml-generate-labels-status`
- porém `useShippingLabels` não persiste `job_id` nem faz polling de retomada
- então a geração não é resiliente à navegação

4. Ainda há refreshes locais ao remontar
- `useShippingCutoff` busca novamente no mount
- `ShippingEligibilityGuard` e checks auxiliares podem mostrar loading de novo
- isso reforça a sensação de tela “viva” em vez de estática

Correção proposta

1. Transformar a geração em fluxo resiliente por job
- Ao iniciar geração, persistir `job_id`, tipo, layout e contexto do seller em storage local.
- Não depender mais só de `mutation.isPending`.
- Tratar a geração como “job em andamento” até consultar `meli_print_queue`/`ml-generate-labels-status`.

2. Retomar automaticamente ao voltar para a rota
- Quando `ShippingLabels` montar, verificar se existe job ativo salvo.
- Se existir e pertencer ao seller atual:
  - restaurar `generationProgress`
  - iniciar polling do status
  - manter a barra de progresso visível
- Ao concluir:
  - disparar download final
  - limpar estado persistido do job

3. Persistir estado operacional da tela
Criar persistência local por seller para:
- `statusFilter`
- `periodFilter`
- `customDateRange`
- `searchQuery`
- `sortField` / `sortDirection`
- `currentPage`
- `logisticFilter`
- `selectedIds`

Assim, sair e voltar para a rota não reinicia a operação visual.

4. Congelar refreshes automáticos enquanto houver geração ativa
- Suspender o auto-refresh de 5 min em `useShippingLabels` quando existir job ativo.
- Evitar reconsultas desnecessárias enquanto o usuário está imprimindo.
- Manter apenas o polling do job de impressão.

5. Reduzir remount-loading perceptível na página
- Fazer `ShippingLabels` renderizar o último snapshot persistido imediatamente.
- Evitar spinner de tela cheia quando já houver estado restaurado.
- Aplicar o mesmo princípio ao card de cutoff: manter último valor visível e atualizar em background sem “piscar”.

Arquivos a alterar

- `src/hooks/useShippingLabels.ts`
- `src/pages/ShippingLabels.tsx`
- `src/components/shipping/BulkActionsBar.tsx`
- `src/hooks/useShippingCutoff.ts`
- possivelmente um novo utilitário, por exemplo:
  - `src/lib/shippingLabelsSession.ts`

Mudanças técnicas

1. Em `useShippingLabels`
- adicionar estado persistido por seller
- salvar/restaurar filtros, seleção e progresso
- trocar o conceito de “geração ativa” de mutation local para:
  - `activePrintJobId`
  - `activePrintJobStatus`
- implementar polling com cleanup seguro
- ao montar, retomar job incompleto em `meli_print_queue`

2. Na geração
- depois de chamar `ml-generate-labels`, salvar imediatamente o `job_id`
- usar esse `job_id` como fonte de verdade
- quando o job concluir, usar o retorno final para download e limpar sessão

3. Em `ShippingLabels`
- consumir estado restaurado sem resetar a interface
- impedir que a UI “volte ao zero” ao retornar para a rota

4. Em `useShippingCutoff`
- evitar loading agressivo quando já houver dado carregado anteriormente
- manter valor anterior visível durante revalidação

Validação depois da implementação

1. Iniciar geração de etiquetas e navegar para outra página
2. Voltar para `/shipping-labels`
3. Confirmar que:
- barra de progresso continua
- seleção/filtros continuam
- não há reset visual da operação
- ao terminar, o arquivo baixa normalmente

4. Trocar de aba do Chrome / Alt+Tab
- a página não deve “recarregar” visualmente ao voltar

5. Repetir com:
- PDF
- ZPL
- lote pequeno e lote maior

Risco que precisa ser corrigido junto

Hoje o backend retorna o arquivo completo no final da mesma chamada. Para resiliência total, a implementação ideal é:
- usar o job persistido como verdade operacional no frontend agora
- e, se necessário numa segunda etapa, ajustar o backend para expor recuperação final do artefato pelo `job_id`, em vez de depender só da resposta original da chamada

Resultado esperado

A página de Etiquetas passa a funcionar como o módulo de Custos:
- operacionalmente persistente
- sem reset por navegação
- sem perder geração em andamento
- sem “dar react” ao voltar para a aba/tela
