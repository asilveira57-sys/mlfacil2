
## Diagnóstico

Dois problemas confirmados nos logs:

### 1. Erro ao salvar chamado
```
invalid input value for enum support_ticket_category: "financeiro"
```
O enum no banco usa valores em inglês: `bug`, `question`, `suggestion`, `financial`, `integration`, `other`. Mas o frontend envia valores em português: `erro`, `duvida`, `sugestao`, `financeiro`, `integracao`, `outro`. A conversão no `handleSubmit` (linha ~108) faz um cast incorreto — mapeia `'erro'` para `'bug'` mas os demais não são convertidos.

### 2. Screenshot não funciona
```
Failed to fetch dynamically imported module: html2canvas.js
```
O `html2canvas` está sendo importado dinamicamente (`import('html2canvas')`) e o módulo não está sendo resolvido pelo Vite no ambiente de preview. Solução: trocar para import estático no topo do arquivo.

---

## Plano de Correção

### Arquivo: `src/components/support/CreateTicketDialog.tsx`

**Mapear categorias corretamente para o enum do banco:**

Adicionar um mapa de conversão PT → EN:
```typescript
const CATEGORY_TO_DB: Record<TicketCategory, string> = {
  'erro': 'bug',
  'duvida': 'question',
  'sugestao': 'suggestion',
  'financeiro': 'financial',
  'integracao': 'integration',
  'outro': 'other',
};
```

No `handleSubmit`, usar `CATEGORY_TO_DB[category]` em vez do cast manual atual na linha do insert.

### Arquivo: `src/components/support/FloatingSupportButton.tsx`

**Trocar import dinâmico de `html2canvas` por import estático:**

No topo do arquivo, adicionar:
```typescript
import html2canvas from 'html2canvas';
```

E remover o `import('html2canvas')` dinâmico dentro da função `captureScreenshot`.
