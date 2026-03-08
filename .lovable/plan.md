

## Reimplantar Post-it como Feature Independente

### Situação Atual

O sistema de Post-it **existe no código** e está funcional:
- `ModuleNotesOverlay` já renderiza post-its fixados como cards flutuantes (linha 144 de `AppShellLayout.tsx`)
- `ModulePostIt` renderiza cada post-it com expandir/recolher, editar, desfixar, enviar para tarefas
- `useNotePins` + `useNotes` gerenciam toda a lógica de CRUD e fixação

**Problema**: o único ponto de acesso é o ícone "Bloco de Notas" dentro do `HeaderUtilities` (widget hub). Não há botão independente para criar/fixar um post-it rapidamente. O usuário precisa: abrir o Bloco de Notas → criar nota → fixar no módulo. Isso é pouco intuitivo.

### Plano

#### 1. Criar botão flutuante "Novo Post-it" (FAB)

Adicionar um `FloatingPostItButton` no `AppShellLayout.tsx`, ao lado do `FloatingSupportButton`, com ícone de `StickyNote` + `Plus`. Ao clicar:
- Abre um mini-formulário inline (popover) com: título, cor (palette), e botão "Fixar aqui"
- Cria a nota e fixa automaticamente no módulo atual (`useActiveModuleKey`)
- O post-it aparece imediatamente no `ModuleNotesOverlay` como card flutuante

#### 2. Tornar o FAB independente do Hub de Widgets

- O botão flutuante **não depende** de `showNotesInHeader` (configuração do widget hub)
- Terá sua própria preferência em Settings: "Mostrar botão de Post-it flutuante"
- Visível em todas as páginas por padrão

#### 3. Melhorar o ModulePostIt existente

- Adicionar seletor de responsável (atribuir colaborador) no card expandido
- Mostrar badge de cor mais proeminente
- Manter as ações existentes: editar, enviar para tarefas, desfixar

#### 4. Adicionar entrada no menu lateral (sidebar)

- Adicionar item "Post-its" no menu principal via `system_modules` para que apareça na navegação
- Rota `/postits` com listagem de todos os post-its fixados em qualquer módulo, com filtro por módulo/cor/responsável

### Arquivos Afetados

| Arquivo | Ação |
|---------|------|
| `src/components/notes/FloatingPostItButton.tsx` | Criar — FAB + popover de criação rápida |
| `src/components/notes/QuickPostItForm.tsx` | Criar — formulário inline (título, cor, fixar) |
| `src/components/layout/AppShellLayout.tsx` | Editar — adicionar `FloatingPostItButton` no main |
| `src/components/notes/ModulePostIt.tsx` | Editar — adicionar campo de responsável |
| `src/components/notes/index.ts` | Editar — exportar novos componentes |
| `src/hooks/useUtilitiesPreferences.ts` | Editar — adicionar pref `showPostItButton` |
| Locale files (en, es, pt-BR) | Editar — adicionar traduções do FAB |

