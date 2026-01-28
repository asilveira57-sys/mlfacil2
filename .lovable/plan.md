
## Diagnóstico (com base no código atual + evidências)

### 1) “Duas contas na empresa” e sem conseguir trocar/desconectar
- O componente **`src/components/settings/SettingsCompanies.tsx` está 100% mockado** (usa `useState` com dados fixos) e **sempre cria 1 empresa com 2 contas “Loja ML Principal/Secundária”**.
- Por isso:
  - Você vê “2 contas conectadas” mesmo que no backend não existam 2 conexões reais.
  - “Definir como ativa” só altera estado local e não troca conta de verdade.
  - Não existe “Desconectar” real porque não há integração com backend.
- Conferindo o backend: existe **apenas 1 conta conectada** na tabela de contas ML (vimos 1 registro ativo). Tabelas de “empresas” e “marketplace_accounts” estão vazias para o usuário no ambiente de teste, o que confirma que a tela atual não persiste nada.

### 2) “Refresh/piscar e lentidão ao trocar de aba/janela e voltar”
Mesmo com React Query configurado, ainda há 3 fontes globais fortes de “atividade” quando você volta para a aba:

1) **App Shell remonta em navegação**  
   - Hoje cada página renderiza seu próprio **`DashboardLayout`**, e o `DashboardLayout` cria `SidebarProvider`, `AppSidebar`, Header etc.  
   - Isso causa desmontagem/montagem do “shell” ao navegar entre rotas. Não é “hard reload”, mas é **remount do layout** e pode parecer refresh.

2) **Watchdogs globais rodando em background no App.tsx**
   - Em **`src/App.tsx`** existe o componente **`GlobalWatchdogs`** montado globalmente, que executa:
     - `useCostSyncWatchdog` (intervalo ~15s, faz chamadas a functions e tabelas)
     - `useOrdersSyncWatchdog` (intervalo ~60s, pode disparar sync, e emite eventos)
   - Quando o navegador está em background, timers são “throttled”; ao voltar para a aba, eles “acordam” e podem disparar chamadas acumuladas/burst, dando sensação de refresh + lentidão.

3) **Polling de notificações (30s) montado no header**
   - `NotificationBell` usa queries com `refetchInterval: 30000`. Mesmo sem “refetchOnFocus”, o polling continua e pode “acordar” ao retornar para a aba.

Além disso, seus logs mostram o `RouteChangeCleanup` detectando e limpando `pointer-events`/scroll-lock órfão. Isso não é a causa principal de recarga de dados, mas indica que overlays às vezes ficam “travados” e o cleanup precisa corrigir (o que pode contribuir para sensação de instabilidade).

---

## Objetivos (o que vamos entregar)

1) **Empresas/Contas (Settings)**
- Mostrar dados reais do backend (não mock).
- Permitir:
  - criar empresa
  - conectar conta ML na empresa
  - definir conta ativa
  - **desconectar conta** (botão “Desconectar” com confirmação)
- Corrigir o “problema das duas contas” (sumirá ao remover o mock; só aparecerá o que existe de verdade).

2) **Performance global**
- Identificar com logs mínimos se é:
  - hard reload (window reload) vs. remount/re-render/refetch
- Corrigir definitivamente:
  - App Shell não remonta em navegação
  - watchdogs/polling não causam burst ao voltar foco
  - dados ficam cacheados e só atualizam por ação explícita (botão “Atualizar” / ações do usuário)

---

## Etapa A — Logging temporário (mínimo e focado)

### A1) Detectar “hard reload” vs “remount”
Adicionar logs (somente `console.*`, apenas em DEV) em:
- `src/main.tsx` (log único ao carregar a app)
- `src/App.tsx` (useEffect mount/unmount)
- `src/components/layout/DashboardLayout.tsx` e/ou novo layout global (mount/unmount)
- `src/components/layout/AppSidebar.tsx` (mount/unmount)

Critério:
- Se aparecer “mount do App” ao voltar para a aba sem você navegar: é hard reload (ou bfcache/restore extremo).
- Se não, mas aparecem logs de fetch/intervalos: é refetch/polling/interval.

