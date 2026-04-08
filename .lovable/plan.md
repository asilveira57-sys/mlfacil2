

# Gerenciamento de Plano no Admin Clientes

## Situação atual
- O painel de detalhes mostra apenas o UUID truncado do plano (`selected_plan_id.slice(0,8)`)
- Não existe nenhuma ação para trocar o plano de um cliente
- A tabela `user_plan_assignments` já tem a estrutura necessária (user_id, plan_tier_id, status)
- Existem 7 tiers ativos no banco (ZPL Básico, Até 50, 51-300, etc.)

## O que será feito

### 1. Mostrar o plano atual do cliente (legível)
No dialog "Ver detalhes" e na tabela principal, exibir o **nome** do plano em vez do UUID.
- Buscar o `plan_tier_id` ativo do `user_plan_assignments` junto com o nome do tier
- Exibir como badge: ex. "ZPL Básico", "301 a 700 pedidos/mês"

### 2. Ação "Alterar Plano" no dropdown
Nova opção no menu de ações de cada cliente que abre um dialog com:
- Nome do cliente e plano atual
- Select com todos os tiers ativos disponíveis
- Botão "Confirmar"

### 3. RPC `admin_change_user_plan`
Função SQL que:
- Verifica se o chamador é admin
- Desativa todas as atribuições antigas do usuário (`status = 'inactive'`)
- Insere nova atribuição com o tier escolhido (`status = 'active'`)
- Atualiza `user_access_state.payment_status` se necessário
- Retorna sucesso

### 4. Hook e integração
- Adicionar mutação `changeUserPlan(userId, planTierId)` no `useAdmin.ts`
- Enriquecer `admin_get_clients_overview` para retornar o nome do plano ativo

## Arquivos afetados
- **Migration SQL**: Criar RPC `admin_change_user_plan`, atualizar `admin_get_clients_overview`
- **`src/hooks/useAdmin.ts`**: Mutação `changeUserPlan`
- **`src/pages/admin/AdminClientes.tsx`**: Dialog de troca de plano, exibição do nome do plano
- **`src/hooks/useAdminClients.ts`**: Tipo `AdminClient` com campo `plan_name`

## Resultado
- Admin vê o plano atual de cada cliente pelo nome
- Admin pode trocar o plano de qualquer cliente com 2 cliques
- Mudança reflete imediatamente nos módulos habilitados do usuário

