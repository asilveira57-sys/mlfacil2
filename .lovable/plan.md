
Objetivo: impedir qualquer “refresh”/recarregamento perceptível (UI voltando para skeleton, listas mudando, contadores atualizando, etc.) quando o usuário alterna de aba/janela ou volta para o sistema. A aplicação só deve atualizar dados quando:
1) o usuário apertar F5 (reload do navegador), ou  
2) o usuário clicar em um botão explícito de “Atualizar/Recarregar” dentro do sistema.  

Também vamos reduzir ao máximo “auto-updates” que hoje acontecem por polling (refetchInterval) e por Realtime subscriptions.

---

Diagnóstico do que está acontecendo hoje (com base no código):
- O React Query global já está configurado para NÃO refazer fetch ao voltar o foco (refetchOnWindowFocus=false, refetchOnReconnect=false, refetchOnMount=false). Isso ajuda.
- Porém existem vários pontos com atualização automática independente do foco:
  - Hooks com polling/refetchInterval (ex.: notificações a cada 30s, QA a cada 30s, trends status a cada 5 min, admin a cada 1 min).
  - Hooks com Realtime subscription (tasks, promotions, ads campaigns/alerts, rules events, notifications etc.) que podem trazer alterações “ao vivo”.
- Quando o usuário volta para a aba, timers “atrasados” podem disparar e alguns hooks setam loading=true novamente, causando “cara de refresh”.
- Existe também a possibilidade de o Chrome descartar a aba por memória e recarregar a página (isso é do navegador). Isso não dá para impedir por código, mas dá para mitigar restaurando estado e evitando flashes.

---

Solução proposta (alto nível):
1) Criar um “modo estático” global (default ligado) que DESLIGA:
   - Todo polling (refetchInterval).
   - Toda subscription realtime.
   - Qualquer “auto refresh” que não seja disparado por botão.
2) Adicionar um botão global “Atualizar dados” no header do sistema (AppShellLayout) para o usuário disparar atualização manual.
3) Onde houver “polling de progresso” (ex.: acompanhar job em execução iniciado pelo usuário), permitir SOMENTE após um clique do usuário e somente por tempo limitado enquanto ele estiver na tela (opcional, mas recomendado para UX).
4) Minimizar “flash” de loading: quando o usuário atualizar manualmente, manter os dados antigos na tela enquanto o novo fetch acontece (sem resetar para skeleton).

---

Mudanças planejadas (arquivos e ações)

A) Camada global de política de atualização (novo contexto)
1. Criar um contexto/hook global, por exemplo:
   - src/contexts/RefreshPolicyContext.tsx (novo)
   - API:
     - autoRefreshEnabled (boolean) -> default: false (modo estático)
     - setAutoRefreshEnabled(boolean) -> opcional (se você quiser permitir ligar “ao vivo” depois)
     - manualRefresh() -> dispara refresh manual
   - Persistência em localStorage (ex.: “app_auto_refresh_enabled”).
2. Expor um hook simples:
   - useRefreshPolicy()

B) Tornar o React Query “não-stale” por padrão (para não revalidar automaticamente)
1. Ajustar src/App.tsx:
   - defaultOptions.queries.staleTime: Infinity (ou um valor muito alto)
   - manter refetchOnWindowFocus=false, refetchOnReconnect=false, refetchOnMount=false
   - manter retry baixo (ou 0) para evitar comportamento “automático” em cascata
   Observação: isso garante que o React Query não fique marcando as queries como “stale” e não tente “ajudar” com refetch em momentos inesperados.

C) Desligar polling (refetchInterval) quando modo estático estiver ativo
Alterar os hooks que hoje fazem polling para só fazer quando autoRefreshEnabled=true OU quando houver uma operação explícita iniciada pelo usuário.

Arquivos identificados:
- src/hooks/useAppNotifications.ts
  - useUnreadNotificationsCount: remover refetchInterval: 30000 quando static mode estiver ativo
- src/hooks/useQA.ts
  - usePendingQuestionsCount: remover refetchInterval: 30000 quando static mode estiver ativo
- src/hooks/useTrendsStatus.ts
  - refetchInterval: 5*60*1000 -> desligar em static mode
- src/hooks/useAdmin.ts
  - refetchInterval: 60000 -> desligar em static mode