### A2) Logs de auth/session (para confirmar que não é token refresh causando cascata)
- No `src/pages/Auth.tsx`: logar evento recebido no `onAuthStateChange`.
- No `ActiveAccountProvider` e `useUserAccessState`: logar apenas SIGNED_IN/SIGNED_OUT (já filtrado, mas vamos confirmar que não há navegação/efeito colateral no retorno de foco).

### A3) Logs de “atividade global”
- Em `GlobalWatchdogs` e nos hooks `useCostSyncWatchdog` / `useOrdersSyncWatchdog`:
  - logar quando roda `fetchState`
  - logar quando decide disparar sync
  - logar quando dispara events `orders_sync_*`

### A4) Log de React Query (para identificar invalidations inesperadas)
- Em `App.tsx`, usar:
  - `queryClient.getQueryCache().subscribe(...)` para logar:
    - invalidate/refetch/fetch status (somente nomes e queryKey)
  - Importante: logar só quando acontecer “storm” (ex.: limitar 1 log por segundo) para não poluir.

> Após encontrarmos a origem, os logs serão removidos.

---

## Etapa B — Correção definitiva do “refresh/piscar”

### B1) Preservar App Shell (sem remount por rota)
Refatorar rotas para **usar um layout único com `<Outlet />`** (React Router), mantendo Sidebar/Header/Providers montados uma única vez.

- Criar um `AppShellLayout` (ou similar) que contém:
  - `SidebarProvider`
  - `AppSidebar`
  - Header (NotificationBell + AccountSwitcher)
  - `<Outlet />` para conteúdo das páginas

- Cada página deixa de renderizar `DashboardLayout` diretamente.  
  Em vez disso:
  - páginas viram “conteúdo” (somente main content)
  - título/subtítulo do header virá de:
    - (opção 1) um `PageHeaderContext` com setter `setHeader({title, subtitle, rightContent})` usado pelas páginas
    - (opção 2) mapear por rota (mais simples, menos flexível)

Isso elimina “piscar” de menu/header ao navegar e reduz re-renderizações globais.

### B2) Eliminar burst ao voltar foco: remover atividade global “automática”
A regra do produto é clara: **atualizar só com ação explícita**.

Então vamos:
- **Remover `GlobalWatchdogs` do `App.tsx`** (ou deixar desativado por padrão).
- Montar watchdogs somente quando fizer sentido e/ou apenas quando o usuário ativar conscientemente:
  - Ex.: em `/custos` ou numa tela de “Sincronização”, e somente se o usuário clicar “Ativar auto-sync”.
- Adicionar proteção adicional nos watchdogs:
  - se `document.hidden === true`, não rodar
  - não “catch up” imediatamente ao voltar foco

> Resultado: trocar aba/janela não dispara ondas de calls (que hoje aparecem no network como chamadas frequentes a functions).

### B3) Remover polling global (notificações) e usar realtime/eventos
- Remover `refetchInterval: 30000` das queries de notificações (counts e listas).
- Manter atualização via:
  - realtime (`useNotificationsRealtime`) para inserir/atualizar cache
  - invalidations apenas após ações explícitas (marcar como lida, resolver, dispensar)
- Isso reduz chamadas e elimina “atividade constante” em background.

### B4) Auth sem “restart”
Ajustar `src/pages/Auth.tsx`:
- Hoje ele redireciona para `/dashboard` sempre que `session` existe, independentemente do evento (isso pode ocorrer em eventos que não deveriam navegar).
- Alterar para navegar somente em:
  - `SIGNED_IN`
  - e/ou quando detectar sessão na checagem inicial (uma vez)
- Nunca reagir a `TOKEN_REFRESHED` com navegação.

---

## Etapa C — “Empresas e Contas” real (com Desconectar)

### C1) Substituir mock por backend
Reescrever `src/components/settings/SettingsCompanies.tsx` para:
- Buscar empresas reais em `companies` (ex.: `display_name`, `billing_type`, `is_active`)
- Criar empresa via insert no backend
- Buscar contas por empresa em `marketplace_accounts`:
  - `provider`
  - `external_user_id` (Seller ID)
  - `account_label`
  - `status`
  - `is_active`
  - tokens/expiração (não exibiremos tokens)

