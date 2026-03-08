

## Análise do Problema

Identifiquei **dois problemas distintos** que precisam ser resolvidos:

### 1. Erro 500 ao tentar vincular produto catálogo (MLBU)
**Causa raiz**: O Mercado Livre está bloqueando com 403 (PolicyAgent) todos os endpoints usados para resolver vendedores de produtos catálogo:
- `/products/MLBU...` → 403
- `/sites/MLB/search?catalog_product_id=MLBU...` → 403  
- `/sites/MLB/search?q=título` → 403

O Edge Function `competitor-seller-sync` tenta múltiplas estratégias, mas todas falham. Quando não consegue resolver o vendedor, lança um erro 500 com a mensagem: _"Não foi possível encontrar vendedores para o produto catálogo MLBU1399893059. Tente colar o link de um anúncio específico."_

**Problema adicional**: O erro é tecnicamente correto, mas a mensagem não é clara o suficiente. O usuário colou um link válido do ML e não entende por que não funciona.

### 2. Requisito LGPD - Nicknames Aleatórios Mascarados
**Contexto**: Você mencionou que concorrentes (RealTrends, Lubimetrics) usam nomes aleatórios tipo `gato.sapato.sacola` em vez de mostrar o nickname real do vendedor para conformidade com LGPD.

**Estrutura atual**:
- `ml_nickname`: armazena o nickname real do vendedor (ex: "ADECONEX.SP")
- `user_alias`: permite o usuário adicionar um apelido interno (ex: "Fornecedor João")

**Problema**: Isso expõe dados de terceiros (vendedores concorrentes) sem consentimento.

---

## Solução Proposta

### **Parte 1: Melhorar Resolução de Produtos Catálogo**

#### 1.1 Estratégia de Fallback Aprimorada
Quando um link de produto catálogo (MLBU) é detectado, tentar:

1. **Extrair o `item_id` do URL** (muitos URLs catálogo contém `item_id:MLB...` como parâmetro)
2. **Se houver item_id no link**, usar esse MLB diretamente
3. **Se não houver**, buscar na página HTML do produto:
   - Fazer scraping leve do HTML da página produto
   - Extrair vendedores listados na página
   - Pegar o primeiro vendedor disponível

#### 1.2 Mensagem de Erro Mais Clara
Substituir erro genérico 500 por:
- **400 Bad Request** (é um problema de input do usuário, não erro do servidor)
- Mensagem: _"Este é um link de produto catálogo. Por favor, acesse a página do produto no Mercado Livre, escolha um vendedor específico e cole o link do anúncio desse vendedor."_
- Incluir instruções visuais na UI

---

### **Parte 2: Implementar Nicknames Aleatórios (LGPD)**

#### 2.1 Gerador de Nicknames Aleatórios
Criar um módulo que gera nicknames mascarados usando:
- **3 palavras aleatórias** de listas predefinidas (substantivos comuns)
- **Formato**: `palavra1.palavra2.palavra3`
- **Exemplos**: `caneta.mesa.lago`, `sapato.nuvem.prato`, `cadeira.sol.livro`

```typescript
// Exemplo de implementação
const WORDS = [
  'caneta', 'mesa', 'lago', 'sapato', 'nuvem', 'prato', 'cadeira', 
  'sol', 'livro', 'porta', 'janela', 'pedra', 'rio', 'flor', 
  'gato', 'cachorro', 'peixe', 'arvore', 'chuva', 'vento'
  // ... mais 50-100 palavras
];

function generateMaskedNickname(): string {
  const word1 = WORDS[Math.floor(Math.random() * WORDS.length)];
  const word2 = WORDS[Math.floor(Math.random() * WORDS.length)];
  const word3 = WORDS[Math.floor(Math.random() * WORDS.length)];
  return `${word1}.${word2}.${word3}`;
}
```

#### 2.2 Ajuste no Banco de Dados
**Não precisa alterar schema** - a coluna `ml_nickname` já aceita `TEXT`:

