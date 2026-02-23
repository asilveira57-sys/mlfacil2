
# Ollie - Correcao da Busca de Produtos e Identidade Visual

## Problemas

1. **Busca de produtos nao funciona**: O `ProductSearchSelector` busca em `analyzed_items` (tabela vazia). Os dados reais estao em `meli_listings_cache` com 767+ produtos, contendo `item_id`, `title`, `sku`, `thumbnail`, `seller_id`.

2. **Nome e identidade**: O dialog ainda mostra "Agente de Adesao" com icone generico de Bot. Precisa ser "Agente de Adesao Ollie" com o robozinho 3D no header.

3. **Execucao automatica**: O Ollie ja executa automaticamente apos cada `promotions-sync` (encadeado na edge function). Nao e necessario clicar "Executar agora" toda vez -- so para testes manuais.

4. **Configuracao por empresa**: O Ollie ja e configurado por empresa (`workspace_id` + `seller_id`). Cada conta tem sua propria configuracao independente.

---

## Mudancas no arquivo `src/components/promotions/PromotionAgentConfig.tsx`

### A. Corrigir busca de produtos

Reescrever a funcao `search()` dentro de `ProductSearchSelector`:

- Trocar `analyzed_items` por `meli_listings_cache`
- Filtrar por `seller_id` do seller atual
- Buscar em 3 campos: `title`, `item_id` (MLB) e `sku`
- Query: `.or('title.ilike.%q%,item_id.ilike.%q%,sku.ilike.%q%')`
- Exibir SKU nos resultados quando disponivel
- Atualizar tipo `ProductHit` para incluir `sku`
- Atualizar placeholder para "Buscar por titulo, SKU ou MLB..."

### B. Renomear para Ollie

- Titulo do Dialog: "Agente de Adesao Ollie"
- Manter descricao: "Adesao automatica a promocoes"

### C. Mini-Ollie no header

Substituir o icone quadrado `<Bot>` por uma versao mini (40x40px) do robo 3D:
- Esfera cromada com radial-gradient identico ao `PromotionAgentBot`
- Olhos estaticos (pupilas centralizadas)
- Antena com LED verde quando agente ativo
- Sem drag, sem mouse tracking -- puramente decorativo

---

## Detalhes Tecnicos

### Query corrigida

```typescript
const { data: listings } = await supabase
  .from('meli_listings_cache')
  .select('item_id, title, sku, thumbnail')
  .eq('seller_id', sellerId)
  .or(`title.ilike.%${q}%,item_id.ilike.%${q}%,sku.ilike.%${q}%`)
  .limit(20);
```

### Tipo atualizado

```typescript
interface ProductHit {
  item_id: string;
  title: string | null;
  thumbnail: string | null;
  sku: string | null;
}
```

### Respostas as duvidas do usuario

O plano tambem inclui adicionar texto informativo na UI:
- Na secao "Executar agora": adicionar nota "O Ollie executa automaticamente apos cada sincronizacao de promocoes."
- No header ou descricao: indicar que a configuracao e especifica para a conta selecionada.

---

## Resumo

| Arquivo | Acao |
|---------|------|
| `src/components/promotions/PromotionAgentConfig.tsx` | Corrigir busca para `meli_listings_cache`, renomear para Ollie, adicionar mini-robo, notas informativas |
