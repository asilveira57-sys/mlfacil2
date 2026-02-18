

# Monitoramento de Vendedores Concorrentes

## Resumo

Evoluir o modulo de Concorrencia para permitir o acompanhamento de **contas de vendedores** (sellers) alem de anuncios individuais. O usuario podera seguir uma conta concorrente, ver todos os seus anuncios ativos, acompanhar vendas estimadas a partir da data de vinculo, e adicionar um apelido (nickname) ao nome mascarado da API.

## Como funciona dentro das diretrizes da API

A API publica do Mercado Livre disponibiliza os seguintes endpoints sem autenticacao (ou com token proprio):

- `GET /users/{user_id}` -- dados publicos: nickname mascarado (ex: GATO.SAPATO.MARIOLA), reputacao, data de registro, nivel
- `GET /sites/MLB/search?seller_id={seller_id}` -- lista de anuncios ativos do seller (ate 1000 resultados com paginacao)
- `GET /items/{item_id}` -- dados publicos do anuncio: preco, titulo, thumbnail, sold_quantity (faixa referencial), status
- `GET /items?ids=ID1,ID2,...` -- multiget ate 20 itens por chamada

**Importante**: `sold_quantity` e `available_quantity` sao valores **referenciais** (faixas), nao exatos. Plataformas como Nubimetrics e Real Trends usam a mesma abordagem: capturam snapshots periodicos de `sold_quantity` e calculam o **delta** entre capturas para estimar vendas no periodo. E exatamente isso que faremos.

## Abordagem de Nickname (LGPD + Etica)

- O sistema armazena o `nickname` original retornado pela API (mascarado pelo ML)
- O usuario pode adicionar um **apelido proprio** que sera concatenado: `GATO.SAPATO.MARIOLA (Fornecedor Joao)`
- O apelido fica visivel apenas para o usuario que o criou
- Nenhum dado pessoal real do vendedor e buscado ou armazenado

---

## Mudancas Tecnicas

### 1. Nova tabela: `competitor_sellers`

Armazena os sellers concorrentes monitorados.

```text
competitor_sellers
  id                  UUID PK
  user_id             UUID FK (auth.users)
  seller_id           TEXT (seller do usuario logado)
  ml_seller_id        TEXT (ID ML do concorrente, ex: 66043362)
  ml_nickname         TEXT (nickname mascarado da API)
  user_alias          TEXT (apelido dado pelo usuario)
  seller_reputation   JSONB (snapshot da reputacao)
  total_items_tracked INT
  last_synced_at      TIMESTAMPTZ
  next_sync_at        TIMESTAMPTZ
  sync_interval_hours INT DEFAULT 6
  status              TEXT DEFAULT 'ativo'
  binding_date        TIMESTAMPTZ (data de vinculo - baseline)
  created_at          TIMESTAMPTZ
  updated_at          TIMESTAMPTZ
```

### 2. Nova tabela: `competitor_seller_items`

Snapshot dos anuncios do seller concorrente.

```text
competitor_seller_items
  id                  UUID PK
  competitor_seller_id UUID FK
  user_id             UUID
  item_id             TEXT (MLB...)
  title               TEXT
  thumbnail           TEXT
  price               NUMERIC
  original_price      NUMERIC
  currency_id         TEXT
  sold_quantity_ref   INT (valor referencial da API)
  available_qty_ref   INT (valor referencial)
  category_id         TEXT
  listing_type        TEXT (gold_special, etc)
  condition           TEXT (new/used)
  status              TEXT (active/paused/closed)
  permalink           TEXT
  free_shipping       BOOLEAN
  catalog_listing     BOOLEAN
  last_synced_at      TIMESTAMPTZ
  created_at          TIMESTAMPTZ
  updated_at          TIMESTAMPTZ
```

### 3. Nova tabela: `competitor_seller_item_snapshots`

Para calcular delta de vendas (mesma tecnica do Nubimetrics).

```text
competitor_seller_item_snapshots
  id                  UUID PK
  item_id             TEXT
  competitor_seller_id UUID FK
  price               NUMERIC
  sold_quantity_ref   INT
  available_qty_ref   INT
  status              TEXT
  captured_at         TIMESTAMPTZ DEFAULT now()
```

### 4. Edge Function: `competitor-seller-sync`

Nova funcao backend para sincronizar dados do seller concorrente:

- **Adicionar seller**: Recebe nickname ou seller_id, busca `/users/{id}` para dados publicos, busca `/sites/MLB/search?seller_id={id}` para listar anuncios
- **Sync periodica**: A cada N horas, re-busca todos os anuncios do seller, compara `sold_quantity` com snapshot anterior para estimar vendas
- **Calculo de delta**: `vendas_estimadas = sold_quantity_atual - sold_quantity_snapshot_anterior`
- **Rate limiting**: delay de 200ms entre chamadas, maximo 50 itens por batch via multiget

### 5. Componentes Frontend

**SellerTrackingTab** (nova aba ou sub-secao dentro de "Monitorados"):
- Card de resumo do seller: nickname + apelido, reputacao, total de anuncios, vendas estimadas desde vinculo
- Lista de anuncios do seller com: thumbnail, titulo, preco, sold_quantity (delta), status
- Ordenacao por mais vendidos, preco, recentes
- Botao "Editar apelido" inline
- Botao "Monitorar este anuncio" (cria tracker individual a partir do item)

**AddCompetitorSellerDialog**:
- Campo para colar link do perfil do vendedor OU ID do seller
- Parser que extrai seller_id de URLs como `mercadolivre.com.br/perfil/NICKNAME`
- Preview com dados publicos antes de confirmar
- Campo de apelido opcional

**SellerDetailDrawer**:
- Detalhes completos do seller
- Grafico de vendas estimadas ao longo do tempo
- Lista paginada de anuncios com filtros (categoria, faixa de preco)
- Timeline de eventos (novos anuncios, anuncios removidos, mudancas de preco)

### 6. Integracao com tab existente "Monitorados"

- Adicionar filtro "Anuncios | Sellers" na parte superior da tab
- Quando visualizando sellers, mostrar cards no formato de perfil
- Permitir expandir seller para ver seus anuncios diretamente

### 7. Migracao de dados e RLS

- RLS em todas as novas tabelas: usuario so ve seus proprios dados
- Indice em `competitor_sellers(user_id, ml_seller_id)` para evitar duplicatas
- Indice em `competitor_seller_items(competitor_seller_id, item_id)`
- pg_cron job para sync automatica (similar ao competitor-scan existente)

---

## Sequencia de Implementacao

1. Criar tabelas via migracao SQL com RLS
2. Criar edge function `competitor-seller-sync` com endpoints: add, sync, list, detail
3. Criar hook `useCompetitorSellers` no frontend
4. Criar componentes: AddCompetitorSellerDialog, SellerTrackingList, SellerDetailDrawer
5. Integrar na pagina de Concorrencia (nova sub-aba ou filtro na tab Monitorados)
6. Agendar sync automatica via pg_cron

