

## Melhorias no Post-it: Plano de Implementação

### Resumo dos Requisitos

1. **Botão flutuante**: Adicionar X para fechar + arrastar (drag) para reposicionar
2. **Comportamento de visibilidade**: Sempre reaparece ao logar; preferência em Configurações (ativo/inativo)
3. **Seletor de módulo**: Substituir "Fixar em: Dashboard" por um dropdown com todos os módulos + opção "Geral" (todos)
4. **Enviar para tarefa**: Opção de enviar para tarefa geral OU para colaborador específico
5. **Colar imagem / Anexo**: Integrar `useNoteAttachments` + paste handler no formulário rápido

---

### 1. FloatingPostItButton — Fechar + Arrastar

**Arquivo**: `src/components/notes/FloatingPostItButton.tsx`

- Adicionar estado `dismissed` (sessão) — ao clicar X, esconde até próximo login/reload
- Implementar drag via `onPointerDown/Move/Up` para mover a posição do FAB (estado local `{x, y}` com `position: fixed`)
- Persistir posição no `localStorage` para manter entre páginas
- Ao recarregar a página, o botão reaparece (dismissed reseta)

### 2. Preferência em Configurações

**Já existe** `showPostItButton` em `useUtilitiesPreferences`. Apenas precisa garantir que a UI de Settings exiba o toggle. Verificar se já está no painel de configurações de widgets.

### 3. Seletor de Módulo no QuickPostItForm

**Arquivo**: `src/components/notes/QuickPostItForm.tsx`

- Substituir o texto estático "📌 Fixar em: Dashboard" por um `Select` dropdown
- Alimentado por `getAvailableModules()` do `useActiveModuleKey.ts`
- Adicionar opção especial `"__global__"` = "Geral (todos os módulos)"
- Default: módulo atual detectado automaticamente
- Quando "Geral" selecionado, o `moduleKey` passa como `"__global__"` e o pin aparece em todos os módulos

### 4. Enviar para Tarefa — Geral ou Colaborador

**Arquivo**: `src/components/notes/ModulePostIt.tsx`

- Transformar o botão "Enviar para Tarefas" em um dropdown com duas opções:
  - "Tarefa Geral" (sem responsável)
  - "Enviar para Colaborador" (abre seletor de membro do workspace)
- Reutilizar hook de membros do workspace existente para listar colaboradores

### 5. Colar Imagem + Anexo no QuickPostItForm

**Arquivo**: `src/components/notes/QuickPostItForm.tsx`

- Integrar `useNoteAttachments` — como a nota ainda não existe no momento da criação, usar fluxo em 2 etapas:
  1. Capturar arquivos/imagens em estado temporário (clipboard paste + botão de anexo)
  2. Após criar a nota, fazer upload dos arquivos pendentes
- Adicionar `onPaste` handler no Textarea para capturar imagens do clipboard
- Adicionar botão de anexo (ícone Paperclip) com input file hidden
- Mostrar preview das imagens/arquivos pendentes antes de enviar

### 6. ModuleNotesOverlay — Suporte a "Geral"

**Arquivo**: `src/hooks/useNotePins.ts`

- Na query de pins, incluir pins com `module_key = '__global__'` além do módulo atual
- Isso faz post-its "Geral" aparecerem em qualquer página

---

### Arquivos Afetados

| Arquivo | Mudança |
|---------|---------|
| `FloatingPostItButton.tsx` | Drag + botão X + dismissed por sessão |
| `QuickPostItForm.tsx` | Dropdown de módulo + paste de imagem + botão anexo |
| `ModulePostIt.tsx` | Dropdown "enviar tarefa" com opção colaborador |
| `useNotePins.ts` | Incluir `__global__` na query |
| `useActiveModuleKey.ts` | Adicionar entrada `__global__` no MODULE_LABELS |
| Locales (pt-BR, en, es) | Novas traduções |

