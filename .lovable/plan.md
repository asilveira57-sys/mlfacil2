

## Corrigir o Loop de Aprovações e a Coleta "Não Disponível"

### Diagnóstico

Identifiquei dois problemas claros:

1. **Loop de aprovações**: A cada mensagem, o sistema propunha deletar cache/rate-limit e pedia aprovação repetidamente. Isso consumia créditos sem progresso real. Vou parar esse ciclo agora.

2. **Coleta "não disponível"**: O cache mais recente mostra `colecta_enabled: false` e `colecta_cutoff_time: null`. Porém, existem envios reais na `meli_shipments_cache` com `estimated_handling_limit` para hoje (16:32, 17:52, 18:54...), todos do tipo `xd_drop_off`. O código que deveria capturar esses dados via query no banco **não está funcionando silenciosamente** - não há log `shipment_cutoff` no trace, o que indica que a query retornou vazio.

**Causa raiz provável**: A query usa `.gte("estimated_handling_limit", "2026-02-20T00:00:00-03:00")` com string de timezone offset. O Supabase JS client em Deno pode não estar parseando corretamente esse formato. Além disso, o endpoint `flex_subscriptions` retorna HTTP 410 (deprecated), e o `capacity_middleend/xd_drop_off` retorna capacidades semanais (monday, tuesday...), não horários de corte diários.

### Solução

#### 1. Corrigir a query de shipment cutoff (principal)

Trocar o formato de data para ISO UTC puro (sem offset `-03:00`) que o Supabase JS client parseia corretamente:

```text
// De:
const todayStart = getDateRefSP() + "T00:00:00-03:00";
const todayEnd = getDateRefSP() + "T23:59:59-03:00";

// Para: converter explicitamente para UTC
const spDate = getDateRefSP(); // "2026-02-20"
const todayStartUTC = spDate + "T03:00:00.000Z"; // 00:00 BRT = 03:00 UTC
const todayEndUTC = new Date(new Date(spDate + "T03:00:00.000Z").getTime() + 24*60*60*1000 - 1).toISOString();
```

#### 2. Adicionar log de debug para a query de shipments

Registrar o resultado da query (mesmo quando vazio) para diagnóstico futuro.

#### 3. Remover endpoint deprecado `subscriptions/v1`

O endpoint Flex `subscriptions/v1` retorna 410 Gone. Remover essa chamada e usar apenas o fallback `shipping_preferences` que já funciona (retorna HTTP 200).

#### 4. Simplificar normalizacão de Coleta

A API `capacity_middleend/xd_drop_off` retorna capacidades semanais, não cutoff times. Remover a tentativa de extrair cutoff dali e depender exclusivamente dos `estimated_handling_limit` dos shipments reais (que é a fonte mais precisa, conforme já validamos).

### Detalhes Tecnico

**Arquivos a editar:**
- `supabase/functions/meli-shipping-cutoff-refresh/index.ts` - Corrigir formato de datas UTC, remover endpoint deprecado, simplificar coleta

**Sem necessidade de:**
- Deletar cache manualmente (o sistema vai buscar dados frescos automaticamente quando o cache expirar ou via refresh)
- Criar novas tabelas ou migrações
- Alterar o frontend

