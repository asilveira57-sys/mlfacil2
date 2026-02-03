
# Plano: Atualização Constante de Vendas com Sincronização Automática

## Diagnóstico do Problema

Após análise completa do sistema, identifiquei os seguintes pontos:

1. **Dados existem no banco** - Todas as datas de janeiro têm pedidos registrados (1-18 pedidos/dia)
2. **Sincronização é manual/reativa** - O watchdog (`useOrdersSyncWatchdog`) só sincroniza quando:
   - Usuário está logado e usando o dashboard
   - Dados ficam "stale" (>15 minutos sem sync)
   - Só busca os últimos 7 dias
3. **Sem job automático** - Não existe cron/scheduler para sincronizar pedidos automaticamente
4. **Cache muito agressivo** - TTL de 24h para dados históricos pode mostrar dados desatualizados

## Arquitetura Proposta

```text
┌─────────────────────────────────────────────────────────────────────┐
│                    CAMADAS DE SINCRONIZAÇÃO                         │
├─────────────────────────────────────────────────────────────────────┤
│  1. NIGHTLY JOB (02:00 BRT)                                        │
│     └── Sincroniza últimos 30 dias para TODAS as contas ativas     │
│                                                                     │
│  2. HOURLY JOB (cada hora)                                         │
│     └── Sincroniza últimos 2 dias para contas ativas (delta sync)  │
│                                                                     │
│  3. WATCHDOG (15min quando app aberto)                             │
│     └── Mantém comportamento atual para tempo real                 │
│                                                                     │
│  4. MANUAL REFRESH                                                  │
│     └── Botão de atualizar força sync imediato                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Componentes a Implementar

### 1. Nova Edge Function: `orders-nightly-sync`

**Propósito**: Job automático que roda diariamente às 02:00 (BRT)

**Funcionalidades**:
- Buscar todas as contas ML ativas
- Para cada conta, sincronizar últimos 30 dias
- Usar locking para evitar execuções paralelas
- Rate limiting para respeitar limites da API do ML
- Logging detalhado para auditoria

**Estrutura**:
```typescript
// supabase/functions/orders-nightly-sync/index.ts
- Lock global com TTL de 60 minutos
- Iteração por todas as contas ativas
- Token refresh automático antes de cada sync
- Batch de 50 pedidos por página
- Delay de 100-500ms entre requisições API
- Checkpoint a cada 100 pedidos processados
```

### 2. Nova Edge Function: `orders-hourly-sync`

**Propósito**: Sincronização incremental a cada hora

**Funcionalidades**:
- Sincroniza apenas últimas 48 horas (delta sync)
- Mais leve que o nightly
- Garante que novos pedidos apareçam rapidamente

### 3. Tabela de Controle: `sync_scheduler`

Nova tabela para controlar execuções de jobs:

```sql
CREATE TABLE sync_scheduler (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name TEXT NOT NULL UNIQUE,
  last_run_at TIMESTAMP WITH TIME ZONE,
  next_run_at TIMESTAMP WITH TIME ZONE,
  status TEXT DEFAULT 'idle',
  lock_expires_at TIMESTAMP WITH TIME ZONE,
  stats JSONB DEFAULT '{}'::JSONB
);
```

### 4. Melhorias no Frontend

**SalesDashboard.tsx**:
- Indicador visual de última sincronização
- Auto-refresh a cada 5 minutos quando tela aberta
- Badge "Dados atualizados há X minutos"

**useOrdersSyncWatchdog.ts**:
- Aumentar período de sync de 7 para 14 dias
- Verificar último sync do nightly job
- Não duplicar sync se nightly rodou recentemente

## Fluxo de Sincronização

```text
NIGHTLY (02:00 BRT)
    │
    ├── Para cada conta ativa:
    │   ├── Verificar token (refresh se necessário)
    │   ├── Buscar pedidos dos últimos 30 dias
    │   ├── Upsert em meli_orders_cache
    │   ├── Upsert em meli_order_items_cache
    │   └── Atualizar sync_scheduler
    │
    └── Disparar billing sync após orders

HOURLY (a cada hora)
    │
    ├── Para contas com vendas recentes:
    │   └── Sincronizar últimas 48 horas
    │
    └── Mais leve, complementa o nightly

WATCHDOG (quando app aberto)
    │
    └── Se último sync > 15 min:
        └── Sincronizar últimos 7 dias
```

## Modificações em Arquivos Existentes

| Arquivo | Alteração |
|---------|-----------|
| `useOrdersSyncWatchdog.ts` | Verificar sync_scheduler antes de disparar |
| `SalesDashboard.tsx` | Mostrar timestamp da última atualização |
| `useSalesDataCache.ts` | Reduzir TTL histórico de 24h para 6h |
| `src/components/SalesDashboard.tsx` | Auto-refresh a cada 5 min |

## Novos Arquivos

| Arquivo | Propósito |
|---------|-----------|
| `supabase/functions/orders-nightly-sync/index.ts` | Job noturno |
| `supabase/functions/orders-hourly-sync/index.ts` | Job horário |
| `supabase/migrations/xxx_sync_scheduler.sql` | Tabela de controle |

## Configuração de Cron (Supabase Dashboard)

Para ativar os jobs automáticos, será necessário configurar via pg_cron ou webhooks externos:

```sql
-- Nightly sync às 02:00 BRT (05:00 UTC)
SELECT cron.schedule(
  'orders-nightly-sync',
  '0 5 * * *',
  $$SELECT net.http_post(
    url := 'https://rfckrbqwdsejicjlxqdv.supabase.co/functions/v1/orders-nightly-sync',
    headers := '{"Authorization": "Bearer SERVICE_ROLE_KEY"}'::JSONB
  )$$
);

-- Hourly sync (a cada hora)
SELECT cron.schedule(
  'orders-hourly-sync',
  '30 * * * *',
  $$SELECT net.http_post(
    url := 'https://rfckrbqwdsejicjlxqdv.supabase.co/functions/v1/orders-hourly-sync',
    headers := '{"Authorization": "Bearer SERVICE_ROLE_KEY"}'::JSONB
  )$$
);
```

## Regras de Rate Limiting (API Mercado Livre)

- **Limite**: ~18.000 requisições/hora por app
- **Estratégia**: Delay de 500ms entre requisições
- **Fallback**: Se rate limited, aguardar 60s e retry
- **Prioridade**: Contas com mais vendas primeiro

## Ordem de Implementação

1. **Fase 1 - Infraestrutura**
   - Criar tabela `sync_scheduler`
   - Criar migration para RLS

2. **Fase 2 - Edge Functions**
   - Implementar `orders-nightly-sync`
   - Implementar `orders-hourly-sync`
   - Registrar em config.toml

3. **Fase 3 - Frontend**
   - Atualizar `useOrdersSyncWatchdog`
   - Adicionar indicador de última sync
   - Implementar auto-refresh

4. **Fase 4 - Configuração**
   - Documentar setup de pg_cron
   - Testar execução manual das functions

## Benefícios

- **Dados sempre atualizados**: Nightly garante 30 dias sincronizados
- **Novos pedidos rápidos**: Hourly pega vendas recentes em até 1h
- **Menos dependência do usuário**: Sistema atualiza sozinho
- **Respeito à API**: Rate limiting controlado centralmente
- **Auditoria**: Tabela de scheduler registra todas as execuções
