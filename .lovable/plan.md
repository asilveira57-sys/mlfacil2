

# Nova Opção "Sem NF" no Menu de Etiquetas PDF

## Resumo

Adicionar uma terceira opção no dropdown PDF: **"Sem NF"** — gera apenas as etiquetas, sem páginas de nota fiscal. Para 13 vendas = 13 páginas.

## Implementação

### 1. Novo layout type

Adicionar `'meli_100x150_no_nf'` ao tipo `LabelLayout` em `useShippingLabels.ts`:

```typescript
export type LabelLayout = 'meli_100x150' | 'mlfacil_100x175_header' | 'meli_100x150_no_nf';
```

### 2. Menu dropdown — nova opção

Em `BulkActionsBar.tsx`, adicionar entre "Padrão ML" e "Com Cabeçalho":

```
Sem NF — somente etiquetas
```

### 3. Edge function — pular DANFE

Em `ml-generate-labels/index.ts`, quando `layout === 'meli_100x150_no_nf'`:
- No fluxo padrão (não-header): copiar apenas a página 0 (etiqueta) de cada envio, ignorar página 1+ (DANFE)
- Sem cabeçalho, sem NF — arquivo limpo só com etiquetas

### Arquivos afetados
- **`src/hooks/useShippingLabels.ts`** — tipo `LabelLayout` expandido
- **`src/components/shipping/BulkActionsBar.tsx`** — nova opção no dropdown PDF
- **`supabase/functions/ml-generate-labels/index.ts`** — lógica para pular DANFE quando layout = `meli_100x150_no_nf`

### Resultado
- Dropdown PDF: "Padrão ML" | "Sem NF" | "Com Cabeçalho"
- 13 vendas com "Sem NF" = 13 páginas (só etiquetas)

