
# Integrar Avaliações de Módulos na Interface do Usuário

## Problema
Os componentes de avaliação (`ModuleRatingSummaryCard`, `SystemRatingSummaryCard`) foram criados mas nunca foram inseridos em nenhuma página visível ao usuário. Por isso, não há como avaliar módulos ou o sistema.

## Solução

Vamos adicionar as avaliações em **dois locais**:

### 1. Página Início - Card de Avaliação do Sistema
Na página Início (`src/pages/Home.tsx`), adicionar o `SystemRatingSummaryCard` para que o usuário possa avaliar o sistema como um todo. Ficará posicionado na parte inferior da página, após os quick actions.

### 2. Configurações - Seção "Avaliações"
Criar um novo item no menu de Configurações chamado "Avaliações" (slug: `avaliacoes`) que conterá:
- O card de avaliação geral do sistema (`SystemRatingSummaryCard`)
- Uma lista dos módulos ativos com o card `ModuleRatingSummaryCard` para cada um, permitindo avaliar individualmente cada módulo
- O centro de consentimentos (`SettingsConsentCenter`) para gerenciar permissões de depoimentos

### 3. Menu de Configurações - Novo item no banco de dados
Inserir o item "Avaliações" na tabela `config_menu_items` para que apareça no menu lateral de Configurações.

---

## Detalhes Técnicos

### Arquivos a criar:
- `src/components/settings/SettingsRatings.tsx` - Página de configurações com avaliação do sistema + lista de módulos avaliáveis + consentimentos

### Arquivos a modificar:
- `src/components/settings/SettingsLayout.tsx` - Registrar o slug `avaliacoes` no `COMPONENT_MAP`
- `src/pages/Home.tsx` - Adicionar `SystemRatingSummaryCard` na parte inferior

### Banco de dados:
- Inserir novo item `config_menu_items` com slug `avaliacoes`, ícone `Star`, dentro do grupo de preferências ou como item de conta
