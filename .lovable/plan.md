

# Plano de Correção: Modal de Clonagem Automática

## Problemas Identificados

### 1. Campo de URL muito estreito (Imagem 1)
O campo de entrada para a URL está com largura insuficiente para exibir links longos do Mercado Livre, causando overflow visual.

### 2. Falta de barra de rolagem (Imagem 2)
Embora o componente `ScrollArea` esteja implementado, a rolagem não está funcionando corretamente, impedindo o acesso aos campos abaixo.

### 3. Descrição vazia (Imagem 3)
A resposta da API veio do cache (`source: "cache"`), e o cache não inclui a descrição do anúncio. Quando os dados vêm do cache, os campos de descrição e dimensões ficam vazios.

### 4. Botão "Continuar" desabilitado (Imagem 4 e 5)
O botão está condicionado a `!hasPictures`, mas os dados do cache não incluem o array de fotos (`pictures`), fazendo com que a validação `hasPictures` retorne `false`.

---

## Soluções Propostas

### Correção 1: Largura do campo de URL
Aumentar a largura mínima do container do input e remover a limitação de espaço que corta o texto.

**Mudanças:**
- Remover `flex-1` que limita a largura
- Usar `w-full min-w-0` para garantir responsividade
- Ajustar padding e overflow do input

### Correção 2: Barra de rolagem obrigatória
Garantir que o `ScrollArea` funcione corretamente com altura máxima fixa e overflow visível.

**Mudanças:**
- Adicionar `overflow-hidden` no `DialogContent`
- Garantir `flex-1 min-h-0` no ScrollArea para permitir o cálculo correto de altura
- Forçar a altura máxima do conteúdo rolável

### Correção 3: Descrição do cache
Modificar a edge function `ad-item-snapshot` para:
1. Quando usar cache, também buscar a descrição via API pública
2. Incluir a descrição no retorno do cache

**Mudanças no backend:**
```text
- Após encontrar item no cache, chamar fetchDescriptionPublic()
- Adicionar campo description no retorno do cache
```

### Correção 4: Fotos do cache + validação do botão
O cache inclui apenas `thumbnail`, não o array `pictures`. A lógica precisa considerar o thumbnail como foto válida quando `pictures` estiver ausente.

**Mudanças:**
- Quando `pictures` estiver vazio mas `thumbnail` existir, criar um array com a foto do thumbnail
- Ajustar a validação `hasPictures` para considerar esse caso

### Correção 5: Dimensões do item fonte
O cache não inclui os atributos de dimensões. Precisamos:
1. Também buscar atributos do item via API quando vem do cache
2. Ou armazenar os atributos no cache para uso futuro

**Solução prática:**
- Quando vem do cache, fazer uma chamada pública adicional para `/items/{id}` para obter atributos (já que o cache está incompleto)
- Dessa forma, teremos descrição, fotos e dimensões

---

## Resumo das Alterações

| Arquivo | Tipo | Mudança |
|---------|------|---------|
| `UnifiedCloneModal.tsx` | UI | Ajustar largura do input de URL |
| `UnifiedCloneModal.tsx` | UI | Corrigir ScrollArea para funcionar sempre |
| `UnifiedCloneModal.tsx` | UI | Ajustar lógica de `hasPictures` para considerar thumbnail |
| `ad-item-snapshot/index.ts` | Backend | Quando usar cache, buscar dados complementares via API pública (descrição, fotos, atributos) |

---

## Detalhes Técnicos

### UnifiedCloneModal.tsx - Mudanças de UI

```text
Linha 557-575: Ajustar layout do input
- Trocar estrutura flex para empilhar melhor em telas menores
- Aumentar largura mínima do campo

Linha 539: Garantir DialogContent com overflow correto
- Manter max-h-[90vh] e flex flex-col
- Adicionar overflow-hidden explícito

Linha 550: Garantir ScrollArea funcional
- Usar flex-1 min-h-0 para cálculo correto de altura
```

### ad-item-snapshot/index.ts - Mudanças no Cache

Quando o dado vem do cache (linhas 346-367):
1. Chamar `fetchItemPublic()` para obter dados completos
2. Chamar `fetchDescriptionPublic()` para obter descrição
3. Se falhar, usar dados do cache como fallback

Essa abordagem garante que, mesmo quando o cache é utilizado para identificar rapidamente o item, os dados retornados sejam completos e incluam descrição, fotos e atributos de dimensões.

