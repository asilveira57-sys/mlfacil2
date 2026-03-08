

## Correções na Curva ABC Cidades — 3 Problemas

### Problema 1: Produtos mostram MLB/SKU em vez de thumbnail + título
No `AbcGeographicDetailDrawer.tsx` (linha 176), o nome do produto é resolvido como `item.sku || item.title_short || item.title` — priorizando SKU. Além disso, não busca thumbnail.

**Correção:**
- Inverter a prioridade: usar `item.title_short || item.title || item.sku || item.item_id`
- Buscar `thumbnail` na query de `meli_order_items_cache` (já disponível na tabela)
- Adicionar coluna de thumbnail na tabela de produtos, mostrando imagem pequena (32x32) ao lado do título

### Problema 2: Navegação inversa (voltar) inexistente no drawer de detalhes
O botão "Voltar" já existe no breadcrumb da tab principal (`handleDrillUp`, linha 355-363), mas o usuário provavelmente está tentando voltar de dentro do drawer de detalhes (Dialog). O drawer não tem navegação de volta — ele é um modal estático.

**Correção:**
- Adicionar breadcrumb de contexto no header do `AbcGeographicDetailDrawer` mostrando o caminho (ex: `SP > São Paulo > Vila Nina`)
- Adicionar botões de navegação para subir de nível diretamente do drawer (bairro → cidade, cidade → estado)
- Passar callbacks `onNavigateUp` para o drawer permitir navegação sem fechar

### Problema 3: Mapa não abre / botão não visível
O botão "Ver Mapa" existe na linha 460 do `AbcCitiesTab`, mas está no header junto com "Exportar CSV". O problema é que ele pode estar `disabled` quando `classifiedItems.length === 0` (dados ainda carregando ou vazio), ou o usuário simplesmente não encontra o botão.

**Correção:**
- Adicionar um ícone de olho/mapa (Eye) em cada linha da tabela ABC (similar ao `onDetailClick`) para abrir o mapa filtrado por aquele item específico
- Tornar o botão "Ver Mapa" mais visível com estilo primary ao invés de outline
- Garantir que ao clicar no ícone de mapa na linha de um estado, abra o mapa já focado naquele estado com as cidades

### Resumo das Alterações

| Arquivo | Mudança |
|---|---|
| `AbcGeographicDetailDrawer.tsx` | Priorizar título sobre SKU, buscar e exibir thumbnail |
| `AbcGeographicDetailDrawer.tsx` | Adicionar breadcrumb + navegação de volta no drawer |
| `AbcCitiesTab.tsx` | Botão mapa mais visível, ícone de mapa por linha |
| `AbcTable.tsx` | Adicionar callback opcional `onMapClick` com ícone de mapa por linha |

