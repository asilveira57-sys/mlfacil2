

# Plano: Corrigir Radiografia — Limite, Visitas e Filtros

## Problemas Identificados

### 1. Limite de 50 anúncios
O `handleListItems` na edge function `radiography-engine` tem `limit = 50` como padrão (linha 442). O frontend não envia paginação nem limit diferente. Se o seller tiver mais de 50 itens ativos, os excedentes não aparecem.

### 2. Visitas zeradas
O `radiography-engine` **não coleta visitas** — ele apenas **lê** da tabela `seller_item_visits`. Quem popula essa tabela é o `trends-collect-seller`, que busca visitas apenas de itens presentes na `meli_order_items_cache` (itens que já tiveram vendas). Itens que **nunca venderam** ficam sem visitas registradas.

Além disso, o snapshot do radiography busca visitas de 7 dias na `seller_item_visits`, mas se o `trends-collect-seller` não rodou para esse seller, tudo ficará zerado.

### 3. Texto dos filtros escuro em fundo escuro
O `SelectContent` usa `bg-slate-800 border-slate-700`, mas o `SelectItem` herda `text-popover-foreground` do tema global (que pode ser escuro). Precisa forçar `text-slate-200` nos items do dropdown.

---

## Correções Propostas

### 1. Remover limite de 50 — carregar todos os itens
**Arquivo:** `supabase/functions/radiography-engine/index.ts`
- Na função `handleListItems`, aumentar o limit padrão para 1000
- Nota: Supabase tem limite de 1000 por query, que é suficiente para a maioria dos sellers

### 2. Coletar visitas de TODOS os itens ativos no snapshot
**Arquivo:** `supabase/functions/radiography-engine/index.ts`
- Na função `handleSnapshot`, após obter os listings ativos, buscar visitas diretamente da API do Mercado Livre para cada item (usando o token do seller)
- Gravar na `seller_item_visits` para histórico, igual ao `trends-collect-seller`
- Isso garante que itens sem vendas também tenham dados de visitas
- Usar rate limit de 800ms entre chamadas para respeitar a API

### 3. Corrigir texto dos filtros
**Arquivo:** `src/components/radiography/RadiographyItemList.tsx`
- Adicionar `text-slate-200` nas classes do `SelectContent` e `SelectItem` para garantir contraste

---

## Arquivos Modificados
- `supabase/functions/radiography-engine/index.ts` — limit 1000 + coleta de visitas no snapshot
- `src/components/radiography/RadiographyItemList.tsx` — texto branco nos filtros dropdown

