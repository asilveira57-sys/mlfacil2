

## Plano: Editor de Menu de Configurações

### Situação atual
O `SettingsLayout` usa uma lista **hardcoded** de 15 tabs. O banco já possui as tabelas `config_menu_groups` e `config_menu_items` populadas com dados equivalentes, mas **não são consumidas** pelo layout.

### O que será feito

#### 1. Tornar o menu dinâmico (consumir do banco)
- Alterar `SettingsLayout` para usar o hook `useConfigMenu()` em vez do array hardcoded
- Criar um mapa estático `slug → componente` para vincular cada slug do banco ao componente React correto
- A ordem e o nome das tabs passam a vir do banco de dados

#### 2. Criar componente "Editor do Menu de Configurações"
- Botão de engrenagem/edição ao lado das tabs (visível apenas para owner/admin)
- Abre um dialog/drawer com a lista de itens editáveis:
  - **Arrastar para reordenar** (instalar `@dnd-kit/core` + `@dnd-kit/sortable`)
  - **Editar nome** inline (clique no texto para editar)
  - **Ativar/desativar** item (toggle switch)
- Salvar altera `display_order`, `name` e `active` na tabela `config_menu_items`
- Invalidar cache do `useConfigMenu` ao salvar

#### 3. Arquivos envolvidos
- `src/components/settings/SettingsLayout.tsx` — consumir `useConfigMenu`, adicionar botão de edição
- `src/components/settings/SettingsMenuEditor.tsx` — novo componente com drag-and-drop e edição inline
- `package.json` — adicionar `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`

#### Detalhes técnicos
- O mapa de componentes será: `{ "perfil": SettingsProfile, "seguranca": SettingsSecurity, ... }` — slugs do banco vinculam ao componente correto
- Items sem componente mapeado mostram o placeholder "Em breve"
- A reordenação atualiza `display_order` de todos os itens afetados em batch via `upsert`
- Verificação de role (owner/admin) via `useUserRole` para mostrar/esconder o botão de edição

