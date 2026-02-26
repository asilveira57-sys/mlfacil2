

## Plan: Melhorias no Módulo Ajuste de Preço em Lote

### 1. Limpar pesquisa ao trocar de empresa
- Add `useEffect` watching `sellerId` to reset `searchQuery`, `filterCategory`, `filterStatus`, `foundItems`, `selectedItems`, `previewRows`, `showPreview`, and `applyLogs`.

### 2. Listar categorias do seller (dropdown em vez de campo texto)
- On the Edge Function `ml-price-adjustment`, add a new action `get_seller_categories` that calls `GET /users/{sellerId}/items/search?limit=0` and returns the `available_filters` array (specifically the `category` filter) — this gives the seller's actual categories with names and counts.
- On the frontend, fetch seller categories when `sellerId` changes and populate a `<Select>` dropdown replacing the text input for "Categoria ID".

### 3. Filtro Ativo / Pausado / Todos
- Add a `"todos"` option to the status `<Select>`. When "todos" is selected, omit the `status` param from the API call.

### 4. Lembrete de Tarefa com data e Notificação
- After a successful batch execution, show an optional "Agendar lembrete" dialog where the user sets a date (e.g., 15 days from now).
- Insert a row into `app_notifications` with `category = 'task_assigned'`, scheduled `created_at`, and `action_url = '/ajuste-preco'` so the user gets reminded to do the next adjustment.

### 5. Recomendação quando percentual > 3%
- In the adjustment config panel, show an `AlertTriangle` warning banner when `percentual > 3` with the text: "Recomendamos reajuste máximo de 3% por vez, a cada 15 dias."
- Also show it in the preview table header.

### Technical Details

**Edge Function change** (`ml-price-adjustment/index.ts`):
- New action `get_seller_categories`: calls ML API `/users/{sellerId}/items/search?limit=0` with auth token, extracts `available_filters[id=category].values` → returns `[{id, name, results}]`.

**Frontend changes** (`AjustePreco.tsx`):
- `useEffect` on `sellerId` → clear all state.
- `useEffect` on `sellerId` → fetch categories via new action.
- `filterCategory` uses `<Select>` with fetched categories instead of `<Input>`.
- `filterStatus` adds "Todos" option, sends `undefined` when selected.
- Warning banner when `percentual > 3`.
- Post-execution reminder dialog using `Dialog` + `react-day-picker` for date, inserting into `app_notifications`.

