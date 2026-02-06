

# Correcoes do Widget Bloco de Notas - 6 Problemas

## Problema 1: Criar nova nota sempre edita a primeira

**Causa raiz:** O `NoteEditor` inicializa o `contentEditable` apenas quando `note.id` muda (useEffect com `[note.id]`), mas o state `title` usa `useState(note.title)` que nao reinicializa quando a nota muda. Alem disso, o `editingNote` no `NotesDrawer` nao limpa o estado do editor corretamente entre notas.

**Solucao:**
- No `NoteEditor.tsx`, adicionar `key={note.id}` no componente para forcar remontagem quando trocar de nota, ou resetar o state `title` e `editorRef.current.innerHTML` via `useEffect` quando `note.id` mudar.
- No `NotesDrawer.tsx`, garantir que `setEditingNote(null)` seja chamado antes de criar nova nota, e que `handleNewNote` limpe o editor antes de abrir a nova nota.

**Arquivos:** `NoteEditor.tsx`, `NotesDrawer.tsx`

---

## Problema 2: Nao consegue trocar o modulo ao fixar

**Causa raiz:** O botao "Fixar neste modulo" usa automaticamente o `moduleKey` ativo (da rota). Nao ha opcao de selecionar outro modulo.

**Solucao:**
- Substituir o botao simples de fixar por um `DropdownMenu` ou `Popover` que lista os modulos disponiveis (extraidos do `ROUTE_MODULE_MAP` existente no `useActiveModuleKey.ts`).
- Exportar a lista de modulos como constante para uso no seletor.
- O modulo ativo ficara pre-selecionado, mas o usuario pode escolher outro.
- Atualizar o `pinNote` no `useNotePins` para aceitar um `moduleKey` customizado ao inves de usar sempre o ativo.

**Arquivos:** `NoteEditor.tsx`, `useActiveModuleKey.ts` (exportar lista), `useNotePins.ts` (aceitar moduleKey parametrizado), `NotesDrawer.tsx`, `NoteCard.tsx`

---

## Problema 3: Layout cortado a direita (botao Arquivar nao aparece)

**Causa raiz:** A barra de acoes inferior no `NoteEditor.tsx` usa `flex` com botoes que excedem a largura do drawer de 380-420px. Os textos dos botoes "Fixar neste modulo" + "Enviar para tarefas" + "Arquivar" ocupam muito espaco.

**Solucao:**
- Tornar a barra de acoes inferior responsiva: usar `flex-wrap` ou empilhar os botoes.
- Usar apenas icones com tooltip quando o espaco for limitado, ou reduzir o tamanho do texto.
- Alternativa: usar 2 linhas de acoes, ou um layout com `overflow-x-auto`.
- Centralizar melhor o editor no espaco disponivel.

**Arquivos:** `NoteEditor.tsx`

---

## Problema 4: Upload e paste de imagens nao funcionam

**Causa raiz:** Multiplos problemas:
1. O `uploadFromClipboard` e o `uploadFile` no `useNoteAttachments` fazem upload para o storage e registram no banco, mas **nao inserem a imagem no editor** visualmente. Apos o upload, nada aparece no `contentEditable`.
2. O `handlePaste` no `NoteEditor` chama `e.preventDefault()` e `onPasteImage(e.clipboardData)` mas o resultado (URL da imagem) nao e inserido no DOM do editor.
3. O bucket e privado, entao `getPublicUrl` nao funciona - precisa usar `createSignedUrl` para exibir.

**Solucao:**
- Apos upload bem-sucedido, obter a URL assinada do arquivo e inserir um `<img>` no `contentEditable` usando `document.execCommand('insertHTML')` ou manipulacao direta do DOM.
- Mudar `getPublicUrl` para `createSignedUrl` (bucket privado).
- Retornar a URL da imagem dos callbacks `onPasteImage` e `onUploadImage` para que o editor insira no conteudo.
- Alterar a assinatura dos callbacks para retornar `Promise<string | null>` (URL).

