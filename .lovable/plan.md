
# Correcao: Etiquetas "Sincronizando..." + Filtros Zerados + Nome do Menu

## Diagnostico Completo

### Problema 1: "Sincronizando..." eternamente e filtros zerados

A investigacao revelou que **duas funcoes de backend criticas NAO estao deployadas**:

- `ml-sync-shipments` --> retorna **404 (NOT_FOUND)**
- `ml-sync-invoices` --> retorna **404 (NOT_FOUND)**

Essas funcoes falharam no deploy durante a migracao em massa de `esm.sh` para `npm:`. O pipeline de sincronizacao funciona assim:

```text
  Fase 1: ml-sync-orders (FUNCIONA - 424 pedidos sincronizados)
       |
  Fase 2-3: Coleta shipment_ids e verifica quais faltam (FUNCIONA com fix anterior)
       |
  Fase 4: ml-sync-shipments --> 404 NOT FOUND (FALHA SILENCIOSA)
       |
  Fase 5: ml-sync-invoices --> 404 NOT FOUND (FALHA SILENCIOSA)
       |
  Resultado: Pedidos no cache, mas sem dados de envio
       --> TODOS mostram "pendente_sync" / "Sincronizando..."
       --> Filtros "Para imprimir", "Aguardando NF", "Reimprimir" = 0
```

**Evidencia no banco de dados:**
- Os 22 pedidos de hoje tem shipment_ids (ex: 46411273122, 46410865253...)
- NENHUM desses shipment_ids existe na tabela `meli_shipments_cache`
- Os unicos shipments no cache sao de 03/02 (2 dias atras), todos com status "delivered"

### Problema 2: Nome do menu "Vendas" em vez de "Etiquetas de Envio"

No sidebar (`AppSidebar.tsx` linha 73), o item do menu usa a chave de traducao `nav:sales` que em pt-BR traduz para "Vendas". Precisa mudar para `nav:shipping_labels` que ja existe e traduz para "Etiquetas de Envio".

### Problema 3: Filtro padrao deve ser "Hoje"

No hook `useShippingLabels.ts` (linha 194), o estado inicial do filtro de periodo e `'30d'`. Deve ser alterado para `'today'`.

---

## Correcoes

### Correcao 1: Deploy das funcoes de backend (CRITICA)

**Acao:** Forcar o deploy de `ml-sync-shipments` e `ml-sync-invoices`. Os arquivos ja existem no projeto e ja usam `npm:@supabase/supabase-js@2`. So precisam ser redeployados.

### Correcao 2: Nome do menu - "Vendas" para "Etiquetas de Envio"

**Arquivo:** `src/components/layout/AppSidebar.tsx` (linha 73)

Mudar `titleKey: "nav:sales"` para `titleKey: "nav:shipping_labels"`. A chave `shipping_labels` ja existe em todos os 3 idiomas:
- pt-BR: "Etiquetas de Envio"
- es: "Etiquetas de Envio"
- en: "Shipping Labels"

### Correcao 3: Filtro padrao "Hoje"

**Arquivo:** `src/hooks/useShippingLabels.ts` (linha 194)

Mudar o estado inicial de `'30d'` para `'today'`:

```typescript
const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('today');
```

---

## Escopo Minimo - Sem Impacto em Outros Modulos

- Nenhuma Edge Function sera editada (apenas redeployada)
- Nenhuma tabela ou RLS sera alterada
- Apenas 2 arquivos de frontend recebem mudancas minimas (1 linha cada)
- Dashboard de vendas nao e afetado
- Perguntas, Pos-venda, e todos os demais modulos permanecem inalterados

## Resultado Esperado

Apos o deploy:
1. Sync pipeline completa todas as fases (orders, shipments, invoices)
2. Pedidos de hoje mostram status correto (Pronta, Aguardando NF, Reimprimir)
3. Filtros exibem contagens reais
4. Menu mostra "Etiquetas de Envio" em vez de "Vendas"
5. Pagina abre com filtro "Hoje" por padrao
