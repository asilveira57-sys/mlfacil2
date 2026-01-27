
# Plano: Padronização de Layout e Navegação de Todos os Módulos

## Diagnóstico

Analisei as páginas do sistema e identifiquei as seguintes inconsistências:

| Módulo | Problema Atual |
|--------|----------------|
| **Configurações** (`/settings`) | Sem sidebar, sem botão de voltar |
| **Radiografia** (`/radiografia`) | Sem sidebar, sem botão de voltar |
| **Curva ABC** (`/abc-analysis`) | Usa sidebar própria (`AbcSidebar`) diferente do padrão |
| **Tarefas** (`/tarefas`) | Sem sidebar, sem botão de voltar |
| **Custos** (`/custos`) | Botão "Voltar" aponta para "/" (front-end) ao invés de `/dashboard` |
| **Conversor ZPL** (`/zpl-converter`) | Usa ícone de casinha (Home) ao invés de seta para voltar |
| **Vendas/Etiquetas** (`/shipping-labels`) | Tem sidebar nativa com seta de voltar, ok |

## Padrão Correto (Referência)

Baseado nas páginas que já funcionam corretamente (Dashboard, Publicidade, Promoções), o padrão é:

1. Usar `DashboardLayout` que inclui:
   - Sidebar (`AppSidebar`) com menu lateral completo
   - Botão `SidebarTrigger` no header para expandir/recolher
   - Header com título da página e conteúdo adicional
   - Área de conteúdo principal

2. A sidebar já possui botão de recolher integrado via `SidebarTrigger`

## Solução

### 1. Configurações (`/settings`)
- Envolver conteúdo com `DashboardLayout`
- Passar título "Configurações" e subtítulo ao layout

### 2. Radiografia (`/radiografia`)
- Envolver conteúdo com `DashboardLayout`
- Passar título "Radiografia de Anúncios" ao layout

### 3. Curva ABC (`/abc-analysis`)
- Remover `AbcSidebar` customizada
- Usar `DashboardLayout` padrão
- Manter o conteúdo interno das tabs

### 4. Tarefas (`/tarefas`)
- Envolver conteúdo com `DashboardLayout`
- Passar título "Tarefas" ao layout

### 5. Custos (`/custos`)
- Remover header customizado com link para "/"
- Usar `DashboardLayout` padrão
- Manter seletor de conta no `headerContent`

### 6. Conversor ZPL (`/zpl-converter`)
- Remover header customizado com botão Home
- Usar `DashboardLayout` padrão
- Manter controles do usuário no `headerContent`

### 7. Vendas/Etiquetas (`/shipping-labels`)
- Remover header customizado
- Usar `DashboardLayout` padrão

## Estrutura Final Esperada

Todas as páginas seguirão este padrão:

```text
+------------------------------------------------+
|  [≡] Sidebar Trigger | Título | [Ações Header] |
+------------------------------------------------+
|  S  |                                          |
|  i  |                                          |
|  d  |      Conteúdo da Página                  |
|  e  |                                          |
|  b  |                                          |
|  a  |                                          |
|  r  |                                          |
+------------------------------------------------+
```

## Arquivos a Modificar

| Arquivo | Ação |
|---------|------|
| `src/pages/Settings.tsx` | Adicionar `DashboardLayout` |
| `src/pages/Radiografia.tsx` | Adicionar `DashboardLayout` |
| `src/pages/AbcAnalysis.tsx` | Trocar `AbcSidebar` por `DashboardLayout` |
| `src/pages/Tarefas.tsx` | Adicionar `DashboardLayout` |
| `src/pages/Custos.tsx` | Trocar header customizado por `DashboardLayout` |
| `src/pages/ZPLConverter.tsx` | Trocar header customizado por `DashboardLayout` |
| `src/pages/ShippingLabels.tsx` | Trocar header customizado por `DashboardLayout` |

## Arquivo a Deletar

| Arquivo | Motivo |
|---------|--------|
| `src/components/abc/AbcSidebar.tsx` | Não mais necessário após padronização |

## Resultado Esperado

- Navegação consistente em todos os módulos
- Sidebar unificada com menu completo
- Botão de recolher/expandir sidebar disponível em todas as páginas
- Não há mais ícones de "casinha" ou links para "/"
- Todas as páginas carregam com sidebar lateral visível