**Nova lógica ao adicionar seller**:
```typescript
// Edge function - handleAdd()
const maskedNickname = generateMaskedNickname();

await admin.from('competitor_sellers').insert({
  ...
  ml_nickname: maskedNickname,  // ← Nome mascarado aleatório
  user_alias: user_alias || null,
  // Guardar nickname real em campo interno (opcional, se necessário)
});
```

#### 2.3 Ajustes na Interface

**DisplayName pattern** (já existente em `SellerDetailDrawer.tsx`):
```typescript
const getDisplayName = () => {
  // ml_nickname agora será "caneta.mesa.lago"
  const base = competitorSeller.ml_nickname || `Seller ${competitorSeller.ml_seller_id}`;
  
  // Se user adicionar alias, mostra: "caneta.mesa.lago (Fornecedor João)"
  return competitorSeller.user_alias 
    ? `${base} (${competitorSeller.user_alias})` 
    : base;
};
```

**Preview no diálogo** (`AddCompetitorSellerDialog.tsx`):
- Mostrar o nickname mascarado no preview antes de adicionar
- Manter campo de alias editável
- Exemplo: "Será exibido como: **caneta.mesa.lago** (Fornecedor João)"

---

## Arquivos a Modificar

### Edge Function
**`supabase/functions/competitor-seller-sync/index.ts`**:
1. Criar função `generateMaskedNickname()` no topo do arquivo
2. Modificar `resolveFromMLBU()`:
   - Tentar extrair `item_id` do HTML se APIs falharem
   - Lançar erro 400 com mensagem clara se falhar completamente
3. Modificar `handleAdd()` e `handlePreview()`:
   - Usar `generateMaskedNickname()` em vez de `userData.nickname`

### Frontend (opcional - ajustes menores)
**`src/components/competitor/AddCompetitorSellerDialog.tsx`**:
- Adicionar tooltip explicando que nickname é mascarado por LGPD
- Mensagem de ajuda quando link catálogo falha

**`src/components/competitor/SellerDetailDrawer.tsx`**:
- Já está correto - usa `getDisplayName()` que funciona com nicknames mascarados

---

## Fluxo Após Implementação

### Cenário 1: Link de Catálogo (MLBU)
1. Usuário cola: `https://www.mercadolivre.com.br/lacre-para-delivery/up/MLBU1399893059`
2. Sistema detecta MLBU
3. Sistema tenta extrair `item_id` do URL ou HTML
4. **Se falhar**: retorna 400 com orientação clara
5. **Se suceder**: resolve seller do item MLB encontrado

### Cenário 2: Link de Anúncio Específico (MLB)
1. Usuário cola: `https://www.mercadolivre.com.br/produto/p/MLB123456`
2. Sistema resolve seller normalmente
3. Gera nickname mascarado: `cadeira.rio.vento`
4. Preview mostra: "**cadeira.rio.vento** - 147 anúncios ativos"
5. Usuário pode adicionar alias: "Loja Concorrente A"
6. Display final: "cadeira.rio.vento (Loja Concorrente A)"

---

## Impacto LGPD

### ✅ Antes (problema)
- `ml_nickname: "ADECONEX.SP"` → **Expõe identidade do vendedor**
- Viola LGPD: dados de terceiros sem consentimento

### ✅ Depois (solução)
- `ml_nickname: "caneta.mesa.lago"` → **Anônimo, não identifica ninguém**
- `user_alias: "Fornecedor João"` → **Privado, só o usuário vê**
- Conformidade com LGPD mantida

---

## Perguntas para Validação

Antes de implementar, preciso confirmar:

1. **O nome mascarado deve ser completamente aleatório** ou você quer alguma lógica (ex: sempre o mesmo nickname para o mesmo seller_id)?
   - Aleatório → sempre diferente
   - Hash → mesmo seller sempre gera mesmo nickname

2. **Sellers já cadastrados** (como "ADECONEX.SP") devem ser atualizados com nicknames mascarados ou mantemos como está?
   - Atualizar retroativamente → rodar migration
   - Só novos → não mexer nos existentes

3. **Para o erro 403 de catálogo**, você prefere:
   - Tentar scraping HTML (mais complexo, pode quebrar)
   - Simplesmente orientar usuário a colar link específico (mais simples)

