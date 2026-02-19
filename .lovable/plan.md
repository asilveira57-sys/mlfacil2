

# Corrigir "0 pedidos" na Receita via ADS

## Problema

A API do Mercado Livre so retorna os campos de metricas que voce solicita explicitamente no parametro `metrics` da URL. No codigo atual, as duas funcoes que buscam metricas (`fetchCampaigns` e `fetchItemMetricsBatch`) solicitam:

```
clicks,prints,cost,cpc,acos,roas,total_amount
```

O campo `conversions` **nao esta na lista**. Por isso, `m.conversions` sempre retorna `undefined`, que vira `0`.

A receita (`total_amount`) aparece corretamente porque esta na lista de metricas solicitadas.

## Correcao

### Arquivo: `supabase/functions/ads-period-metrics/index.ts`

Duas alteracoes pontuais:

1. **Linha 512** (`fetchCampaigns`): Adicionar `conversions` a string de metricas
   - De: `clicks,prints,cost,cpc,acos,roas,total_amount`
   - Para: `clicks,prints,cost,cpc,acos,roas,total_amount,conversions`

2. **Linha 572** (`fetchItemMetricsBatch`): Adicionar `conversions` a string de metricas
   - De: `metrics=clicks,prints,cost,cpc,acos,roas,total_amount`
   - Para: `metrics=clicks,prints,cost,cpc,acos,roas,total_amount,conversions`

### Impacto

- Os dados cacheados antigos (sem conversoes) serao automaticamente corrigidos conforme o cache expira ou o usuario consulta novos periodos
- Para forcar a atualizacao imediata, pode-se limpar o cache do periodo no banco (opcional)
- Nenhuma mudanca no frontend necessaria: os cards ja calculam tudo com base no `total_conversions` que vem da edge function

### Arquivos afetados

- `supabase/functions/ads-period-metrics/index.ts` (2 linhas alteradas + deploy)

