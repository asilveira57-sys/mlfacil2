

# Implementar Tela de Auditoria no Admin

## Problema

A aba "Auditoria" em `/admin/logs` exibe apenas um placeholder vazio, mas a tabela `system_logs` ja tem mais de 4.500 registros de 7 areas diferentes do sistema.

## Solucao

Substituir o `AdminAuditPlaceholder` por um componente completo que exibe os logs do sistema com filtros e paginacao.

---

## O que sera exibido

### KPIs no topo
- Total de logs
- Logs nas ultimas 24h
- Areas ativas (quantidade distinta de `system_area`)
- Erros recentes (logs com `success = false` nas ultimas 24h)

### Filtros
- **Area do sistema** (`system_area`): dropdown com as opcoes existentes (sandbox, onboarding, operational_quick_sync, etc.)
- **Acao** (`action`): dropdown que atualiza conforme a area selecionada
- **Nivel** (`level`): info, warn, error
- **Periodo**: 24h, 7d, 30d, todos
- **Busca por texto**: pesquisa em `message` e `action`

### Tabela principal
Colunas: Data/Hora, Area, Acao, Usuario, Sucesso, Mensagem

- Paginacao de 50 em 50
- Clique na linha expande para mostrar `meta_json` formatado
- Linhas com `success = false` destacadas em vermelho claro
- Ordenacao por data (mais recente primeiro)

---

## Detalhamento Tecnico

### Arquivo novo: `src/pages/admin/AdminAuditLogs.tsx`

Componente que:
1. Busca logs da tabela `system_logs` com filtros aplicados via query Supabase
2. Busca areas distintas para popular o dropdown de filtro
3. Paginacao controlada por estado local (`page`, `pageSize = 50`)
4. Expande linha ao clicar para mostrar `meta_json` em `<pre>` formatado
5. Usa `useQuery` com chave que inclui todos os filtros para cache automatico

Query principal:
```text
supabase.from('system_logs')
  .select('*', { count: 'exact' })
  .order('created_at', { ascending: false })
  // + filtros condicionais: eq('system_area', ...), eq('level', ...), gte('created_at', ...)
  .range(offset, offset + pageSize - 1)
```

### Arquivo modificado: `src/pages/Admin.tsx`

- Importar `AdminAuditLogs` no lugar do placeholder
- Substituir a rota `<Route path="logs" element={<AdminAuditPlaceholder />} />` pelo novo componente
- Remover a funcao `AdminAuditPlaceholder`

### Sem alteracoes no banco

A tabela `system_logs` ja existe com as colunas necessarias (id, created_at, level, system_area, action, user_id, company_id, success, message, meta_json). As RLS policies ja estao configuradas para admin.

