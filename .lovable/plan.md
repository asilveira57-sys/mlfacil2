

## Forçar Execução do Código Novo (Sem Loop de Aprovações)

### O que aconteceu

O código com a correção de Coleta (query de shipments em UTC) **já está deployado**, mas nunca executou porque:
- O cache antigo (criado pelo codigo velho as 12:52) expira somente as 18:52 UTC
- O rate limit de 15 minutos bloqueia o "Atualizar agora"
- Resultado: ciclo infinito de "deletar cache -> aprovar -> rate limit -> deletar -> aprovar..."

### Solucao (1 passo unico, sem loop)

Vou chamar a edge function `meli-shipping-cutoff-refresh` **diretamente** via curl, passando os parametros corretos. Isso:
- Ignora o cache (a funcao refresh nao checa cache, ela sempre busca dados novos)
- Ignora o rate limit (o rate limit fica no GET, nao no refresh)
- Executa o codigo novo com a query de shipments em UTC
- Salva cache novo com `colecta_enabled: true` e o horario correto

Nenhum arquivo sera editado. Apenas 1 chamada direta a edge function ja deployada.

### Detalhes Tecnicos

**Chamada direta:**
- Endpoint: `meli-shipping-cutoff-refresh`
- Payload: `company_id`, `seller_id`, `ml_user_id` do seller atual
- O codigo na linha 132-141 vai consultar `meli_shipments_cache` com UTC range e encontrar os 5 shipments com `estimated_handling_limit` de hoje (16:32, 17:52, 18:54...)
- O mais cedo (16:32 UTC = 13:32 BRT) sera usado como `colecta_cutoff_time`

**Nenhuma aprovacao de DELETE necessaria.**
