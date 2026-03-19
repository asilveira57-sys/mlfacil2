

## Plano: Painel de Gerenciamento de Clientes (Admin)

### Problema atual

A tela `AdminUsers` atual é limitada: mostra apenas IDs truncados de `user_access_state`, sem email real, sem empresa vinculada, sem contas ML, e sem opção de excluir. Não serve para gestão de clientes.

---

### Solução: Nova aba "Clientes" no Admin

Criar uma nova página `AdminClientes` com visão completa de cada seller, substituindo/complementando a atual `AdminUsers`.

---

### O que será exibido por cliente

| Dado | Origem |
|---|---|
| Nome completo, email, whatsapp, CPF | `profiles` |
| Empresa (nome, CNPJ, cidade, UF) | `companies` (via `user_id`) |
| Contas ML vinculadas (nickname, status, company_id) | `ml_accounts` (via `user_id`) |
| Status de acesso (trial/ativo/expirado/bloqueado) | `user_access_state` |
| Início e fim do trial | `user_access_state.trial_start_at`, `trial_end_at` |
| Plano selecionado | `user_access_state.selected_plan_id` |
| Data de cadastro | `profiles.created_at` |
| Roles | `user_roles` |

### Ações disponíveis por cliente

1. **Ver detalhes** — modal/drawer com todos os dados acima
2. **Ajustar período de trial** — adicionar/remover dias (já existe RPC `admin_adjust_trial`)
3. **Resetar trial** — (já existe RPC)
4. **Bloquear/Desbloquear** — (já existe RPC)
5. **Excluir seller** — nova funcionalidade via Edge Function `admin-delete-user` que:
   - Remove `ml_accounts`, `companies`, `user_access_state`, `profiles`, `user_roles`
   - Deleta o user de `auth.users` (requer service_role)
   - Registra log de auditoria

### Mudanças necessárias

**1. Nova Edge Function `admin-delete-user`**
- Recebe `user_id`, valida que o chamador é admin
- Deleta dados relacionados em cascata
- Deleta o auth user via `supabase.auth.admin.deleteUser()`
- Retorna sucesso/erro

**2. Nova RPC `admin_get_clients_overview`**
- Função SQL SECURITY DEFINER que retorna join de `profiles` + `user_access_state` + `companies` + `ml_accounts` + `user_roles`
- Acesso restrito a admins via `has_role(auth.uid(), 'admin')`
- Retorna dados completos para a listagem

**3. Novo componente `src/pages/admin/AdminClientes.tsx`**
- Tabela com colunas: Nome, Email, Empresa, Contas ML, Status, Trial, Cadastro, Ações
- Filtros: busca por nome/email, status (trial/ativo/expirado/bloqueado)
- Modal de detalhes com todas as informações do seller
- Dialog de confirmação para exclusão (com digitação do email para confirmar)
- Ações inline: ajustar trial, bloquear, excluir

**4. Hook `src/hooks/useAdminClients.ts`**
- `useAdminClients()` — query da RPC
- `useDeleteClient()` — mutation chamando a Edge Function
- Reutiliza `useAdminTrialManagement` existente

**5. Registrar no Admin.tsx**
- Nova tab "Clientes" com ícone `UserCheck`
- Nova rota `/admin/clientes`
- Posicionar após "Usuários" na lista de tabs

### Resultado

O admin terá uma visão completa de todos os sellers: dados pessoais, empresa, contas ML vinculadas, status de trial/plano, com capacidade de ajustar prazos, bloquear e excluir completamente um seller de teste.

