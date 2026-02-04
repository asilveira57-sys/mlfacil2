
## Objetivo (o que você pediu)
Fazer o módulo de **Custos** funcionar de forma **automática e resiliente**:

- Atualizar vendas/pedidos e custos **sem o cliente clicar em sincronizar**
- Rodar **na madrugada** (e manter incremental durante o dia, se necessário)
- **Checar Billing**, puxar **custos reais**, guardar em **cache**
- Se der erro/timeout/rate limit: **não travar**, **destravar sozinho** e **continuar de onde parou**

---

## Diagnóstico (por que está travado agora)
Hoje existe a tela com “Sincronização Automática”, mas o “automático” não está executando de verdade:

1) **O Step 2 está realmente pausado no backend** e ficou assim desde 28/01  
- `meli_real_costs_sync_state` para `seller_id=66043362` está `status='paused'`, `processed=200`, `total=791`, com `last_heartbeat_at` em 28/01.

2) **Os pedidos continuam chegando**, mas o cache de custos não acompanha  
- Existem pedidos pagos recentes (até 04/02), porém o cache `order_cost_breakdown_cache` está atualizado só até 28/01.
- Ou seja: o pipeline parou no Step 2 e ninguém retomou automaticamente.

3) **O “watchdog” do módulo existe no código**, mas não está conectado/rodando de forma efetiva  
- Existe o hook `useCostSyncWatchdog`, e a tela `CostSettings` escreve flags em `localStorage` e dispara um evento `cost_watchdog_update`.
- Porém não há nenhum “listener/montagem global” que realmente consuma isso no app (e há comentário no `App.tsx` indicando que watchdogs globais foram removidos).

Resultado: o Step 2 fica “paused” e a UI mostra como se fosse retomar, mas **nada retoma**.

---

## Solução proposta (arquitetura em 2 camadas)
### Camada A — Automação server-side (madrugada, sem depender do usuário)
Criar um job noturno no backend que:
1. Puxa pedidos (já existe nightly/hourly de pedidos, vamos manter)
2. Sincroniza Billing (taxas)
3. Calcula custos reais / reprocessa pendências
4. Se pausar por runtime/rate limit, continua na próxima execução automaticamente

### Camada B — Watchdog in-app (quando o usuário estiver logado)
Mesmo com job noturno, é útil ter um watchdog leve no app para:
- Se ficar `paused` durante o dia, ele retoma sozinho
- A tela de Configurações não fica “travada” esperando alguém clicar

---

## Entregáveis (o que vou implementar)

### 1) Backend: Job “Costs Nightly Sync” (madrugada)
**Nova backend function** (ex: `costs-nightly-sync`) com estas características:
- **Não depende de usuário logado**
- Protegida por **segredo de cron** (header), para não ser um endpoint público “chamável por qualquer um”
- Usa lock (tabela `sync_scheduler`) para evitar duas execuções simultâneas
- Para cada conta ativa:
  1. **Confere/atualiza token**
  2. **Sincroniza Billing Details** (escopo “recent” por padrão) com:
     - paginação
     - backoff para 429 (rate limit)
     - persistência de cursor em `meli_billing_details_sync_state`
  3. **Backfill de breakdown** para pedidos pagos sem registro (`missing_breakdown`)
     - persistindo progresso em `meli_backfill_sync_state`
  4. **Real costs incremental** (atualiza `order_cost_breakdown_cache`)
     - persistindo progresso em `meli_real_costs_sync_state`
     - retomando automaticamente se estiver `paused`

Observação importante: como as funções atuais (`ml-sync-billing-details`, `ml-sync-real-costs`) validam JWT de usuário, o job noturno será implementado como **função dedicada de cron** (para não depender de token de usuário).

---

### 2) Backend: Agendamento (cron) na madrugada + retomada automática
Adicionar agendamentos (pg_cron/pg_net) similares aos já existentes:

- `costs-nightly-sync`: roda todo dia na madrugada (horário alinhado ao seu fuso, mesma lógica do nightly de pedidos)
- Opcional recomendado: `costs-watchdog-resume` a cada X minutos/hora
  - Ele não “puxa tudo”, apenas detecta estados `paused/error` e tenta retomar com segurança
  - Ajuda quando o ML rate-limita e o processo precisa ser retomado depois sem ficar preso

