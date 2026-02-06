

# Plano: Widget Bloco de Notas

## Visao Geral

Implementar um widget completo de Bloco de Notas integrado ao header do sistema, com drawer lateral, editor rich text, fixacao contextual por modulo (post-it), integracao com tarefas existentes e auditoria.

---

## Parte 1 - Banco de Dados (4 tabelas + 1 bucket + indices)

### 1.1 Tabela `notes`

| Coluna | Tipo | Notas |
|--------|------|-------|
| id | uuid PK | gen_random_uuid() |
| workspace_id | uuid NOT NULL | FK workspace |
| company_id | uuid NULL | NULL = nota global |
| created_by_user_id | uuid NOT NULL | auth.uid() |
| title | text NOT NULL | default '' |
| content_rich | jsonb | conteudo rich text (Tiptap JSON ou similar) |
| content_plain | text | texto puro para busca |
| color_hex | text | default '#FBBF24' (amarelo post-it) |
| status | text | default 'active', check in ('active','archived') |
| created_at | timestamptz | now() |
| updated_at | timestamptz | now() |

RLS: Membros do workspace podem SELECT; operadores+ podem INSERT/UPDATE/DELETE (usando funcoes `is_workspace_member` e `can_edit_tasks` ja existentes).

### 1.2 Tabela `note_attachments`

| Coluna | Tipo | Notas |
|--------|------|-------|
| id | uuid PK | gen_random_uuid() |
| workspace_id | uuid NOT NULL | |
| note_id | uuid NOT NULL | FK notes(id) ON DELETE CASCADE |
| storage_path | text NOT NULL | caminho no bucket |
| file_name | text | nome original |
| mime_type | text | |
| file_size | integer | bytes |
| width | integer NULL | px (imagens) |
| height | integer NULL | px (imagens) |
| created_at | timestamptz | now() |

RLS: Mesma logica de `notes`, baseada em `workspace_id`.

### 1.3 Tabela `note_pins`

| Coluna | Tipo | Notas |
|--------|------|-------|
| id | uuid PK | gen_random_uuid() |
| workspace_id | uuid NOT NULL | |
| company_id | uuid NULL | |
| note_id | uuid NOT NULL | FK notes(id) ON DELETE CASCADE |
| module_key | text NOT NULL | ex: 'dashboard', 'custos' |
| route_path | text NULL | rota exata opcional |
| entity_type | text NULL | |
| entity_id | text NULL | |
| created_by_user_id | uuid NOT NULL | |
| created_at | timestamptz | now() |

Constraint UNIQUE: (note_id, module_key, company_id) para evitar duplicacao.

### 1.4 Tabela `note_events`

| Coluna | Tipo | Notas |
|--------|------|-------|
| id | uuid PK | gen_random_uuid() |
| workspace_id | uuid NOT NULL | |
| note_id | uuid NOT NULL | FK notes(id) ON DELETE CASCADE |
| event_type | text NOT NULL | created, updated, pinned, unpinned, sent_to_tasks, archived |
| payload_json | jsonb | dados contextuais |
| created_by_user_id | uuid NOT NULL | |
| created_at | timestamptz | now() |

RLS: SELECT para membros do workspace.

### 1.5 Bucket de Storage

Criar bucket `note-attachments` (privado) para imagens e arquivos das notas.

### 1.6 Indices

- `notes`: (workspace_id, company_id, updated_at DESC)
- `note_pins`: (workspace_id, module_key, company_id)
- `note_attachments`: (note_id)
- `note_events`: (note_id, created_at DESC)

---

## Parte 2 - Tipos TypeScript

### Arquivo: `src/types/notes.ts` (novo)

Definir interfaces `Note`, `NoteAttachment`, `NotePin`, `NoteEvent` e constantes de cores disponiveis.

---

## Parte 3 - Hook Principal

### Arquivo: `src/hooks/useNotes.ts` (novo)

Hook com React Query que gerencia:

- **Listagem com scroll infinito** - Paginacao por cursor (updated_at DESC), sem limite de 1000 registros
- **Busca textual** - ilike em title + content_plain
- **CRUD** - create, update, archive, delete
- **Filtros** - por company_id (ativa) + notas globais (company_id IS NULL)
- **Auto-save** - debounce de 1.5s apos ultima alteracao

### Arquivo: `src/hooks/useNotePins.ts` (novo)

- Fixar/desfixar nota em module_key
- Buscar notas fixadas no modulo atual + notas globais fixadas
- Registrar evento em note_events

### Arquivo: `src/hooks/useNoteAttachments.ts` (novo)

- Upload de imagens para bucket `note-attachments`
- Listagem por note_id
- Suporte a paste de clipboard (imagem)

---

## Parte 4 - Deteccao do Modulo Ativo

### Arquivo: `src/hooks/useActiveModuleKey.ts` (novo)

Hook que extrai o `module_key` a partir da rota atual (`useLocation().pathname`), usando o mapeamento ja existente no `AppSidebar` (campo `moduleKey` dos navItems):

| Rota | module_key |
|------|-----------|
| /dashboard | dashboard |
| /custos | custos |
| /tarefas | tarefas |
| /settings | settings |
| ... | ... |

Sem enum fixo - usa apenas o primeiro segmento da rota mapeado dinamicamente.

---

## Parte 5 - Componentes UI

### 5.1 Icone no Header

**Arquivo:** `src/components/utilities/HeaderUtilities.tsx` (editar)

Adicionar icone de Bloco de Notas (Lucide `StickyNote`) ao lado da calculadora, controlado pela preferencia `showNotesInHeader` (novo campo em `useUtilitiesPreferences`).

### 5.2 Drawer lateral

