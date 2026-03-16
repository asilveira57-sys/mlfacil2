

## Diagnóstico da Causa Raiz - Hora de Corte Errada

### O que está acontecendo

O sistema mostra **"Agência: 11:22"** quando o Mercado Livre mostra **"Agência até as 16:17h"**. A causa é que o sistema está usando o campo **errado** da API.

**Campo usado hoje:** `estimated_handling_limit` = prazo para o vendedor PREPARAR o pedido (varia por pedido, baseado na hora da compra)

**Campo correto:** `estimated_schedule_limit` = prazo para ENTREGAR na agência (horário fixo do dia, que é o que o ML exibe)

Dados reais do banco confirmam o problema:

```text
Shipment 46663628578 | xd_drop_off | handling_limit: 2026-03-17T14:22:36 UTC
  → Convertido para BRT: 11:22 (é isso que aparece no card)
  → Mas isso é o prazo de AMANHÃ para este pedido específico, não o cutoff da agência HOJE
```

O `estimated_handling_limit` é um prazo POR PEDIDO (quando o pedido foi criado + tempo de preparo). Já o `estimated_schedule_limit` é o horário real de corte da agência (ex: 16:17h), que é o mesmo para todos os pedidos do dia.

### Plano de Correção

#### 1. Adicionar coluna `estimated_schedule_limit` na tabela `meli_shipments_cache`
- Migration para adicionar a coluna que armazena o prazo real de entrega na agência

#### 2. Corrigir `meli-shipping-cutoff-refresh` - buscar cutoff real
- Ao invés de extrair hora do `estimated_handling_limit` (errado), buscar diretamente da API do ML o campo `shipping_option.estimated_schedule_limit.date` de UM envio ativo `xd_drop_off`
- Já temos o token ML disponível na função, então é apenas 1 chamada adicional à API
- Extrair a hora desse campo como cutoff real da agência
- Manter o `estimated_handling_limit` como informação secundária ("prazo de despacho")

#### 3. Atualizar funções de sincronização para capturar `estimated_schedule_limit`
- `shipping-labels-sync` (cron)
- `shipping-status-sync` (cron)
- `ml-sync-shipments` (manual)
- Em cada um, extrair `shipping_option.estimated_schedule_limit.date` e persistir na coluna nova

#### 4. Atualizar o card para mostrar ambos quando houver divergência
- "Agência: 16:17 (ML)" = horário real de cutoff
- Se houver prazo de despacho diferente, mostrar como informação adicional
- Quando não houver dado confiável, mostrar "não disponível" ao invés de número errado

### Detalhes Técnicos

**Nova coluna:**
```sql
ALTER TABLE meli_shipments_cache 
  ADD COLUMN IF NOT EXISTS estimated_schedule_limit TIMESTAMPTZ;
```

**Lógica de extração do cutoff real (no refresh):**
```text
1. Pegar 1 shipment ativo xd_drop_off do cache
2. Chamar GET /shipments/{id} com token ML
3. Extrair shipping_option.estimated_schedule_limit.date
4. Converter para horário BRT → esse é o cutoff real
5. Se não disponível, marcar como "não disponível"
```

**Impacto:**
- 1 chamada extra à API ML por refresh (já fazemos 2-3 chamadas, +1 é aceitável)
- Cache de 6h continua funcionando (não aumenta consumo significativamente)
- Os cron jobs de sync passam a capturar o campo automaticamente para uso futuro

### Resultado Esperado
- Card mostra o mesmo horário que o Mercado Livre
- Quando não houver dado confiável, mostra "não disponível" ao invés de número incorreto
- Separação clara entre "cutoff da agência" e "prazo de despacho do pedido"

