
# Plano Corretivo: Performance do Modulo de Custos + Nova Aba "Sem Custo"

## Resumo das Alteracoes

1. Nova aba **"Sem Custo"** para pedidos sem billing (pending + no_charges)
2. Aba **"Pedidos"** passa a exibir apenas pedidos com billing real
3. Remover logica que marca pedidos antigos como `no_charges` automaticamente
4. Cache no frontend para troca de abas instantanea
5. Otimizacao das queries no backend (paginacao SQL)
6. Formulario manual de custo de venda e frete na aba "Sem Custo"

---

## Dados Atuais no Banco

| fee_ml_source | Total | Ultimos 30d | Ultimos 7d |
|---------------|-------|-------------|------------|
| billing       | 4.369 | 155         | 0          |
| pending       | 564   | 112         | 99         |
| no_charges    | 430   | 119         | 0          |

- **994 pedidos** estao sem billing real (pending + no_charges)
- Nos ultimos 30 dias: **231 pedidos** sem custo (112 pending + 119 no_charges)
- Os 430 marcados como `no_charges` podem estar incorretos (foram assumidos automaticamente apos 7 dias)

---

## Detalhamento Tecnico

### 1. Nova aba "Sem Custo" -- `CostOrdersNoCost.tsx` (novo)

Componente dedicado que exibe pedidos com `fee_ml_source IN ('pending', 'no_charges')`.

Funcionalidades:
- Tabela com: Data, Pedido, Comprador, Receita, Status (Pendente / Sem Taxas)
- Filtro por periodo (7d, 15d, 30d, 90d, 180d)
- Busca por pedido/comprador
- **Botao "Forcar Sincronizacao"**: chama `ml-sync-real-costs` com `action: reprocess_pending`
- **Edicao manual inline**: ao clicar em um pedido, abre dialog com campos para informar manualmente:
  - Custo de venda (comissao ML)
  - Custo de frete
  - Observacoes
  - Ao salvar, atualiza o breakdown e muda `fee_ml_source` para `manual`

### 2. Modificar aba "Pedidos" -- `CostOrders.tsx`

- Adicionar filtro `fee_ml_source = 'billing'` por padrao (ou novo `fee_ml_source = 'manual'`)
- Remover o botao "Reprocessar Pendentes" (migra para aba "Sem Custo")
- Remover o filtro de billing (billing/pending/no_charges) ja que so mostra com billing
- Manter todos os outros filtros e funcionalidades

### 3. Backend: Novo endpoint e otimizacoes -- `cost-engine/index.ts`

**Novo endpoint `orders/no-cost`:**
- Query SQL com `fee_ml_source IN ('pending', 'no_charges')` paginada
- Retorna `pending_total` e `no_charges_total` para contadores

**Novo endpoint `orders/update-manual-cost`:**
- Recebe: `order_id`, `commission_cost`, `shipping_cost`, `notes`
- Atualiza `order_cost_breakdown_cache` com os valores informados
- Muda `fee_ml_source` para `'manual'`
- Recalcula `cost_total`, `profit_total`, `margin_percent`

**Otimizacao do endpoint `orders`:**
- Adicionar filtro SQL `fee_ml_source NOT IN ('pending', 'no_charges')` por padrao
- Mover busca por comprador para o SQL (adicionar `buyer_nickname` na tabela)
- Paginacao direta no SQL em vez de carregar tudo em memoria

**Otimizacao do endpoint `catalog`:**
- Usar `DISTINCT ON` no SQL para produtos unicos
- Aplicar busca `ILIKE` no SQL
- Paginacao SQL

### 4. Remover logica de `no_charges` automatico -- `ml-sync-real-costs/index.ts`

Linhas 336-351: remover o bloco que assume `no_charges` para pedidos > 7 dias. Pedidos sem billing ficam como `pending` indefinidamente ate:
- O billing aparecer na API do ML
- O usuario informar manualmente na aba "Sem Custo"

### 5. Migracao SQL

Adicionar colunas `buyer_nickname` e `buyer_name` na tabela `order_cost_breakdown_cache` para eliminar a query secundaria de lookup na `meli_orders_cache`.

### 6. Cache no frontend -- `useCostModuleCache.ts` (novo hook)

Hook que armazena resultados em memoria com TTL de 3 minutos:
- Troca de aba com mesmos filtros: dados instantaneos do cache
- Mudanca de filtro/periodo/busca: nova requisicao
- Invalidacao automatica ao trocar de conta

### 7. Pagina principal -- `Custos.tsx`

Adicionar a nova aba no TabsList:
```text
Resumo | Catalogo | Pedidos | Sem Custo | ABC por Lucro | Diagnostico | Configuracoes
```

---

## Arquivos Modificados

| Arquivo | Acao |
|---------|------|
| `src/components/custos/CostOrdersNoCost.tsx` | Criar (novo componente) |
| `src/components/custos/CostOrders.tsx` | Modificar (remover pendentes, filtrar billing) |
| `src/components/custos/CostCatalog.tsx` | Modificar (adicionar cache) |
| `src/hooks/useCostModuleCache.ts` | Criar (novo hook de cache) |
| `src/pages/Custos.tsx` | Modificar (adicionar aba "Sem Custo") |
| `supabase/functions/cost-engine/index.ts` | Modificar (novos endpoints, otimizacoes SQL) |
| `supabase/functions/ml-sync-real-costs/index.ts` | Modificar (remover no_charges automatico) |
| Migracao SQL | Adicionar buyer_nickname e buyer_name |

## Arquivos NAO Modificados

- Dashboard de Vendas, Perguntas, Mensagens, Etiquetas, Anuncios
- Nenhuma outra Edge Function
- Nenhuma RLS alterada
- Sincronizacao noturna permanece inalterada (exceto remocao do no_charges automatico)

---

## Resultado Esperado

- Aba "Pedidos" exibe apenas pedidos com custos reais ou manuais -- carrega rapido
- Aba "Sem Custo" centraliza gestao de pedidos pendentes com acoes claras
- Troca entre abas e instantanea (cache)
- Contador real de pendentes (nao mais limitado a 50)
- Pedidos antigos sem billing nao sao mais falsamente marcados como "sem taxas"
- Usuario pode cadastrar custos manualmente quando a API nao retorna