**Arquivos:** `NoteEditor.tsx`, `useNoteAttachments.ts`, `NotesDrawer.tsx`

---

## Problema 5: Faltam bullet points numericos (lista ordenada)

**Causa raiz:** O editor so tem botao para `insertUnorderedList` (lista com pontos). Nao tem botao para `insertOrderedList` (lista numerada).

**Solucao:**
- Adicionar botao `ListOrdered` (icone do Lucide) na toolbar do editor.
- Usar `document.execCommand('insertOrderedList')` para listas numeradas.

**Arquivos:** `NoteEditor.tsx`

---

## Problema 6: Validar vinculacao com empresa

**Causa raiz:** O `ModuleNotesOverlay` no `AppShellLayout.tsx` e renderizado sem `companyId` (`<ModuleNotesOverlay />`), e o `HeaderUtilities` tambem nao recebe `companyId` corretamente do contexto da conta ativa.

**Solucao:**
- No `AppShellLayout.tsx`, obter o `activeAccountId` do `ActiveAccountContext` e passar como `companyId` para o `ModuleNotesOverlay`.
- Verificar que o `NotesDrawer` no `HeaderUtilities` tambem recebe o `companyId` - atualmente o `HeaderUtilities` aceita `companyId` como prop mas no `AppShellLayout` nao esta sendo passado.
- Usar `useActiveAccount()` para obter o `activeAccountId` e propagar como `companyId`.

**Arquivos:** `AppShellLayout.tsx`, `HeaderUtilities.tsx`

---

## Resumo de Alteracoes

| Arquivo | Alteracao |
|---------|-----------|
| `src/components/notes/NoteEditor.tsx` | Reset de estado ao trocar nota; seletor de modulo para fixar; layout responsivo da barra de acoes; botao lista ordenada; insercao de imagem no editor |
| `src/components/notes/NotesDrawer.tsx` | Passar `key={note.id}` ao NoteEditor; adaptar callbacks de imagem para inserir no editor; propagar moduleKey selecionado |
| `src/hooks/useNoteAttachments.ts` | Retornar URL assinada apos upload; usar `createSignedUrl` ao inves de `getPublicUrl` |
| `src/hooks/useActiveModuleKey.ts` | Exportar `ROUTE_MODULE_MAP` ou lista de modulos para uso no seletor |
| `src/hooks/useNotePins.ts` | Aceitar `moduleKey` como parametro no `pinNote` (override do default) |
| `src/components/notes/NoteCard.tsx` | Adicionar seletor de modulo no menu de pin |
| `src/components/layout/AppShellLayout.tsx` | Passar `companyId` (da conta ativa) ao `ModuleNotesOverlay` e `HeaderUtilities` |
| `src/components/utilities/HeaderUtilities.tsx` | Propagar `companyId` recebido como prop |
| `src/locales/pt-BR/notes.json` | Adicionar chaves para "Lista numerada" e "Selecionar modulo" |
| `src/locales/en/notes.json` | Adicionar chaves correspondentes |
| `src/locales/es/notes.json` | Adicionar chaves correspondentes |

### Detalhes Tecnicos

- **Reset do editor**: Usar `key={editingNote.id}` no `<NoteEditor>` no `NotesDrawer` para forcar remontagem completa ao trocar de nota, eliminando qualquer estado residual.
- **Seletor de modulo**: Popover com lista de modulos extraida de `ROUTE_MODULE_MAP`. Pre-seleciona o modulo atual. Ao confirmar, chama `pinNote` com o `moduleKey` escolhido.
- **Layout responsivo**: Barra inferior usara `flex-wrap gap-1` com botoes menores usando apenas icones e texto truncado, garantindo que "Arquivar" fique sempre visivel.
- **Insercao de imagem**: Apos upload, criar URL assinada (1h de validade), inserir `<img src="..." class="max-w-full rounded" />` no cursor do `contentEditable` usando `insertHTML`.
- **Empresa ativa**: Usar `useActiveAccount().activeAccountId` como `companyId` para filtrar notas por empresa em todos os contextos.

