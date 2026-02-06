
# Plano Corretivo: Central de Promocoes - Modulo Estatico

## Diagnostico Completo

### 5 Bugs Criticos Encontrados

| # | Bug | Impacto | Causa Raiz |
|---|-----|---------|------------|
| 1 | `items_count` sempre 0 em todas as promocoes | KPI "Itens Participando" mostra 0, tabela mostra 0 itens por promocao | O sync nunca atualiza o campo `items_count` na tabela `promotion_snapshots` apos sincronizar os itens |
| 2 | Eventos nunca sao criados | Tarefas automaticas nao funcionam, alertas nao disparam | `system_events.account_id` e UUID mas o sync envia `"66043362"` (texto). Erro: `invalid input syntax for type uuid` |
| 3 | `validateSellerAccess` bloqueia intermitentemente | Modulo inteiro para de funcionar quando o token expira (~a cada 6h) | A funcao rejeita contas com status `'attention'` (token expirado mas renovavel). So aceita `'connected'` |
| 4 | Promocoes expiradas ficam como "Ativas" eternamente | 7 promocoes com `end_at` no passado (02/02 e 03/02) ainda mostram status `started` | O sync nao marca como `finished` promocoes que nao retornam mais da API do ML |
| 5 | Bloco `if (!workspaceId)` vazio | Se o workspace nao carregar, a pagina renderiza mas sem dados | Linha 208-209: `if (!workspaceId) {}` - nao faz nada |

### Dados no Banco (Evidencia)

```text
promotion_snapshots:
  - 18 registros (16 started, 2 pending)
  - TODOS com items_count = 0

promotion_items_snapshots:
  - 316 registros (313 candidate, 1 pending, 2 started)
  - Distribuidos em 18 promocoes (1 a 50 itens cada)
  - discount_percent = NULL em todos
  - promo_price = NULL em todos

Ultimo sync (00:29 UTC):
  - 11 promocoes da API ML (7 antigas nao retornaram)
  - 110 itens sincronizados
  - 3 eventos tentados -> TODOS falharam (UUID error)
```

### Funcionalidades Ausentes

1. **Sem filtro/busca**: Nao ha campo de busca por nome nem filtro por tipo de promocao
2. **Sem acao "Aderir"**: Itens com status `candidate` (313) nao podem ser aderidos a promocao
3. **Sem desconto calculado**: `discount_percent` nunca e preenchido pelo sync
4. **Sem limpeza de dados antigos**: Promocoes e itens obsoletos acumulam no banco

---

## Correcoes Propostas

### Correcao 1: Sync atualiza `items_count` e `discount_percent`

No `promotions-sync/index.ts`, apos sincronizar todos os itens de uma promocao, contar os itens e atualizar o snapshot:

```text
// Apos o loop de items de cada promo:
const itemCount = promo.items?.length || 0;
await supabase.from('promotion_snapshots')
  .update({ items_count: itemCount })
  .eq('workspace_id', workspaceId)
  .eq('promotion_id', promo.id);
```

Calcular `discount_percent` no upsert de itens:
```text
discount_percent = original_price && deal_price
  ? Math.round((1 - deal_price / original_price) * 100)
  : null
```

### Correcao 2: Eventos com UUID correto

O `system_events.account_id` e UUID. O valor correto e o `ml_accounts.id` (UUID), nao o `ml_user_id` (texto numerico).

Trocar em todo o sync:
```text
// DE:
account_id: accountId  // "66043362" (texto)

// PARA:
account_id: mlAccountId  // "997e5eb2-..." (UUID)
```

Isso corrige a criacao de eventos que alimentam o motor de automacao e tarefas.

### Correcao 3: `validateSellerAccess` aceita `'attention'`

Em `src/lib/accountUnification.ts` linha 354:

```text
// DE:
return account !== null && account.status === 'connected';

// PARA:
return account !== null && (account.status === 'connected' || account.status === 'attention');
```

Isso garante que o modulo funciona mesmo quando o token esta em renovacao.

### Correcao 4: Marcar promocoes expiradas como `finished`

No sync, apos processar as promocoes da API, verificar quais promocoes existentes nao foram retornadas E tem `end_at` no passado:

```text
// IDs retornados pela API
const apiPromoIds = new Set(promotions.map(p => p.id));

// Promocoes no banco que nao vieram na API e ja expiraram
for (const [promoId, existing] of existingMap) {
  if (!apiPromoIds.has(promoId) && existing.status === 'started') {
    // Verificar end_at
    // Se end_at < now, marcar como finished
  }
}
```