**Arquivo:** `src/components/notes/NotesDrawer.tsx` (novo)

- Abre ao clicar no icone
- Lista notas (empresa ativa + globais) com scroll infinito
- Barra de busca no topo
- Botao "Nova nota"
- Cada card mostra: titulo, preview de 2 linhas, cor, data, badge se fixada

### 5.3 Editor de nota

**Arquivo:** `src/components/notes/NoteEditor.tsx` (novo)

- Textarea com formatacao basica (negrito, italico, listas) usando contentEditable com sanitizacao
- Suporte a:
  - Colar imagens do clipboard (Ctrl+V)
  - Upload de imagens via botao
  - Seletor de cor (6-8 cores pre-definidas)
- Auto-save com indicador visual
- Barra de acoes: "Fixar neste modulo", "Enviar para tarefas", "Arquivar"

### 5.4 Post-it contextual

**Arquivo:** `src/components/notes/ModulePostIt.tsx` (novo)

- Componente discreto renderizado nos modulos que tenham notas fixadas
- Aparece como um pequeno post-it no canto superior direito da area de conteudo
- Expandivel ao clicar
- Acoes rapidas: editar, desfixar, enviar para tarefas

### 5.5 Wrapper para injecao automatica

**Arquivo:** `src/components/notes/ModuleNotesOverlay.tsx` (novo)

Componente que encapsula a deteccao do modulo ativo e renderiza os post-its. Sera inserido no `AppShellLayout` dentro da area `<main>`.

---

## Parte 6 - Integracao com Tarefas

Ao clicar "Enviar para tarefas":

1. Chamar `createTask` do hook `useTasks` existente com:
   - `title`: nota.title ou primeira linha do content_plain
   - `description`: content_plain completo
   - `source_type`: 'note' (adicionar ao `SOURCE_TYPES` em `src/types/tasks.ts`)
   - `source_id`: note.id
   - `source_ref`: { note_id, module_key, color_hex }
   - `workspace_id`: atual
   - `account_id`: null (notas nao sao por conta ML)

2. Copiar anexos da nota como referencia no `source_ref.attachments[]`

3. Registrar evento `sent_to_tasks` em `note_events` com `{ task_id }`

**Arquivo:** `src/types/tasks.ts` (editar)
- Adicionar `NOTE: 'note'` ao `SOURCE_TYPES`

---

## Parte 7 - Preferencias do Widget

**Arquivo:** `src/hooks/useUtilitiesPreferences.ts` (editar)

- Adicionar `showNotesInHeader: boolean` (default: true) ao `WidgetsEnabled`
- Persistir no JSONB `widgets_enabled` existente

**Arquivo:** `src/components/settings/SettingsUtilities.tsx` (editar)

- Adicionar card "Bloco de Notas" com switch para habilitar/desabilitar no header

---

## Parte 8 - Traducoes

Adicionar chaves em `src/locales/{pt-BR,en,es}/notes.json` (novo namespace):

- Titulos, acoes, placeholders, mensagens de sucesso/erro
- Cores dos post-its

---

## Parte 9 - Integracao no Layout

**Arquivo:** `src/components/layout/AppShellLayout.tsx` (editar)

- Importar e renderizar `ModuleNotesOverlay` dentro da tag `<main>`, posicionado de forma absoluta

**Arquivo:** `src/components/utilities/index.ts` (editar)

- Exportar `NotesWidget`

---

## Resumo de Arquivos

| Arquivo | Acao |
|---------|------|
| Migracao SQL (4 tabelas + indices + bucket + RLS) | **Criar** |
| `src/types/notes.ts` | **Criar** |
| `src/types/tasks.ts` | Editar (adicionar source_type 'note') |
| `src/hooks/useNotes.ts` | **Criar** |
| `src/hooks/useNotePins.ts` | **Criar** |
| `src/hooks/useNoteAttachments.ts` | **Criar** |
| `src/hooks/useActiveModuleKey.ts` | **Criar** |
| `src/hooks/useUtilitiesPreferences.ts` | Editar |
| `src/components/notes/NotesDrawer.tsx` | **Criar** |
| `src/components/notes/NoteEditor.tsx` | **Criar** |
| `src/components/notes/NotesList.tsx` | **Criar** |
| `src/components/notes/NoteCard.tsx` | **Criar** |
| `src/components/notes/ModulePostIt.tsx` | **Criar** |
| `src/components/notes/ModuleNotesOverlay.tsx` | **Criar** |
| `src/components/notes/index.ts` | **Criar** |
| `src/components/utilities/HeaderUtilities.tsx` | Editar |
| `src/components/utilities/index.ts` | Editar |
| `src/components/settings/SettingsUtilities.tsx` | Editar |
| `src/components/layout/AppShellLayout.tsx` | Editar |
| `src/locales/pt-BR/notes.json` | **Criar** |
| `src/locales/en/notes.json` | **Criar** |
| `src/locales/es/notes.json` | **Criar** |

### Detalhes Tecnicos

- **Scroll infinito**: Implementado via `useInfiniteQuery` do React Query, paginando por `updated_at` cursor
- **Rich text**: ContentEditable com sanitizacao HTML basica (sem dependencia externa pesada como Tiptap/ProseMirror)
- **Auto-save**: Debounce de 1500ms usando `useRef` + `setTimeout`
- **Clipboard paste**: Listener `paste` no editor que detecta `clipboardData.items` com type `image/*`
- **Storage**: Bucket `note-attachments` privado, paths `{workspace_id}/{note_id}/{filename}`
- **RLS**: Todas as 4 tabelas usam as funcoes existentes `is_workspace_member` e `can_edit_tasks`
- **Sem limite global**: Paginacao incremental em todas as listagens

