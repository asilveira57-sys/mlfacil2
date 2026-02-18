
# Consulta da Tabela Oficial de Frete do Mercado Livre via API

## Contexto

O Mercado Livre possui um endpoint oficial que retorna o custo de frete que o seller pagara para um envio, baseado em parametros como dimensoes, preco do item, tipo de anuncio, categoria, etc:

```
GET /users/{user_id}/shipping_options/free?dimensions={HxWxL,weight}&item_price={price}&listing_type_id={type}&category_id={cat}&mode={mode}
```

Este endpoint retorna o `list_cost` (custo oficial do frete) e informacoes de subsidio/desconto. Com ele, podemos montar a tabela oficial do ML para qualquer combinacao de categoria, faixa de preco e peso -- independente de ter vendido ou nao.

## Plano

### 1. Nova Edge Function: `freight-table-query`

Cria uma Edge Function que consulta a API do ML para montar a tabela oficial de frete. O usuario seleciona os parametros e a funcao faz as chamadas necessarias para popular a grade.

**Parametros de entrada:**
- `seller_id` (para autenticacao na API)
- `category_id` (opcional - categoria do item)
- `listing_type_id` (gold_pro, gold_special, etc.)
- `logistic_type` (drop_off, fulfillment, xd_drop_off, cross_docking)
- `weight_ranges` - array de faixas de peso a consultar (ex: [0.3, 0.5, 1, 2, 5, 10, 15, 30])
- `price_ranges` - array de faixas de preco a consultar (ex: [79, 120, 200, 500, 1000])

**Logica:**
- Para cada combinacao de peso x preco, faz uma chamada ao endpoint `shipping_options/free`
- Converte peso para dimensoes estimadas (usando os perfis A/B/C ja configurados no sistema)
- Retorna a grade completa com os custos oficiais

**Saida:**
```text
[
  { weight: 0.3, price: 79, listing_type: "gold_pro", list_cost: 18.90, discount_rate: 0, ... },
  { weight: 0.3, price: 200, listing_type: "gold_pro", list_cost: 0, discount_rate: 1.0, ... },
  ...
]
```

### 2. Atualizar `FreightRulesetsTab.tsx`

Adicionar dois botoes de acao:
- **"Cadastrar Manualmente"**: formulario para digitar a tabela oficial (ja previsto)
- **"Consultar na API do ML"**: novo botao que abre um dialog para consultar a tabela oficial direto da API

### 3. Novo componente: `FreightApiQueryDialog.tsx`

Dialog que permite ao usuario:
1. Selecionar parametros (tipo de anuncio, tipo logistico, categoria opcional)
2. Definir as faixas de peso e preco a consultar
3. Clicar "Consultar" - chama a Edge Function
4. Ver a grade de resultados (tabela peso x preco com custos)
5. Opcionalmente "Salvar como Tabela" - persiste como `freight_ruleset` + `freight_rule_lines` para uso nos calculos de divergencia

### 4. Novo componente: `FreightCreateDialog.tsx`

Formulario manual para cadastrar regras de frete:
- Nome e descricao da tabela
- Tipo logistico e tipo de anuncio
- Linhas com faixa de peso, faixa de preco e valor do frete
- Possibilidade de adicionar/remover linhas

### 5. Confronto futuro (ja preparado)

Com as duas fontes de dados:
- **Tabela oficial** (consultada via API ou cadastrada manualmente) -> `freight_rulesets` / `freight_rule_lines`
- **Valores cobrados** (historico real de `meli_shipment_costs_cache`)

O FreightEngine existente ja faz o calculo de divergencia (expected vs paid). A tabela oficial alimenta o "expected", e os dados historicos alimentam o "paid".

## Detalhamento Tecnico

### Edge Function `freight-table-query`

```text
Arquivo: supabase/functions/freight-table-query/index.ts

1. Recebe seller_id, parametros de consulta
2. Busca access_token do seller via ml_accounts
3. Para cada combinacao peso x preco:
   - Converte peso em dimensoes estimadas (usando perfis A/B/C do freight_settings)
   - Chama GET /users/{seller_id}/shipping_options/free?dimensions=...&item_price=...&listing_type_id=...
   - Extrai list_cost, discount, billable_weight
4. Retorna array com todos os resultados
5. Rate limit: aguarda 100ms entre chamadas para nao exceder limites da API
```

### Componente `FreightApiQueryDialog.tsx`

```text
- Select: Tipo de Anuncio (Classico, Premium)
- Select: Tipo Logistico (Mercado Envios, Full, Drop Off)
- Input: Categoria (opcional, com autocomplete)
- Chips/Input: Faixas de peso (pre-definidas + customizaveis)
- Chips/Input: Faixas de preco (pre-definidas + customizaveis)
- Botao: Consultar API
- Tabela de resultados: grade peso x preco com valores
- Botao: Salvar como Tabela de Frete
```

### Componente `FreightCreateDialog.tsx`

```text
- Input: Nome da tabela
- Input: Descricao
- Date: Valida a partir de
- Tabela editavel com linhas:
  - Tipo logistico | Tipo anuncio | Peso min | Peso max | Preco min | Preco max | Valor frete
- Botoes: Adicionar linha, Remover linha
- Botao: Salvar
```

## Arquivos impactados

| Arquivo | Alteracao |
|---------|-----------|
| `supabase/functions/freight-table-query/index.ts` | Nova Edge Function para consultar API do ML |
| `src/components/freight/FreightRulesetsTab.tsx` | Adicionar botoes "Consultar API" e "Cadastrar Manual" |
| `src/components/freight/FreightApiQueryDialog.tsx` | Novo dialog de consulta a API |
| `src/components/freight/FreightCreateDialog.tsx` | Novo dialog de cadastro manual |