### C2) Conectar conta ML “dentro da empresa”
Hoje o OAuth salva em `ml_accounts` e **não vincula a empresa**.
Vamos ajustar o fluxo:
- Ao clicar “Conectar” em uma empresa, o frontend chama a function `ml-auth-url` passando também `companyId`.
- A function `ml-auth-url` inclui `companyId` dentro do `state` do OAuth.
- A function `ml-oauth-callback` ao finalizar:
  - faz upsert em `marketplace_accounts` vinculando `company_id` + `provider='mercadolivre'` + `external_user_id = userData.id`
  - mantém (por compatibilidade) a gravação em `ml_accounts` se ainda existirem módulos que dependem dela
  - evita “desativar todas as contas antigas” de forma global (o código atual desativa tudo, o que inviabiliza multi-conta e troca)

### C3) Botão “Desconectar”
No card da conta (dentro do sheet da empresa):
- Adicionar botão “Desconectar” (com confirmação).
- Ação no backend:
  - marcar `marketplace_accounts.status='disconnected'`, `is_active=false`
  - limpar tokens (`access_token`, `refresh_token`, `token_expires_at`) para evitar uso acidental
- Se essa conta estiver ativa no `user_context`, limpar ou mover a ativa para outra conectada.

### C4) “Definir como ativa” de verdade
- Troca de conta ativa deve atualizar `user_context` via RPC `set_user_active_context` (já existe no schema) para:
  - `active_company_id`
  - `active_marketplace_account_id`
- Após sucesso:
  - atualizar o header (AccountSwitcher) e módulos dependentes
  - disparar um evento interno (se necessário) para módulos legados

### C5) Regra “uma conta por empresa”
Você disse que “empresa com duas contas não existe”. Vamos aplicar como regra de UI e validação:
- Se já existir uma conta **conectada** para a empresa:
  - desabilitar “Conectar” e orientar a “Desconectar” antes
- Se você quiser permitir exceção (por exemplo, trocar sem desconectar), implementamos “Mover conta para esta empresa” quando detectar que o Seller ID já está vinculado em outra empresa.

---

## Etapa D — Remoção dos logs e validação final

Após as correções:
- remover todos os logs temporários
- checklist de validação:
  1) Trocar de aba/janela e voltar: sem loaders globais e sem re-fetch storm
  2) Navegar entre módulos: sidebar/header não “pisca”
  3) Settings > Empresas:
     - lista empresas reais
     - conectar conta cria vínculo correto
     - “Desconectar” funciona e permite conectar em outra empresa
     - “Definir como ativa” reflete no topo do app
  4) Confirmar queda de chamadas repetidas no network (principalmente functions de sync) ao ficar alternando abas

---

## Arquivos principais que serão mexidos (estimativa)
- Layout/roteamento/performance:
  - `src/App.tsx`
  - `src/components/layout/DashboardLayout.tsx` (substituído/encolhido ou migrado)
  - `src/components/layout/AppSidebar.tsx`
  - `src/pages/*` (remover uso direto de DashboardLayout e usar Outlet)
  - `src/pages/Auth.tsx`
  - `src/hooks/useCostSyncWatchdog.ts`
  - `src/hooks/useOrdersSyncWatchdog.ts`
  - `src/hooks/useNotificationSystem.ts`
  - `src/hooks/useAppNotifications.ts` (se ainda usado)
- Empresas/contas:
  - `src/components/settings/SettingsCompanies.tsx`
  - backend functions:
    - `supabase/functions/ml-auth-url/index.ts`
    - `supabase/functions/ml-oauth-callback/index.ts`

---

## Riscos / cuidados
- Como o app hoje usa `ml_accounts` como “fonte” em alguns pontos (AccountSwitcher/ActiveAccountContext), precisamos:
  - manter compatibilidade (ou migrar o contexto para uma view unificada, se preferível)
  - garantir que trocar/desconectar não quebre módulos existentes

