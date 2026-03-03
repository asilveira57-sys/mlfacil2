

# Diagnóstico e Plano: Importação Histórica de 1 Ano pós-Pagamento

## Diagnóstico

A conta Adeconex SP (`1411095727`) só possui ~50 dias de dados porque:

1. **Bootstrap**: No OAuth, o sistema importa apenas 30 dias (`bootstrap_30d` em `ml-oauth-callback`)
2. **Nightly sync**: O `orders-nightly-sync` sincroniza apenas os últimos 30 dias (`SYNC_DAYS = 30`)
3. **Pós-pagamento**: O webhook `mercadopago-webhook` cria/atualiza a subscription mas **não dispara nenhuma importação histórica de 1 ano**
4. **Botões manuais**: Os botões "Últimos 12 Meses" e "Histórico Completo" na aba Sincronização sincronizam apenas **billing details** (taxas/comissões), não os **pedidos** em si

Ou seja: **não existe nenhum mecanismo para importar pedidos de 1 ano**. Billing sem pedidos é inútil — o dashboard precisa dos pedidos na `meli_orders_cache` para calcular custos.

## Plano de Implementação

### 1. Nova Edge Function: `orders-historical-import`
Importação de pedidos de até 365 dias, com:
- Processamento em lotes de 50 pedidos por chamada
- Auto-encadeamento (chama a si mesma via `/continue`) para sobreviver ao timeout de 60s
- Rate limit: delay de 500ms entre requests, 2s entre páginas
- Estado persistido em `sync_jobs` (job_type: `historical_365d`)
- Parâmetros: `seller_id`, `days_back` (default 365)
- Reutiliza a mesma lógica de upsert do `orders-nightly-sync` (orders + items + item details)

### 2. Trigger pós-pagamento no Webhook
No `mercadopago-webhook`, após aprovação do pagamento (linha ~158):
- Criar um job `historical_365d` na tabela `sync_jobs`
- **Não executar imediatamente** — marcar `scheduled_for` como próxima janela noturna (02:00 BRT)
- Para execução imediata (admin/teste), permitir invocação manual

### 3. Nightly Sync expandido
Alterar `orders-nightly-sync` para:
- Antes de processar o ciclo normal de 30 dias, verificar se existem jobs `historical_365d` pendentes na `sync_jobs`
- Se existir, processar o historical import primeiro (com limite de tempo de ~4 minutos por conta)
- Se não completar, auto-encadear para a próxima execução

### 4. Botão manual na UI (CostSettings)
Adicionar na aba Sincronização:
- Botão "Importar Pedidos (1 ano)" que invoca `orders-historical-import` diretamente
- Progress bar mostrando % de pedidos importados (via polling de `sync_jobs`)
- Este botão será usado agora para forçar a importação da Adeconex SP

### 5. Billing após pedidos
Após conclusão do import de pedidos, o sistema deve automaticamente disparar:
- `ml-sync-billing-details` (scope: history)
- `ml-sync-real-costs` (action: backfill_missing)

Isso garante que custos e taxas sejam preenchidos para todos os pedidos importados.

### Arquivos a criar/editar

| Arquivo | Ação |
|---------|------|
| `supabase/functions/orders-historical-import/index.ts` | **Criar** — nova edge function |
| `supabase/functions/mercadopago-webhook/index.ts` | **Editar** — trigger pós-pagamento |
| `supabase/functions/orders-nightly-sync/index.ts` | **Editar** — processar jobs pendentes |
| `src/components/custos/CostSettings.tsx` | **Editar** — botão + progress de importação |

### Fluxo resumido

```text
Seller conecta conta
  └─> Bootstrap 30d (já existe)

Seller paga plano
  └─> Webhook cria job historical_365d (scheduled_for: 02:00 BRT)
  └─> Nightly sync processa o job durante a madrugada
      └─> Importa pedidos de 365 dias em lotes
      └─> Ao concluir, dispara billing + real costs sync

Admin precisa forçar agora
  └─> Botão "Importar Pedidos (1 ano)" na aba Sincronização
      └─> Executa orders-historical-import imediatamente
```