---

### 3) Frontend: ligar o watchdog de Custos de verdade (sem “tempestade”)
Implementar um watcher **apenas no módulo /custos**, não global no app inteiro:

- Montar `useCostSyncWatchdog(sellerId, enabled)` dentro do módulo Custos
- Criar um pequeno hook auxiliar (ex: `useCostWatchdogPreferences`) para:
  - ler `localStorage.cost_watchdog_enabled`
  - escutar o evento `cost_watchdog_update`
  - manter o toggle “Sincronização Automática” realmente refletindo no watchdog

Com isso, quando o Step 2 estiver `paused`, o watchdog:
- retoma (`continue` / `continue_backfill` / billing sync) com cooldown/debounce (já existe no hook)
- evita spam de requests (já tem `COOLDOWN_MS`, `WATCHDOG_INTERVAL_MS` e debounce por etapa)

---

### 4) Frontend: atualização automática dos dados na página de Custos (sem precisar clicar)
Hoje o Resumo/Pedidos carregam “uma vez” e não revalidam por conta própria.

Vou adicionar uma estratégia leve:
- Polling suave (ex: 30s–60s) apenas enquanto a rota `/custos` estiver aberta e a aba estiver visível
- Quando detectar mudança de estado (ex: heartbeat/status mudando), faz refresh do resumo/listagens

Isso resolve o “estou na página e não cliquei em nada e não atualiza”.

---

## Mudanças em arquivos (alto nível)

### Backend (novos/alterados)
- `supabase/functions/costs-nightly-sync/index.ts` (novo)
- SQL (via migração aprovada) para:
  - inserir registro em `sync_scheduler` para o novo job (se necessário)
  - criar `cron.schedule(...)` para disparar a função na madrugada e (opcional) um resume job

### Frontend
- `src/pages/Custos.tsx` (montar watchdog e refresh leve)
- `src/components/custos/CostSettings.tsx` (conectar toggle ao watchdog real + garantir que “auto” tem efeito)
- (Se necessário) `src/hooks/useCostWatchdogPreferences.ts` (novo hook pequeno para ler localStorage/evento)

---

## Regras de retomada (como “destrava e volta de onde parou”)
- **Paused por tempo**: continua automaticamente na próxima rodada (in-app ou cron)
- **Rate limit (429)**: marca `paused` com motivo e tenta novamente depois (cron resume)
- **Token expirado**: tenta refresh; se inválido, marca conta para reconexão (sem travar o job inteiro)
- **Backlog grande**: processa em lotes (limite de runtime), salva cursor e continua na próxima execução

---

## Critérios de aceite (o que vou considerar “pronto”)
1. Em `Configurações > Passo 2`, o status não fica preso indefinidamente em `paused` sem retomar
2. O cache de custos (`order_cost_breakdown_cache`) volta a avançar para datas recentes (ex: após 28/01)
3. A página `/custos` atualiza o Resumo/Pedidos automaticamente sem clicar em “Sincronizar”
4. O job noturno roda sozinho e mantém dados atualizados, sem depender do cliente abrir o app
5. Se houver erro/rate limit, o sistema não “morre”: ele pausa, registra e retoma sozinho

---

## Plano de testes (prático)
- Disparar manualmente a função `costs-nightly-sync` (execução única) e validar:
  - criação/atualização de estados (`meli_*_sync_state`)
  - novos registros em `order_cost_breakdown_cache` para datas recentes
- Abrir `/custos` e confirmar:
  - Resumo atualiza sozinho após processamento
  - “Passo 2” sai de travado e progresso continua
- Simular rate limit (ou esperar ocorrer) e validar:
  - status vai para paused com mensagem
  - próxima execução retoma do cursor

---

## Observações/assunções
- Vou agendar a madrugada seguindo o mesmo padrão dos jobs atuais (que já rodam nesse horário).
- Billing real pode ter atraso (≈24h), então pedidos muito recentes continuarão “pendentes” até o ML liberar — mas o sistema continuará tentando automaticamente.

