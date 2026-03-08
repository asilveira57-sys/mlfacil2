

## Redirecionar Ferramentas do Sidebar para as Versões Internas

### Situação Atual

O sidebar tem 3 itens no grupo "Ferramentas" apontando para rotas **públicas** (`/ferramentas/*`), que carregam o `ToolsLayout` (layout público, fora do dashboard). Porém, já existem **versões internas completas** dessas mesmas ferramentas no ambiente autenticado:

| Item no Sidebar | Rota atual (pública) | Rota interna (já existe) | Página |
|---|---|---|---|
| Tendências Lite | `/ferramentas/tendencias` | `/tendencias` | `TendenciasV2` |
| Calculadora de Precificação | `/ferramentas/precificacao` | `/precificacao` | `Precificacao` |
| Comissões ML | `/ferramentas/comissoes` | `/comissoes` | `Comissoes` |

As versões internas já usam `PageContainer` (layout do dashboard), são mais completas (TendênciasV2 usa dados reais do seller, cache, API do ML), e permanecem dentro do shell autenticado.

### Plano

**1. Atualizar rotas no banco (`system_modules`)**

Executar um `UPDATE` para apontar os 3 itens do grupo Ferramentas para as rotas internas:

- `ferramentas.trends_lite` → `/tendencias`
- `ferramentas.pricing_calc` → `/precificacao`
- `ferramentas.commissions_calc` → `/comissoes`

Isso é tudo que precisa mudar -- o sidebar é dinâmico e vai refletir automaticamente.

### Arquivos alterados

Nenhum arquivo de código precisa ser alterado. Apenas uma migration SQL para atualizar as 3 rotas na tabela `system_modules`.

### Resultado

O usuário clica em "Tendências Lite" no sidebar e permanece dentro do dashboard, carregando a versão completa (`TendenciasV2`) com dados reais. O mesmo para Precificação e Comissões. As rotas públicas (`/ferramentas/*`) continuam existindo para visitantes não autenticados.