### Correcao 5: Fallback para `workspaceId`

Substituir o bloco vazio por um estado de loading/erro:

```text
if (!workspaceId) {
  return (
    <PageContainer title="Promocoes" subtitle="Central de Promocoes">
      <div className="p-6">
        <Skeleton className="h-64" />
      </div>
    </PageContainer>
  );
}
```

### Correcao 6: Adicionar busca e filtro por tipo

Na pagina `Promocoes.tsx`, adicionar:
- Campo de busca (Input) que filtra por `promotion_name`
- Select/dropdown para filtrar por `promotion_type` (DEAL, PRICE_MATCHING, SMART, etc.)
- Os filtros se aplicam ANTES das tabs (ativas/terminando/finalizadas)

### Correcao 7: Acao "Aderir a Promocao" (Nova Edge Function)

Criar `supabase/functions/promotions-action/index.ts` com dois endpoints:

**Endpoint `adhere`**: Adiciona itens a uma promocao via API do ML
```text
POST /seller-promotions/promotions/{promo_id}/items/{item_id}
  ?promotion_type={type}&app_version=v2
Body: { price: deal_price }
```

**Endpoint `remove`**: Remove itens de uma promocao
```text
DELETE /seller-promotions/promotions/{promo_id}/items/{item_id}
  ?promotion_type={type}&app_version=v2
```

No drawer de detalhes da promocao:
- Botao "Aderir Itens" para itens com status `candidate`
- Botao "Remover" para itens com status `started`
- Confirmacao antes de executar

---

## Detalhamento Tecnico

### Arquivos modificados

| Arquivo | Acao |
|---------|------|
| `supabase/functions/promotions-sync/index.ts` | Corrigir items_count, discount_percent, UUID dos eventos, marcar expiradas |
| `supabase/functions/promotions-action/index.ts` | CRIAR - nova funcao para aderir/remover itens |
| `supabase/config.toml` | Adicionar `[functions.promotions-action]` |
| `src/lib/accountUnification.ts` | Aceitar status 'attention' no validateSellerAccess |
| `src/pages/Promocoes.tsx` | Adicionar busca, filtro, fallback workspaceId, botoes de acao no drawer |

### Arquivos NAO modificados

- Nenhuma migracao SQL (tabelas ja existem com as colunas corretas)
- Nenhuma RLS alterada
- Hooks `usePromotions.ts` e `usePromotionItems.ts` permanecem inalterados
- Modulos de Custos, Tendencias, ADS inalterados

### Detalhe da Edge Function `promotions-action`

```text
POST /promotions-action
Body: {
  action: "adhere" | "remove",
  workspace_id: string,
  seller_id: string,      // ml_user_id
  promotion_id: string,
  promotion_type: string,
  items: [
    { item_id: string, price?: number }
  ]
}

Response: {
  ok: true,
  data: {
    success_count: number,
    failed_count: number,
    results: [
      { item_id, success, error? }
    ]
  }
}
```

### Detalhe do Drawer atualizado

O drawer de detalhes da promocao passara a ter:

1. **Secao de Resumo** (como hoje): Datas, contadores
2. **Secao de Acoes**:
   - "Aderir Todos os Candidatos" (se houver itens `candidate`)
   - "Criar Tarefa" (como hoje)
3. **Tabela de Itens** com colunas:
   - Item ID (link para o anuncio)
   - Status (badge colorido)
   - Preco Original / Preco Promo
   - Desconto (%)
   - Acao (Aderir / Remover)
4. **Paginacao**: Mostrar todos os itens com scroll, nao limitar a 10

### Detalhe da Busca e Filtros

Adicionar acima das tabs:
```text
[Campo de Busca: "Buscar promocao..."]  [Tipo: Todos v]
```

O filtro por tipo usa os valores unicos de `promotion_type` das promocoes carregadas:
- Todos
- DEAL
- PRICE_MATCHING
- SMART
- LIGHTNING_DEALS
- (outros dinamicamente)

---

## Resultado Esperado

- KPI "Itens Participando" mostra contagem real (316 itens, nao 0)
- Eventos sao criados com sucesso no `system_events` (UUID correto)
- Modulo funciona 24/7 (nao quebra quando token esta em renovacao)
- Promocoes expiradas sao automaticamente marcadas como "Finalizadas"
- Busca e filtro permitem encontrar promocoes rapidamente
- Botao "Aderir" permite adicionar itens candidatos a promocao via API do ML
- Desconto percentual e exibido na tabela de itens
