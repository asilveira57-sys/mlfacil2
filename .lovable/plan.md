
Objetivo: aplicar uma correção definitiva no menu de Configurações para resolver ordem inconsistente, itens sumindo e comportamento instável de cache.

Diagnóstico profundo (confirmado em código + banco)
1) Ordem “Empresas e Contas” não respeita editor
- No banco, `empresas-contas` está com `display_order = 2`.
- Mesmo assim a UI mostra depois de “Colaboradores”.
- Causa: `SettingsLayout` monta tabs por ordem de grupos (`config_menu_groups`) e não por ordem global de item.

2) Editor e UI usam lógicas diferentes
- `SettingsMenuEditor` salva `display_order` global.
- `SettingsLayout` renderiza por blocos de grupo.
- Resultado: usuário arrasta, salva, mas ordem visual não acompanha.

3) Itens sumiram (Aparência/Tema e Mensagem do Dia)
- `aparencia` foi removido fisicamente da tabela `config_menu_items`.
- `mensagem-do-dia` não existe atualmente no banco.
- Sem registro no banco, não aparece no menu dinâmico.

4) Instabilidade de cache (causa de comportamento “fantasma”)
- `usePostLoginPrefetch` grava `['config-menu']` com formato `{ groups, items }`.
- `useConfigMenu` espera array de `menuGroups`.
- Com cache persistido, isso pode ativar fallback indevido e gerar menu inconsistente.

Plano corretivo final

Fase 1 — Correção de dados (migração idempotente)
- Criar migração SQL para:
  1. Recriar/reativar `aparencia` como item de topo (`parent_id = null`, `active = true`).
  2. Criar/reativar `mensagem-do-dia` como item de topo.
  3. Normalizar `display_order` dos itens de topo ativos.
  4. Forçar `mensagem-do-dia` para última posição.
- Manter os demais itens já removidos como estão (não reintroduzir menus vazios antigos).

Fase 2 — Unificar lógica de carregamento e cache
- Arquivo: `src/hooks/useConfigMenu.ts`
  - Manter uma única transformação de dados consistente.
  - Expor itens já prontos para renderização de tabs (top-level).
- Arquivo: `src/hooks/usePostLoginPrefetch.ts`
  - Parar de popular `['config-menu']` com payload em formato diferente.
  - Usar a mesma função/shape de `useConfigMenu` (ou remover prefetch desse key).
- Arquivo: `src/lib/queryPersister.ts`
  - Incrementar `PERSIST_BUSTER` (`v1` → `v2`) para limpar cache persistido incompatível.

Fase 3 — Corrigir renderização do Settings
- Arquivo: `src/components/settings/SettingsLayout.tsx`
  - Renderizar tabs por ordem global de `display_order` (não por agrupamento).
  - Trabalhar apenas com itens de topo para navegação principal.
  - Regra fixa: `mensagem-do-dia` sempre no final.
  - Fallback estático só quando houver erro real de carregamento, não apenas lista vazia.

Fase 4 — Alinhar editor com a mesma regra da UI
- Arquivo: `src/components/settings/SettingsMenuEditor.tsx`
  - Carregar lista do editor em ordem global (`display_order`) de itens topo.
  - Salvar na mesma estratégia da UI (sem reintroduzir ordenação por grupo).
  - Impedir exclusão de `mensagem-do-dia` e manter sempre no fim ao salvar.
  - Continuar invalidando/refetch de `['config-menu']` após salvar.

Validação (checklist de aceite)
1. Arrastar “Empresas e Contas” para depois de “Perfil” e confirmar que a UI respeita imediatamente.
2. Confirmar “Aparência” visível novamente e abrindo painel de tema.
3. Confirmar “Mensagem do Dia” visível e sempre última.
4. Confirmar que não existem tabs “fantasmas” fora do editor.
5. Testar hard refresh e novo login para validar que cache persistido não reintroduz bug.

Detalhes técnicos (implementação)
- Arquivos a alterar:
  - `supabase/migrations/<new>.sql`
  - `src/hooks/useConfigMenu.ts`
  - `src/hooks/usePostLoginPrefetch.ts`
  - `src/lib/queryPersister.ts`
  - `src/components/settings/SettingsLayout.tsx`
  - `src/components/settings/SettingsMenuEditor.tsx`
- Sem mudanças de RLS necessárias; políticas atuais já permitem leitura de ativos e gestão por admin.
