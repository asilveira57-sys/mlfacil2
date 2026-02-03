
# Plano: Atualização Constante de Vendas com Sincronização Automática

## ✅ STATUS: IMPLEMENTADO

### O que foi feito:

1. **✅ Tabela `sync_scheduler`** - Criada para controlar execuções de jobs
   - Campos: job_name, status, last_run_at, next_run_at, lock_expires_at, stats
   - RLS configurado para leitura pública

2. **✅ Edge Function `orders-nightly-sync`**
   - Sincroniza últimos 30 dias para todas as contas ativas
   - Lock global com TTL de 60 minutos
   - Token refresh automático
   - Rate limiting (300ms entre requests, 2s entre contas)

3. **✅ Edge Function `orders-hourly-sync`**
   - Sincroniza últimas 48 horas (delta sync)
   - Mais leve que o nightly
   - Lock com TTL de 15 minutos

4. **✅ Cron Jobs Configurados (pg_cron)**
   - Nightly: 05:00 UTC (02:00 BRT) diariamente
   - Hourly: minuto 30 de cada hora

5. **✅ Frontend Atualizado**
   - `SyncStatusIndicator` - Mostra última sincronização
   - Auto-refresh a cada 5 minutos quando dashboard visível
   - Cache TTL reduzido (6h histórico, 3min recente)
   - Watchdog aumentado para 14 dias

### Arquivos Criados:
- `supabase/functions/orders-nightly-sync/index.ts`
- `supabase/functions/orders-hourly-sync/index.ts`
- `src/hooks/useSyncSchedulerStatus.ts`
- `src/components/sales/SyncStatusIndicator.tsx`

### Arquivos Modificados:
- `supabase/config.toml` - Adicionadas novas functions
- `src/hooks/useSalesDataCache.ts` - TTL reduzido
- `src/hooks/useOrdersSyncWatchdog.ts` - 14 dias
- `src/components/SalesDashboard.tsx` - Auto-refresh + indicador

### Teste Realizado:
O `orders-hourly-sync` foi executado com sucesso:
- 2 contas processadas
- 35 pedidos sincronizados
- 35 items sincronizados
- Duração: ~3 segundos