- src/hooks/useSellerCategories.ts
  - useCategorySyncState: hoje faz polling enquanto status=running
    - Ajuste recomendado: polling só se o usuário acabou de clicar “Sincronizar” (janela de polling temporária) OU se autoRefreshEnabled=true

D) Desligar Realtime subscriptions quando modo estático estiver ativo
Em todos os hooks que abrem channel() e refetcham automaticamente, condicionar a inscrição a autoRefreshEnabled.

Arquivos com subscription identificados:
- src/hooks/useNotificationSystem.ts (notifications realtime)
- src/hooks/useNotifications.ts
- src/hooks/useTasks.ts
- src/hooks/usePromotions.ts
- src/hooks/useAds.ts (ads campaigns e alerts)
- src/hooks/useAdsRules.ts (ads rule events)
- src/hooks/useAdsTasksHistory.ts
- src/hooks/useQA.ts (qa realtime aparece no arquivo em linhas posteriores)
Ação: em cada useEffect do channel, adicionar:
- if (!autoRefreshEnabled) return;  (ou não criar channel)
Assim, nada “se mexe” sozinho quando o usuário troca de aba.

E) Botão global “Atualizar dados” (manual refresh)
1. Alterar src/components/layout/AppShellLayout.tsx para incluir um botão no header (ex.: ícone RefreshCw “Atualizar”).
2. Ao clicar, executar uma estratégia de refresh manual:
   Opção 1 (mais simples, focada em React Query):
   - queryClient.invalidateQueries({ type: 'active' })
   - queryClient.refetchQueries({ type: 'active' })
   Isso atualiza apenas o que estiver “em uso” na tela.
   Opção 2 (mais abrangente):
   - disparar um evento global window.dispatchEvent(new CustomEvent('manual_refresh'))
   - cada módulo que não usa React Query pode ouvir e rodar seu refetch.
   Como o projeto tem hooks fora do React Query (useState + fetch + loading), essa opção dá cobertura total sem refatorar tudo.

Recomendação: implementar as duas:
- refetchQueries(active) para React Query
- evento “manual_refresh” para os hooks que usam fetch manual

F) Evitar “flash” de loading em refresh manual
Onde ainda existir loading “agressivo” (setLoading(true) sempre que refaz fetch), ajustar para:
- só mostrar loading no primeiro carregamento
- em refetch manual, manter dados antigos e mostrar um indicador pequeno (spinner no botão, por exemplo)
Isso é especialmente importante nos hooks fora do React Query (ex.: useAdsCampaigns/useAdsAlerts/usePromotions/useTasks).

---

Como vamos validar (checklist prático)
1) Abrir /anuncios/linha-do-tempo e outra tela qualquer.
2) Abrir DevTools > Network.
3) Trocar de aba/janela por 10–20s e voltar:
   - esperado: nenhum “boom” de requests, nenhuma troca de skeleton/flash.
4) Clicar no botão global “Atualizar dados”:
   - esperado: requests acontecem e a UI atualiza, sem reset de layout.
5) Verificar módulos com polling antigo (QA, notificações, tendências):
   - esperado: contadores não mudam sozinhos ao voltar para a aba.
6) (Extra) Se o Chrome estiver realmente descartando a aba (tab discard):
   - esperado: mesmo que a página recarregue, vamos tentar restaurar o estado/rota e reduzir flashes.
   - Observação: não é possível impedir o discard via código, só mitigar.

---

Riscos e impactos (para alinhar expectativa)
- Desligar realtime + polling significa que notificações/contadores não vão “andar sozinhos” (por design). O usuário precisará clicar “Atualizar”.
- Processos em background (jobs) continuarão rodando normalmente no backend; apenas a tela não refletirá mudanças automaticamente.

---

Entrega (ordem de implementação)
1) Criar RefreshPolicyContext e persistência.
2) Ajustar QueryClient (staleTime alto/infinito).
3) Desligar polling (refetchInterval) condicionado ao modo estático.
4) Desligar realtime subscriptions condicionado ao modo estático.
5) Botão global “Atualizar dados” + evento manual_refresh.
6) Ajustar loaders para não “piscar” em refresh manual (primeiro nos módulos mais usados).
