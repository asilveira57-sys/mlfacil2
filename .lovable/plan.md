

# Plano de Correção Definitiva - Bloco de Notas

## Problemas Identificados

1. **Bloco de notas abre no canto direito e pequeno**: Atualmente usa o componente `Sheet` (gaveta lateral de 380-420px). Precisa abrir centralizado e maior.

2. **Erro ao fixar módulo** (`invalid input syntax for type uuid: "66043362"`): O `companyId` passado para o bloco de notas vem do `sellerId` do Mercado Livre (ex: "66043362"), que **nao e UUID**. A coluna `note_pins.company_id` e do tipo `uuid`, causando o erro na insercao.

3. **Lista de modulos estatica (hardcoded)**: Os modulos disponiveis para fixar estao definidos em `src/hooks/useActiveModuleKey.ts` como constantes no codigo. Novos modulos nao aparecem automaticamente.

4. **Falta selecao de empresa ao fixar**: Ao fixar uma nota em um modulo, nao ha como escolher a empresa. Deveria permitir selecionar a empresa destino.

---

## Solucao Proposta

### Parte 1 - Abrir Centralizado e Maior

**Trocar `Sheet` por `Dialog`** no `NotesDrawer.tsx`:
- Substituir o componente `Sheet` (que abre como gaveta lateral) por `Dialog` (que abre centralizado como modal)
- Definir tamanho maior: largura de ~700px e altura de ~80vh
- Manter toda a funcionalidade interna (lista, editor, busca) intacta
- O botao de abrir no header continua o mesmo (icone de nota)

### Parte 2 - Corrigir Erro ao Fixar (company_id UUID)

**Problema raiz**: O `AppShellLayout` passa `sellerId` (string numerica do ML) como `companyId` para `HeaderUtilities` e `ModuleNotesOverlay`. Esse valor chega ate `useNotePins` que tenta inserir na coluna `company_id` (tipo UUID).

**Solucao**:
- Adicionar validacao UUID no `useNotePins` (mesmo padrao que ja foi feito no `useNotes`)
- O `companyId` invalido sera tratado como `null` nas queries e insercoes
- Quando o usuario fixar uma nota, a empresa sera selecionada explicitamente pelo seletor (Parte 4)

### Parte 3 - Lista de Modulos Dinamica (do Banco de Dados)

**Situacao atual**: Ja existe a tabela `system_modules` no banco com 14 modulos cadastrados (Dashboard, Tarefas, Etiquetas, etc.), com campos `id`, `name`, `description`, `icon_name`, `route`, `is_active`.

**Solucao**:
- Criar um hook `useSystemModules` que busca os modulos da tabela `system_modules` (filtrando `is_active = true`)
- Substituir a funcao estatica `getAvailableModules()` no `NoteEditorActions` pelo hook dinamico
- Quando um novo modulo for adicionado ao sistema, basta inserir na tabela `system_modules` e ele aparecera automaticamente na lista do bloco de notas
- Manter fallback para a lista estatica caso a query falhe

### Parte 4 - Seletor de Empresa ao Fixar

**Solucao**:
- No `NoteEditorActions`, ao lado do botao "Fixar em modulo", adicionar um seletor de empresa
- Buscar empresas da tabela `companies` (que tem `id` UUID, `display_name`, `is_active`)
- O fluxo fica: selecionar modulo + selecionar empresa (opcional) -> fixar
- A empresa atual fica pre-selecionada, mas o usuario pode trocar
- Usar o campo `company_id` existente na tabela `note_pins` para gravar a empresa selecionada

---

## Arquivos a Modificar

| Arquivo | Alteracao |
|---------|-----------|
| `src/components/notes/NotesDrawer.tsx` | Trocar `Sheet` por `Dialog`, aumentar tamanho, centralizar |
| `src/hooks/useNotePins.ts` | Adicionar validacao UUID no `companyId`, aceitar `companyId` no `pinNote` |
| `src/hooks/useActiveModuleKey.ts` | Manter para resolucao de rota, mas remover dependencia do `getAvailableModules` para notas |
| `src/hooks/useSystemModules.ts` | **Novo** - Hook que busca modulos da tabela `system_modules` |
| `src/components/notes/NoteEditorActions.tsx` | Usar modulos dinamicos + adicionar seletor de empresa |
| `src/components/notes/NoteEditor.tsx` | Propagar empresa selecionada para o `onPin` |
| Locales (en, es, pt-BR) | Adicionar chave para "Selecionar empresa" |

---

## Detalhes Tecnicos

### Hook useSystemModules (novo)
```text
- Query: SELECT id, name, icon_name, route FROM system_modules WHERE is_active = true ORDER BY name
- Cache: staleTime de 5 minutos (modulos mudam raramente)
- Fallback: lista estatica do ROUTE_MODULE_MAP em caso de erro
- Retorna: { modules: Array<{key, label, icon}>, isLoading }
```

### Fluxo de Fixar Nota (corrigido)
```text
1. Usuario clica "Fixar em modulo"
2. Popover abre com:
   - Lista de modulos (da tabela system_modules)
   - Seletor de empresa (da tabela companies)
3. Usuario seleciona modulo e opcionalmente a empresa
4. Sistema insere em note_pins com:
   - module_key = id do modulo selecionado
   - company_id = UUID da empresa selecionada (ou null)
5. Toast de sucesso
```

### Validacao UUID (useNotePins)
```text
- Mesma regex UUID usada no useNotes
- companyId invalido -> tratado como null
- Previne erro de "invalid input syntax for type uuid"
```

### Dialog centralizado (NotesDrawer)
```text
- max-w-3xl (768px) com h-[80vh]
- Conteudo usa flex-col com overflow interno
- Mantém toda a UX atual (lista, editor, busca, toolbar)
```

