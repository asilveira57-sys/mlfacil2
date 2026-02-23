
# Adesao em Massa nos Resultados de Pesquisa por Produto

## O que muda

Adicionar checkboxes de selecao e um botao de adesao em massa na secao "Resultados por Produto" da pesquisa, permitindo aderir dezenas/centenas de itens de uma vez sem clicar um por um.

## Como vai funcionar

1. Cada linha de campanha com status "candidato" (botao "Participar") ganha um checkbox ao lado
2. Um header com "Selecionar todos candidatos" e contagem de selecionados aparece acima dos resultados
3. Um botao "Aderir X Selecionados" aparece quando ha itens marcados
4. Ao clicar, abre o mesmo dialog de confirmacao existente com o resumo da acao

## Alteracoes Tecnicas

### Arquivo: `src/pages/Promocoes.tsx`

**1. Novo estado para selecao em massa** (junto aos estados existentes):

```typescript
// Chave unica: "item_id::promotion_id" para identificar cada par item-campanha
const [selectedSearchItems, setSelectedSearchItems] = useState<Set<string>>(new Set());
```

**2. Funcoes auxiliares de selecao**:

```typescript
// Extrair todos os candidatos filtraveis
const allCandidateEntries = useMemo(() => {
  return filteredProductResults.flatMap(product =>
    product.promotions
      .filter(p => p.item_status === 'candidate' || p.item_status === 'pending')
      .map(p => ({
        key: `${product.item_id}::${p.promotion_id}`,
        item_id: product.item_id,
        promotion_id: p.promotion_id,
        promotion_type: p.promotion_type,
        price: p.promo_price || p.original_price || undefined,
        offer_id: p.offer_id || undefined,
      }))
  );
}, [filteredProductResults]);

const toggleSelectItem = (key: string) => { ... };
const toggleSelectAll = () => { ... };
```

**3. Header com selecao em massa** (dentro do CardContent, antes da lista de resultados):

- Checkbox "Selecionar todos candidatos (N)"
- Badge mostrando "X selecionados"
- Botao "Aderir X Selecionados" que agrupa por promotion_id e chama setConfirmAction

**4. Checkboxes nas linhas de campanha** (dentro de ProductPromotionCard):

- Passar selectedSearchItems e toggleSelectItem como props
- Adicionar Checkbox ao lado de cada campanha candidata
- Itens "Participando" ou com outro status nao ganham checkbox

**5. Acao em massa**:

Como cada item pode pertencer a campanhas diferentes, a adesao em massa agrupa por promotion_id e faz chamadas separadas para cada campanha. O dialog de confirmacao mostra:
- Total de itens selecionados
- Quantidade de campanhas distintas envolvidas

**6. Limpar selecao** quando os filtros mudam ou apos acao concluida.

### Resumo

| Arquivo | Alteracao |
|---------|-----------|
| `src/pages/Promocoes.tsx` | Estado de selecao, logica de toggle, header com "Selecionar todos" e "Aderir Selecionados", checkbox nas linhas candidatas do ProductPromotionCard |

Nenhuma alteracao no backend — a adesao usa a mesma edge function `promotions-action` ja existente, chamada uma vez por campanha distinta nos itens selecionados.
