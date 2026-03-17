
Diagnóstico profundo (com causa raiz confirmada)

1) Divergência dos filtros (9 vs 15) está no SQL do `get_shipping_orders` (modo `today_dispatch`)
- Hoje a regra está restritiva demais:
  - exige `estimated_handling_limit <= fim de hoje`
  - e, quando `estimated_handling_limit` é nulo, só aceita pedido criado hoje
- Resultado real no banco para o seller afetado:
  - `ready_to_print` ativos = 15
  - incluídos pela regra atual = 9
  - excluídos = 6, sendo:
    - 4 com `handling_limit` nulo e pedidos antigos (mas ainda ativos)
    - 2 com prazo em “amanhã” (que o ML ainda considera no operacional de hoje)

2) Divergência do filtro 7 dias (14 vs 15)
- O 1 faltante está fora da janela de criação de 7 dias, mas ainda está ativo para impressão.
- Ou seja: filtro por data de venda está escondendo envio operacional ativo.

3) “Hora de Corte não disponível” tem dois problemas independentes
- Problema estrutural: `meli-shipping-cutoff-refresh` tenta salvar colunas que não existem em `shipping_cutoff_cache`:
  - `agency_cutoff_source`
  - `agency_handling_limit_time`
- Isso gera erro de upsert e impede persistência correta do cache do dia.
- Problema de fonte: `estimated_schedule_limit` está vindo nulo nos envios atuais (cache/API), então a função cai em “none” e a UI mostra indisponível.

Plano definitivo de correção

Fase A — Ajustar regra de filtros para paridade operacional com ML
1. Criar migration para substituir a função `public.get_shipping_orders` com regra “ML-like”:
- `today_dispatch`:
  - incluir envios ativos (`ready_to_ship`, `handling`, `pending`)
  - aceitar:
    - `estimated_handling_limit` nulo (sem restringir “criado hoje”)
    - ou `estimated_handling_limit < fim_de_hoje + 1 dia` (janela operacional)
- Corrigir fronteira de timezone (São Paulo) dentro da função para evitar corte UTC incorreto.
2. Para filtros por período (`7d/15d/30d/custom`), manter histórico por data, mas incluir “envios ativos operacionais” para não esconder pendências reais.

Fase B — Eliminar erro silencioso que afeta sincronização
3. Corrigir `useShippingLabels`:
- remover query inválida em `meli_orders_cache.invoice_key` (coluna não existe)
- usar `meli_invoices_cache` para detectar pedidos sem NF
- isso remove erro 400 recorrente e evita sync parcial mascarado.

Fase C — Correção definitiva do card de Hora de Corte
4. Migration em `shipping_cutoff_cache`:
- adicionar:
  - `agency_cutoff_source text`
  - `agency_handling_limit_time text`
5. Endpoints de cutoff:
- `meli-shipping-cutoff-refresh`:
  - parar de tratar upsert falho como sucesso
  - tentar extração de cutoff oficial em múltiplas fontes/caminhos do payload de shipment (não só 1 shipment)
  - persistir fonte usada (`schedule_limit`, `api_schedule_limit`, `fallback_handling`)
- `meli-shipping-cutoff-get`:
  - retornar meta coerente (`partial/error`) quando cutoff oficial não vier
  - manter fallback transparente (mostrar ambos quando houver divergência, conforme regra aprovada)

Fase D — UI e transparência operacional
6. `ShippingCutoffCard`:
- quando cutoff oficial não existir, não “sumir” com contexto:
  - exibir “Agência: não disponível (ML)”
  - exibir “Despacho: HH:mm” quando houver `handling_limit_time`
- manter badge de origem para evitar nova interpretação errada.

Validação de aceite (obrigatória)
- `today_dispatch` deve retornar “Para imprimir = 15” no seller de referência.
- Filtro `7d` não pode ficar menor que o conjunto operacional ativo.
- `shipping_cutoff_cache` deve ter linha do dia corrente após refresh.
- logs não podem mais conter:
  - erro de coluna inexistente no save_cache
  - falso “status ok” com persistência falha
- conferência lado a lado com painel ML (mesmo usuário, mesmo momento) para garantir equivalência real.

Arquivos/áreas que serão alterados na implementação
- DB migration: `get_shipping_orders` + novas colunas de cutoff
- `src/hooks/useShippingLabels.ts`
- `supabase/functions/meli-shipping-cutoff-refresh/index.ts`
- `supabase/functions/meli-shipping-cutoff-get/index.ts`
- `src/components/shipping/ShippingCutoffCard.tsx`
