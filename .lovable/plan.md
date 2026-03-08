

## Diagnóstico

O problema está claro após análise do código:

| Ação | Função chamada | O que faz |
|------|---------------|-----------|
| **Botão individual** (direita) ✅ | `ml-sync-real-costs` → `resync_single` | Chama a **API do Mercado Livre**, busca billing real, salva no cache, recalcula |
| **"Atualizar selecionados"** (esquerda) ❌ | `cost-engine/orders/bulk-reimport` → `calculateSingleOrder` | Apenas **recalcula a partir do cache existente** — se o cache está vazio, o resultado fica zerado |

O botão em lote nunca busca dados novos. Ele recalcula com o que já existe. Se não existe billing no cache, comissão e frete ficam R$0,00.

---

## Plano de Correção

### Substituir a lógica do batch "resync" para usar `ml-sync-real-costs`

**Arquivo:** `supabase/functions/cost-engine/index.ts`

Na função `processChunkAndContinue`, quando `job_type === 'resync'`, em vez de chamar `calculateSingleOrder`, fazer uma chamada interna para `ml-sync-real-costs` com `action: 'resync_single'` para cada pedido do chunk.

```text
processChunkAndContinue()
  ├─ job_type === 'reimport' → calculateSingleOrder() (mantém como está)
  └─ job_type === 'resync'  → chama ml-sync-real-costs:resync_single via fetch interno
                              → depois chama calculateSingleOrder() para consolidar impostos/embalagem
```

Mudanças específicas:

1. **`processChunkAndContinue`** (linha ~1984): Adicionar condicional — se `job.job_type === 'resync'`, para cada order_id do chunk:
   - Chamar `ml-sync-real-costs` via `supabase.functions.invoke` com service role key (chamada interna server-to-server)
   - Aguardar resposta
   - Depois chamar `calculateSingleOrder` para consolidar impostos, embalagem e custo de mercadoria
   - Manter rate limit de 600ms entre pedidos

2. **Delay entre chamadas**: Aumentar para 800ms no modo resync (são 2 chamadas de API por pedido — billing + order detail).

3. **Logging**: Adicionar log no job com `last_error` indicando se a API retornou erro para algum pedido específico.

### Resultado

Após a correção, o fluxo será:

```text
Usuário seleciona 10 pedidos → clica "Atualizar selecionados"
  → Job criado com job_type='resync'
  → Para cada pedido:
      1. ml-sync-real-costs busca billing real na API do ML
      2. calculateSingleOrder consolida com impostos/embalagem/custo produto
  → Tabela atualiza com comissão e frete reais
```

O botão "Excluir e reimportar" continua funcionando como antes (deleta cache + recalcula).

