

# Sincronizacao de Status de Campanhas com Mercado Livre + Filtro Ativa/Pausada

## Problema

1. **Status desatualizado**: A ultima sincronizacao foi em 18/02. Desde entao, campanhas foram pausadas no ML mas nosso banco ainda mostra como `active`. De 31 campanhas, o ML mostra 7 ativas e 25 pausadas, mas o sistema mostra 29 ativas e 2 pausadas.

2. **Sem filtro de status**: A tabela de campanhas nao tem filtro para mostrar apenas Ativas ou Pausadas.

3. **Causa raiz**: O `ads-sync` (unico responsavel por atualizar status no banco) so roda quando o usuario clica "Sinc" manualmente. O `ads-period-metrics` busca metricas mas NAO atualiza o campo `status` das campanhas no banco. O `ads-nightly-cache` busca dados da API com `status=active,paused` mas salva apenas em `ads_period_cache`, nao em `ads_campaigns`.

## Solucao

### Parte 1: Nightly Cache atualiza status das campanhas

Modificar `supabase/functions/ads-nightly-cache/index.ts` para, alem de cachear metricas, **atualizar o status** das campanhas na tabela `ads_campaigns` com base na resposta da API do ML.

Mudanca:
- Apos receber a lista de campanhas da API, fazer `upsert` no `ads_campaigns` com o status atualizado
- Isso garante que toda madrugada os status ficam sincronizados automaticamente

### Parte 2: ads-period-metrics tambem atualiza status

Modificar `supabase/functions/ads-period-metrics/index.ts` para, ao buscar campanhas da API do ML, tambem fazer update do status no `ads_campaigns`. Assim, mesmo durante o dia, ao trocar de periodo no frontend, os status sao atualizados.

### Parte 3: Filtro de Status na tabela de campanhas

Modificar `src/components/ads/AdsCampaignsTable.tsx` para adicionar um filtro de status (Todas / Ativas / Pausadas / Encerradas) acima da tabela, ao lado do campo de busca.

### Parte 4: Contagem correta no header

Atualizar o header em `src/pages/Publicidade.tsx` para mostrar a contagem de ativas E pausadas (ja existe `activeCampaigns` e `pausedCampaigns`, so falta exibir pausadas).

---

## Detalhamento Tecnico

### Arquivo: `supabase/functions/ads-nightly-cache/index.ts`

Apos buscar campanhas da API (linha ~195), adicionar um loop que faz upsert no `ads_campaigns`:

```text
Para cada campanha retornada pela API:
  - Extrair id, name, status, budget
  - Upsert em ads_campaigns com onConflict: 'seller_id,ml_campaign_id'
  - Atualizar: status, name, daily_budget, synced_at
```

### Arquivo: `supabase/functions/ads-period-metrics/index.ts`

Na funcao que busca campanhas da ML API, apos receber a resposta, fazer batch update do status no `ads_campaigns`.

### Arquivo: `src/components/ads/AdsCampaignsTable.tsx`

- Adicionar estado `statusFilter: 'all' | 'active' | 'paused' | 'ended'`
- Adicionar botoes de filtro (chips) ao lado da barra de busca: "Todas", "Ativas", "Pausadas", "Encerradas"
- Filtrar `campaigns` pelo status antes de aplicar busca textual e ordenacao

### Arquivo: `src/pages/Publicidade.tsx`

- No `CardDescription`, mostrar tambem pausadas: `{campaigns.length} campanhas encontradas - {activeCampaigns} ativas - {pausedCampaigns} pausadas`

## Resultado Esperado

- Status das campanhas atualizados automaticamente toda madrugada e a cada consulta de metricas
- Filtro visual de Ativa/Pausada na tabela de campanhas
- Contagens corretas no header
