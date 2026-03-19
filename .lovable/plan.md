

## Plano: Corrigir itens inativos aparecendo + Adicionar botão de exclusão

### Problema
1. **Itens desativados reaparecem como tabs** — O `useConfigMenu` tem `staleTime: 30 * 60 * 1000` (30 minutos de cache). Após salvar alterações no editor, o cache antigo continua sendo usado. O `queryClient.invalidateQueries` é chamado no save, mas pode haver uma race condition ou o componente já renderizou com dados stale.
2. **Sem botão de exclusão** — O editor só permite ativar/desativar e reordenar, mas não deletar itens permanentemente.

### Correções

#### 1. Forçar refresh do cache após salvar (`SettingsMenuEditor.tsx`)
- Após `invalidateQueries`, chamar `refetchQueries` para garantir que os dados frescos são buscados imediatamente
- Reduzir `staleTime` no `useConfigMenu` de 30 min para 5 min

#### 2. Adicionar botão de exclusão no editor (`SettingsMenuEditor.tsx`)
- Adicionar ícone de lixeira (Trash2) ao lado do switch em cada item
- Ao clicar, mostrar confirmação inline ou dialog simples
- No save, enviar `DELETE` para os itens marcados para exclusão
- Itens excluídos são removidos permanentemente da tabela `config_menu_items`

#### 3. Garantir que o layout respeita apenas itens ativos (`SettingsLayout.tsx`)
- Adicionar filtro explícito: `dbItems.filter(i => i.active !== false)` como segurança extra (o hook já filtra, mas como defesa)

### Arquivos
- `src/components/settings/SettingsMenuEditor.tsx` — Botão delete + invalidação forçada
- `src/hooks/useConfigMenu.ts` — Reduzir staleTime
- `src/components/settings/SettingsLayout.tsx` — Filtro defensivo

