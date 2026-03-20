
# Plano: Auditoria e Correção da Radiografia

## Diagnóstico Completo

### Verificação 1 — listing_health_history
**Resultado: 0 registros.** Nenhuma coleta foi persistida.

### Verificação 2 — listing_health_current
**Resultado: 0 registros.** O estado atual nunca foi populado.

### Verificação 3 — radiography_collection_logs
O sync funciona (167 items processed). A collection falha 100%:
- `items_processed: 0, items_failed: 162` em todas as execuções
- Motivo: `"Visits multiget failed: 400"` em todos os lotes

### Verificação 4 — last_visit_collection_at
**Todos NULL** — 783 registros (seller 66043362) e 321 registros (seller 1411095727), todos sem coleta.

---

## Causa Raiz Identificada — 3 Problemas

### BUG 1: URL da API de visitas invertida (CRÍTICO)
A correção anterior trocou `/items/visits` por `/visits/items`, mas a documentação oficial do Mercado Livre mostra:
- **Com date_from/date_to**: `GET /items/visits?ids=...&date_from=...&date_to=...`
- **Sem datas (total histórico)**: `GET /visits/items?ids=...`

O código atual usa `/visits/items` com parâmetros `date_from` e `date_to`, o que retorna **400** porque esse endpoint não aceita esses parâmetros. Precisa voltar para `/items/visits`.

**Correção:** Reverter todas as 3 ocorrências de `/visits/items` para `/items/visits` no `radiography-collector/index.ts`.

### BUG 2: RLS policy quebrada nas tabelas de saúde
As policies de SELECT para `listing_health_current` e `listing_health_history` têm um erro na subquery:
```sql
-- ERRADO (referencia a própria tabela):
seller_id IN (SELECT listing_health_current.seller_id FROM ml_accounts WHERE ml_accounts.user_id = auth.uid())

-- CORRETO:
seller_id IN (SELECT ml_accounts.ml_user_id FROM ml_accounts WHERE ml_accounts.user_id = auth.uid())
```
Mesmo que a edge function grave os dados com service_role, o **frontend não consegue ler** porque a RLS bloqueia.

**Correção:** Migration para recriar as 2 policies com a subquery correta.

### BUG 3: Backfill marcado como "done" sem processar nada
O backfill completou `items_failed: 665, items_processed: 0` mas status `done`. Como a URL de visitas estava errada, todos os lotes falharam, mas o código marcou como concluído. Após corrigir a URL, precisamos resetar o backfill para que ele reprocesse.

**Correção:** Resetar `radiography_backfill_control` para status `pending` nos 2 sellers afetados.

---

## Correções a Implementar

### 1. Edge Function — corrigir URL da API (3 locais)
**Arquivo:** `supabase/functions/radiography-collector/index.ts`
- Linha ~326: `/visits/items?ids=` → `/items/visits?ids=`
- Linha ~334: mesma correção (retry após rate limit)
- Linha ~561: mesma correção (backfill)
- Adicionar log do response body quando status != 200 para diagnóstico futuro

### 2. Migration — corrigir RLS policies
Recriar as 4 policies (2 tabelas × SELECT):
```sql
DROP POLICY "Users can view own health current" ON listing_health_current;
CREATE POLICY "Users can view own health current" ON listing_health_current
  FOR SELECT TO authenticated
  USING (seller_id IN (SELECT ml_user_id::text FROM ml_accounts WHERE user_id = auth.uid()));

-- Mesmo para listing_health_history
```

### 3. Dados — resetar backfill_control
Usar insert tool para atualizar os 2 registros de `radiography_backfill_control` de `done` para `pending`, `progress_percent = 0`.

### 4. Melhorar logs na collection
Adicionar log do response body da API ML quando retornar erro, para facilitar diagnóstico futuro.

### 5. UI — melhorar mensagens de estado
**Arquivo:** `src/components/radiography/RadiographyDiagnosticCards.tsx` e `RadiographyItemList.tsx`
Diferenciar entre:
- "Coleta inicial em andamento" (quando há logs de collection recentes com status running)
- "Falha na coleta" (quando último log tem items_failed > 0)
- "Sem dados ainda" (quando não há logs)
- Exibir último erro quando aplicável

---

## Arquivos Modificados
- `supabase/functions/radiography-collector/index.ts` — reverter URL para `/items/visits`
- Migration SQL — corrigir RLS + resetar backfill
- `src/components/radiography/RadiographyDiagnosticCards.tsx` — mensagens de estado
- `src/components/radiography/RadiographyItemList.tsx` — mensagem de erro
