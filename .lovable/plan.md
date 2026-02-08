
# Plano: Integrar Frete, Precificacao e Comissoes no Menu do Sistema

## Situacao Atual

### O que existe hoje

| Funcionalidade | Pagina | Rota | No Sidebar? | No system_modules? | No ROUTE_MODULE_MAP? |
|---|---|---|---|---|---|
| Frete | `FreightManagement.tsx` | `/frete` (dentro do shell) | NAO | NAO | NAO |
| Precificacao | `PricingSimulatorTool.tsx` | `/ferramentas/precificacao` (fora do shell) | NAO | NAO | NAO |
| Comissoes | `CommissionsTool.tsx` | `/ferramentas/comissoes` (fora do shell) | NAO | NAO | NAO |

### Estrutura atual do sidebar

```text
MENU PRINCIPAL: Inicio, Dashboard, Etiquetas, Tarefas, Seed, Promocoes, ADS, Linha do Tempo, Pos-Venda, Perguntas
ANALISES: Radiografia, Mercado, Tendencias, Concorrencia, Curva ABC, Custos
FERRAMENTAS: ZPL, Blog (em breve), Relatorios (em breve)
SISTEMA: Configuracoes
```

## Restricao Critica

As ferramentas publicas (`/ferramentas/*`) sao isoladas dos modulos pagos - nao compartilham codigo, componentes ou hooks. Portanto, Precificacao e Comissoes precisam de **paginas internas novas** dentro do shell, independentes das versoes publicas.

---

## Plano de Implementacao

### 1. Criar paginas internas para Precificacao e Comissoes

**Precificacao Interna** (`src/pages/Precificacao.tsx`):
- Nova pagina standalone usando `PageContainer`
- Simulador de precificacao com a mesma logica de calculo (lucro, margem, break-even), mas componentes proprios
- Nao importa nada de `src/components/tools/` ou `src/pages/tools/`
- Usa namespace i18n proprio (nao o `tools.json`)

**Comissoes Interna** (`src/pages/Comissoes.tsx`):
- Nova pagina standalone usando `PageContainer`
- Consulta de comissoes por categoria ML, mesma logica de fetch da API publica ML
- Componentes proprios, independentes da versao publica
- Usa namespace i18n proprio

### 2. Adicionar rotas no App.tsx

Dentro do bloco `<AppShellLayout>`:
```text
/precificacao → Precificacao
/comissoes → Comissoes
/frete → FreightManagement (ja existe)
```

### 3. Adicionar ao Sidebar (AppSidebar.tsx)

Proposta de organizacao - adicionar os 3 itens ao grupo **Analises** (que ja contem Custos, ABC, etc.):

```text
ANALISES (atualizado):
  - Radiografia
  - Mercado
  - Tendencias
  - Concorrencia
  - Curva ABC
  - Custos
  - Precificacao (NOVO)
  - Comissoes (NOVO)
  - Gestao de Frete (NOVO)
```

Icones:
- Precificacao: `Calculator`
- Comissoes: `Percent`
- Frete: `Truck`

### 4. Registrar no system_modules (migracao SQL)

Inserir 3 novos modulos na tabela `system_modules`:

```text
id: precificacao | name: Precificacao | icon_name: Calculator | route: /precificacao | is_active: true
id: comissoes | name: Comissoes | icon_name: Percent | route: /comissoes | is_active: true
id: frete | name: Gestao de Frete | icon_name: Truck | route: /frete | is_active: true
```

Isso garante que o Bloco de Notas (e qualquer outro consumidor de `useSystemModules`) reconheca automaticamente esses modulos.

### 5. Atualizar ROUTE_MODULE_MAP

Adicionar mapeamentos em `src/hooks/useActiveModuleKey.ts`:

```text
'precificacao' → 'precificacao'
'comissoes' → 'comissoes'
'frete' → 'frete'
```

### 6. Adicionar traducoes (i18n)

Chaves novas nos 3 locales (`nav.json`):

| Chave | pt-BR | en | es |
|---|---|---|---|
| `nav:commissions` | Comissoes | Commissions | Comisiones |

As chaves `nav:pricing` e `nav:freight` ja existem nos 3 idiomas.

Criar novos namespaces `precificacao.json` e `comissoes.json` para as paginas internas (labels, placeholders, etc.).

### 7. Adicionar ao DashboardModulesGrid

Incluir cards para Precificacao, Comissoes e Frete no grid de modulos do Dashboard.

---

## Arquivos a Criar

| Arquivo | Descricao |
|---|---|
| `src/pages/Precificacao.tsx` | Pagina interna do simulador de precificacao |
| `src/pages/Comissoes.tsx` | Pagina interna de consulta de comissoes |
| `src/locales/pt-BR/precificacao.json` | Traducoes pt-BR para precificacao interna |
| `src/locales/en/precificacao.json` | Traducoes en |
| `src/locales/es/precificacao.json` | Traducoes es |
| `src/locales/pt-BR/comissoes.json` | Traducoes pt-BR para comissoes interna |
| `src/locales/en/comissoes.json` | Traducoes en |
| `src/locales/es/comissoes.json` | Traducoes es |

## Arquivos a Modificar

| Arquivo | Alteracao |
|---|---|
| `src/App.tsx` | Importar novas paginas + adicionar rotas `/precificacao` e `/comissoes` |
| `src/components/layout/AppSidebar.tsx` | Adicionar 3 itens ao grupo `analyticsNavItems` |
| `src/hooks/useActiveModuleKey.ts` | Adicionar 3 entradas no `ROUTE_MODULE_MAP` e `MODULE_LABELS` |
| `src/components/dashboard/DashboardModulesGrid.tsx` | Adicionar 3 cards de modulo |
| `src/locales/*/nav.json` | Adicionar chave `commissions` (pt-BR, en, es) |
| Migracao SQL | INSERT de 3 registros em `system_modules` |

---

## Detalhes Tecnicos

### Precificacao Interna - Estrutura

A pagina tera a mesma funcionalidade do simulador publico, mas com componentes independentes:
- Formulario de inputs (preco de venda, custo, taxa ML, frete, embalagem, outros)
- Display de resultados (lucro, margem, custo total, taxas, break-even)
- Calculos em `useMemo` (sem backend necessario neste momento)
- Futuramente podera integrar com o `pricing-engine` para persistencia

### Comissoes Interna - Estrutura

A pagina tera a mesma funcionalidade da consulta publica:
- Seletor de categorias ML (30 categorias)
- Fetch da API publica ML (`https://api.mercadolibre.com/sites/MLB/listing_prices`)
- Fallback para dados estaticos quando API falha
- Exibicao em cards agrupados por categoria (Premium vs Classico)

### Frete - Apenas integracao no menu

A pagina `FreightManagement.tsx` ja existe e funciona dentro do shell. Precisa apenas:
- Entrada no sidebar
- Registro no `system_modules`
- Entrada no `ROUTE_MODULE_MAP`

### Migracao SQL

```text
INSERT INTO system_modules (id, name, description, icon_name, route, is_active) VALUES
  ('precificacao', 'Precificacao', 'Simulador de precificacao para Mercado Livre', 'Calculator', '/precificacao', true),
  ('comissoes', 'Comissoes', 'Consulta de comissoes por categoria do Mercado Livre', 'Percent', '/comissoes', true),
  ('frete', 'Gestao de Frete', 'Tabela de frete, calculo de custos e divergencias', 'Truck', '/frete', true)
ON CONFLICT (id) DO NOTHING;
```
