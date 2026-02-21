
# Reorganizacao do Menu Lateral

## Problemas Identificados

1. **"Marketplace" como wrapper desnecessario** - adiciona um nivel de profundidade sem utilidade
2. **Shopee e eliminado pela logica de poda** - o codigo remove grupos sem filhos com rotas, descartando o Shopee (coming_soon)
3. **Menus abrem por padrao** - o estado inicial trata todos os grupos como abertos
4. **Espacos vazios** - grupos podados parcialmente deixam lacunas visuais na renderizacao

## Solucao

### 1. Alteracoes no Banco de Dados

- **Desativar "Marketplace"** (`is_active = false`) para remover o wrapper
- **Promover "Mercado Livre" a raiz** (`parent_module_id = NULL`, `sort_order = 1`)
- **Promover "Shopee" a raiz** (`parent_module_id = NULL`, `sort_order = 2`) com status `coming_soon`
- **Criar submenu "Curva ABC" dentro do Shopee** como item filho com status `coming_soon`
- **Reordenar os demais grupos raiz**: Operacional (3), Ferramentas (4), Sistema (5), Admin (6)

Resultado da hierarquia:

```text
Inicio (raiz, rota /inicio)
Mercado Livre (raiz, grupo)
  Painel
    Dashboard
  Vendas
    Etiquetas de Envio
  Anuncios
    Linha do Tempo, Radiografia, Promocoes
  Crescimento
    ADS, Seed, Perguntas
  Inteligencia
    Tendencias, Mercado, Concorrencia, Curva ABC
  Financeiro
    Custos, Precificacao, Comissoes
Shopee (raiz, grupo, coming_soon)
  Curva ABC (coming_soon)
Operacional (raiz, grupo)
Ferramentas (raiz, grupo)
Sistema (raiz, grupo)
Admin (raiz, link direto)
```

### 2. Alteracoes no Codigo

**Arquivo: `src/components/layout/DynamicSidebar.tsx`**
- Alterar `isGroupOpen` para retornar `false` por padrao em vez de `true`
- Linha atual: `openGroups[key] !== false` (aberto por padrao)
- Nova logica: `openGroups[key] === true` (fechado por padrao)

**Arquivo: `src/hooks/useDynamicMenu.ts`**
- Ajustar a funcao de poda (`prune`) para preservar grupos com status `coming_soon`, mesmo sem filhos com rotas
- Logica atual remove qualquer no sem rota e sem filhos
- Nova logica: manter nos com `status === 'coming_soon'` independente de filhos

### Detalhes Tecnicos

**SQL de migracao:**
```sql
-- Desativar Marketplace
UPDATE system_modules SET is_active = false
WHERE id = 'b0000000-0000-0000-0000-000000000001';

-- Mercado Livre como raiz
UPDATE system_modules
SET parent_module_id = NULL, sort_order = 1
WHERE id = 'b0000000-0000-0000-0000-000000000100';

-- Shopee como raiz
UPDATE system_modules
SET parent_module_id = NULL, sort_order = 2
WHERE id = 'b0000000-0000-0000-0000-000000000200';

-- Criar Curva ABC dentro de Shopee
INSERT INTO system_modules (id, key, name, layer, parent_module_id, sort_order, icon_key, route, is_active, status)
VALUES ('b0000000-0000-0000-0000-000000000201', 'shopee.abc', 'Curva ABC', 'marketplace', 'b0000000-0000-0000-0000-000000000200', 1, 'BarChart3', NULL, true, 'coming_soon');

-- Reordenar raizes
UPDATE system_modules SET sort_order = 3 WHERE id = 'c0000000-0000-0000-0000-000000000001'; -- Operacional
UPDATE system_modules SET sort_order = 4 WHERE id = 'd0000000-0000-0000-0000-000000000001'; -- Ferramentas
UPDATE system_modules SET sort_order = 5 WHERE id = 'e0000000-0000-0000-0000-000000000001'; -- Sistema
UPDATE system_modules SET sort_order = 6 WHERE id = 'a0000000-0000-0000-0000-000000000001'; -- Admin
```

**Alteracao em `DynamicSidebar.tsx`** (1 linha):
```typescript
// De:
const isGroupOpen = (key: string) => openGroups[key] !== false;
// Para:
const isGroupOpen = (key: string) => openGroups[key] === true;
```

**Alteracao em `useDynamicMenu.ts`** (funcao prune):
```typescript
// De:
if (!n.route && n.children.length === 0) return false;
// Para:
if (!n.route && n.children.length === 0 && n.status !== 'coming_soon') return false;
```
