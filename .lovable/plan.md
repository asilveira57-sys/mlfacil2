

# Plano: Copiar MLB + Correção de Promoção

## Diagnóstico

### Problema 1 — Promoção não detectada
**Causa raiz confirmada no banco:** O item MLB5284532414 está em 3 promoções ativas com `item_status = 'started'`. Porém o código na linha 1863 do collector só aceita `item_status === 'candidate' || item_status === 'active'` — ignora `'started'`.

Dados reais:
- P-MLB17131006: promo `started`, item `started` — **ignorado pelo código**
- P-MLB16977014: promo `started`, item `started` — **ignorado**
- P-MLB17243018: promo `pending`, item `candidate` — **ignorado** (promo não é started/active)

### Problema 2 — Sem atalho de copiar MLB
Nenhum botão de copiar existe ao lado dos IDs MLB no sistema.

---

## Correções

### 1. Fix promoção — incluir `started` como status ativo de item

**Arquivo:** `supabase/functions/radiography-collector/index.ts` (linha 1863)

Alterar:
```typescript
if (r.item_status === 'candidate' || r.item_status === 'active') promoActiveSet.add(r.item_id);
```
Para:
```typescript
if (['candidate', 'active', 'started'].includes(r.item_status)) promoActiveSet.add(r.item_id);
```

E na recomendação, quando `is_promotion_active = true`, gerar sugestão contextual:
- "Promoção ativa — verifique se há mais promoções disponíveis para este anúncio"

### 2. Componente `CopyMlbId` — botão copiar ao lado de todo MLB

Criar componente reutilizável `src/components/ui/CopyMlbId.tsx`:
- Mostra o ID MLB em monospace
- Ícone de copiar ao lado (Copy icon)
- Ao clicar: copia para clipboard + feedback visual (ícone muda para Check por 2s)
- Tamanho compacto para caber em listas e painéis

### 3. Aplicar `CopyMlbId` no módulo Radiografia

**`RadiographyItemList.tsx`:** Na linha do item, substituir exibição do item_id pelo componente com botão copiar.

**`RadiographyDetailPanel.tsx`:** No header do detalhe (linha 357), substituir `<span className="font-mono">{item.item_id}</span>` pelo componente.

### 4. Deploy + reprocessar

- Deploy do collector corrigido
- Executar `analyze` para atualizar `is_promotion_active` de todos os itens

---

## Arquivos modificados
1. `supabase/functions/radiography-collector/index.ts` — fix `started` status + recomendação contextual
2. `src/components/ui/CopyMlbId.tsx` — novo componente reutilizável
3. `src/components/radiography/RadiographyItemList.tsx` — usar CopyMlbId
4. `src/components/radiography/RadiographyDetailPanel.tsx` — usar CopyMlbId + ajustar recomendação de promo

