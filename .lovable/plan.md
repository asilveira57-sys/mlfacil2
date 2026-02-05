
# Redeploy Massivo: Todas as Funções Backend Estão Fora do Ar

## Diagnóstico

Ao verificar o status de todas as funções backend do projeto, identifiquei um problema sistêmico grave: **a grande maioria das funções está retornando 404 (NOT_FOUND)**, ou seja, não estão ativas no servidor.

### Status atual das funções

**Ativas (respondendo):**
- `ml-sales-data` - OK (Dashboard de vendas funciona)
- `ml-sync-orders` - OK
- `ml-sync-shipments` - OK
- `ml-sync-invoices` - OK
- `cost-engine` - OK (deployado manualmente agora há pouco)
- `costs-nightly-sync` - OK (deployado manualmente agora há pouco)
- `ml-generate-labels` - OK (deployado manualmente agora há pouco)
- `ml-generate-labels-status` - OK (deployado manualmente agora há pouco)

**Fora do ar (404 NOT_FOUND) - 20+ funções:**
- `ml-sync-billing-details` -- Sincronização de taxas/billing (Módulo Custos - Passo 1)
- `ml-sync-real-costs` -- Cálculo de custos reais (Módulo Custos - Passo 2)
- `ml-sync-questions` -- Perguntas
- `ml-sync-messages` -- Mensagens pós-venda
- `ml-send-message` -- Envio de mensagens
- `ml-answer-question` -- Resposta a perguntas
- `ml-token-refresh` -- Renovação de tokens ML
- `ml-webhook-ingest` -- Ingestão de webhooks
- `ml-worker-process` -- Processamento de webhooks
- `orders-nightly-sync` -- Sincronização noturna de pedidos
- `orders-hourly-sync` -- Sincronização horária de pedidos
- `ad-timeline-recalculate` -- Linha do tempo de anúncios
- `ad-item-snapshot` -- Snapshots de anúncios
- `ads-sync` -- Sincronização de anúncios
- `ads-connector-sync` -- Conector de anúncios
- `pricing-engine` -- Motor de precificação
- `trends-api` -- API de tendências
- `post-sale-messages` -- Mensagens pós-venda
- `ml-token-refresh` -- Renovação automática de tokens
- E possivelmente outras...

### Causa raiz

Cada vez que uma única função é editada e redeployada individualmente, as demais funções podem ser desassociadas do ambiente de produção. Isso explica por que "isso vem acontecendo com frequência" -- a cada correção pontual, outros módulos param de funcionar.

### Dados no banco

Os dados propriamente ditos estão preservados:
- 5.493 pedidos no cache (mais recente: hoje 05/02)
- 18.872 registros de billing
- 5.363 registros de cost breakdown
- Sincronização noturna rodou hoje às 22:49 com sucesso

O problema é exclusivamente que as funções não estão deployadas, não há perda de dados.

## Plano de Ação

### Passo 1: Deploy em massa de TODAS as funções

Deployar todas as 67 funções backend de uma vez para garantir que nenhuma fique de fora:

```text
ad-action-execute, ad-item-snapshot, ad-timeline-recalculate,
ads-ai-consultant, ads-connector-sync, ads-rules-engine, ads-sync,
automation-processor, billing-admin, billing-checkout, billing-public-plans,
blog-generate-article, clone-anti-catalog-execute, collaborator-invite,
competitor-engine, competitor-scan, competitor-tracking,
cost-engine, costs-nightly-sync,
create-listing-capture, create-product-record,
erp-sync-orders, erp-test-connection,
facebook-conversions, facebook-get-pixel-id,
learn-listing, learn-listing-save,
mercadopago-checkout, mercadopago-webhook,
ml-answer-question, ml-auth-url, ml-enrich-neighborhoods,
ml-generate-labels, ml-generate-labels-status,
ml-get-item, ml-oauth-callback, ml-sales-data,
ml-send-message, ml-sync-billing, ml-sync-billing-details,
ml-sync-financial, ml-sync-invoices, ml-sync-messages,
ml-sync-orders, ml-sync-questions, ml-sync-real-costs,
ml-sync-shipments, ml-token-refresh,
ml-webhook-ingest, ml-worker-process,
mp-sync-price, orders-hourly-sync, orders-nightly-sync,
post-sale-messages, pricing-engine,
promotions-sync, publish-to-ml, qa-engine,
radiography-engine, trends-alerts-engine, trends-api,
trends-build-history, trends-collect-public, trends-collect-seller,
trends-nightly-public, trends-seller-metrics, trends-sync-categories,
validate-product-record
```

### Passo 2: Verificar funções críticas

Após o deploy, testar automaticamente as funções mais importantes:
- `ml-sync-billing-details` (Custos - Passo 1)
- `ml-sync-real-costs` (Custos - Passo 2)
- `orders-nightly-sync` (Sincronização noturna)
- `orders-hourly-sync` (Sincronização horária)
- `ml-token-refresh` (Renovação de tokens)
- `ml-webhook-ingest` (Webhooks)
- `ad-timeline-recalculate` (Linha do tempo)

---

## Detalhes Técnicos

- Nenhum arquivo de código será alterado
- Nenhuma tabela ou política de segurança será modificada
- Apenas operação de deploy (ativar funções que já existem no código)
- Todos os módulos voltarão a funcionar: Custos, Anúncios, Perguntas, Mensagens, Tendências, Precificação, Webhooks
