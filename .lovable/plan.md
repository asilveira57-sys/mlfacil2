
# Correcao Definitiva: Migrar TODAS as Edge Functions de esm.sh para npm:

## Problema Raiz

Cada vez que uma funcao e editada e redeployada, o sistema redeploya TODAS as funcoes do projeto. As 62 funcoes que ainda usam `import from "https://esm.sh/@supabase/supabase-js@2"` ficam vulneraveis a falhas de timeout do CDN esm.sh durante o deploy. Isso explica o efeito "consertar uma coisa e quebrar outra": ao corrigir as funcoes de Perguntas, o redeploy fez a funcao `ml-sales-data` (usada pelo Dashboard) falhar no bundling.

Apenas 4 funcoes ja foram migradas para `npm:` (qa-engine, ml-token-refresh, ml-answer-question, ml-sync-questions). As outras 62 precisam ser atualizadas.

## Solucao

Migrar o import `https://esm.sh/@supabase/supabase-js@2` para `npm:@supabase/supabase-js@2` em TODAS as 62 funcoes restantes. A mudanca e de uma unica linha por arquivo, sem alteracao de logica.

Exemplo da mudanca:
```
// ANTES:
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// DEPOIS:
import { createClient } from "npm:@supabase/supabase-js@2";
```

Casos especiais que precisam de atencao:
- `pricing-engine` e `trends-sync-categories`: usam versao pinada `@2.49.1` -- manter a versao no npm: specifier
- `collaborator-invite`, `billing-admin`, etc.: usam `std@0.190.0` -- manter, so mudar o import do supabase
- `radiography-engine`: usa path complexo `esm.sh/@supabase/supabase-js@2.39.7/dist/module/index.js?target=deno&no-check` -- simplificar para `npm:@supabase/supabase-js@2`
- `ml-worker-process` e `post-sale-messages`: importam `SupabaseClient` type -- manter no `npm:` import
- `ml-generate-labels`: tambem importa `pdf-lib` e `zipjs` do esm.sh -- migrar apenas o supabase, manter os outros imports esm.sh (sao pacotes que nao tem npm: equivalente direto no Deno)

## Lista Completa dos 62 Arquivos a Modificar

1. ad-action-execute
2. ad-item-snapshot
3. ad-timeline-recalculate
4. ads-ai-consultant
5. ads-connector-sync
6. ads-rules-engine
7. ads-sync
8. automation-processor
9. billing-admin
10. billing-checkout
11. billing-public-plans
12. blog-generate-article
13. clone-anti-catalog-execute
14. collaborator-invite
15. competitor-engine
16. competitor-scan
17. competitor-tracking
18. cost-engine
19. costs-nightly-sync
20. create-listing-capture
21. create-product-record
22. erp-sync-orders
23. erp-test-connection
24. facebook-conversions (nao usa supabase, mas verificar outros esm.sh)
25. facebook-get-pixel-id
26. learn-listing
27. learn-listing-save
28. mercadopago-checkout
29. mercadopago-webhook
30. ml-auth-url
31. ml-enrich-neighborhoods
32. ml-generate-labels
33. ml-generate-labels-status
34. ml-get-item
35. ml-oauth-callback
36. ml-sales-data
37. ml-send-message
38. ml-sync-billing
39. ml-sync-billing-details
40. ml-sync-financial
41. ml-sync-invoices
42. ml-sync-messages
43. ml-sync-orders
44. ml-sync-real-costs
45. ml-sync-shipments
46. ml-webhook-ingest
47. ml-worker-process
48. mp-sync-price
49. orders-hourly-sync
50. orders-nightly-sync
51. post-sale-messages
52. pricing-engine
53. promotions-sync
54. publish-to-ml
55. radiography-engine
56. trends-alerts-engine
57. trends-api
58. trends-build-history
59. trends-collect-public
60. trends-collect-seller
61. trends-nightly-public
62. trends-seller-metrics
63. trends-sync-categories
64. validate-product-record

## Resultado Esperado

- Dashboard volta a funcionar imediatamente apos o deploy
- Nenhuma funcao futura quebrara por timeout do CDN esm.sh
- Editar qualquer funcao no futuro nao causara efeito colateral em outras

## Detalhes Tecnicos

A mudanca de `esm.sh` para `npm:` e segura porque:
- O Deno suporta nativamente `npm:` specifiers desde v1.28
- O bundler do Supabase Edge Functions resolve `npm:` localmente, sem depender de CDN externo
- A API do `@supabase/supabase-js` e identica independente do metodo de importacao
- As 4 funcoes ja migradas (qa-engine, ml-token-refresh, etc.) confirmam que o padrao funciona
