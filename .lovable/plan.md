

## Diagnóstico: Por que a sincronização de etiquetas demora tanto

### Causa Raiz
A sincronização de etiquetas é **100% client-driven** — quando o seller abre a página, o hook `useShippingLabels` executa um pipeline pesado de 6 fases:
1. Importa pedidos via `ml-sync-orders` (Edge Function)
2. Busca todos os shipment_ids no banco
3. Verifica quais shipments estão faltando
4. Sincroniza shipments faltantes via `ml-sync-shipments` (chamadas individuais à API do ML)
5. Re-sincroniza shipments com status ativo (mais chamadas à API)
6. Sincroniza notas fiscais via `ml-sync-invoices`

O gargalo principal são as **fases 4 e 5**: cada shipment faz uma chamada individual à API do Mercado Livre com delay de 200ms entre elas. Com 100+ shipments, isso pode levar minutos.

Já existem crons para **pedidos** (`orders-hourly-sync` a cada hora) e **status de envio** (`shipping-status-sync` a cada 10 min), mas **nenhum cron sincroniza shipments novos** (dados de logística, receiver_name, label_available, etc.). O `shipping-status-sync` só atualiza shipments já existentes no cache.

### Plano de Solução

**1. Criar Edge Function `shipping-labels-sync`** (servidor)
- Nova função que roda o pipeline completo de etiquetas no servidor (sem depender do browser):
  - Para cada conta ativa, buscar pedidos recentes (últimos 7 dias) sem shipment no cache
  - Buscar dados de shipment na API do ML em lotes
  - Sincronizar notas fiscais em lotes
  - Atualizar shipments com status ativo
- Usa `SUPABASE_SERVICE_ROLE_KEY` e refresh de token automático
- Registra progresso em `sync_scheduler` com job_name `shipping-labels-sync`

**2. Configurar cron jobs via `pg_cron`**
- **07:00 BRT (10:00 UTC)**: Sync completo matinal — `shipping-labels-sync` processa todos os pedidos dos últimos 7 dias
- **A cada 30 minutos**: Sync incremental — `shipping-labels-sync` processa apenas pedidos das últimas 6 horas + atualiza status ativos

**3. Otimizar o frontend (`useShippingLabels`)**
- Remover o sync automático pesado no `useEffect` de auto-sync
- Quando os dados do cron estão frescos (< 30 min), mostrar dados do cache direto sem sync
- O botão "Atualizar agora" continua disponível para sync manual sob demanda
- Adicionar polling silencioso com `refetchInterval` de 60s para pegar dados novos do banco sem chamar APIs externas

### Resultado Esperado
- Seller abre a página às 07:30 → dados já prontos do sync das 07:00, carregamento instantâneo
- A cada 30 min os dados são atualizados automaticamente em background
- Sem refresh na tela, sem indicador de loading (polling silencioso no banco)
- Botão manual continua disponível como fallback

